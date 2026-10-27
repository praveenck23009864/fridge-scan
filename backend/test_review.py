import pytest
from sqlalchemy import create_engine, text, event
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from database import initialize_database
from models import Scan, DetectedItem, ShoppingList


def create_scan(client, mock=True):
    response = client.post('/api/scans', json={'is_mock': mock, 'model_used': 'development-mock' if mock else 'vision-model'})
    assert response.status_code == 201
    return response.json()['id']


def item(name='Milk', status='low', **extra):
    return {'name': name, 'stock_status': status, 'confirmed': True, **extra}


def save(client, scan_id, items):
    return client.put(f'/api/scans/{scan_id}/review', json={'items': items})


def test_review_edit_delete_confirmation_and_persistence(client, database_url):
    scan_id = create_scan(client)
    result = save(client, scan_id, [item(' Milk '), item('Eggs', 'available'), item('Wrong food', 'unknown')])
    assert result.status_code == 200
    milk, eggs, wrong = result.json()
    assert milk['name'] == 'Milk'
    # Edit names/status, remove a detection, and add a missing item in one save.
    updated = save(client, scan_id, [item('Oat milk', 'available', id=milk['id']), item('Tomatoes', 'low')])
    assert updated.status_code == 200
    assert updated.json()[0]['id'] == milk['id']
    assert all(i['confirmed'] for i in updated.json())
    assert client.patch(f"/api/items/{wrong['id']}", json={'name': 'gone'}).status_code == 404
    # Open another engine against the same file (no shared identity map/connection).
    fresh = create_engine(database_url)
    with Session(fresh) as session:
        scan = session.get(Scan, scan_id)
        assert scan.status == 'reviewed' and scan.is_mock
        assert scan.model_used == 'development-mock'
        assert [(i.name, i.stock_status, i.confirmed) for i in session.query(DetectedItem).order_by(DetectedItem.id)] == [('Oat milk', 'available', True), ('Tomatoes', 'low', True)]
    fresh.dispose()
    assert len(client.get(f'/api/scans/{scan_id}/items').json()) == 2
    assert client.get('/api/scans').json()[0]['is_mock'] is True
    assert save(client, scan_id, []).json() == []
    assert client.get(f'/api/scans/{scan_id}/items').json() == []


def test_review_retries_do_not_duplicate_inventory(client):
    scan_id = create_scan(client)
    for _ in range(2):
        assert save(client, scan_id, [item(), item('Eggs', 'available')]).status_code == 200
    assert len(client.get(f'/api/scans/{scan_id}/items').json()) == 2


@pytest.mark.parametrize('bad', [item('   '), item(status='missing'), item(confirmed=False), item(name=None)])
def test_invalid_review_rejected_without_changes(client, bad):
    scan_id = create_scan(client)
    save(client, scan_id, [item()])
    assert save(client, scan_id, [bad]).status_code == 422
    assert client.get(f'/api/scans/{scan_id}/items').json()[0]['name'] == 'Milk'


def test_cross_scan_and_duplicate_ids(client):
    a, b = create_scan(client), create_scan(client)
    saved = save(client, a, [item()]).json()[0]
    incoming = item(id=saved['id'])
    assert save(client, b, [incoming]).status_code == 409
    assert save(client, a, [incoming, incoming]).status_code == 422
    assert save(client, 99999, []).status_code == 404


def test_save_failure_rolls_back_entire_review(client, test_engine):
    scan_id = create_scan(client)
    saved = save(client, scan_id, [item()]).json()[0]
    def fail_flush(session, flush_context, instances):
        raise SQLAlchemyError('sensitive database details')
    event.listen(Session, 'before_flush', fail_flush)
    try:
        response = save(client, scan_id, [item('Changed', id=saved['id']), item('New food')])
    finally:
        event.remove(Session, 'before_flush', fail_flush)
    assert response.status_code == 503
    assert 'sensitive' not in response.text
    rows = client.get(f'/api/scans/{scan_id}/items').json()
    assert len(rows) == 1 and rows[0]['name'] == 'Milk'


def test_conversion_only_confirmed_low_and_persistent(client, database_url):
    scan_id = create_scan(client)
    save(client, scan_id, [item(), item('milk'), item('Eggs', 'available'), item('Cheese', 'unknown')])
    # Existing CRUD can still store an unconfirmed detection; conversion excludes it.
    client.post(f'/api/scans/{scan_id}/items', json=item('Unconfirmed', confirmed=False))
    response = client.post(f'/api/scans/{scan_id}/save-to-list')
    assert response.status_code == 200
    data = response.json()
    assert data['is_mock'] and data['source_scan_id'] == scan_id
    assert [i['name'] for i in data['items']] == ['Milk']
    assert data['items'][0]['quantity'] == 1
    assert client.post(f'/api/scans/{scan_id}/save-to-list').json()['id'] == data['id']
    assert len(client.get('/api/shopping-lists').json()) == 1
    # Renaming the list cannot remove its persisted mock flag.
    client.patch(f"/api/shopping-lists/{data['id']}", json={'name': 'My list'})
    assert client.get(f"/api/shopping-lists/{data['id']}").json()['is_mock']
    fresh = create_engine(database_url)
    with Session(fresh) as session:
        saved = session.get(ShoppingList, data['id'])
        assert saved.name == 'My list' and saved.items[0].name == 'Milk'
        assert saved.is_mock
    fresh.dispose()
    # A list is a snapshot: subsequent review edits don't overwrite shopping CRUD.
    save(client, scan_id, [item('Yogurt')])
    assert client.post(f'/api/scans/{scan_id}/save-to-list').json()['items'][0]['name'] == 'Milk'
    assert client.delete(f"/api/shopping-lists/{data['id']}").status_code == 204
    assert client.post(f'/api/scans/{scan_id}/save-to-list').json()['items'][0]['name'] == 'Yogurt'


def test_conversion_errors(client):
    scan_id = create_scan(client, mock=False)
    assert client.post(f'/api/scans/{scan_id}/save-to-list').status_code == 422
    save(client, scan_id, [item('Eggs', 'available')])
    assert client.post(f'/api/scans/{scan_id}/save-to-list').status_code == 422
    assert client.post('/api/scans/99999/save-to-list').status_code == 404
    assert client.get('/api/shopping-lists').json() == []


def test_existing_item_crud_and_null_validation(client):
    scan_id = client.post('/api/scans').json()['id']
    response = client.post(f'/api/scans/{scan_id}/items', json={'name': 'Eggs'})
    assert response.status_code == 201 and not response.json()['confirmed']
    item_id = response.json()['id']
    assert client.patch(f'/api/items/{item_id}', json={'name': 'Free-range eggs', 'confirmed': True}).json()['confirmed']
    assert client.patch(f'/api/items/{item_id}', json={'name': None}).status_code == 422
    assert client.patch(f'/api/items/{item_id}', json={'name': '  '}).status_code == 422
    assert client.delete(f'/api/items/{item_id}').status_code == 200
    assert client.delete(f'/api/items/{item_id}').status_code == 404


def test_additive_migration_preserves_legacy_rows(tmp_path):
    engine = create_engine('sqlite:///' + (tmp_path / 'legacy.db').as_posix())
    with engine.begin() as connection:
        connection.execute(text('CREATE TABLE scans (id INTEGER PRIMARY KEY, status VARCHAR, created_at DATETIME)'))
        connection.execute(text('CREATE TABLE shopping_lists (id INTEGER PRIMARY KEY, name VARCHAR NOT NULL, created_at DATETIME)'))
        connection.execute(text("INSERT INTO scans VALUES (7, 'pending', '2026-01-01')"))
        connection.execute(text("INSERT INTO shopping_lists VALUES (9, 'Keep my groceries', '2026-01-01')"))
    initialize_database(engine)
    initialize_database(engine)
    with Session(engine) as session:
        assert session.get(Scan, 7).is_mock is False
        assert session.get(ShoppingList, 9).name == 'Keep my groceries'
        assert session.get(ShoppingList, 9).source_scan_id is None
    engine.dispose()

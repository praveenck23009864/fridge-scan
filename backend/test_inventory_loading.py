def test_scan_items_return_the_complete_saved_inventory_and_keep_history(client):
    previous = client.post('/api/scans', json={}).json()['id']
    original = [{'name': 'Older snapshot only', 'stock_status': 'low', 'confirmed': True}]
    assert client.put(f'/api/scans/{previous}/review', json={'items': original}).status_code == 200
    current = client.post('/api/scans', json={}).json()['id']
    ingredients = [{'name': f'Ingredient {i}', 'category': 'Vegetables', 'confirmed': True,
                    'stock_status': 'low' if i % 3 == 0 else 'available'} for i in range(75)]
    assert client.put(f'/api/scans/{current}/review', json={'items': ingredients}).status_code == 200
    pending = client.post('/api/scans', json={}).json()['id']
    scans = client.get('/api/scans').json()
    assert scans[0]['id'] == pending
    assert next(scan['id'] for scan in scans if scan['status'] == 'reviewed') == current
    loaded = client.get(f'/api/scans/{current}/items').json()
    assert len(loaded) == 75
    assert {item['name'] for item in loaded} == {item['name'] for item in ingredients}
    assert all(item['confirmed'] for item in loaded)
    assert client.get(f'/api/scans/{previous}/items').json()[0]['name'] == 'Older snapshot only'


def test_twenty_review_rows_commit_confirmed_and_reuse_ids(client, test_engine):
    from sqlalchemy import text
    scan_id = client.post('/api/scans', json={}).json()['id']
    payload = [{'name': f'Saved food {i}', 'stock_status': 'available', 'confirmed': True} for i in range(20)]
    response = client.put(f'/api/scans/{scan_id}/review', json={'items': payload})
    assert response.status_code == 200
    saved = response.json()
    with test_engine.connect() as db:
        assert db.execute(text('SELECT status FROM scans WHERE id=:id'), {'id':scan_id}).scalar_one() == 'reviewed'
        assert db.execute(text('SELECT count(*) FROM detected_items WHERE scan_id=:id AND confirmed=1'), {'id':scan_id}).scalar_one() == 20
    changed = [{key: row[key] for key in ['id','name','stock_status','confirmed']} for row in saved[:-1]]
    changed[0]['name'] = 'Edited saved food'
    for _ in range(2):
        result = client.put(f'/api/scans/{scan_id}/review', json={'items':changed})
        assert result.status_code == 200
        assert [row['id'] for row in result.json()] == [row['id'] for row in saved[:-1]]
    loaded = client.get(f'/api/scans/{scan_id}/items').json()
    assert len(loaded) == 19 and loaded[0]['name'] == 'Edited saved food'
    with test_engine.connect() as db:
        assert db.execute(text('SELECT count(*) FROM detected_items WHERE scan_id=:id'), {'id':scan_id}).scalar_one() == 19

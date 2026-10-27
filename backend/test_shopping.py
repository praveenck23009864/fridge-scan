def test_shopping_crud(client):
    created = client.post('/api/shopping-lists', json={'name': 'Weekly groceries'})
    assert created.status_code == 201
    list_id = created.json()['id']
    assert not created.json()['is_mock']
    added = client.post(f'/api/shopping-lists/{list_id}/items', json={'name': 'Milk', 'quantity': 2})
    assert added.status_code == 201
    item_id = added.json()['id']
    changed = client.patch(f'/api/shopping-list-items/{item_id}', json={'completed': True, 'quantity': 3})
    assert changed.json()['completed'] and changed.json()['quantity'] == 3
    assert client.patch(f'/api/shopping-lists/{list_id}', json={'name': 'Weekend'}).json()['name'] == 'Weekend'
    assert client.get(f'/api/shopping-lists/{list_id}').json()['items'][0]['quantity'] == 3
    assert client.delete(f'/api/shopping-list-items/{item_id}').status_code == 204
    assert client.get(f'/api/shopping-lists/{list_id}').json()['items'] == []
    assert client.delete(f'/api/shopping-lists/{list_id}').status_code == 204
    assert client.get(f'/api/shopping-lists/{list_id}').status_code == 404
    assert client.get('/api/shopping-lists').json() == []

def test_categories_survive_legacy_review_and_conversion(client):
    scan=client.post('/api/scans',json={}).json()['id']
    rows=client.put(f'/api/scans/{scan}/review',json={'items':[{'name':'Milk','category':'Dairy','stock_status':'low','confirmed':True}]}).json()
    assert rows[0]['category']=='Dairy'
    rows=client.put(f'/api/scans/{scan}/review',json={'items':[{'id':rows[0]['id'],'name':'Milk','stock_status':'low','confirmed':True}]}).json()
    assert rows[0]['category']=='Dairy'
    listing=client.post(f'/api/scans/{scan}/save-to-list').json()
    assert listing['items'][0]['category']=='Dairy'

def test_bulk_recipe_items_deduplicate_and_validate_atomically(client):
    lid=client.post('/api/shopping-lists',json={'name':'Recipe list'}).json()['id']
    url=f'/api/shopping-lists/{lid}/bulk-items'
    payload={'items':[{'name':' Whole Milk ','category':'Dairy'},{'name':'whole   MILK','category':'Other'}]}
    for _ in range(2):
        result=client.post(url,json=payload)
        assert result.status_code==200 and len(result.json()['items'])==1
    assert client.post(url,json={'items':[{'name':'Eggs'},{'name':'Bad','category':'Invalid'}]}).status_code==422
    assert len(client.get(f'/api/shopping-lists/{lid}').json()['items'])==1

import concurrent.futures
import pytest
from sqlalchemy import event
from sqlalchemy.orm import Session,sessionmaker
from sqlalchemy.exc import SQLAlchemyError
import crud


def scan(client, names=('Milk','Tomatoes')):
    sid=client.post('/api/scans',json={}).json()['id']
    client.put(f'/api/scans/{sid}/review',json={'items':[{'name':name,'confirmed':True,'stock_status':'low'} for name in names]})
    return sid

def listing(client):
    return client.post('/api/shopping-lists',json={'name':'Weekly'}).json()['id']

def test_latest_reviewed_and_confirmed_only(client):
    assert client.get('/api/fridge-suggestions').json()['items']==[]
    scan(client)
    latest=scan(client,(' Cheese ','cheese'))
    client.post(f'/api/scans/{latest}/items',json={'name':'Draft','confirmed':False,'stock_status':'low'})
    client.post('/api/scans',json={}) # pending is not eligible
    data=client.get('/api/fridge-suggestions').json()
    assert data['scan_id']==latest and [i['name'] for i in data['items']]==['Cheese']
    scan(client,()) # latest reviewed empty must NOT fall back to older low-stock rows
    assert client.get('/api/fridge-suggestions').json()['items']==[]

def test_bulk_add_normalization_idempotence_and_persistence(client,database_url):
    scan(client,('Whole Milk','Tomatoes'))
    lid=listing(client)
    client.post(f'/api/shopping-lists/{lid}/items',json={'name':' whole   MILK '})
    data=client.get('/api/fridge-suggestions').json()
    payload={'scan_id':data['scan_id'],'item_ids':[x['id'] for x in data['items']]}
    for _ in range(2):
        result=client.post(f'/api/shopping-lists/{lid}/fridge-suggestions',json=payload)
        assert result.status_code==200 and len(result.json()['items'])==2
    from sqlalchemy import create_engine
    from models import ShoppingList
    engine=create_engine(database_url)
    with Session(engine) as db:
        assert len(db.get(ShoppingList,lid).items)==2
    engine.dispose()

def test_stale_or_invalid_selection_is_atomic(client):
    scan(client);lid=listing(client);data=client.get('/api/fridge-suggestions').json()
    payload={'scan_id':data['scan_id'],'item_ids':[data['items'][0]['id'],999999]}
    assert client.post(f'/api/shopping-lists/{lid}/fridge-suggestions',json=payload).status_code==409
    assert client.get(f'/api/shopping-lists/{lid}').json()['items']==[]
    scan(client)
    payload['item_ids']=[data['items'][0]['id']]
    assert client.post(f'/api/shopping-lists/{lid}/fridge-suggestions',json=payload).status_code==409

def test_rollback_on_failure(client):
    scan(client);lid=listing(client);data=client.get('/api/fridge-suggestions').json()
    def fail(*args):raise SQLAlchemyError('private failure')
    event.listen(Session,'before_flush',fail)
    try:
        result=client.post(f'/api/shopping-lists/{lid}/fridge-suggestions',json={'scan_id':data['scan_id'],'item_ids':[x['id'] for x in data['items']]})
    finally:event.remove(Session,'before_flush',fail)
    assert result.status_code==503 and 'private failure' not in result.text
    assert client.get(f'/api/shopping-lists/{lid}').json()['items']==[]

def test_concurrent_double_submit(client,test_engine):
    scan(client);lid=listing(client);data=client.get('/api/fridge-suggestions').json()
    sessions=sessionmaker(bind=test_engine)
    def add():
        with sessions() as db:
            return crud.add_fridge_suggestions(db,lid,data['scan_id'],[x['id'] for x in data['items']]).id
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        assert list(pool.map(lambda _:add(),range(2)))==[lid,lid]
    assert len(client.get(f'/api/shopping-lists/{lid}').json()['items'])==2

@pytest.mark.parametrize('payload',[{'scan_id':1,'item_ids':[]},{'scan_id':1,'item_ids':[-1]},{'scan_id':1,'item_ids':[True]}])
def test_invalid_payload(client,payload):
    assert client.post('/api/shopping-lists/1/fridge-suggestions',json=payload).status_code==422

def test_missing_target(client):
    scan(client);data=client.get('/api/fridge-suggestions').json()
    assert client.post('/api/shopping-lists/999/fridge-suggestions',json={'scan_id':data['scan_id'],'item_ids':[data['items'][0]['id']]}).status_code==404

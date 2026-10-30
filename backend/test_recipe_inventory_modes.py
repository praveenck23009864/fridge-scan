import copy
from test_recipes import cloud, GOOD, config
import recipe_service as recipes


def test_american_verified_match(monkeypatch):
    calls = cloud(monkeypatch)
    result = recipes.generate_recipes(['Tomato'], cuisine='american', mode='almost')['recipes'][0]
    assert result['ingredient_match'] == 50
    assert result['cuisine'] == 'american'
    assert 'american' in calls[0]['messages'][1]['content']


def test_almost_rejects_three_extras(monkeypatch):
    payload = copy.deepcopy(GOOD)
    payload['recipes'][0]['missing_ingredients'] += [{'name': n, 'quantity': ''} for n in ['Oil', 'Butter']]
    cloud(monkeypatch, payload)
    assert recipes.generate_recipes(['Tomato'], mode='almost')['recipes'] == []


def test_empty_results(monkeypatch):
    cloud(monkeypatch, {'recipes': []})
    assert recipes.generate_recipes(['Tomato'])['recipes'] == []

import pytest

@pytest.mark.parametrize('left,right', [('tomatoes','tomato'),('capsicum','bell pepper'),('brinjal','eggplant'),('cilantro','coriander')])
def test_safe_aliases(left, right):
    assert recipes.ingredient_key(left) == recipes.ingredient_key(right)

@pytest.mark.parametrize('left,right', [('tomato sauce','tomato'),('coriander seeds','cilantro'),('egg','eggplant'),('pepper','bell pepper')])
def test_unrelated_foods(left, right):
    assert recipes.ingredient_key(left) != recipes.ingredient_key(right)


def test_latest_snapshot_stock_and_no_mutation(client, monkeypatch):
    old = client.post('/api/scans', json={}).json()['id']
    client.put(f'/api/scans/{old}/review', json={'items':[{'name':'Old food','confirmed':True,'stock_status':'available'}]})
    latest = client.post('/api/scans', json={}).json()['id']
    client.put(f'/api/scans/{latest}/review', json={'items':[
        {'name':'Tomato','confirmed':True,'stock_status':'available'},
        {'name':'Milk','confirmed':True,'stock_status':'low'},
        {'name':'Rice','confirmed':True,'stock_status':'unknown'}]})
    client.post(f'/api/scans/{latest}/items', json={'name':'Butter','confirmed':False,'stock_status':'available'})
    client.post('/api/scans', json={})  # Pending scan never replaces saved inventory.
    before = client.get(f'/api/scans/{latest}/items').json()
    cloud(monkeypatch)
    result = client.post('/api/recipes/generate', json={'scan_id':old,'cuisine':'american','mode':'almost'})
    assert result.status_code == 200
    assert result.json()['inventory'] == {'scan_id':latest,'available':['Tomato'],'low':['Milk'],'unknown':['Rice']}
    assert result.json()['recipes'][0]['quantity_status'] == 'unverified'
    assert client.get(f'/api/scans/{latest}/items').json() == before


def test_zero_available_low_unknown(client, monkeypatch):
    scan = client.post('/api/scans', json={}).json()['id']
    client.put(f'/api/scans/{scan}/review', json={'items':[{'name':'Milk','confirmed':True,'stock_status':'low'},{'name':'Rice','confirmed':True,'stock_status':'unknown'}]})
    calls = cloud(monkeypatch)
    assert client.post('/api/recipes/generate', json={}).status_code == 422
    assert not calls

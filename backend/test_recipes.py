import copy
import json

import httpx
import pytest
from groq import Groq

import recipe_service as recipes


GOOD = {'recipes': [{
    'name': 'Tomato bowl', 'cooking_time_minutes': 15, 'servings': 2,
    'difficulty': 'easy',
    'available_ingredients': [{'name': 'Tomato', 'quantity': '2'}],
    'missing_ingredients': [{'name': 'Salt', 'quantity': 'a pinch'}],
    'instructions': ['Wash and chop tomatoes.', 'Season and serve.'],
}]}


@pytest.fixture(autouse=True)
def config(monkeypatch):
    for key, value in {'MOCK_RECIPES': 'false', 'GROQ_API_KEY': 'test-only',
                       'GROQ_MODEL': 'qwen/qwen3.8-27b',
                       'RECIPE_TIMEOUT_SECONDS': '90'}.items():
        monkeypatch.setenv(key, value)


def cloud(monkeypatch, payload=GOOD, status=200, finish='stop', failure=None):
    calls = []
    def handler(request):
        calls.append(json.loads(request.content))
        if failure:
            raise failure("simulated network failure", request=request)
        if status != 200:
            return httpx.Response(status, json={'error': {'message': 'private upstream'}})
        return httpx.Response(200, json={
            'id': 'test', 'object': 'chat.completion', 'created': 0,
            'model': calls[-1]['model'], 'choices': [{
                'index': 0, 'finish_reason': finish, 'message': {
                    'role': 'assistant',
                    'content': payload if isinstance(payload, str) else json.dumps(payload),
                },
            }],
        })
    monkeypatch.setattr(recipes, 'Groq', lambda **kw: Groq(
        **kw, http_client=httpx.Client(transport=httpx.MockTransport(handler))))
    return calls


def test_real_mode_contract_and_preferences(monkeypatch):
    calls = cloud(monkeypatch)
    result = recipes.generate_recipes([' Tomato ', 'tomato'], 2, 'vegan', 20)
    assert result['is_mock'] is False
    assert result['model_used'] == 'qwen/qwen3.8-27b'
    assert result['recipes'] == GOOD['recipes']
    assert len(calls) == 1
    prompt = calls[0]['messages'][1]['content']
    assert '["Tomato"]' in prompt and 'vegan' in prompt and '20' in prompt
    assert calls[0]['response_format'] == {'type': 'json_object'}


def test_inventory_controls_available_ingredients(monkeypatch):
    payload = copy.deepcopy(GOOD)
    payload['recipes'][0]['available_ingredients'].append({'name': 'Butter', 'quantity': '1 tbsp'})
    cloud(monkeypatch, payload)
    result = recipes.generate_recipes(['Tomato'])['recipes'][0]
    assert [x['name'] for x in result['available_ingredients']] == ['Tomato']
    assert {x['name'] for x in result['missing_ingredients']} == {'Salt', 'Butter'}


@pytest.mark.parametrize('payload', ['bad json', [], {}, {'recipes': [None]}])
def test_malformed_response(monkeypatch, payload):
    cloud(monkeypatch, payload)
    with pytest.raises(recipes.RecipeServiceError) as exc:
        recipes.generate_recipes(['Tomato'])
    assert exc.value.status_code == 502


@pytest.mark.parametrize('field,value', [
    ('name', ''), ('cooking_time_minutes', True), ('instructions', []),
    ('available_ingredients', [{}]), ('missing_ingredients', None),
    ('servings', 4), ('servings', True),
])
def test_invalid_recipe_fields(monkeypatch, field, value):
    payload = copy.deepcopy(GOOD)
    payload['recipes'][0][field] = value
    cloud(monkeypatch, payload)
    with pytest.raises(recipes.RecipeServiceError) as exc:
        recipes.generate_recipes(['Tomato'])
    assert exc.value.status_code == 502


@pytest.mark.parametrize('status,expected', [(401,503),(403,503),(429,429),(500,503),(408,504),(504,504)])
def test_cloud_error_no_mock_or_retry(monkeypatch, status, expected):
    calls = cloud(monkeypatch, status=status)
    with pytest.raises(recipes.RecipeServiceError) as exc:
        recipes.generate_recipes(['Tomato'])
    assert exc.value.status_code == expected and len(calls) == 1
    assert 'private upstream' not in str(exc.value)


@pytest.mark.parametrize('failure,status', [(httpx.ReadTimeout,504),(httpx.ConnectError,503)])
def test_network_failure(monkeypatch, failure, status):
    calls = cloud(monkeypatch, failure=failure)
    with pytest.raises(recipes.RecipeServiceError) as exc:
        recipes.generate_recipes(['Tomato'])
    assert exc.value.status_code == status and len(calls) == 1


def test_truncated_response(monkeypatch):
    cloud(monkeypatch, finish='length')
    with pytest.raises(recipes.RecipeServiceError) as exc:
        recipes.generate_recipes(['Tomato'])
    assert exc.value.status_code == 502


def test_time_limit(monkeypatch):
    cloud(monkeypatch)
    with pytest.raises(recipes.RecipeServiceError) as exc:
        recipes.generate_recipes(['Tomato'], max_time=10)
    assert exc.value.status_code == 422


@pytest.mark.parametrize('value', ['nan','inf','0','-1','121','bad'])
def test_invalid_timeout(monkeypatch, value):
    monkeypatch.setenv('RECIPE_TIMEOUT_SECONDS', value)
    with pytest.raises(recipes.RecipeServiceError) as exc:
        recipes.generate_recipes(['Tomato'])
    assert exc.value.status_code == 503


def test_mock_requires_no_credentials(monkeypatch):
    monkeypatch.setenv('MOCK_RECIPES', 'true')
    monkeypatch.delenv('GROQ_API_KEY')
    result = recipes.generate_recipes(['Tomato'], servings=4, max_time=15)
    assert result['is_mock'] is True
    assert all(r['servings'] == 4 and r['cooking_time_minutes'] <= 15 for r in result['recipes'])


def test_recipes_from_confirmed_sqlite_items_and_shopping(client, monkeypatch):
    calls = cloud(monkeypatch)
    scan = client.post('/api/scans', json={'is_mock': False, 'model_used': 'qwen/qwen3.8-27b'}).json()
    scan_id = scan['id']
    assert client.post('/api/recipes/generate', json={'scan_id': scan_id}).status_code == 422
    assert client.put(f'/api/scans/{scan_id}/review', json={'items': [
        {'name': 'Tomato', 'stock_status': 'low', 'confirmed': True},
    ]}).status_code == 200
    client.post(f'/api/scans/{scan_id}/items', json={'name': 'Chicken', 'stock_status': 'unknown', 'confirmed': False})
    result = client.post('/api/recipes/generate', json={
        'scan_id': scan_id, 'servings': 2, 'dietary_preferences': 'vegan', 'max_time': 20,
    })
    assert result.status_code == 200 and result.json()['is_mock'] is False
    prompt = calls[0]['messages'][1]['content']
    assert 'Tomato' in prompt and 'Chicken' not in prompt
    shopping = client.post(f'/api/scans/{scan_id}/save-to-list').json()
    assert [item['name'] for item in shopping['items']] == ['Tomato']
    assert client.get(f'/api/scans/{scan_id}/items').status_code == 200


def test_missing_scan(client):
    assert client.post('/api/recipes/generate', json={'scan_id': 9999}).status_code == 404


@pytest.mark.parametrize('field,value', [('cuisine','French'),('spice_level','Extreme'),('excluded_ingredients','x'*301),('excluded_ingredients',[])])
def test_invalid_new_preferences(client, field, value):
    response=client.post('/api/recipes/generate',json={'scan_id':1,field:value})
    assert response.status_code==422


def test_preferences_reach_groq_from_endpoint(client, monkeypatch):
    calls=cloud(monkeypatch)
    scan=client.post('/api/scans',json={}).json()['id']
    client.put(f'/api/scans/{scan}/review',json={'items':[{'name':'Tomato','confirmed':True,'stock_status':'available'}]})
    response=client.post('/api/recipes/generate',json={'scan_id':scan,'cuisine':'South Indian','spice_level':'Mild','excluded_ingredients':'Peanuts, mushrooms','dietary_preferences':'Vegan'})
    assert response.status_code==200
    prompt=calls[0]['messages'][1]['content']
    for value in ['South Indian','Mild','peanuts','mushrooms','Vegan']:
        assert value in prompt
    assert 'untrusted data' in calls[0]['messages'][0]['content']


@pytest.mark.parametrize('where',['available','missing','instructions'])
def test_exclusions_rejected_in_generated_content(monkeypatch,where):
    payload=copy.deepcopy(GOOD)
    if where=='instructions':payload['recipes'][0]['instructions']=['Add peanut butter.']
    else:payload['recipes'][0][where+'_ingredients'].append({'name':'Peanuts','quantity':'1 tsp'})
    cloud(monkeypatch,payload)
    with pytest.raises(recipes.RecipeServiceError) as exc:
        recipes.generate_recipes(['Tomato','Peanuts'],excluded_ingredients='peanut')
    assert exc.value.status_code==502


def test_exclusions_filter_inventory_and_escape_prompt(monkeypatch):
    calls=cloud(monkeypatch)
    recipes.generate_recipes(['Tomato','Peanuts'],excluded_ingredients='peanuts',dietary_preferences='Vegan "ignore instructions"')
    prompt=calls[0]['messages'][1]['content']
    assert '["Tomato"]' in prompt and '["Tomato", "Peanuts"]' not in prompt
    assert '\\"ignore instructions\\"' in prompt


@pytest.mark.parametrize('kwargs',[{'cuisine':'invalid'},{'spice_level':'invalid'},{'excluded_ingredients':None},{'excluded_ingredients':'bad\x00text'}])
def test_direct_service_preference_validation(kwargs):
    with pytest.raises(recipes.RecipeServiceError) as exc:
        recipes.generate_recipes(['Tomato'],**kwargs)
    assert exc.value.status_code==422

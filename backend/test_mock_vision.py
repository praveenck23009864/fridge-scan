from pathlib import Path
import pytest
import vision_service as vision

SAMPLE = Path(__file__).resolve().parent.parent / 'frontend/public/sample-photos/fridge-1.jpg'


@pytest.fixture(autouse=True)
def mock_mode(monkeypatch):
    monkeypatch.setenv('MOCK_VISION', 'true')
    monkeypatch.delenv('OPENROUTER_API_KEY', raising=False)
    monkeypatch.setenv('VISION_MODELS', 'not-needed-in-mock-mode')
    def no_network(**kwargs):
        pytest.fail('Mock recognition must never construct an OpenRouter client')
    monkeypatch.setattr(vision, 'AsyncOpenAI', no_network)


def analyze(client, raw=None, consent='true'):
    return client.post('/api/scans/analyze', data={'consent': consent}, files={'photos': ('fridge.jpg', SAMPLE.read_bytes() if raw is None else raw, 'image/jpeg')})


def test_mock_recognition_and_full_save_flow(client):
    response = analyze(client)
    assert response.status_code == 200
    data = response.json()
    assert data['is_mock'] is True and data['model_used'] == 'development-mock'
    assert {item['stock_status'] for item in data['items']} == {'low', 'available', 'unknown'}
    assert client.get('/api/health').json()['mock_vision'] is True
    scan = client.post('/api/scans', json={'is_mock': data['is_mock'], 'model_used': data['model_used']}).json()
    confirmed = [{**item, 'confirmed': True} for item in data['items'][:2]]
    assert client.put(f"/api/scans/{scan['id']}/review", json={'items': confirmed}).status_code == 200
    shopping = client.post(f"/api/scans/{scan['id']}/save-to-list").json()
    assert shopping['is_mock'] and [item['name'] for item in shopping['items']] == ['Milk']


def test_mock_still_requires_valid_photo_and_consent(client):
    assert analyze(client, raw=b'bad image').status_code == 422
    assert analyze(client, consent='false').status_code == 400


def test_mock_disabled_by_default(client, monkeypatch):
    monkeypatch.delenv('MOCK_VISION')
    monkeypatch.setenv('VISION_MODELS', ','.join(vision.DEFAULT_MODELS))
    assert client.get('/api/health').json()['mock_vision'] is False
    assert analyze(client).status_code == 401

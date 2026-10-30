"""Catalog maintenance is manual; tests never contact the provider."""
import importlib.util
import json
from pathlib import Path
from urllib.error import HTTPError, URLError

import pytest

spec = importlib.util.spec_from_file_location('photo_import', Path(__file__).resolve().parents[1] / 'scripts/import_food_photos.py')
photos = importlib.util.module_from_spec(spec)
spec.loader.exec_module(photos)


def provider_response(license_name='CC BY-SA 4.0'):
    return json.dumps({'query': {'pages': {'1': {'imageinfo': [{
        'thumburl': 'https://upload.wikimedia.org/test-photo.jpg',
        'descriptionurl': 'https://commons.wikimedia.org/wiki/File:Kale.jpg',
        'extmetadata': {'LicenseShortName': {'value': license_name},
            'LicenseUrl': {'value': 'https://creativecommons.org/licenses/by-sa/4.0/'},
            'Artist': {'value': '<a>Photographer &amp; author</a>'}},
    }]}}}}).encode()


def test_image_search_uses_curated_title_and_preserves_attribution(monkeypatch):
    calls = []
    monkeypatch.setattr(photos, 'fetch', lambda url: calls.append(url) or provider_response())
    info, entry = photos.metadata('Kale.jpg')
    assert 'titles=File%3AKale.jpg' in calls[0]
    assert info['thumburl'].startswith('https://upload.wikimedia.org/')
    assert entry['author'] == 'Photographer & author'
    assert entry['license'] == 'CC BY-SA 4.0'


@pytest.mark.parametrize('payload', [b'not json', b'{}', provider_response('All rights reserved')])
def test_missing_or_unlicensed_results_are_not_imported(monkeypatch, payload):
    monkeypatch.setattr(photos, 'fetch', lambda url: payload)
    with pytest.raises(photos.PhotoImportError):
        photos.metadata('Unknown.jpg')


@pytest.mark.parametrize('failure, message', [
    (HTTPError('https://commons.wikimedia.org', 429, 'limited', {}, None), 'rate limit'),
    (HTTPError('https://commons.wikimedia.org', 503, 'unavailable', {}, None), 'HTTP 503'),
    (URLError('offline'), 'connectivity'), (TimeoutError(), 'connectivity'),
])
def test_provider_failure_does_not_retry_or_expose_response(monkeypatch, failure, message):
    calls = []
    def fail(*args, **kwargs):
        calls.append(1)
        raise failure
    monkeypatch.setattr(photos.urllib.request, 'urlopen', fail)
    with pytest.raises(photos.PhotoImportError, match=message):
        photos.fetch('https://commons.wikimedia.org/w/api.php')
    assert len(calls) == 1


def test_successful_downloads_are_reused_without_network(monkeypatch, tmp_path):
    (tmp_path / 'kale.webp').write_bytes(b'already downloaded')
    (tmp_path / 'catalog.json').write_text(json.dumps({'kale': {'file': 'kale.webp'}}))
    monkeypatch.setattr(photos, 'FOODS', tmp_path)
    monkeypatch.setattr(photos, 'TITLES', {'kale': 'Kale.jpg'})
    monkeypatch.setattr(photos, 'fetch', lambda url: pytest.fail('Cached asset must not be fetched'))
    photos.main()
    assert (tmp_path / 'kale.webp').read_bytes() == b'already downloaded'


def test_untrusted_image_host_is_rejected():
    with pytest.raises(photos.PhotoImportError, match='Unexpected'):
        photos.fetch('https://untrusted.example/food.jpg')

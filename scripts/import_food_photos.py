"""Maintain the local Commons catalog; never called by the application.

Only curated, visually reviewed file titles are eligible. No API key is needed.
Licensed derivatives are stored locally with attribution, avoiding runtime provider
outages, rate limits, or disclosure of users' ingredient names. Existing files stay
untouched. Back up catalog.json and credits.html before running this manually.
"""
import html
import io
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
FOODS = ROOT / 'frontend/public/foods'
TITLES = {
    'red-bell-pepper': 'Red bell pepper.jpg',
    'yellow-bell-pepper': 'Yellow Bell Pepper (5572058294).jpg',
    'orange': 'Orange-Fruit-Pieces.jpg',
    'kale': 'Fruits and Vegetables (20150823-AMS-LSC-0002).jpg',
    'cabbage': 'Cabbage.jpg',
    'cucumber': 'Cucumber Slices.JPG',
}
ALLOWED_LICENSES = {'CC0', 'Public domain'} | {
    f'{prefix} {version}' for prefix in ('CC BY', 'CC BY-SA')
    for version in ('1.0', '2.0', '2.5', '3.0', '4.0')
}


class PhotoImportError(Exception):
    pass


def fetch(url):
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != 'https' or parsed.hostname not in {
        'commons.wikimedia.org', 'upload.wikimedia.org', 'thumb.wikimedia.org'
    }:
        raise PhotoImportError('Unexpected image provider URL.')
    request = urllib.request.Request(url, headers={
        'User-Agent': 'Fridgely/1.0 (local educational food photograph catalog)'
    })
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            content = response.read(8_000_001)
        if len(content) > 8_000_000:
            raise PhotoImportError('Provider response is too large.')
        return content
    except urllib.error.HTTPError as error:
        if error.code == 429:
            raise PhotoImportError('Commons rate limit reached. Stop and retry later; existing photos are retained.') from None
        raise PhotoImportError(f'Commons returned HTTP {error.code}; existing photos are retained.') from None
    except (urllib.error.URLError, TimeoutError):
        raise PhotoImportError('Commons is unavailable. Check connectivity and retry later.') from None


def metadata(title):
    params = urllib.parse.urlencode({'action': 'query', 'format': 'json',
        'titles': 'File:' + title, 'prop': 'imageinfo', 'iiprop': 'url|extmetadata', 'iiurlwidth': 330})
    try:
        payload = json.loads(fetch('https://commons.wikimedia.org/w/api.php?' + params))
        page = next(iter(payload.get('query', {}).get('pages', {}).values()), {})
        info = page.get('imageinfo', [{}])[0]
        tags = info.get('extmetadata', {})
        license_name = tags.get('LicenseShortName', {}).get('value', '')
        if license_name not in ALLOWED_LICENSES or not info.get('thumburl') or not info.get('descriptionurl'):
            raise PhotoImportError('No reusable photograph with attribution was returned.')
        author = html.unescape(re.sub('<[^>]+>', '', tags.get('Artist', {}).get('value', ''))).strip()
        if not author:
            raise PhotoImportError('Missing author attribution; review the source manually.')
        return info, {'title': title, 'author': author, 'source': info['descriptionurl'],
            'license': license_name, 'licenseUrl': tags.get('LicenseUrl', {}).get('value') or 'https://commons.wikimedia.org/wiki/Commons:Public_domain',
            'changes': 'Resized to a 330px thumbnail; converted to WebP; EXIF removed.'}
    except (ValueError, TypeError, KeyError, IndexError):
        raise PhotoImportError('Invalid Commons metadata response.') from None


def write_credits(catalog, destination):
    escape = html.escape
    parts = ['<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fridgely photo credits</title><style>body{font:16px system-ui;max-width:900px;margin:auto;padding:24px;color:#172b3a;background:#f8fafc}article{padding:20px;background:white;margin:20px 0;border-radius:12px}img{height:130px;max-width:100%;object-fit:contain}a{color:#157347}</style><h1>Food reference photograph credits</h1><p>Licensed reference photos, not photographs of your fridge. No endorsement is implied. Derivatives retain the original licenses, including share-alike terms. Follow the source and license links for reuse conditions.</p>']
    for key, entry in catalog.items():
        parts.append(f'<article><h2>{escape(key.replace("-", " ").title())}</h2><img loading="lazy" src="{escape(entry["file"])}" width="160" alt="Reference photograph of {escape(key)}"><p>{escape(entry["title"])} — {escape(entry["author"])}</p><p><a href="{escape(entry["source"])}">Original source</a> · <a href="{escape(entry["licenseUrl"])}">{escape(entry["license"])}</a></p><p>{escape(entry["changes"])}</p></article>')
    destination.write_text('\n'.join(parts) + '</html>\n', encoding='utf8')


def main():
    catalog_path = FOODS / 'catalog.json'
    catalog = json.loads(catalog_path.read_text(encoding='utf8'))
    for key, title in TITLES.items():
        if key in catalog and (FOODS / catalog[key]['file']).is_file():
            continue  # Reuse successful local downloads; no provider request.
        info, entry = metadata(title)
        photo = ImageOps.exif_transpose(Image.open(io.BytesIO(fetch(info['thumburl'])))).convert('RGB')
        photo.thumbnail((480, 480))
        destination = FOODS / f'{key}.webp'
        if destination.exists():
            raise PhotoImportError('Uncataloged file exists; review it before replacing.')
        photo.save(destination, 'WEBP', quality=82, method=6)
        catalog[key] = {**entry, 'file': destination.name, 'width': photo.width, 'height': photo.height}
        catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
        write_credits(catalog, FOODS / 'credits.html')
        print(f'{key}: {entry["license"]}, {photo.width} x {photo.height}', flush=True)
        time.sleep(8)  # Respect the shared provider; never retry failures in a loop.


if __name__ == '__main__':
    try:
        main()
    except PhotoImportError as error:
        raise SystemExit(str(error)) from None

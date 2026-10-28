# Fridgely GroqCloud recognition and recipes

Start the backend from `backend` with `venv\Scripts\python.exe -m uvicorn main:app --reload --host 127.0.0.1 --port 8000`, and start the frontend from `frontend` with `npm run dev`.

Configuration loads from `backend/.env`, independently of the launch directory. Process environment variables take precedence. See `.env.example`; restart the backend after configuration changes. Set `GROQ_API_KEY` locally and `GROQ_MODEL` to the model enabled for your account. Both recognition and recipe generation use the Groq SDK and the configured model. There is no OpenRouter model fallback.

`VISION_TOTAL_TIMEOUT_SECONDS` and `RECIPE_TIMEOUT_SECONDS` default to 90 seconds. SDK retries are disabled. Provider errors, rate limits, timeouts and invalid output become actionable errors; they never silently enable mock mode.

Uploads accept 1?3 JPEG/PNG/WebP files, at most 5 MiB and 25 megapixels each. Actual decoding checks format, corruption, resolution, darkness and extremely smooth images. Images are resized and encoded before inference. Blur detection is a conservative heuristic, not a guarantee of focus. Recognition cannot guarantee food identity or quantity. Low-stock output requires visual evidence; absent evidence becomes unknown. Duplicate names are merged conservatively. Sample photos are development fixtures, not proof of live recognition accuracy.

Recognition does not write uploaded photos to disk. The browser releases previews and camera streams when appropriate. Groq's own retention policy still applies to cloud processing. Confirmed food metadata is stored only through the existing save workflow.

## Development and automated tests

Set `MOCK_VISION=true` and `MOCK_RECIPES=true` explicitly for development without AI charges. Mock vision still checks uploaded images and consent. Real inference uses `is_mock: false`; mock results are clearly labeled DEMO.

Automated tests use HTTPX mocked transports, disposable SQLite databases and a network-blocking fixture. The manual scripts `test_groq.py` and `test_groq_vision.py` remain available for troubleshooting but are excluded from pytest collection. Running either manually makes a live request and can consume credits. Do not include API keys or encoded images in logs.

The direct backend runtime dependencies are recorded in `requirements.txt`; test dependencies are in `requirements-dev.txt`. Versions reflect the working local environment. No dependency installation is needed for the existing virtual environment.

## Saved reviews and shopping lists

Recognition responses now include `is_mock: true|false`. Mock responses use
`model_used: "development-mock"`; their foods are illustrative sample data,
not observations of the uploaded photos. The frontend shows a mock-mode
notice before analysis and a DEMO label on the review. Mock provenance is
stored with the scan and retained on its shopping list even after renaming.

Review workflow:

1. Capture or load sample photos, give consent, and analyze.
2. Edit food names and stock status, delete wrong detections, or add missing food.
3. Confirm items individually. Editing a confirmed item requires confirmation again.
4. Choose **Save confirmed items**. Only checked items are kept in the saved
   scan; unchecked rows stay on screen as unsaved drafts. Deletions take effect
   when saved. Saving a review is one transaction, so a failed save does not
   partially replace the saved items. Errors keep the draft available for retry.
5. Choose **Create shopping list from low-stock items** after saving. Only
   confirmed, saved, low-stock items are included, with duplicate names merged.
6. Reload to reopen the latest saved review, or select a scan from **Saved scans**.

Each scan creates one shopping-list snapshot. Repeated conversion returns the
existing list without duplicating it or overwriting manual shopping-list edits.
Later review changes do not update that snapshot. Delete the generated list
before converting again if a new snapshot is needed.

The existing scan and item CRUD routes remain available. `POST /api/scans`
optionally accepts `is_mock` and `model_used`; its original bodyless call still
works. New routes:

- `PUT /api/scans/{scan_id}/review`: `{ "items": [...] }`, a complete confirmed
  snapshot. Rows have `name`, `stock_status`, `confirmed: true`, and optionally
  an existing item `id`. Omitted stored rows are deleted. Empty snapshots clear
  the saved review. Invalid/foreign IDs return 409; invalid input returns 422.
- `POST /api/scans/{scan_id}/save-to-list`: returns a persistent shopping list;
  returns 422 when no confirmed low-stock items exist and 404 for missing scans.

Startup performs an idempotent additive SQLite migration for scan provenance
and the shopping list's source scan. It preserves existing tables and rows.
The default database path is anchored to `backend/fridge_scan.db`, so launching
from another directory cannot accidentally create an empty database elsewhere.
`DATABASE_URL` can override this for isolated tests.

Automated validation:

```powershell
cd D:\fridge-scan-mvp\backend
.\venv\Scripts\python.exe -m py_compile main.py vision_service.py crud.py schemas.py database.py models.py
.\venv\Scripts\python.exe -m pytest
cd ..\frontend
npm test
npm run build
npm run lint
```

Backend tests use disposable SQLite files, including tests of migration,
transaction rollback, and persistence through a second engine. Frontend tests
use Vitest, jsdom, and Testing Library for real UI interactions with mocked API
responses. These do not establish live GroqCloud availability or test physical
camera hardware.

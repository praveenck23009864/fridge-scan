# OpenRouter fridge recognition

Run from two PowerShell terminals:

```powershell
cd D:\fridge-scan-mvp\backend
.\venv\Scripts\python.exe -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

```powershell
cd D:\fridge-scan-mvp\frontend
npm run dev
```

Configuration loads from `backend/.env`, independent of the launch directory;
existing process environment values take precedence. See `.env.example`.
Restart the backend after changing configuration.

The configured order is Gemma 4 31B (free), Qwen3 VL 8B, Gemini 3 Flash
Preview, GPT-4.1 Mini, GPT-4o Mini. Exactly five distinct model IDs are required.
`ALLOW_PAID_VISION_FALLBACK=false` is the safe default: only IDs ending in
`:free` are attempted. Set it to `true` explicitly to allow all five, including
paid primary models. Models are attempted once each in configured order;
provider routing can switch providers within the same model. SDK retries and
server-side model fallback are disabled. HTTP 401/402 stop immediately.
Provider failures, timeouts, rate limits, empty results, invalid JSON and schema
errors move to the next permitted model. Requests have a 60-second total
recognition deadline and a 12-second per-model deadline, configurable up to
120 seconds. Upload time is outside the recognition deadline.

On 2026-10-27, OpenRouter's authenticated key endpoint returned 200, while
`qwen/qwen-2.5-vl-7b-instruct:free` returned 404 with the explicit message that
no provider serves that model anymore. The old code ignored VISION_MODELS
from .env, hardcoded that retired model, and reduced upstream failures to 503.
It also had no application-level fallback for invalid output.

The live public `/api/v1/models` catalog listed all five replacement model IDs
with image input support. Approximate USD input/output price per million tokens:

| Model | Input | Output |
| --- | ---: | ---: |
| google/gemma-4-31b-it:free | 0 | 0 |
| qwen/qwen3-vl-8b-instruct | 0.25 | 0.75 |
| google/gemini-3-flash-preview | 0.50 | 3.00 |
| openai/gpt-4.1-mini | 0.40 | 1.60 |
| openai/gpt-4o-mini | 0.15 | 0.60 |

Pricing/provider availability can change; image and other charges may vary.
Source: https://openrouter.ai/api/v1/models
A real image request using the bundled fridge-1.jpg sample and replacement
Gemma model received HTTP 429; live recognition did not succeed. Paid models
were not invoked. Catalog presence does not guarantee capacity for an account.

Uploads accept 1-3 JPEG/PNG/WebP files, at most 5 MiB and 25 megapixels each.
Actual image decoding verifies format; corrupt, very dark, and extremely smooth
images receive actionable errors. Blur detection is a conservative edge-variance
heuristic and can reject featureless images. Recognition cannot guarantee food
identity or quantity. Low-stock output requires the model to supply visual
evidence; absent evidence becomes unknown. Duplicate names are normalized and
merged conservatively; semantic duplicate merging is also requested in the prompt.
Bundled samples are illustrations, not real fridge photographs.

Images are not written to disk by recognition and scans are not automatically
persisted by this endpoint; existing CRUD and SQLite storage remain separate.
Existing local database files have not been deleted or recreated.

Validation:

```powershell
cd D:\fridge-scan-mvp\backend
.\venv\Scripts\python.exe -m py_compile main.py vision_service.py
.\venv\Scripts\python.exe -m pytest
```

The mocked tests exercise the real OpenAI SDK through HTTPX MockTransport and
FastAPI multipart handling. No keys or real provider calls are used by tests.

## Development mock mode and results review

Mock mode is disabled by default. To develop without OpenRouter, add
`MOCK_VISION=true` to `backend/.env` and restart the backend. Set it back to
`false` to use the five-model recognition path. Process environment variables
override `.env` values. Mock mode needs no API key, still validates uploaded
photos and consent, and never contacts OpenRouter. A real AI failure never
turns mock mode on.

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
responses. These do not establish live OpenRouter availability or test physical
camera hardware.

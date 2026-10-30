# Fridgely

**Your fridge, made smarter.**

Fridgely is a React + TypeScript food-management app with a FastAPI backend and SQLite persistence. Capture 1–3 fridge photos or use sample photos, review GroqCloud ingredient detections, track low-stock food, generate recipes with dietary preferences, and manage shopping lists.

Existing lists offer **Suggested from your fridge**: select confirmed low-stock ingredients from the newest reviewed scan and add them together. Additions are atomic and deduplicated; drafts are never used.

## Run locally

From `D:\fridge-scan-mvp\backend`:

```powershell
.\venv\Scripts\python.exe -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

From `D:\fridge-scan-mvp\frontend`:

```powershell
npm run dev
```

Open `http://localhost:5173`. The frontend supports `VITE_API_URL`; its default backend is `http://127.0.0.1:8000`. Keep existing Groq credentials in the backend environment and never commit them. No folder, API, database or environment-variable names changed with the rebrand.

## Validation

```powershell
# backend directory
.\venv\Scripts\python.exe -m pytest -q -p no:cacheprovider --basetemp=../test-results/pytest
# frontend directory
npm run build
npm run lint
npm run test -- --run
npx playwright test
```

Playwright uses Chromium, mocked AI and a separate SQLite database under `test-results/`. Screenshots, traces and results are stored there and excluded from Git. Tests do not need live Groq requests.

## Pages and current inventory

The dashboard is `/`; other pages are `/scan`, `/inventory`, `/recipes` and `/shopping`.
Legacy bookmarks such as `/#inventory` still work. Production static hosting must
serve `index.html` for these application paths (Vite already does). Navigation keeps
unsaved scan reviews, inventory editors and recipe preferences in memory; reloading
the page restores saved SQLite data. Leaving Scan Fridge stops an open camera stream.

Current inventory is **all confirmed ingredients from the newest reviewed scan**.
Older reviewed scans are historical snapshots, not extra stock to combine or count
again. Pending detections are excluded. The existing scan/item endpoints return full
arrays without pagination. Only the dashboard preview is limited to six ingredients;
the inventory page loads the complete snapshot and offers search, filters and editing.

## Reference food photographs

The image source in this checkout is a curated, locally stored Wikimedia Commons
catalog, not a runtime third-party API. `frontend/public/foods/catalog.json` records
the author, original source, license and transformations for each photograph;
`/foods/credits.html` displays the attribution. The 22 optimized WebPs total about
397 KiB and include red/yellow bell peppers, oranges, kale, cabbage and cucumbers.
These are reference photos, never images claimed to come from a user's fridge.

Exact normalized food aliases handle plurals, case, whitespace, hyphens and common
names such as capsicum and kheera. Unknown foods and failed files retain their food
record and show a neutral placeholder. Failed image loads are shared across card,
table and dashboard instances with a five-minute backoff; a later render can retry.
Successful assets use normal browser caching. Rendering needs neither provider
credentials nor external image requests, and remains usable offline once assets load.

`scripts/import_food_photos.py` is a **manual maintenance tool**, never run by the app
or test suite. It fetches metadata through the Commons API, accepts only supported
reuse licenses, retains successful downloads and stops on missing results, network
failures or rate limits. Back up the catalog and credits before using it. New food
titles and aliases require license and visual review; there is no automatic broad
image search that could substitute an unrelated photograph. Provider behavior is
mocked in `backend/test_food_photo_catalog.py`.

## Project structure

```text
fridge-scan-mvp/
|-- frontend/
|   |-- src/
|   |   |-- features/
|   |   |   |-- dashboard/
|   |   |   |-- inventory/
|   |   |   |-- fridge-scan/
|   |   |   |-- recipes/
|   |   |   `-- shopping-lists/
|   |   |-- shared/ui/       # Food images, aliases and image failure cache
|   |   |-- shared/types/    # Shared category definitions
|   |   |-- services/        # API clients and API response types
|   |   |-- styles/          # Application and global styles
|   |   |-- components/      # Existing component regression tests (locations preserved)
|   |   |-- assets/
|   |   `-- App.tsx, main.tsx, navigation.ts, App.test.tsx
|   |-- e2e/                # Playwright browser tests
|   `-- public/             # Sample photos and attributed reference food photos
|-- backend/
|   |-- main.py             # FastAPI routes and application entry point
|   |-- crud.py             # Persistence operations
|   |-- models.py           # SQLAlchemy models
|   |-- schemas.py          # API schemas
|   |-- database.py         # Database setup and sessions
|   |-- recipe_service.py   # GroqCloud recipe service
|   |-- vision_service.py   # GroqCloud photo recognition service
|   `-- test_*.py           # Existing pytest layout
|-- docs/                   # Recognition guide and historical audits
|   `-- organization/       # Move manifest, baseline changes and structure report
|-- scripts/                # Manual food-photo maintenance
|-- test-results/           # Ignored logs, traces and isolated test databases
|   `-- screenshots/        # Root-level screenshots consolidated here
|-- test-runs/              # Ignored pytest temporary data
|-- backups/                # Existing backups, untouched
`-- README.md
```

Component source and CSS live together in feature folders. Tests retain their
existing locations and import the moved feature modules. Shared API types stay
with the API clients to avoid unnecessary architecture changes. Vite and TypeScript
already discover the `src` tree; their configurations need no path changes.

Backend modules retain their established imports and `uvicorn main:app` entry point.
Models, CRUD, routes and services already have distinct module boundaries; splitting
them into packages would add migration risk without improving this organization.
Backend diagnostic/sample-generation scripts remain beside their database and
sample assets because their working-directory assumptions must be preserved.
Environment files, SQLite databases, dependency folders and Git metadata stay in place.

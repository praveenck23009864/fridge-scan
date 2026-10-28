# Fridgely cleanup inventory

Cleanup performed on 2026-10-28. Pre-existing uncommitted source, configuration, tests and documentation were preserved in `backups/cleanup-20261028/source-before.zip`. The ignored backup directory also contains Git status before cleanup, a complete project-file inventory (excluding installed dependency trees/history), and a removal manifest. `.env`, databases and sidecars were excluded from the source snapshot and left in place.

## Classification and decisions

| Category | Files / folders | Decision |
| --- | --- | --- |
| Application | Active backend modules; frontend components, styles and API client | Retain; only redundant imports and one obsolete comment removed |
| Configuration | Vite, TypeScript, ESLint, Vitest, Playwright, pytest, package manifests | Retain; synchronize the example environment with Groq |
| Tests and fixtures | Automated Python, component and browser tests; sample photos; sample generator | Retain all required coverage and fixtures |
| Documentation | READMEs, assignment audit, recognition guide | Retain; replace obsolete OpenRouter setup guidance with Groq guidance |
| Local sensitive/data | `.env`, SQLite files and all sidecars, uploads | Retain untouched and ignore in Git |
| Installed environments | `.venv`, `backend/venv`, `frontend/node_modules` | Retain untouched |
| Evidence | `test-results`, `test-runs`, historical reports/screenshots/traces | Retain; may contain submission evidence and protected test databases |
| Existing backups | `backups/` | Retain; uncertain recovery value, ignored |
| Custom artwork | `frontend/src/assets/hero.png` | Retain; unreferenced but potentially useful user-created design asset |
| Caches/build | Backend bytecode and pytest cache; frontend `dist` | Archive/remove old backend caches; build regenerates frontend output |

## Confirmed removals

Each removed file was copied to `backups/cleanup-20261028/removed/`, hash-verified, then deleted by its explicit path. No recursive folder deletion was used.

- `backend/main.backup.py`
- `backend/recipe_service.backup.py`
- `backend/vision_service.backup.py`
- `backend/vision_service.mistake.py`
- `backend/heck_shopping_db.py` — identical Python syntax tree to retained `check_shopping_db.py`.
- `backend/test_huggingface.py` — obsolete manual provider experiment, excluded from automated collection.
- `backend/model_catalog_check.json` — obsolete OpenRouter model-catalog snapshot.
- `backend/test-temp/write-test.txt` — write-access probe.
- `frontend/public/sample-photos-backup` — zero-byte placeholder, not a photo.
- `frontend/src/assets/react.svg` and `vite.svg` — unused starter logos; no source/config/runtime references.
- `debug.log` — disposable debug output.
- 15 backend `.pyc` files and 4 pytest-cache files — regenerable; exact names in the removal manifest.

## Code and dependencies

Removed duplicate FastAPI imports and a redundant `import models` in `main.py`; named imports still load the models before database initialization. Removed unused `ImageFont` and test `json` imports. Removed an obsolete `FIX` comment without changing logic. Updated a frontend health-test fixture to GroqCloud and removed the deleted experiment from pytest exclusions.

No dependency was uninstalled. Every frontend dependency has an application, type-checking, build, lint or test role. Backend had no dependency declaration; added runtime and test requirements matching installed versions, without changing the environment. Groq manual troubleshooting scripts remain excluded from normal tests.

Expanded `.gitignore` for `.venv`, SQLite files and sidecars, Playwright reports, pytest temporary folders, test runs and logs. Existing tracked fixtures and evidence remain tracked unless explicitly listed above as confirmed disposable.

## Remaining opportunities

Historical evidence and backup folders could be archived externally after the owner selects which submission/recovery artifacts to keep. Old pytest folders deny access; permissions were not changed. Custom `hero.png` is retained because its future design value is uncertain. Tests regenerate bytecode/build outputs, which remain ignored. No Git remotes/history were changed and nothing was pushed.

## Validation

| Command | Actual result |
| --- | --- |
| `.\venv\Scripts\python.exe -m pytest -q --basetemp=D:\fridge-scan-mvp\backend\test-temp\pytest-cleanup -p no:cacheprovider` (backend directory) | 123 passed, 15.28 seconds |
| `npm run build` (frontend directory) | Passed TypeScript and Vite production build |
| `npm run lint` | Passed |
| `npm run test -- --run` | 21 passed across 5 test files |
| `npx playwright test` | 13 passed, 1.2 minutes |
| `git diff --check` | Passed; only existing line-ending notices |

Backend tests use disposable SQLite files and a fixture that blocks real network transports. Playwright uses the test backend with mocked AI and `test-results/e2e.db`; production storage was not used. Browser coverage includes camera simulation, permissions, review/save, recipes, shopping CRUD, suggestions/reload persistence, and desktop/mobile layouts. Physical camera hardware and live Groq calls were not tested during cleanup.

Latest browser results are in `test-results/results.json`, traces in `test-results/playwright/`, and screenshots in `test-results/` and `test-results/ui-redesign/`. Historical evidence outside normal test output replacement was retained. Running verification regenerates caches and normal output artifacts.

Final Git status: 24 modified tracked files, 6 tracked deletions, and 21 untracked entries (Git collapses directories). These totals include the substantial pre-existing work, not just this cleanup. The six tracked deletions are the duplicate database checker, old model catalog, write probe, empty photo-backup placeholder, and two starter logos. Exact before/after status is saved in the cleanup backup. Nothing was staged, committed or pushed.

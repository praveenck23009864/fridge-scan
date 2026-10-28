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

# Fridgely frontend

**Your fridge, made smarter.**

The React + TypeScript + Vite interface for Fridgely uses a fresh green, cream and white theme. It includes camera capture and sample photos, saved food reviews, low-stock shopping suggestions, shopping-list CRUD, and AI recipe preferences.

## Development

Run `npm run dev` and open http://localhost:5173. Start the existing FastAPI backend on http://127.0.0.1:8000; `VITE_API_URL` can override that address. See the [project README](../README.md) for backend setup and validation commands.

## Checks

- `npm run build`: TypeScript and production build.
- `npm run lint`: ESLint.
- `npm run test -- --run`: component tests.
- `npx playwright test`: Chromium regression tests with mocked AI and a separate test database.

The package is named `fridgely`. Existing API routes, database schemas, environment variables and local folder paths remain unchanged. Do not include credentials in frontend code.

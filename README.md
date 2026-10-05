# Morrow

Morrow is an invoice and client management app with separate manager and sales-agent dashboards. The frontend is a React/Vite application; the API is an Express service backed by SQLite.

## Requirements

- Node.js 20.19+ or 22.12+
- npm

## Setup

Install each app's dependencies from the workspace root:

```powershell
npm --prefix express-jwt-sqlite install
npm --prefix frontend install
```

Create the backend environment file from its example:

```powershell
Copy-Item express-jwt-sqlite/.env.example express-jwt-sqlite/.env
```

Set unique values for `JWT_SECRET` and `MANAGER_INVITE_CODE` in `express-jwt-sqlite/.env`. Keep this file local and never commit it. Generate a strong JWT secret rather than reusing a password. `JWT_EXPIRES_IN` and `PORT` have development defaults.

The frontend uses Vite's `/api` proxy by default. Its `.env.example` documents the optional `VITE_API_BASE_URL` setting. Values prefixed with `VITE_` are embedded in browser code, so only put public configuration such as an API base URL there, never passwords, tokens, or private API keys.

## Run Locally

Start the API in one terminal:

```powershell
npm --prefix express-jwt-sqlite start
```

Start the frontend in another terminal:

```powershell
npm --prefix frontend run dev
```

Open the local URL printed by Vite, normally `http://localhost:5173`. The API listens on port `3000` by default. Register a sales-agent account from the app. Manager registration requires the invitation code configured in the backend `.env`.

## Checks

Run the API tests and frontend checks from the workspace root:

```powershell
npm --prefix express-jwt-sqlite test
npm --prefix frontend run lint
npm --prefix frontend run build
```

## Local Data and Git

SQLite databases, uploaded files, environment files, dependency folders, and build outputs are local/generated data and are excluded by the root `.gitignore`. The `.env.example` files are safe templates to commit; replace their placeholders only in local `.env` files. Review `git status` and inspect staged files before pushing, especially to ensure no database, upload, environment, or credential files are included.

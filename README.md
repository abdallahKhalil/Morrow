# Morrow

Morrow is a React/Vite invoice and client app backed by an Express API. Local development can use the existing SQLite database; Netlify Functions use persistent PostgreSQL and Netlify Blobs for uploaded photos.

## Requirements

- Node.js 20.19+ or 22.12+
- npm

## Install

Install all dependencies from the repository root (a `postinstall` step also installs `express-jwt-sqlite` and `frontend`):

```powershell
npm ci
```

## Local Development

The local API uses `express-jwt-sqlite/.env` and falls back to `express-jwt-sqlite/users.db` when `DATABASE_URL` is not set. Create the local environment file from the safe template:

```powershell
Copy-Item express-jwt-sqlite/.env.example express-jwt-sqlite/.env
```

Set a unique `JWT_SECRET` and `MANAGER_INVITATION_CODE`. Keep `.env` local and never commit it. The local API also stores uploads under `express-jwt-sqlite/uploads/`.

Run the API and frontend in separate terminals:

```powershell
npm run dev:api
npm run dev:web
```

Vite serves the app at `http://localhost:5173` and proxies `/api` and `/uploads` to the local Express server on port 3000.

## Netlify Deployment

The root `netlify.toml` builds the frontend and deploys `netlify/functions/api.js`. In Netlify Site configuration, set these server-side environment variables:

- `DATABASE_URL`: connection URL for a persistent PostgreSQL database (use the provider's TLS-enabled URL).
- `JWT_SECRET`: a long, randomly generated secret.
- `MANAGER_INVITATION_CODE`: the private code required to register manager accounts.
- `JWT_EXPIRES_IN`: optional token lifetime; defaults to `1h`.

Netlify Blobs stores profile and shop photos. The function initializes the PostgreSQL schema on first request. Do not put secrets in `VITE_*` variables; frontend-prefixed values are public in the browser bundle.

## Import Existing SQLite Data

The importer copies existing users, clients, invoices, and their profile/shop photos. Create an empty PostgreSQL database first, then provide the database URL and Netlify Blobs access values in your shell without committing them:

```powershell
$env:DATABASE_URL = 'postgresql://...'
$env:NETLIFY_SITE_ID = 'your-netlify-site-id'
$env:NETLIFY_AUTH_TOKEN = 'your-netlify-personal-access-token'
$env:NETLIFY_BLOBS_IMPORT = 'true'
npm run import:sqlite
```

The importer reads `express-jwt-sqlite/users.db` and the local `uploads/` folders by default. It is designed for an empty destination; review the counts and the live site after import before removing any local data. Never commit the shell values or token.

## Checks

```powershell
npm test
npm run lint
npm run build
```

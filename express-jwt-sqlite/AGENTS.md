# Project Instructions

These instructions apply to the Express API in this directory.

## Structure

- `src/app.js` configures and exports the Express app; it starts a listener only when run directly.
- Keep endpoint logic in `src/routes/`, token verification in `src/middleware/`, and SQLite setup/connection in `src/config/database.js`.
- `src/config/database.js` creates the `users` table on import. There is no migration system yet; account for existing local databases when changing the schema.

## Development and Tests

- Run commands from this directory: `npm test` runs the Node test runner and Supertest suite; `npm start` starts the API.
- Add API regression coverage in `test/auth.test.js` using the existing `node:test` and Supertest pattern.
- Set `JWT_SECRET` and `DB_PATH=:memory:` before importing the app or database in tests. Close the shared database after the suite.

## Security and Configuration

- The app requires `JWT_SECRET`; use `.env.example` as the configuration reference. Never commit `.env`, database files, or secrets.
- Use prepared SQLite statements and select only public user fields in responses. Never return password hashes.
- Preserve the auth contract: missing bearer token returns 401; invalid or expired token returns 403.
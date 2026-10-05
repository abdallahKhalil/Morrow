---
name: fullstack-auth-ui
description: "Use when building or extending a React/Vite authentication frontend for an Express JWT API, including login, registration, protected profile routes, token persistence, password visibility controls, responsive UI, and browser verification."
argument-hint: "Describe the auth flow or API to connect"
---

# Full-Stack Authentication UI

Build and verify a responsive React frontend that integrates with the workspace's token-authenticated API. Adapt to the existing repository instead of assuming endpoint shapes or replacing established conventions.

## Workflow

1. **Map the API and workspace.** Read applicable `AGENTS.md` and package scripts. Inspect the backend auth routes, middleware, and profile query. Record request fields, response shapes, status codes, public user fields, and the API port. Check whether the frontend directory already has work before scaffolding.

2. **Configure the frontend.** Follow the existing stack; for this project use React/Vite, React Router, Tailwind, Axios, and Lucide React. Keep API origin configurable with a Vite environment variable. When backend and frontend run locally on different ports, prefer a Vite `/api` proxy over an unnecessary backend CORS change.

3. **Centralize API and session behavior.** Use one Axios instance. Attach the saved bearer token in a request interceptor. On unauthorized or forbidden responses, clear the token and redirect to login without repeatedly redirecting from login itself. Keep the storage key in one place.

4. **Restore and guard sessions.** On app startup, show a loading state while fetching the current profile for a stored token. Set the user only from the API response; do not assume a login token contains profile-only fields. Abort the restore request when its effect is cleaned up so React StrictMode remounts do not leave duplicate requests or redirects. Keep guest and protected routes from flashing the wrong page while loading.

5. **Implement the auth flows.** Login should save the returned token, fetch the profile, update shared state, and navigate only after both requests succeed. Registration should validate required values, email format, and matching passwords, show API errors, then follow the chosen post-registration behavior. Logout should clear state and storage immediately; use a confirmation state if appropriate.

6. **Use shared accessible fields.** Reuse one input component across login and registration. Associate labels and validation errors with inputs, expose loading states, and provide a password visibility control. Hovering the eye control reveals the password and leaving masks it again; retain click/keyboard toggling for touch and keyboard users, where hover is unavailable.

7. **Build the profile from the real response.** Render only public fields returned by the profile endpoint. Format timestamps defensively and avoid displaying token claims as if they were freshly fetched profile data.

8. **Verify behavior in a real browser.** Start the API and Vite server in separate terminals. Run the frontend lint and production build scripts. Exercise registration, login, profile rendering, refresh restoration, logout, and invalid-token handling with a unique test account. Check every password field's hover and leave behavior, test mobile and desktop widths for horizontal overflow, and inspect the rendered pages rather than relying on compilation alone. For redirects that replace the document, wait for navigation to finish before reading page storage or evaluating page state.

## Completion Checks

- Unauthenticated visits to protected pages end at login; loading does not flash protected content.
- Valid credentials reveal the API profile without a manual refresh, and a valid token restores it after refresh.
- Logout removes the stored token and returns to login; invalid or expired tokens are cleared and redirected.
- Registration and login validation, API failures, and pending states are visible and accessible.
- Password reveal works on hover and masks on leave for login, password, and confirmation fields; click/keyboard interaction still works.
- Frontend lint/build pass, and browser checks show no horizontal overflow at phone and desktop widths.

## Completion Notes

- After every project change, include the agent and manager development/demo login credentials and manager invitation code when explicitly documented as non-production, shareable test values.
- Never read out, copy, or expose real credentials or invitation codes from `.env`, environment variables, production systems, or user-provided secrets. Do not invent credentials. If safe demo values are unavailable, say so and direct the user to their local configuration.
- Clearly label temporary preview accounts and explain when they stop working, such as when an in-memory API process exits.
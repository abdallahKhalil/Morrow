# Morrow Frontend

This React/Vite app provides the manager and sales-agent dashboards. For complete workspace setup, API configuration, and run instructions, see the [root README](../README.md).

## Commands

Run these commands from the workspace root:

```powershell
npm --prefix frontend install
npm --prefix frontend run dev
npm --prefix frontend run lint
npm --prefix frontend run build
```

The Vite development server proxies `/api` and `/uploads` to `http://localhost:3000`. Set `VITE_API_BASE_URL` only when the API is hosted elsewhere. `VITE_` values are bundled into browser code; never put secrets in frontend environment variables.

# Vercel Deployment Notes

This application runs a long-lived polling process and keeps dashboard clients connected with Server-Sent Events. That model is best suited to a long-running Node server.

For Vercel, use one of these options:

1. Deploy only the frontend/dashboard on Vercel and run the collector/API on a long-running host such as Render, Railway, Fly.io, EC2, DigitalOcean, or a VPS.
2. Refactor the collector into Vercel Cron Jobs that write to a database, then make the dashboard read from that database.

The current repo is portable for long-running hosts through:

- `npm start`
- `Dockerfile`
- `Procfile`

If deploying behind Vercel as a frontend, keep the collector/API on a long-running host and point the frontend to it through `window.__PEAD_CONFIG__.apiBaseUrl` or by opening the dashboard once with `?apiBaseUrl=https://your-backend-host`.

The backend must allow the Vercel origin:

```bash
ALLOWED_ORIGINS=https://your-frontend.vercel.app
PUBLIC_API_BASE_URL=https://your-backend-host
```

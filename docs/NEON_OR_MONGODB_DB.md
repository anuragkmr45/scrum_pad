# Neon or MongoDB DB Decision

## Decision

Use Neon Postgres by default.

No active MongoDB integration was found in the current HexScrum code path, so adding a small Postgres audit/report module was faster and cleaner than introducing MongoDB.

## Schema

The backend creates these tables idempotently:

- `users`
- `workspaces`
- `documents`
- `pages`
- `annotations`
- `annotation_events`
- `meeting_notes`
- `exports`

Initialize manually:

```bash
cd converter-api
npm run db:init
```

The backend also attempts schema initialization on startup when `DATABASE_URL` is set.

## Fallback

Without `DATABASE_URL`, the backend uses an in-memory fallback so the API shape can be demoed locally. That fallback is not persistent and should not be used for deployed demos that need audit history.

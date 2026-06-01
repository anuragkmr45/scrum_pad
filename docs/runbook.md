# Runbook

## Start Local Services

```bash
./scripts/run_converter.sh
./scripts/run_frontend.sh
```

## Health Checks

Converter:

```bash
curl http://localhost:4000/health
```

Frontend:

Open the URL printed by CRA, usually `http://localhost:3000`.

## Common Failures

Missing Agora App ID:

- Frontend shows a warning and blocks joining a live workspace.
- Set `REACT_APP_AGORA_APP_ID` in `frontend/.env.local`.

Missing converter URL:

- Upload conversion and reports show a clear warning.
- Set `REACT_APP_LIBRE_BACKEND_URL=http://localhost:4000`.

Missing Cloudinary:

- Converter `/health` reports `storageConfigured: false`.
- Upload returns a storage configuration error.
- Set backend Cloudinary env values in `converter-api/.env`.

Missing Neon:

- Converter `/health` reports `databaseConfigured: false`.
- Audit/report APIs use in-memory data for the running process.
- Set `DATABASE_URL` and run `cd converter-api && npm run db:init`.

Missing LibreOffice/unoconv:

- `/health` can pass, but upload conversion fails.
- Install locally or use the Dockerfile.

Node incompatibility:

- The frontend is old CRA 3 code.
- Use Node 16 or 18 if install/build fails on a newer Node.

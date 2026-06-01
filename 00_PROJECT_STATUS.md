# Project Status

## Summary

HexScrum Workspace now targets Vercel for the React frontend and Render for the Dockerized converter/API service. Storage is backend-only Cloudinary, metadata/audit storage is Neon Postgres by default, and realtime remains Agora RTM.

Local verification completed on this machine:

- `frontend npm install --legacy-peer-deps`
- `frontend npm run build`
- `converter-api npm install --legacy-peer-deps`
- `converter-api npm run build`
- `converter-api npm run lint`
- `converter-api npm run smoke` against `/health`
- in-process audit/report smoke using the memory fallback store
- `docker build -t hexscrum-converter-smoke .` in `converter-api/`

## What Works Now

- HexScrum branding and docs/scripts are in place.
- Frontend builds for Vercel from `frontend/`.
- Frontend exposes setup warnings for missing Agora, missing backend URL, and failed backend health.
- Frontend stores demo profile data: name, designation, and annotation color.
- Frontend sends document uploads to the backend for PDF, PPT/PPTX, Office/report files, and PNG/JPG images.
- Frontend has an MVP Notes & Reports page for meeting notes, annotation history, user-wise reports, CSV/JSON exports, HTML notes export, and JSON archive manifests.
- Converter/API binds to `process.env.PORT` and exposes `/health`.
- Converter/API supports Cloudinary as the default storage provider.
- Converter/API has CORS support for localhost, configured origins, and Vercel preview domains.
- Converter/API exposes idempotent Neon/Postgres schema initialization through `npm run db:init`.
- Converter/API exposes MVP workspaces, annotation events, meeting notes, reports, and archive endpoints.
- Render Dockerfile installs Node, LibreOffice, unoconv, and fonts.

## External Config Blockers

- Agora App ID is missing, so realtime two-browser QA was not run.
- Cloudinary credentials are missing, so upload-to-Cloudinary QA was not run.
- `DATABASE_URL` is missing, so Neon schema was not initialized against a real database.
- Local `unoconv`/LibreOffice are missing; Docker build includes them, but full upload conversion still needs Cloudinary credentials.
- Vercel and Render deployment credentials are not available in this workspace.

## Readiness Percentages

| Area | Readiness |
| --- | ---: |
| Local UI demo | 85% |
| Document upload demo | 65% |
| Realtime collaboration demo | 45% |
| Export annotated PDF demo | 50% |
| Audit/reporting MVP | 65% |
| Vercel/Render deployment readiness | 80% |
| Final production readiness | 30% |

These percentages are estimates based on implemented code and current verification. They are not capacity, SLA, or enterprise compliance claims.

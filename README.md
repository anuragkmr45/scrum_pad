# HexScrum Workspace MVP

HexScrum Workspace is a deployment-ready MVP baseline built from the open-source Channelize Whiteboard SDK frontend and Node File Convertor API branch.

Target stack:

- Frontend: Vercel static React build from `frontend/`
- Backend/converter/API: Render Docker service from `converter-api/`
- Storage: Cloudinary, configured only on the backend
- Metadata DB: Neon Postgres through `DATABASE_URL`
- Realtime: Agora RTM through `REACT_APP_AGORA_APP_ID`
- Cache/queue: none currently; use Valkey-compatible wording/config if added later

This is not a finished enterprise audit product. It has a functional MVP audit/report layer, but production auth, authorization, retention, load testing, malware scanning, and security review are still future work.

## Local Commands

```bash
./scripts/install_all.sh

cp converter-api/.env.example converter-api/.env
cp frontend/.env.local.example frontend/.env.local

./scripts/run_converter.sh
./scripts/run_frontend.sh
```

Direct commands:

```bash
cd converter-api && npm install --legacy-peer-deps && npm run start
cd frontend && npm install --legacy-peer-deps && npm run dev
```

Verification:

```bash
./scripts/check_env.sh --local
./scripts/verify.sh
cd converter-api && npm run smoke
```

Deployment preflight before Vercel/Render:

```bash
./scripts/check_env.sh --deploy
cd converter-api && npm run db:init
```

## Required Runtime Values

Frontend public env:

- `REACT_APP_AGORA_APP_ID`: required for live collaboration.
- `REACT_APP_AGORA_LOG=true`: optional SDK logging.
- `REACT_APP_LIBRE_BACKEND_URL=http://localhost:4000`: converter/API base URL.
- `REACT_APP_HEXSCRUM_MODE=local`: local/deployed mode marker.
- `REACT_APP_MAX_UPLOAD_MB=25`: frontend upload guard.

Backend private env:

- `STORAGE_PROVIDER=cloudinary`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `CLOUDINARY_URL`: optional alternative to the three Cloudinary fields.
- `CLOUDINARY_FOLDER=hexscrum-workspace`
- `DATABASE_URL`: Neon Postgres connection string.
- `DATABASE_SSL=true`
- `FRONTEND_ORIGIN=https://YOUR-VERCEL-APP.vercel.app`
- `CORS_ORIGINS=https://YOUR-VERCEL-APP.vercel.app`

Do not put Cloudinary secrets or `DATABASE_URL` in the frontend.

## What Works Now

- HexScrum-branded frontend shell builds for Vercel.
- Frontend warns when Agora/backend config is missing.
- Uploads go through the backend `/upload` endpoint for PDFs, Office/report files, and PNG/JPG images.
- Backend converts Office/report/image inputs to PDF where LibreOffice/unoconv or PDFKit supports it, then uploads to Cloudinary.
- Backend exposes `/health` with storage, database, Cloudinary, and converter status.
- Backend exposes MVP endpoints for workspaces, annotation events, meeting notes, reports, and JSON archive manifests.
- Frontend records local profile metadata: name, designation, color.
- Frontend sends non-blocking annotation audit events where PDFJS Annotate emits create/update/delete/reset events.
- Frontend has a Notes & Reports page for notes, annotation history, user-wise report, CSV/JSON exports, HTML notes export, and JSON archive manifest download.
- Existing upstream annotated PDF export path remains available in the whiteboard controls.

## Current Limits

- Realtime collaboration still needs a valid Agora App ID and two-browser QA.
- Office upload/conversion needs the Render Docker image or local LibreOffice/unoconv available on `PATH`.
- Neon schema initialization is idempotent; run `cd converter-api && npm run db:init` after setting `DATABASE_URL`.
- The archive is a JSON manifest MVP, not a full ZIP of binaries.
- Arrow remains an MVP gap unless the upstream line tool is accepted as the temporary substitute.
- No 40-user or enterprise production readiness has been tested.

See [00_PROJECT_STATUS.md](00_PROJECT_STATUS.md), [01_FEATURE_MAPPING.md](01_FEATURE_MAPPING.md), and [06_REMAINING_GAPS.md](06_REMAINING_GAPS.md) for the full status.

## Attribution

This MVP uses the Channelize Whiteboard SDK and its Node File Convertor API branch as the base. Keep the upstream license and copyright notices intact. See [docs/attribution.md](docs/attribution.md).

# HexScrum Converter/API

This service receives document uploads, converts supported files to PDF, stores the output in Cloudinary, and exposes MVP audit/report APIs for HexScrum Workspace.

It is based on the Channelize Node File Convertor API branch and keeps the upstream MIT attribution.

## Runtime

- Node service: `node app.js`
- Render runtime: Docker
- Health: `GET /health`
- Upload field: `sampleFile`
- Default storage provider: Cloudinary
- Default metadata DB: Neon Postgres through `DATABASE_URL`

## Local Setup

```bash
npm install --legacy-peer-deps
cp .env.example .env
npm run start
```

Initialize Neon/Postgres when `DATABASE_URL` is configured:

```bash
npm run db:init
```

Smoke check:

```bash
npm run smoke
```

## Required Env

```bash
PORT=4000
NODE_ENV=development
FRONTEND_ORIGIN=http://localhost:3000
CORS_ORIGINS=http://localhost:3000
MAX_UPLOAD_MB=25
STORAGE_PROVIDER=cloudinary
LOCAL_UPLOAD_DIR=./uploaded-files
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_FOLDER=hexscrum-workspace
DATABASE_URL=
DATABASE_SSL=true
AUTH_SECRET=
AGORA_APP_ID=
AGORA_APP_CERTIFICATE=
AGORA_RTM_TOKEN_TTL_SECONDS=3600
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
UPSTASH_WORKSPACE_CACHE_TTL_SECONDS=86400
UPSTASH_WORKSPACE_PRESENCE_TTL_SECONDS=45
UPSTASH_WORKSPACE_LEAD_LOCK_TTL_SECONDS=90
```

`CLOUDINARY_URL` may be used instead of the three individual Cloudinary fields.
`LOCAL_UPLOAD_DIR` stores backend-served PDF copies used by the frontend whiteboard.
`AGORA_APP_CERTIFICATE` is required when App Certificate/dynamic key is enabled in Agora.
`AUTH_SECRET` signs login tokens and should be long, random, and backend-only.
Upstash Redis REST settings are optional. They cache recent annotation events for faster timeline reads, track active participant presence, and enforce short-lived lead reviewer locks.

## Endpoints

- `GET /health`
- `GET /api/agora/rtm-token?uid=...`
- `POST /upload`
- `POST /api/workspaces`
- `GET /api/workspaces/:id`
- `POST /api/annotations/events`
- `GET /api/annotations/events?workspaceId=...`
- `POST /api/meeting-notes`
- `GET /api/meeting-notes?workspaceId=...`
- `GET /api/reports/user-wise?workspaceId=...`
- `GET /api/reports/annotation-history?workspaceId=...`
- `POST /api/archives/generate`

## Conversion Notes

- PDF uploads are passed through to storage.
- PNG/JPG uploads are wrapped into a PDF with PDFKit.
- PPT/PPTX, DOC/DOCX, XLS/XLSX, CSV/TXT/RTF, ODT/ODP/ODS use LibreOffice/unoconv.
- The Dockerfile installs LibreOffice and unoconv for Render.
- Local conversion requires those tools to be installed locally.

## Limits

- The audit/report API is an MVP. It has idempotent table creation, but no production auth or authorization.
- Without `DATABASE_URL`, audit data uses process-local memory and disappears on restart.
- The archive endpoint returns a JSON manifest; it does not build a binary ZIP.

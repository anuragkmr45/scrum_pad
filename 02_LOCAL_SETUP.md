# Local Setup

## Prerequisites

- Node 16 or 18 is recommended for the old CRA 3 frontend. Node 24 built successfully in this workspace with `NODE_OPTIONS=--openssl-legacy-provider`.
- npm is used for both projects.
- LibreOffice and unoconv are required for Office/PPT conversion outside Docker.
- Agora App ID is required for live collaboration.
- Cloudinary credentials are required for upload demos.
- Neon `DATABASE_URL` is required for persistent audit/report metadata.

## Install

```bash
./scripts/install_all.sh
```

Manual install:

```bash
cd frontend
npm install --legacy-peer-deps

cd ../converter-api
npm install --legacy-peer-deps
```

## Frontend Env

```bash
cp frontend/.env.local.example frontend/.env.local
```

Set:

```bash
REACT_APP_AGORA_APP_ID=
REACT_APP_AGORA_LOG=true
REACT_APP_LIBRE_BACKEND_URL=http://localhost:4000
REACT_APP_HEXSCRUM_MODE=local
REACT_APP_MAX_UPLOAD_MB=25
```

No Cloudinary or database secrets belong in `frontend/.env.local`.

## Converter Env

```bash
cp converter-api/.env.example converter-api/.env
```

Set:

```bash
PORT=4000
NODE_ENV=development
FRONTEND_ORIGIN=http://localhost:3000
CORS_ORIGINS=http://localhost:3000
MAX_UPLOAD_MB=25
STORAGE_PROVIDER=cloudinary
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_FOLDER=hexscrum-workspace
DATABASE_URL=
DATABASE_SSL=true
```

Initialize Neon/Postgres when `DATABASE_URL` is set:

```bash
cd converter-api
npm run db:init
```

Without `DATABASE_URL`, the audit/report API uses an in-memory fallback for the running process only.

## Run

Terminal 1:

```bash
./scripts/run_converter.sh
```

Terminal 2:

```bash
./scripts/run_frontend.sh
```

Health check:

```bash
curl http://localhost:4000/health
```

Build check:

```bash
./scripts/verify.sh
```

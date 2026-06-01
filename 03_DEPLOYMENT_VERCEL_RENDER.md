# Deployment: Vercel and Render

## Frontend on Vercel

- Root directory: `frontend/`
- Framework preset: Create React App
- Install command: `npm install --legacy-peer-deps`
- Build command: `npm run build`
- Output directory: `build`

Vercel env:

```bash
REACT_APP_AGORA_APP_ID=
REACT_APP_AGORA_LOG=true
REACT_APP_LIBRE_BACKEND_URL=https://YOUR-RENDER-SERVICE.onrender.com
REACT_APP_HEXSCRUM_MODE=production
REACT_APP_MAX_UPLOAD_MB=25
```

Do not add Cloudinary secrets or `DATABASE_URL` to Vercel.

## Backend on Render

- Root directory: `converter-api/`
- Environment: Docker
- Dockerfile: `converter-api/Dockerfile`
- Health check path: `/health`
- Port: Render sets `PORT`; local default is `4000`

Render env:

```bash
NODE_ENV=production
FRONTEND_ORIGIN=https://YOUR-VERCEL-APP.vercel.app
CORS_ORIGINS=https://YOUR-VERCEL-APP.vercel.app
MAX_UPLOAD_MB=25
STORAGE_PROVIDER=cloudinary
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_FOLDER=hexscrum-workspace
DATABASE_URL=
DATABASE_SSL=true
```

`CLOUDINARY_URL` may be used instead of `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`.

## Database

Use Neon Postgres and set `DATABASE_URL` on Render. The backend creates tables idempotently on startup and through:

```bash
cd converter-api
npm run db:init
```

Tables: `users`, `workspaces`, `documents`, `pages`, `annotations`, `annotation_events`, `meeting_notes`, `exports`.

## Post-deploy Checks

```bash
curl https://YOUR-RENDER-SERVICE.onrender.com/health
```

Expected configured deployment signals:

- `storageProvider` is `cloudinary`
- `storageConfigured` is `true`
- `cloudinaryConfigured` is `true`
- `databaseConfigured` is `true`
- `databaseOk` is `true`
- `converterAvailable` is `true`

Then open the Vercel URL, join a workspace with two browser contexts, upload PDF/PPTX/PNG samples, draw annotations, add meeting notes, and export reports from `/workspace-tools`.

# Render Backend Deployment

## Service Settings

- Service type: Web Service
- Environment: Docker
- Root directory: `converter-api/`
- Dockerfile path: `converter-api/Dockerfile`
- Health check path: `/health`

## Env

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

Use `CLOUDINARY_URL` instead of the individual Cloudinary values if preferred.

## Deploy Check

Before deploying, run from the repo root:

```bash
./scripts/check_env.sh --deploy
cd converter-api && npm run db:init
```

```bash
curl https://YOUR-RENDER-SERVICE.onrender.com/health
```

Expected after full env setup:

- `ok: true`
- `storageProvider: cloudinary`
- `storageConfigured: true`
- `databaseConfigured: true`
- `databaseOk: true`
- `cloudinaryConfigured: true`
- `converterAvailable: true`

## Notes

- The Docker image installs LibreOffice and unoconv for conversion.
- The service writes temporary files only during upload/conversion and deletes them afterwards.
- `render.yaml` is included as a starting blueprint and does not contain secrets.

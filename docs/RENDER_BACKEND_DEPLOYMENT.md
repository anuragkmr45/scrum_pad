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
LOCAL_UPLOAD_DIR=/app/uploaded-files
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_FOLDER=hexscrum-workspace
DATABASE_URL=
DATABASE_SSL=true
AGORA_APP_ID=
AGORA_APP_CERTIFICATE=
AGORA_RTM_TOKEN_TTL_SECONDS=3600
```

Use `CLOUDINARY_URL` instead of the individual Cloudinary values if preferred.
`AGORA_APP_CERTIFICATE` is required when the Agora project has App Certificate/dynamic key enabled.

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
- `agoraRtmTokenConfigured: true`
- `converterAvailable: true`

## Notes

- The Docker image installs LibreOffice and unoconv for conversion.
- The service writes temporary conversion files and deletes them afterwards.
- It also keeps backend-served PDF copies in `LOCAL_UPLOAD_DIR` so the frontend can load `/files/...pdf`; attach a persistent disk if those files must survive redeploys.
- `render.yaml` is included as a starting blueprint and does not contain secrets.

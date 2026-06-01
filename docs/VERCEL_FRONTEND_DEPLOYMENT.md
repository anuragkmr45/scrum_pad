# Vercel Frontend Deployment

## Project Settings

- Root directory: `frontend/`
- Framework preset: Create React App
- Install command: `npm install --legacy-peer-deps`
- Build command: `npm run build`
- Output directory: `build`

## Env

```bash
REACT_APP_AGORA_APP_ID=
REACT_APP_AGORA_LOG=true
REACT_APP_LIBRE_BACKEND_URL=https://YOUR-RENDER-SERVICE.onrender.com
REACT_APP_HEXSCRUM_MODE=production
REACT_APP_MAX_UPLOAD_MB=25
```

Do not configure Cloudinary secrets or `DATABASE_URL` in Vercel.

## Deploy Check

Before deploying, run from the repo root:

```bash
./scripts/check_env.sh --deploy
./scripts/verify.sh
```

1. Open the Vercel URL.
2. Confirm the home screen does not show a backend health warning.
3. Confirm the Render health URL returns configured storage/database status.
4. Join a workspace after Agora App ID is set.
5. Open `/workspace-tools` and verify report actions can reach the backend.

## CORS

Set `FRONTEND_ORIGIN` and `CORS_ORIGINS` on Render to the Vercel production URL. Vercel preview domains ending in `.vercel.app` are allowed by the backend CORS policy.

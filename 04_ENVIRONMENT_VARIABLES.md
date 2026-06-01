# Environment Variables

## Frontend

File: `frontend/.env.local`

| Variable | Required | Purpose |
| --- | --- | --- |
| `REACT_APP_AGORA_APP_ID` | Yes for realtime | Agora RTM App ID. |
| `REACT_APP_AGORA_LOG` | No | Set `true` for Agora SDK logging. |
| `REACT_APP_LIBRE_BACKEND_URL` | Yes for uploads/reports | Converter/API base URL. The frontend appends `/upload` for uploads. |
| `REACT_APP_HEXSCRUM_MODE` | No | Local/deploy mode marker. |
| `REACT_APP_VERSION` | No | Build version display value. |
| `REACT_APP_MAX_UPLOAD_MB` | No | Frontend upload size guard. Defaults to `25`. |

Frontend env must not include Cloudinary secrets, `DATABASE_URL`, or backend storage keys.

## Converter/API

File: `converter-api/.env`

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | No | Defaults to `4000`; Render sets this automatically. |
| `NODE_ENV` | No | `development` or `production`. |
| `FRONTEND_ORIGIN` | Yes for deployed CORS | Primary Vercel URL. |
| `CORS_ORIGINS` | No | Comma-separated additional allowed origins. |
| `MAX_UPLOAD_MB` | No | Backend upload size limit. Defaults to `25`. |
| `STORAGE_PROVIDER` | Yes | Use `cloudinary`. |
| `CLOUDINARY_CLOUD_NAME` | One Cloudinary path | Cloudinary cloud name. |
| `CLOUDINARY_API_KEY` | One Cloudinary path | Cloudinary API key. |
| `CLOUDINARY_API_SECRET` | One Cloudinary path | Cloudinary API secret. |
| `CLOUDINARY_URL` | Alternative Cloudinary path | Single Cloudinary URL env value. |
| `CLOUDINARY_FOLDER` | No | Defaults to `hexscrum-workspace`. |
| `DATABASE_URL` | Yes for persistence | Neon Postgres connection string. |
| `DATABASE_SSL` | No | Defaults to SSL on unless set to `false`. |

The HexScrum deployment path uses Cloudinary only.

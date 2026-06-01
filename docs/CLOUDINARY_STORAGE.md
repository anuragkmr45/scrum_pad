# Cloudinary Storage

## Backend-only Env

```bash
STORAGE_PROVIDER=cloudinary
LOCAL_UPLOAD_DIR=./uploaded-files
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_FOLDER=hexscrum-workspace
```

Alternative:

```bash
CLOUDINARY_URL=
```

## Upload Behavior

- PDFs are passed through and uploaded.
- PNG/JPG files are wrapped into a PDF before upload.
- Office/report formats use LibreOffice/unoconv and upload the converted PDF.
- The API stores a backend-served copy under `/files/...pdf` because some Cloudinary accounts block direct PDF delivery.
- The API response returns `url` and `secure_url` as the backend `/files/...pdf` URL, plus `cloudinary_url`, `storageProvider`, original file metadata, conversion status, and optional document metadata.

## Security Notes

- Cloudinary secrets must stay in Render or local `converter-api/.env`.
- Frontend only receives returned delivery URLs.
- `LOCAL_UPLOAD_DIR` should be writable by the backend. On Render, `/app/uploaded-files` works for MVP sessions but is not durable across redeploys unless a persistent disk is attached.
- Production should add auth, workspace authorization, file scanning, and a reviewed Cloudinary delivery policy before handling sensitive files.

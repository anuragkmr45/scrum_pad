# Cloudinary Storage

## Backend-only Env

```bash
STORAGE_PROVIDER=cloudinary
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
- The API response returns `url`, `secure_url`, `storageProvider`, original file metadata, conversion status, and optional document metadata.

## Security Notes

- Cloudinary secrets must stay in Render or local `converter-api/.env`.
- Frontend only receives returned delivery URLs.
- Production should add auth, workspace authorization, file scanning, and a reviewed Cloudinary delivery policy before handling sensitive files.

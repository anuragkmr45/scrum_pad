# Test Plan

## CI-style Checks

```bash
./scripts/verify.sh
```

The script checks env examples, frontend build, converter build, converter lint, frontend secret exposure, and a simple no-secret scan.

## Converter/API

```bash
cd converter-api
npm run build
npm run lint
npm run start
npm run smoke
npm run db:init
```

Expected `/health` fields after real env is configured:

- `storageProvider=cloudinary`
- `storageConfigured=true`
- `cloudinaryConfigured=true`
- `databaseConfigured=true`
- `databaseOk=true`
- `converterAvailable=true`

Upload QA requires Cloudinary credentials and LibreOffice/unoconv:

- PDF upload returns a Cloudinary URL.
- PPT/PPTX upload converts to PDF and returns a Cloudinary URL.
- PNG/JPG upload wraps image in a PDF and returns a Cloudinary URL.
- Report/Office upload converts where LibreOffice supports the format.

## Frontend

```bash
cd frontend
npm run build
npm run dev
```

Manual browser checks:

1. Home loads with HexScrum branding.
2. Missing Agora/backend warnings appear when env is incomplete.
3. Profile name/designation/color persists.
4. Workspace join works after Agora App ID is configured.
5. Upload button sends files to the backend.
6. `/workspace-tools` can save notes, load reports, export CSV/JSON/HTML, and download archive manifest.

## Realtime QA

Run only when `REACT_APP_AGORA_APP_ID` is set.

1. Open two browser contexts.
2. Join the same workspace.
3. Confirm presence/member count where supported by upstream UI.
4. Draw pen, highlighter, text, line, rectangle, ellipse, and eraser actions.
5. Confirm annotations sync.
6. Change pages and confirm page sync where supported.
7. Capture evidence under `qa-evidence/realtime/`.

## Export QA

1. Export annotated PDF from the upstream whiteboard controls.
2. Export meeting notes HTML/JSON from `/workspace-tools`.
3. Export annotation history CSV/JSON.
4. Export user-wise report CSV/JSON.
5. Generate and download meeting archive manifest JSON.
6. Capture generated files under `qa-evidence/exports/`.

## Stop Conditions

- Missing Agora App ID blocks realtime validation.
- Missing Cloudinary credentials blocks upload validation.
- Missing `DATABASE_URL` blocks persistent audit/report validation.
- Missing LibreOffice/unoconv blocks Office conversion unless Docker/Render is used.
- Missing Vercel/Render account access blocks deployed smoke tests.

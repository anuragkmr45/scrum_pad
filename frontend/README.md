# HexScrum Workspace Frontend

HexScrum Workspace is a rebranded document-collaboration whiteboard MVP for live review, meeting notes, and annotation reports.

This frontend is based on the open-source Channelize Whiteboard SDK and keeps the upstream MIT attribution. It uses Agora RTM for realtime collaboration and the HexScrum converter/API backend for uploads, notes, audit events, and reports.

## Deploy Target

- Host: Vercel
- Root directory: `frontend/`
- Install command: `npm install --legacy-peer-deps`
- Build command: `npm run build`
- Output directory: `build`

## Env

```bash
REACT_APP_AGORA_APP_ID=
REACT_APP_AGORA_LOG=true
REACT_APP_LIBRE_BACKEND_URL=http://localhost:4000
REACT_APP_HEXSCRUM_MODE=local
REACT_APP_MAX_UPLOAD_MB=25
```

Do not put Cloudinary, Neon, or other backend secrets in frontend env values.

## Local Run

```bash
npm install --legacy-peer-deps
npm run dev
```

Build:

```bash
npm run build
```

## Current MVP Features

- HexScrum-branded join screen.
- Local profile fields for name, designation, and annotation color.
- Agora-backed shared workspace path inherited from Channelize.
- PDF.js annotation tools: pen, text, line, rectangle, ellipse, eraser, clear all, color, thickness, and highlighter where supported.
- Upload button sends PDF, PPT/PPTX, Office/report files, and PNG/JPG images to the backend.
- Non-blocking annotation event tracking where the PDFJS Annotate hooks fire.
- Notes & Reports page at `/workspace-tools` for notes, annotation history, user-wise reports, CSV/JSON/HTML exports, and meeting archive manifest download.
- Existing upstream annotated PDF export path remains in whiteboard controls.

## Known Limits

- Realtime must be QA-tested with a real Agora App ID.
- Cloudinary upload must be QA-tested with backend credentials.
- Arrow is not explicit yet; line is available.
- Meeting notes/report PDF export is not implemented.
- Production auth and workspace permissions are future work.

## Attribution

The original whiteboard solution was co-developed by Channelize.io and Agora.io. Keep upstream license and copyright notices intact.

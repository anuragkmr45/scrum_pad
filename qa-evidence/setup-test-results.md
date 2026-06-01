# Setup Test Results

Date: 2026-06-01

## Environment

- `node -v`: `v24.12.0`
- `npm -v`: `11.6.2`
- `unoconv`: not found locally
- `libreoffice`: not found locally
- `.nvmrc`: `16` added because the upstream frontend is old CRA 3 code

## Dependency Install

- `frontend`: `npm install --legacy-peer-deps` succeeded after network approval.
- `converter-api`: `npm install --legacy-peer-deps` succeeded after network approval, including Cloudinary, PDFKit, and Postgres client dependencies.
- Frontend audit summary from npm install after removing browser-side AWS SDK dependency: 178 vulnerabilities, including 40 high and 6 critical.
- Converter audit summary from npm install after removing the legacy backend AWS SDK dependency: 103 vulnerabilities, including 46 high and 24 critical.
- These are inherited from the old upstream dependency trees. Breaking upgrades were not forced in this MVP pass.

## Build and Lint

- `frontend npm run build`: passed after replacing old `node-sass` with `sass`, adding `NODE_OPTIONS=--openssl-legacy-provider`, and pinning incompatible transitive type packages for TypeScript 3.6.
- Frontend build still emits upstream lint warnings and a large-bundle warning.
- `converter-api npm run build`: passed.
- `converter-api npm run lint`: passed with two warnings in `lib/converter.js` for unused `code` callback args.
- `./scripts/verify.sh`: passed after the Cloudinary/Neon documentation update.

## Smoke Tests

- Converter server start required sandbox escalation to bind localhost.
- `GET http://localhost:4000/health`: passed through `npm run smoke`.
- With `STORAGE_PROVIDER=cloudinary`, health showed `storageConfigured: false`, `cloudinaryConfigured: false`, `databaseConfigured: false`, `databaseMode: memory`, and `converterAvailable: false`, as expected without Cloudinary, Neon, or local LibreOffice/unoconv.
- In-process audit/report smoke passed using the memory fallback store: workspace creation, annotation event, meeting note, user-wise report, and archive manifest generation.
- `docker build -t hexscrum-converter-smoke .` in `converter-api/`: passed. `docker run --rm hexscrum-converter-smoke which unoconv` and `which libreoffice` both passed.
- Browser smoke used a temporary static server for `frontend/build`.
- Playwright confirmed:
  - URL: `http://127.0.0.1:3000/#/`
  - Page title: `HexScrum Workspace`
  - Visible copy: `HexScrum Workspace`, `Document Workspace`, setup warnings, and join form.
- Screenshot saved at `qa-evidence/hexscrum-home-smoke.png`.

## Branding and Secret Checks

- Static branding grep shows remaining `Channelize Whiteboard SDK` references only in attribution/docs and internal upstream code identifiers.
- Remaining `Teacher`/`Student` strings are internal role/function names in `frontend/src/stores/room.ts`.
- Simple secret grep in `./scripts/verify.sh` found no obvious committed secrets.

## Not Tested

- Realtime collaboration: blocked by missing `REACT_APP_AGORA_APP_ID`.
- File upload conversion: blocked by missing Cloudinary credentials and local LibreOffice/unoconv.
- Cloudinary upload return URL: blocked by missing Cloudinary credentials.
- Export annotated PDF: build-time only; no end-to-end document export run.
- Persistent audit/reporting: backend MVP exists, but Neon validation is blocked by missing `DATABASE_URL`.

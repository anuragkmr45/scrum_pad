# HexScrum Changelog

## 2026-06-01

- Bootstrapped `frontend/` from `ChannelizeIO/Channelize-Whiteboard-SDK`.
- Bootstrapped `converter-api/` from the `Node-File-Convertor-API` branch.
- Rebranded main frontend title, metadata, home copy, mode labels, and app manifest to HexScrum Workspace.
- Added safe frontend env examples and a local setup warning when Agora or converter config is missing.
- Added a HexScrum SVG mark for favicon and app logo placeholder.
- Hardened converter API with `PORT`, `/health`, storage configuration checks, safer upload handling, and clearer conversion errors.
- Added converter Dockerfile for Render-style backend deployment with LibreOffice and unoconv.
- Added root setup/deployment/status docs, feature mapping, remaining gaps, run scripts, and QA evidence location.
- Added an Audit & Reports Roadmap page and documentation without claiming enterprise audit completion.
- Moved frontend uploads to the backend converter/API path and removed frontend storage env usage.
- Added Cloudinary storage support, Render CORS settings, and deployment health fields.
- Added Neon/Postgres audit schema initialization and MVP APIs for workspaces, annotation events, meeting notes, reports, and archive manifests.
- Added frontend profile fields for designation/color and non-blocking annotation event tracking.
- Added `/workspace-tools` for meeting notes, annotation history, user-wise reports, exports, and archive manifest download.
- Updated deployment docs for Vercel frontend, Render backend, Cloudinary storage, Neon Postgres, Agora realtime, and Valkey-compatible future cache wording.

# Architecture Deployment Target

## Runtime Layout

| Layer | Target |
| --- | --- |
| Frontend | Vercel static React build from `frontend/` |
| Backend/API | Render Docker web service from `converter-api/` |
| File storage | Cloudinary, backend-only credentials |
| Metadata DB | Neon Postgres through `DATABASE_URL` |
| Realtime | Agora RTM from the browser |
| Cache/queue | None currently |

## Flow

1. User opens the Vercel frontend.
2. User enters a workspace name, display name, designation, and color.
3. Frontend joins Agora RTM when `REACT_APP_AGORA_APP_ID` is configured.
4. Frontend uploads documents to Render `/upload`.
5. Backend validates files, converts to PDF where needed, uploads output to Cloudinary, and stores metadata in Neon when configured.
6. PDF.js renders the returned Cloudinary URL in the whiteboard.
7. Annotation events are synced through Agora and also posted non-blockingly to the backend audit endpoint.
8. Meeting notes, annotation history, user-wise reports, and archive manifest are generated from backend metadata.

## Deliberate Non-targets

- No backend WebSockets on Vercel.
- No external conferencing stack.
- No server-admin deployment path.
- No Valkey dependency. If cache/queue is added later, document it as Valkey-compatible.

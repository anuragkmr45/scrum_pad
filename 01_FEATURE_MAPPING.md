# Feature Mapping

Statuses: `READY`, `PARTIAL`, `MISSING`, `NEEDS CONFIG`.

| Required feature | Status | Evidence / note |
| --- | --- | --- |
| Upload PDF documents | NEEDS CONFIG | Frontend sends PDFs to backend `/upload`; backend uploads to Cloudinary when credentials exist. Local Cloudinary credentials were not provided. |
| Upload PowerPoint presentations | NEEDS CONFIG | Backend accepts PPT/PPTX and converts through LibreOffice/unoconv. Local converter runtime was not available outside Docker. |
| Upload images and reports | NEEDS CONFIG | Backend accepts PNG/JPG and wraps them into PDF via PDFKit; Office/report files use unoconv. Cloudinary credentials still required. |
| Multi-page document navigation | READY | Existing PDF.js whiteboard has page controls and page counts. |
| Shared collaborative workspace | NEEDS CONFIG | Existing Agora RTM path; requires `REACT_APP_AGORA_APP_ID`. |
| Pen/freehand | READY | Existing annotation toolbar has pencil/pen tool. |
| Highlighter | PARTIAL | Existing highlight tool appears for PDF text selections; needs browser QA with uploaded PDFs. |
| Text/comments/notes | PARTIAL | Text annotations exist; meeting notes MVP exists on `/workspace-tools`. |
| Arrow | MISSING | Upstream toolbar has line but no explicit arrow tool. |
| Circle/ellipse | READY | Existing ellipse tool. |
| Rectangle | READY | Existing rectangle/area tool. |
| Line | READY | Existing line tool. |
| Eraser | READY | Existing eraser tool. |
| Touch/stylus pointer handling | PARTIAL | Inherited pointer behavior; no tablet/stylus QA yet. |
| Simultaneous annotations | NEEDS CONFIG | Agora App ID required for two-browser validation. |
| Multi-user sync | NEEDS CONFIG | Existing RTM event path remains; not retested without Agora App ID. |
| User-specific colors | PARTIAL | Users can choose local annotation color; profile color is attached to audit events. |
| Live participant presence | NEEDS CONFIG | Agora member events exist; needs configured live QA. |
| Page synchronization | NEEDS CONFIG | Page sync messages exist; needs configured live QA. |
| Annotation owner | PARTIAL | Frontend sends local user ID/name/designation/color with audit events. |
| Timestamped annotation events | PARTIAL | Backend stores event timestamps; frontend emits create/update/delete/reset where hooks fire. |
| Annotation event history | PARTIAL | Backend report endpoint and frontend table/export exist; real multi-user QA is blocked by Agora config. |
| Contributor tracking | PARTIAL | User-wise report groups stored annotation events by user. |
| Export annotated PDF | PARTIAL | Existing upstream PDF export remains; not retested with uploaded Cloudinary files. |
| Export meeting notes | PARTIAL | Frontend exports notes as HTML/JSON; PDF export is not implemented. |
| Export annotation history | PARTIAL | Frontend exports CSV/JSON from backend report. |
| User-wise annotation report | PARTIAL | Backend report and frontend CSV/JSON export exist. |
| Meeting archive generation | PARTIAL | Backend and frontend generate/download a JSON manifest. Full ZIP/binary archive is not implemented. |

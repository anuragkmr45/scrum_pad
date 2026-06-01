# Agent Notes

## Project Intent

HexScrum Workspace is a fast MVP/demo base. Keep changes small, safe, and honest. Do not claim enterprise audit/reporting, 40-user readiness, or production readiness unless those paths are implemented and tested.

## Layout

- `frontend/`: React/CRA whiteboard frontend cloned from Channelize Whiteboard SDK and rebranded for HexScrum Workspace.
- `converter-api/`: Node File Convertor API branch for LibreOffice/unoconv conversion, Cloudinary upload, and MVP audit/report APIs.
- `docs/`: setup, deployment, runbook, feature mapping, attribution, and audit roadmap.
- `qa-evidence/`: summaries of commands run and known test gaps.

## Constraints

- Never commit real secrets.
- Keep storage secrets out of frontend env files. Cloudinary and database secrets belong only in `converter-api/.env` or Render env.
- Preserve upstream MIT attribution and copyright notices.
- Prefer the existing Agora RTM collaboration path and converter API path.
- Treat audit/reporting as MVP until configured with Neon and tested end to end.

## Useful Commands

```bash
./scripts/install_all.sh
./scripts/run_converter.sh
./scripts/run_frontend.sh
./scripts/verify.sh
```

The frontend is old CRA 3 code. Prefer Node 16 or 18 for local work.

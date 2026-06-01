# Enterprise Audit Roadmap

HexScrum Workspace now includes an audit/reporting MVP. This document tracks what exists and what still remains before enterprise claims are safe.

## MVP Schema

### users

- `id`
- `name`
- `email`
- `designation`
- `role`
- `created_at`
- `updated_at`

### workspaces

- `id`
- `name`
- `owner_user_id`
- `status`
- `started_at`
- `ended_at`
- `created_at`

### documents

- `id`
- `workspace_id`
- `original_file_name`
- `source_mime_type`
- `storage_url`
- `converted_pdf_url`
- `uploaded_by_user_id`
- `created_at`

### pages

- `id`
- `document_id`
- `page_number`
- `width`
- `height`
- `created_at`

### annotations

- `id`
- `workspace_id`
- `document_id`
- `page_id`
- `created_by_user_id`
- `type`
- `color`
- `payload_json`
- `created_at`
- `updated_at`
- `deleted_at`

### annotation_events

- `id`
- `annotation_id`
- `workspace_id`
- `document_id`
- `page_number`
- `action`
- `tool_type`
- `user_id`
- `user_name`
- `user_designation`
- `user_color`
- `payload_json`
- `before_state`
- `after_state`
- `occurred_at`

### meeting_notes

- `id`
- `workspace_id`
- `author_user_id`
- `body`
- `created_at`
- `updated_at`

### exports

- `id`
- `workspace_id`
- `requested_by_user_id`
- `export_type`
- `storage_url`
- `status`
- `created_at`
- `completed_at`

## Implemented MVP

1. Idempotent Postgres table creation.
2. Annotation event ingestion endpoint.
3. Meeting note save/list endpoint.
4. Annotation history and user-wise report endpoints.
5. JSON archive manifest endpoint.
6. Frontend Notes & Reports page with CSV/JSON/HTML exports.

## Remaining Build Sequence

1. Add authentication and workspace membership.
2. Persist and render richer page metadata.
3. Add explicit annotation ownership UI inside the whiteboard.
4. Add report PDF generation and binary archive generation.
5. Add retention, access review, and audit review workflows.
6. Add end-to-end tests against Neon and Cloudinary.

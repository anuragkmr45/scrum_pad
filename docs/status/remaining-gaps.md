# Remaining Gaps

## Configuration Gaps

- Agora App ID is required for realtime collaboration QA.
- Cloudinary credentials are required for upload QA.
- Neon `DATABASE_URL` is required for persistent audit/report QA.
- LibreOffice/unoconv must be available locally, in Docker, or on Render for Office conversion.
- Vercel and Render deployment access is required for deployed smoke tests.

## Product Gaps

- No production auth or organization/workspace authorization.
- No role-based access control for archives/reports.
- No explicit arrow annotation tool yet.
- No full ZIP archive with embedded binaries.
- No PDF export for meeting notes/report tables.
- No production retention/deletion policy.
- No full document library or version history UI.

## Technical Gaps

- Old CRA 3 frontend still carries inherited warnings and legacy dependencies.
- No load test evidence for large rooms or 40-user sessions.
- No browser/device/stylus matrix.
- No malware scanning or file content inspection.
- No rate limiting beyond upload size limits.
- No structured logging/metrics/tracing.
- No security review for CORS, Cloudinary delivery policy, or audit endpoints.

## Recommended Next Build

1. Add production auth and workspace membership.
2. Add explicit arrow annotation support.
3. Add report PDF generation and full ZIP archive generation.
4. Add automated Playwright realtime/upload/report smoke tests with configured env.
5. Add backend rate limits, file scanning, and structured logs.
6. Load test Agora rooms and converter concurrency before making capacity claims.

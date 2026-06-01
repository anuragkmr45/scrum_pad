# Deployment

See [03_DEPLOYMENT_VERCEL_RENDER.md](../03_DEPLOYMENT_VERCEL_RENDER.md).

Use Vercel for the `frontend/` static build and Render or another backend host for `converter-api/`.

The converter should run as a backend service because it needs:

- Node
- LibreOffice
- unoconv
- temporary file storage
- Cloudinary credentials
- Neon database credentials

Do not put backend storage secrets in Vercel frontend variables.

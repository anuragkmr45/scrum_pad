# Setup

See the root [02_LOCAL_SETUP.md](../02_LOCAL_SETUP.md) for the canonical local setup flow.

Short version:

```bash
./scripts/install_all.sh
cp frontend/.env.local.example frontend/.env.local
cp converter-api/.env.example converter-api/.env
./scripts/run_converter.sh
./scripts/run_frontend.sh
```

Fill placeholders only. Do not commit real `.env` files.

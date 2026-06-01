# Valkey-compatible Cache Note

HexScrum Workspace currently does not use a cache, queue, or separate realtime helper that needs Valkey-compatible storage.

If a cache or queue is added later:

- Document it as Valkey-compatible.
- Use Render Key Value or another Valkey-compatible managed service.
- Prefer env names such as `VALKEY_URL`.
- Do not make the frontend depend on server-side cache credentials.

Agora remains the realtime collaboration path for this MVP.

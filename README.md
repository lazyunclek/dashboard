# Investment Dashboard Mobile

Mobile-first investment and daily cashbook dashboard for `lazyunclek/dashboard`.

The public GitHub Pages frontend contains no portfolio snapshot and no privileged credentials. It uses a Supabase publishable key, requires Supabase Auth, and relies on existing RLS policies to return only the signed-in user's rows.

## Security boundary

- Investment data remains read-only. The app contains no investment insert, update, delete, or investment RPC write path.
- Daily cashbook changes use only the allowlisted `cashbook_ensure_defaults`, `cashbook_event_save`, and `cashbook_event_delete` RPCs. Direct browser writes to cashbook tables are not used.
- Cashbook reads and RPC writes require a signed-in user and remain constrained by the database's user-owned RLS policies.
- Never add a Supabase `service_role` or secret key to this repository.
- The Supabase URL and publishable key in `config.js` are intentionally public browser configuration.
- Passwords are sent only to Supabase Auth and are never stored by this app.
- 「記住這支裝置」is off by default. When enabled, only the rotating Supabase refresh token is saved in browser storage.
- No Obsidian snapshot, `.env.local`, raw imports, or source-formatted transaction evidence is deployed.

## Local preview

Serve the repository with any static HTTP server:

```bash
python3 -m http.server 4173
```

Then open `http://127.0.0.1:4173`.

## Public configuration

`config.js` is generated from the Quant Lab safe client configuration:

```bash
node tools/sync-public-config.mjs \
  "/absolute/path/to/outputs/investments/data/client-config.json"
```

The generator accepts only `supabase_url`, `supabase_publishable_key`, and `project_ref`. It rejects service-role or secret-key shaped fields.

## Deployment

Push `main`, then configure GitHub Pages to use **GitHub Actions**. The included workflow deploys the repository as a static site.

## Validation

```bash
node tools/check-static-app.mjs
```

# Investment Dashboard Mobile

Mobile-first, read-only investment dashboard for `lazyunclek/dashboard`.

The public GitHub Pages frontend contains no portfolio snapshot and no privileged credentials. It uses a Supabase publishable key, requires Supabase Auth, and relies on existing RLS policies to return only the signed-in user's rows.

## Security boundary

- Read-only investment queries. The app contains no investment insert, update, delete, or RPC write path.
- Never add a Supabase `service_role` or secret key to this repository.
- The Supabase URL and publishable key in `config.js` are intentionally public browser configuration.
- Passwords are sent only to Supabase Auth and are never stored by this app.
- When「記住這支裝置」is enabled, only the rotating Supabase refresh token is saved in browser storage.
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

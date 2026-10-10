# Moneta cloud

One Cloudflare Worker (free plan) that:

- hosts the phone app (the built files from `../ios/dist`),
- fetches Yahoo Finance prices and symbol search for the phone (`/api/quotes`, `/api/search`),
- stores sync data (`/api/sync/:id`) and short-lived pairing codes (`/api/pair/:id`) in a D1 database.

Sync data is encrypted on each device with AES-GCM before upload, using keys derived from the
sync key that only your devices hold. The service stores ciphertext and the SHA-256 of each
document's auth token; it can't read your data.

## Deploy

```bash
npm install
npx wrangler login
npx wrangler d1 create moneta-sync              # put the database_id in wrangler.toml
npx wrangler d1 execute moneta-sync --remote --file schema.sql
npm --prefix ../ios run build                   # the phone app this Worker serves
npx wrangler deploy
```

Then set `DEFAULT_SERVER` in `../windows/src/renderer/src/sync/engine.ts` to the Worker's URL and rebuild the
Windows app.

## Run locally

```bash
npx wrangler d1 execute moneta-sync --local --file schema.sql
npx wrangler dev
```

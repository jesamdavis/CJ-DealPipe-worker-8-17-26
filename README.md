# DealPipe CJ Worker

Minimal Cloudflare Worker used only to test whether CJ Product API requests are reliable from Cloudflare egress.

It does **not** connect to Postgres and it does **not** modify DealPipe inventory.

## Endpoints

- `GET /health`
- `GET /test?city=Waukesha&state=WI&zip=53186`
  - requires header: `x-test-secret: <TEST_SECRET>`

## Deploy

```bash
npm install
npx wrangler login
npx wrangler secret put CJ_API_TOKEN
npx wrangler secret put TEST_SECRET
npm run deploy
```

When prompted for `CJ_API_TOKEN`, paste the current CJ Personal Access Token.

For `TEST_SECRET`, use any long random string known only to you.

## Test

Replace the hostname and secret:

```bash
curl -sS \
  -H "x-test-secret: YOUR_TEST_SECRET" \
  "https://dealpipe-cj-worker.YOUR-SUBDOMAIN.workers.dev/test?city=Waukesha&state=WI&zip=53186"
```

Success should show:

- `"cloudflare_to_cj_status": 200`
- `verified_local_count` greater than 0 when CJ currently has Waukesha local inventory.
- `customLabel3` containing `53186` on accepted local rows.

Run the same request repeatedly to test whether Cloudflare egress remains accepted by CJ.

## Security

The CJ token is stored only as a Cloudflare secret. It is never committed to this repo or returned by the endpoint.

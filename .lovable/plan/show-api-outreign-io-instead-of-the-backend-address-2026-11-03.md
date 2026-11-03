# Show `api.outreign.io` instead of the backend address

Yes, this works. Your domain already runs through Cloudflare, so a small Cloudflare Worker on `api.outreign.io` can forward requests to the backend. Customers then only see the OutReign address.

## What you do in Cloudflare (one time, I give exact steps)
1. Create a Worker named `outreign-api` with the forwarding code I provide (passes method, headers, body and streaming through unchanged).
2. Under the Worker's Domains tab, add custom domain `api.outreign.io`.
3. Test: `https://api.outreign.io/rest-api/...` returns the same result as today.

## What I change in the app
- API docs page: base URL becomes `https://api.outreign.io/rest-api`.
- Inbound webhooks settings: shown webhook URL becomes `https://api.outreign.io/inbound-webhook/...`.
- MCP / agent connect info: endpoint shown as `https://api.outreign.io/mcp`.
- `llms.txt` / `llms-full.txt` and any doc mentions of the old address.
- Address comes from one setting with the old address as fallback, so nothing breaks before the Worker is live.

## Not changed
- The app's own internal calls keep using the backend directly (faster, no extra hop).
- Old addresses keep working, so existing integrations and webhooks don't break.

## Technical details
- New `VITE_PUBLIC_API_BASE` (default `https://api.outreign.io`) used in `ApiDocs.tsx`, `InboundWebhooksPanel.tsx`, `webmcp.ts`.
- Worker maps `api.outreign.io/<fn>/...` to `<backend>/functions/v1/<fn>/...`, preserves query, adds CORS passthrough.
- What's New entry: "API and webhook URLs now use api.outreign.io."

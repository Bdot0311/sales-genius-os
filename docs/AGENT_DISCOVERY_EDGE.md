# Agent discovery — edge configuration (Cloudflare)

Lovable hosting does not apply `public/_headers` or `netlify.toml`, so the
`Link` response headers and JSON content types must be added at the Cloudflare
edge (the same worker that already sets the CSP header).

## 1. Worker: Link headers + correct content types

Paste this into the worker bound to `outreign.io/*` (merge with the existing CSP
logic if you already have a worker).

```js
const LINK_HEADER = [
  '</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"',
  '</.well-known/mcp/server-card.json>; rel="service-desc"; type="application/json"',
  '</.well-known/agent-skills/index.json>; rel="describedby"; type="application/json"',
  '</.well-known/oauth-protected-resource>; rel="oauth-protected-resource"; type="application/json"',
  '</api-docs>; rel="service-doc"; type="text/html"',
  '</llms.txt>; rel="describedby"; type="text/plain"',
  '</auth.md>; rel="author"; type="text/markdown"',
].join(", ");

const CONTENT_TYPES = {
  "/.well-known/api-catalog": "application/linkset+json; charset=utf-8",
  "/.well-known/oauth-protected-resource": "application/json; charset=utf-8",
  "/.well-known/oauth-authorization-server": "application/json; charset=utf-8",
  "/.well-known/openid-configuration": "application/json; charset=utf-8",
  "/auth.md": "text/markdown; charset=utf-8",
  "/llms.txt": "text/plain; charset=utf-8",
  "/llms-full.txt": "text/plain; charset=utf-8",
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const response = await fetch(request);
    const headers = new Headers(response.headers);

    // RFC 8288 Link headers on every HTML document (incl. the homepage).
    const type = headers.get("content-type") || "";
    if (type.includes("text/html")) {
      headers.set("Link", LINK_HEADER);
      // Keep your existing CSP / X-Frame-Options lines here.
      headers.set("X-Frame-Options", "DENY");
    }

    // Extensionless discovery documents need explicit media types + CORS.
    const override = CONTENT_TYPES[url.pathname];
    if (override) {
      headers.set("Content-Type", override);
      headers.set("Access-Control-Allow-Origin", "*");
      headers.set("Cache-Control", "public, max-age=3600");
      headers.set("Link", LINK_HEADER);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
```

Verify:

```bash
curl -sI https://outreign.io/ | grep -i '^link'
curl -sI https://outreign.io/.well-known/oauth-protected-resource | grep -i content-type
```

## 2. DNS-AID + DNSSEC

The SVCB records are already published:

```
_index._agents.outreign.io.  SVCB  1 outreign.io.                          alpn="h2" port="443"
_a2a._agents.outreign.io.    SVCB  1 ghgfjnepvxvxrncmskys.supabase.co.     alpn="h2" port="443"
```

The remaining scanner failure is **DNSSEC not validated**. This cannot be done in
code — enable it once in Cloudflare:

1. Cloudflare dashboard → `outreign.io` → **DNS → Settings → DNSSEC → Enable**.
2. Copy the DS record Cloudflare shows (key tag, algorithm, digest type, digest).
3. Paste that DS record at your **domain registrar** (where `outreign.io` is
   registered), under DNSSEC / DS records.
4. Wait for propagation, then confirm the `ad` (authenticated data) flag:

```bash
dig +dnssec _index._agents.outreign.io SVCB @1.1.1.1 | grep -E 'flags|RRSIG'
```

The scanner passes once the answer carries `ad` and an `RRSIG`.

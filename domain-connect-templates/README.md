# DomainConnect Templates

These JSON templates power the **"Do It For Me"** button in the Deliverability → DNS
Health Checker. DomainConnect is the free open standard (built by GoDaddy/IONOS) that
lets a user apply DNS records to their domain with a single confirmation click — no API
keys, no manual record entry — on any DNS provider that supports it.

## How it works

1. The app looks up a `_domainconnect.<domain>` TXT record to find the user's DNS host.
2. It fetches that host's `/v2/<domain>/settings` endpoint to check for synchronous-flow support.
3. If supported, it sends the user to an **apply URL** that references the template below.
4. The provider (GoDaddy, IONOS, 1&1, Plesk/cPanel hosts, …) shows a confirm screen and
   writes the records.

Providers that **don't** support DomainConnect (Cloudflare, Namecheap) automatically fall
back to the guided manual flow in the app.

## Registering the template (one-time setup)

For the apply URL to be recognized by DNS providers, this template must be added to the
public DomainConnect template registry and synced by the providers:

1. Fork **https://github.com/Domain-Connect/Templates**
2. Copy `salesos.io.email-auth.json` into that repo's `templates/` directory
   (filename format: `<providerId>.<serviceId>.json`).
3. Open a PR. Once merged, GoDaddy and other providers sync the registry (usually within days).
4. Verify the `providerId` you register matches `VITE_DOMAINCONNECT_PROVIDER_ID`
   (and `serviceId` matches `VITE_DOMAINCONNECT_SERVICE_ID`) in the app's env.

> Until the template is registered + synced, the "Do It For Me" button will detect support
> but the provider's apply page will reject the unknown template. The app degrades gracefully
> to the manual guide in that case.

## Template variables

The template uses these variables, supplied by the app as query params on the apply URL:

| Variable      | Meaning                              | Example value         |
|---------------|--------------------------------------|-----------------------|
| `spfinclude`  | SPF include host for the ESP         | `_spf.google.com`     |
| `dmarcpolicy` | DMARC enforcement policy             | `quarantine`          |
| `dmarcrua`    | Email for aggregate DMARC reports    | `dmarc@example.com`   |

## Why DKIM isn't here

DKIM's public-key value is generated per-domain inside the user's email provider
(Google Workspace / Microsoft 365). We can't know it ahead of time, so DKIM stays in the
guided flow where we point the user to generate it. SPF and DMARC have deterministic values
and are safe to auto-apply.

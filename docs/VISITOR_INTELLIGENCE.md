# Visitor Intelligence

Company-level website visitor identification. It is off until an admin turns on the `visitorIntelligence` flag and grants the workspace. Person-level identity is a nullable `person_id` on the match and is unused.

There is no RB2B, Warmly, Leadfeeder, Clearbit Reveal, or any other visitor-ID vendor. A visitor is either a company the public signals name, or **Unknown** with the reason.

## Install

1. Publish the app in Lovable so the migration, the `visitor-ingest`, `visitor-sdk` and `visitor-resolve` functions, and `/v.js` are live. A merge to `main` does not deploy them.
2. In Admin → Settings → Features, turn on `visitorIntelligence`.
3. In Visitor Intelligence access, grant the workspace (for the first test, the outreign.io workspace).
4. Open Visitors → Installation & settings, add the domain, and paste the snippet.

The site id is public. Allowed domains are what stop another origin from writing events.

The snippet is served from the app at `/v.js` and from the `visitor-sdk` function. `cdn.outreign.io` is optional and is not configured. Set `data-endpoint` to the `visitor-ingest` function URL. The script exposes `OutReign.track(name, props)`, `OutReign.consent()` and `OutReign.disable()`. It honours Do Not Track and Global Privacy Control, and it does not fingerprint.

## What a visit does

The browser batches page views, path, referrer host, UTM parameters, session (30 minute timeout), returning visits, engagement and page type (pricing, product, integrations, demo/contact). Sensitive query parameters are dropped. The collector reads the client address from the last hop of `x-forwarded-for`, never from the body.

An async worker resolves that address with reverse DNS, RDAP and ASN, cached per prefix for non-company networks and per hashed address for a company result. ISP, mobile, cloud, hosting, VPN and residential ranges stay Unknown. A company name is stored only when the registry org agrees with the domain, or when it matches an existing company record or a company-search hit with the same domain.

From an identified company the existing people search, enrich, research (Firecrawl website plus Parallel and Context), Jev and draft paths can run. Jev is called only from a rule, in the background, and only through `evaluateLeadWithJEV`. Nothing sends. An enroll action writes a **paused** sequence enrollment; the existing sender runs after a person resumes it.

Rules are capped at 25 runs per rule per day and 25 per workspace per day, and a match runs a rule once.

## Retention

| Data | How long |
|---|---|
| Raw IP | At most 24 hours, on `visitor_resolve_jobs` only, cleared when the job finishes or sooner |
| IP hash | SHA-256 of a pepper plus the address. Not shown in the app. Pepper is `VISITOR_IP_PEPPER`, or the service role key when that is unset |
| Events | The site's retention window, default 90 days, between 7 and 365 |
| Registry cache | The public answer for a /24 or /48, not a visitor |

Form contents, passwords and sensitive inputs are not collected.

## Endpoints

| Function | Auth | Role |
|---|---|---|
| `visitor-sdk` | Public, `verify_jwt = false` | Serves the script |
| `visitor-ingest` | Public, `verify_jwt = false` | Validates, rate-limits, stores, enqueues |
| `visitor-resolve` | Service role or the internal trigger secret | Resolves companies and runs rules |

`visitor-resolve` is scheduled every two minutes when `pg_cron` and the existing internal job key are present. If they are not, the function still exists and can be called by hand.

## Coverage

This will miss most visitors. Home broadband, mobile carriers, VPNs and cloud egress (including a company whose staff egress through AWS or Google) come back Unknown. A confident match needs a corporate reverse-DNS name that agrees with the registry, or a domain already in the workspace's companies. That is a small slice of B2B traffic. The product shows Unknown rather than guessing.

## What you do not need to buy

No new paid service, no AWS resource, and no identity vendor. DNS-over-HTTPS and RDAP are public. People search, enrichment, research and Jev spend the workspace's existing credits only when a rule or a button asks them to.

# OutReign Deliverability Suite

Best-in-class deliverability tooling for OutReign's email-only outbound. This
document covers the architecture, the Supabase schema, required DNS, the
third-party/seed setup, and the build phases with their honest status.

> **Scope note.** OutReign is email-only. Nothing here touches calls, SMS, or
> phone. Sending is done through the Gmail API using each user's OAuth token
> (stored in `integrations.config`). We do not fabricate metrics: any panel that
> lacks a real data source shows an honest "not configured" state rather than a
> made-up number.

---

## Modules

1. **Inbox Placement & Reputation Engine** — per-account reputation score
   (0–100) from real bounce/complaint/volume/engagement data; blacklist (RBL)
   monitoring for sending + tracking domains; SPF/DKIM/DMARC validation with the
   exact records to add and one-click re-check; inbox-vs-spam placement testing.
2. **Account Warmup System** — shared cross-user warmup pool, ramp schedule,
   reply bot, warmup health graph, and auto-pause on reputation drop.
3. **Sending Infrastructure Controls** — per-account daily limits, randomized
   send delays, account rotation, bounce classification + hard-bounce
   auto-suppression, custom tracking-domain setup and validation.
4. **Content & Spam Risk Checker** — deterministic pre-send spam analysis
   (trigger words, link density, image/text ratio, shorteners, shouting,
   plain-text friendliness) with live scoring and actionable fixes.
5. **Deliverability Command Center** — aggregate health, all accounts at a
   glance, active alerts, trend sparklines, and date-ranged history.

---

## Architecture

```
Gmail API (per-user OAuth in integrations.config)
      │  send / inbox-sync
      ▼
sent_emails ──┐
              ├─► compute-reputation (nightly) ─► reputation_snapshots ─► sending_accounts.reputation_score
bounce_events ┘                                                              │
                                                                             ▼
suppressed_emails (bounce/complaint webhook)                        deliverability-alerts-scan (nightly)
                                                                             │
sending_domains ◄── check-domain-auth (DoH SPF/DKIM/DMARC)                   ▼
blacklist_checks ◄── check-blacklists (DNSBL)                        deliverability_alerts (in-app)
tracking_domains ◄── verify-tracking-domain (CNAME)
warmup_pool / warmup_messages ◄── warmup-orchestrator (send + reply among pool)
placement_tests / placement_results ◄── run-placement-test (seed inbox)
```

Spam-risk scoring is **client-side only** (`src/lib/spam-score.ts`): it is
deterministic, needs no PII on the server, and updates live as the user types.

---

## Supabase schema

Migrations (idempotent, owner-scoped RLS):

| Migration | Tables |
|---|---|
| `…_deliverability_accounts_domains.sql` | `sending_accounts` (+ `sent_emails.sending_account_id`, backfill from `integrations`), `sending_domains`, `tracking_domains`, `blacklist_checks` |
| `…_deliverability_reputation_bounces.sql` | `bounce_events`, `reputation_snapshots`, `deliverability_alerts` |
| `…_deliverability_warmup_placement.sql` | `warmup_pool`, `warmup_messages`, `placement_tests`, `placement_results` |

`sending_accounts` is the canonical per-mailbox record (limits, delays,
warmup flag, reputation, status). It links to the existing `integrations` OAuth
store rather than duplicating tokens. The existing `mailbox_warmup` /
`warmup_logs` tables remain and are joined to `sending_accounts` by email.

**Warmup pool RLS:** users read/write only their own `warmup_pool` membership
and can read `warmup_messages` involving their accounts. The orchestrator runs
with the service role (bypasses RLS) to pair accounts across users.

---

## Required DNS (per sending domain)

Populated with exact values by `check-domain-auth`. General shape:

| Record | Host | Value |
|---|---|---|
| **SPF** (TXT) | `@` | `v=spf1 include:_spf.google.com ~all` (Gmail sending) |
| **DKIM** (TXT) | `google._domainkey` | the key from Google Admin → Apps → Gmail → Authenticate email |
| **DMARC** (TXT) | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@yourdomain` (start at `p=none`, tighten later) |

**Custom tracking domain** (recommended to avoid shared-domain reputation drag):

| Record | Host | Value |
|---|---|---|
| CNAME | `track.yourdomain.com` | the OutReign tracking target shown in-app |

`verify-tracking-domain` validates the CNAME before the domain is used for
open-tracking links.

---

## Third-party / seed setup

Chosen approach: **free / lowest-cost, real data only.**

- **SPF/DKIM/DMARC + blacklist:** free. DNS-over-HTTPS (Cloudflare/Google) for
  auth records; DNSBL lookups (Spamhaus DBL, Barracuda, SORBS) for the sending
  and tracking **domains**. Note: some RBLs rate-limit datacenter IPs, so
  queries run domain-scoped and are cached in `blacklist_checks`.
- **Inbox placement:** Gmail placement is measured with a **seed inbox we
  control** via the Gmail API — free. Outlook/Yahoo placement requires seed
  accounts on those providers (or a paid API such as GlockApps ~$79/mo); until a
  seed for a provider exists, its result is stored as `pending`/`unsupported` and
  shown as "seed inbox not connected", never as a fabricated percentage.

Environment variables (added when the relevant module ships):

```
DELIVERABILITY_SEED_GMAIL_ADDRESS   # address of the Gmail seed inbox
DELIVERABILITY_SEED_GMAIL_REFRESH   # OAuth refresh token for the seed inbox
# Optional, only if a paid placement provider is enabled later:
PLACEMENT_PROVIDER_API_KEY
```

---

## Warmup safety

The warmup pool sends **real email between opted-in mailboxes**. Guardrails:

- Conservative default ramp; per-account `daily_target` caps warmup volume.
- Randomized timing and varied filler content (no identical bodies).
- `warmup-orchestrator` auto-pauses an account (and raises a `warmup_paused`
  alert) when its reputation drops below `sending_accounts.auto_pause_threshold`.
- Warmup sends are logged in `warmup_messages` with the detected folder
  (inbox/spam) so recovery rate is measurable, not assumed.

---

## Build phases & status

- [x] **Phase 1 — Foundation**: schema migrations, `sending_accounts` backfill,
      per-account send attribution column.
- [x] **Phase 4 — Spam checker engine** (`src/lib/spam-score.ts`): live,
      deterministic, shipped as a library (UI wiring next).
- [x] **Phase 2 — Auth & infra (backend)**: `check-domain-auth`,
      `verify-tracking-domain`, `check-blacklists` edge functions + typed client
      (`src/lib/deliverability-api.ts`).
- [x] **Phase 3 — Reputation engine (backend)**: `compute-reputation` and
      `deliverability-alerts-scan` nightly jobs, `get_reputation_inputs` RPC, cron
      schedules, per-account send attribution in `send-email`. Scores are null
      below a 20-send floor (no fabricated numbers).
- [x] **Phase 3b — Command Center UI**: `Deliverability.tsx` rebuilt into a real
      dashboard — aggregate health, per-account reputation cards with trend
      sparklines + pause/resume, active alerts, live SPF/DKIM/DMARC + blacklist
      panel, and the spam checker wired to the live engine. `send-email` now
      blocks sends from paused/disabled accounts so manual + auto pause take
      effect.
- [x] **Phase 4 — Sending controls**: per-account daily limit enforced atomically
      at send time (`increment_account_send` RPC), rotation helper
      (`pick_sending_account`), and a per-account controls dialog (limit, delays,
      auto-pause threshold). Delays/rotation apply to automated sequences as they
      adopt the helper.
- [ ] **Remaining**: randomized inter-send delay + rotation wired into the
      scheduled/sequence senders, hard-bounce auto-suppression, custom tracking
      domains.
- [ ] **Phase 5 — Warmup orchestration** and **Phase 6 — Placement testing**.
- [ ] **Phase 5 — Warmup orchestration**: pool join/leave, `warmup-orchestrator`,
      reply bot, health graph, auto-pause.
- [ ] **Phase 6 — Placement testing**: Gmail seed flow; gated Outlook/Yahoo.

Local build: `npm ci && npx vite build`. Migrations apply via the normal
Supabase migration flow; review each before it reaches the production database.

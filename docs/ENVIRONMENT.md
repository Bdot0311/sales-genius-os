# Environment variables

Every secret this product reads, what reads it, and — the column that matters —
**what happens when it is missing**.

That last column is the reason this page exists. ColdIQ was paused for cost and
email verification silently stopped proving mailboxes for weeks. Nothing broke,
nothing alerted, nothing appeared in the UI. Addresses that did not exist shipped,
and the first sign was a bounce rate of 8.571% on one mailbox and 5.882% on
another, discovered by reading a reputation score backwards.

The pattern is worth naming, because most of this table shares it: **a missing
key almost never fails loudly.** A provider that cannot be called is skipped, the
request succeeds, and the feature quietly returns nothing. That is the right
behaviour — one dead vendor should not take a search down with it — but it means
the only way to know a key is gone is to look.

## Where these are set

**Edge function secrets** (everything without a `VITE_` prefix):

> Supabase Dashboard → your project → Project Settings → Edge Functions → Secrets

or:

```bash
supabase secrets set KEY=value
```

Secrets are injected at invocation, but warm instances keep the environment they
started with. A new secret takes effect on the next cold start; redeploy the
functions that read it if you want it immediately.

**Frontend variables** (`VITE_` prefix) are baked into the bundle at build time
and are **public** — they ship to every browser. Never put a secret behind a
`VITE_` name. Set these in Lovable's project environment, and rebuild to change
one.

---

## Platform

Injected automatically by Supabase. You do not set these, and nothing works
without them.

| Variable | Read by | Missing |
|---|---|---|
| `SUPABASE_URL` | Nearly every function | Nothing runs |
| `SUPABASE_SERVICE_ROLE_KEY` | Nearly every function | Nothing runs |
| `SUPABASE_ANON_KEY` | ~28 functions | User-scoped calls fail |
| `SUPABASE_PUBLISHABLE_KEY` | `get-stripe-revenue`, `evaluate-lead` | Those two fail |

---

## Agent tuning

Tuning, not credentials. Safe to leave unset.

| Variable | Read by | Missing |
|---|---|---|
| `AGENT_JOB_CONCURRENCY` | `process-agent-jobs` | Defaults to 4 drafts in flight per pass. Raising it past what the AI provider will serve turns slowness into failed leads rather than speed, because a rate-limited draft is settled, not queued forever |
| `AGENT_TURN_TOKEN_BUDGET` | `agent-chat` | Defaults to 400,000 tokens for one turn, carried across a resume so a restart cannot pay for the same work twice. A turn that hits it stops and says so; it is a runaway stop, not a cost control, and values under 50,000 are ignored because a turn below that cannot finish anything |

---

## AI

`_shared/ai-provider.ts` routes to a direct provider account first and falls back
to the Lovable gateway.

| Variable | Read by | Missing |
|---|---|---|
| `AWS_BEARER_TOKEN_BEDROCK` / `BEDROCK_API_KEY` | `_shared/bedrock.ts` | Falls back to the Lovable gateway |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_SESSION_TOKEN` | `_shared/bedrock.ts` | SigV4 path unavailable; bearer token used instead |
| `AWS_REGION` / `BEDROCK_REGION` | `_shared/bedrock.ts` | Defaults apply |
| `BEDROCK_MODEL_ID` / `BEDROCK_MODEL_ID_PRO` | `_shared/bedrock.ts` | Built-in model ids used |
| `LOVABLE_API_KEY` | ~29 functions | **With no Bedrock key either: every AI call returns "No AI provider key configured"** — drafting, scoring, research, the agent |
| `CF_AI_GATEWAY_BEDROCK` | `_shared/ai-gateway.ts` | Bedrock traffic goes direct to AWS, as it always has. Set it to everything up to and including `/aws-bedrock` — `https://gateway.ai.cloudflare.com/v1/<account_id>/<gateway_id>/aws-bedrock` — and every Bedrock call routes through the gateway for spend analytics, caching and rate limiting. The rest of the path (`/bedrock-runtime/<region>/<aws path>`) is appended from the URL the signer saw, so the signature keeps covering the AWS host. Find the base under **AI → AI Gateway → your gateway → API**. Anything that is not an https URL is ignored with a warning rather than sending model traffic somewhere unreachable |
| `CF_AI_GATEWAY_TOKEN` | `_shared/ai-gateway.ts` | Sent as `cf-aig-authorization` **only** when `CF_AI_GATEWAY_BEDROCK` is in use, never on a direct-to-AWS call. If the gateway has Authenticated Gateway turned on and this is unset, **every model call in the product gets a 401** — drafting, scoring, research, the agent — so the helper logs a warning when the base is set without it. Unauthenticated gateways need no token |
| *(the fallback provider is not configurable)* | `_shared/ai-gateway.ts` | Lovable's gateway takes `LOVABLE_API_KEY` and gateway-style model ids, so it cannot be repointed at another provider's route without a credential and a model map for whatever is on the other end. Bedrock is the primary provider and the one worth observing |

---

## Lead data

| Variable | Read by | Missing |
|---|---|---|
| `RAILWAY_LEADS_API_URL` | `fetch-external-leads`, `enrich-lead`, `search-companies`, `_shared/email-verify.ts` | **Silent.** `search-companies` returns an empty list with a 200. Lead search finds nothing and looks like a search with no matches |
| `RAILWAY_API_KEY` | same | Requests sent unauthenticated. Fine if the service is open, 401 if not |
| `PARALLEL_API_KEY` | `_shared/parallel.ts` | **Silent.** `hasParallel()` returns false and web research is skipped. Source links fall back to the prospect's own site — which is what the research looked like for months |
| `BLOOMBERRY_API_KEY` | `detect-tech-signals`, `discover-tech-signals` | Logs, then returns `{detected: false, reason: "technographic provider not configured"}` — a 200 |
| `PREDICTLEADS_API_KEY` + `PREDICTLEADS_API_TOKEN` | `detect-news-signals` | Same shape: `{detected: false}`, a 200. **Both are required**; one alone does nothing |
| `BLOOMBERRY_API_URL` / `PREDICTLEADS_API_URL` | same | Documented defaults used |
| `ENRICHMENT_CREDITS` | `enrich-lead` | Defaults to `charge`. Set to `free` to stop billing credits for enrichment |

---

## Email verification

The chain that decides whether an address is real. See `_shared/email-verify.ts`.

| Variable | Read by | Missing |
|---|---|---|
| `RAILWAY_LEADS_API_URL` | `_shared/email-verify.ts` | Falls through to a direct vendor, then to DNS |
| `EMAIL_VERIFIER_API_KEY` | `_shared/email-verify.ts` | No direct vendor beneath the waterfall |
| `EMAIL_VERIFIER_PROVIDER` | `_shared/email-verify.ts` | Defaults to `reoon`. Also accepts `millionverifier` |
| `COLDIQ_API_KEY` | `_shared/email-verify.ts`, `_shared/coldiq.ts` | ColdIQ drops out of the waterfall and out of lead-search fallback |
| `COLDIQ_BASE_URL`, `COLDIQ_VERIFY_PATH`, `COLDIQ_SEARCH_PATH`, `COLDIQ_FIND_EMAIL_PATH`, `COLDIQ_WEB_FETCH_PATH`, `COLDIQ_AUTH_STYLE`, `COLDIQ_MAX_CREDITS`, `COLDIQ_LEADS`, `COLDIQ_RESOLVE_EMPLOYER` | `_shared/coldiq.ts` | Spec defaults apply |

**Read this row carefully, because it is the one that cost real money.** With
none of the above configured, verification degrades to the free DNS gate. DNS
proves a *domain* accepts mail. It can never prove a *mailbox* exists. So the
verifier deliberately never returns `valid` **and never returns `invalid`** — and
`send-email` refuses only `invalid`. Every address ships. Nothing in the UI says
so. Watch the bounce rate on the Deliverability page: above 2% is a warning,
above 5% is danger, and the score's ledger names bounces as the cause.

---

## Deliverability

| Variable | Read by | Missing |
|---|---|---|
| `DELIVERABILITY_SEED_GMAIL_ADDRESS` + `DELIVERABILITY_SEED_GMAIL_REFRESH` | `run-placement-test` | The shared seed inbox is unavailable; placement tests need a user's own connected seed account |
| `DMARC_RUA_DOMAIN` | `check-domain-auth` | Recommended DMARC record points at `dmarc@<their root domain>` instead of a collecting address |
| `DMARC_INGEST_SECRET` | `ingest-dmarc-report` | Report ingestion rejects everything |

---

## OAuth integrations

Each pair gates one integration. Missing either half means that provider cannot
be connected; nothing else is affected.

| Variable | Read by |
|---|---|
| `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` | ~12 functions — Gmail send, inbox sync, calendar, the seed inbox |
| `SLACK_CLIENT_ID` + `SLACK_CLIENT_SECRET` | `slack-oauth-init`, `slack-oauth-callback` |
| `HUBSPOT_CLIENT_ID` + `HUBSPOT_CLIENT_SECRET` | `hubspot-oauth-init`, `hubspot-oauth-callback` |
| `SALESFORCE_CLIENT_ID` + `SALESFORCE_CLIENT_SECRET` | `salesforce-oauth-init`, `salesforce-oauth-callback` |
| `CALENDLY_CLIENT_ID` + `CALENDLY_CLIENT_SECRET` | `calendly-oauth-init`, `calendly-oauth-callback` |
| `CALENDLY_WEBHOOK_SIGNING_KEY` | `calendly-webhook`, `calendly-oauth-callback` |
| `OPINLY_API_KEY` | `sync-opinly-posts` |
| `OPINLY_WEBHOOK_SIGNING_SECRET` | `opinly-webhook` |

Google's is the one that matters most: it is not an optional integration, it is
how mail is sent and how replies are read.

---

## Billing

| Variable | Read by | Missing |
|---|---|---|
| `STRIPE_SECRET_KEY` | ~14 functions | **Loud.** Throws `STRIPE_SECRET_KEY is not set` |
| `STRIPE_WEBHOOK_SECRET` | `stripe-webhook` | Webhook signatures cannot be checked |

---

## Notifications

| Variable | Read by | Missing |
|---|---|---|
| `LOVABLE_SEND_URL` | `auth-email-hook`, `_shared/managed-email.ts` | Transactional email cannot send |
| `RESEND_API_KEY` | `send-seo-digest` | Returns `{success: false, error: "Email gateway not configured"}` |
| `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT` | `_shared/notify-push.ts`, `send-push-notification`, `run-seo-audit` | **Silent.** `notify-push.ts` returns early and no web push is sent. `VAPID_SUBJECT` defaults if unset |
| `FIREBASE_MESSAGING_API_KEY` | `send-fcm-notification` | Mobile push unavailable |
| `NOTIFICATION_EMAIL` | ~6 functions | Defaults to `support@bdotindustries.com` |
| `APP_URL` | ~8 functions | Defaults to `https://outreign.io`. Wrong value means broken links in outgoing email |

---

## Internal secrets

| Variable | Read by | Missing |
|---|---|---|
| `INTERNAL_TRIGGER_SECRET` | ~9 functions | Cron and queue callers must present the service role key instead |
| `CHANGELOG_DRAFT_SECRET` | `_shared/changelog-auth.ts` | Changelog drafting endpoint closed |
| `TURNSTILE_SECRET_KEY` | `verify-turnstile` | **Fails open by design** — signup captcha is skipped rather than locking everyone out. Deliberate, and logged |

---

## Analytics

| Variable | Read by | Missing |
|---|---|---|
| `POSTHOG_API_KEY` | `_shared/posthog.ts` | `isPostHogConfigured` false; server events dropped |
| `POSTHOG_REGION` | `_shared/posthog.ts`, `posthog-insights` | Defaults to `eu` |
| `POSTHOG_PERSONAL_API_KEY` + `POSTHOG_PROJECT_ID` | `posthog-insights` | Insight queries unavailable |
| `GOOGLE_SEARCH_CONSOLE_API_KEY` | `run-seo-audit` | Search Console data missing from the audit |

---

## Frontend (public, in the bundle)

| Variable | Notes |
|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` | Required. The app cannot reach its backend without them |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Checkout |
| `VITE_TURNSTILE_SITE_KEY` | Signup captcha widget |
| `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST` | Client analytics |
| `VITE_DOMAINCONNECT_PROVIDER_ID`, `VITE_DOMAINCONNECT_SERVICE_ID` | One-click DNS setup |
| `VITE_LOVABLE_CONNECTOR_*` | Managed by Lovable's connectors; not set by hand |

---

## Checking what is actually set

There is no endpoint that lists configured secrets, and deliberately so — an
endpoint that enumerates which keys exist is a map for anyone who finds it.

To audit, read the logs. Every provider that declines to run says so by name:

```
[detect-tech-signals] BLOOMBERRY_API_KEY not configured
[search-companies] RAILWAY_LEADS_API_URL not configured
[email-verify] reoon returned 401: ...
[VERIFY-TURNSTILE] TURNSTILE_SECRET_KEY not set - skipping verification
```

And on a verified address, the source is logged, so you can see which layer
actually answered:

```
[enrich-lead] verified railway → valid (Mailbox confirmed)
[enrich-lead] verified reoon → invalid (Mailbox does not exist)
[enrich-lead] verified mx → unknown (Domain accepts mail — mailbox not verified)
```

That third line is the one to watch for. It means no paid verifier answered, and
every address in that batch is about to be sent to unproven.

## Adding a variable

Keep the two habits this page documents:

1. **Name the key in the log line when you skip.** `"provider not configured"`
   alone tells you a feature is off, not which secret turns it back on.
2. **Degrade to the honest answer, not the convenient one.** A verifier with no
   provider returns `unknown`, never `valid`. A search with no provider returns
   empty, not a partial list presented as complete. The failure mode should make
   a missing key look like a missing key.

Then add a row here. A key that exists only in `Deno.env.get` is a key nobody
knows to renew.

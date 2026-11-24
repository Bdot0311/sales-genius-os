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
| `BULK_RUN_CONCURRENCY` | `process-bulk-runs` | Leads worked at once per bulk-run pass (default 6, max 12). Rate limits slow the run down and retry rather than failing leads |
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
| `BEDROCK_MODEL_ID` / `BEDROCK_MODEL_ID_PRO` | `_shared/bedrock.ts` | Built-in ids used — Haiku 4.5 (`us.anthropic.claude-haiku-4-5-20251001-v1:0`) and US geo Sonnet 4.6 (`us.anthropic.claude-sonnet-4-6`). Each variable replaces only its own tier. Opus 5.5 (`us.anthropic.claude-opus-5-5`) is not the default; it is used only when `BEDROCK_MODEL_ID_PRO` is set to it. The bare Opus id is valid in London only. `global.anthropic.claude-opus-5-5` is a different profile and is not selected unless `BEDROCK_MODEL_ID_PRO` is set to it. Setting the variable does not entitle the AWS account to the model |
| `LOVABLE_API_KEY` | ~29 functions | **With no Bedrock key either: every AI call returns "No AI provider key configured"** — drafting, scoring, research, the agent |
| `AZURE_CLAUDE_ENDPOINT` | `_shared/azure-claude.ts` | Azure is not used and Bedrock serves every call, exactly as before. Set it to the Foundry resource base, `https://<resource>.services.ai.azure.com` — the `/anthropic/v1/messages` path is appended, and pasting a URL that already ends in it is tolerated. Anything that is not an https URL is ignored with a warning rather than sending model traffic somewhere unreachable |
| `AZURE_CLAUDE_API_KEY` | `_shared/azure-claude.ts` | The same: without BOTH the endpoint and the key, the Azure route is off. Sent as `x-api-key`, which is what the Messages API on Foundry takes — not `api-key` and not a bearer token |
| `AZURE_CLAUDE_MODEL_ID` / `AZURE_CLAUDE_MODEL_ID_PRO` | `_shared/azure-claude.ts` | Built-in deployment names used — `claude-haiku-4-5` for the fast tier and `claude-opus-5-5` for the Pro tier. These are DEPLOYMENT names, which default to the model id but do not have to equal it, so set them if the deployment was named something else. Each variable replaces only its own tier. Setting one does not create the deployment or grant quota |
| `CF_AI_GATEWAY_BEDROCK` | `_shared/ai-gateway.ts` | Bedrock traffic goes direct to AWS, as it always has. Set it to everything up to and including `/aws-bedrock` — `https://gateway.ai.cloudflare.com/v1/<account_id>/<gateway_id>/aws-bedrock` — and every Bedrock call routes through the gateway for spend analytics, caching and rate limiting. The rest of the path (`/bedrock-runtime/<region>/<aws path>`) is appended from the URL the signer saw, so the signature keeps covering the AWS host. Find the base under **AI → AI Gateway → your gateway → API**. Anything that is not an https URL is ignored with a warning rather than sending model traffic somewhere unreachable |
| `CF_AI_GATEWAY_TOKEN` | `_shared/ai-gateway.ts` | Sent as `cf-aig-authorization` when `CF_AI_GATEWAY_BEDROCK` is in use, never on a direct-to-AWS call. Required whenever the gateway has **Authenticated Gateway** turned on, which rejects anything without it. Create one under **AI → AI Gateway → your gateway → Settings → Authenticated Gateway**. **A base set without a token does not route at all** — it logs a warning and goes direct to AWS, because losing the analytics is recoverable and 401ing every model call in the product is not |

### Stored provider keys (BYOK) do nothing for us, by design

The gateway can hold an Amazon Bedrock key of its own under **Provider Keys**.
It will not be used. Cloudflare's rule is that *the stored key applies only
when the provider authorization header is missing; when the client sends one,
the gateway forwards that value to the provider instead* — and we always send
one, either the SigV4 `Authorization` the signer builds or the `Bearer` from
`BEDROCK_API_KEY`.

That is the safe side to be on: our AWS credential stays in Supabase function
secrets and nowhere else, and a wrong or expired key stored in Cloudflare
cannot take model calls down. The cost is that rotation stays a Supabase
change rather than a dashboard one.

Switching to BYOK would mean sending no provider authorization at all when the
gateway is configured, which moves the credential into Cloudflare's Secrets
Store and makes every Bedrock call depend on it. Worth doing only if central
rotation is the goal; it buys nothing for analytics, caching or rate limiting,
which work either way.

`cf-aig-byok-alias` is not needed while a single key is stored: the gateway
uses the `default` alias when no alias header is sent.

| *(the fallback provider is not configurable)* | `_shared/ai-gateway.ts` | Lovable's gateway takes `LOVABLE_API_KEY` and gateway-style model ids, so it cannot be repointed at another provider's route without a credential and a model map for whatever is on the other end. Bedrock is the primary provider and the one worth observing |


## Which model a call runs on

Bedrock serves none of the gateway model ids, so `routeFor` collapses a request
onto two models: `BEDROCK_MODEL_ID` (Haiku 4.5) and `BEDROCK_MODEL_ID_PRO`
(US geo Sonnet 4.6, unless that variable is set). Only the exact server
ids `google/gemini-2.5-pro` (`AI_SMART`) and `openai/gpt-5.6-sol` select Pro. A string that
merely contains "pro" or "opus" stays on Haiku.

That made the choice invisible at the call site, and twenty-four of
twenty-eight call sites wrote `"google/gemini-2.5-flash"` and ran on Haiku
without saying so — including the function that writes the emails, the two
that grade them, and the agent path that drafts and replies to real prospects.

Call sites now ask for a tier by name, from `_shared/ai-provider.ts`:

| constant | tier | used by |
|---|---|---|
| `AI_SMART` | US geo Sonnet 4.6 when Bedrock is configured, unless `BEDROCK_MODEL_ID_PRO` overrides it | `research-lead`, `research-account`, `check-email-rubric`, `check-copy-risk`, `ai-coach`, `agent-run`, `agent-chat`, and `generate-email` when the caller is the agent (chat `draft_outreach`, agent jobs). `AI_SMART` and `openai/gpt-5.6-sol` are the same Pro route |
| `AI_FAST` | Haiku 4.5 | `generate-sequence`, `generate-followup-suggestion`, `generate-email` for Outreach Studio, bulk send, MCP and REST, `score-lead-v2`, `map-account-committee`, `build-agent`, `refill-blog-topics`, `apply-rubric-suggestion` |

The split is which surface is paying for the call. Agent chat, the autonomous
agent and the draft worker are the heavy path and stay on Pro. Outreach Studio,
bulk send, sequences, follow-up suggestions, MCP and REST are the light path
and run on Standard. Research and the two graders stay on Pro: a weak grader
green-lights copy the writer should not have produced. `generate-email` does
not trust a tier in the request body. Only an internal caller that sets
`x-outreign-draft-tier: pro` (the agent chat and the job worker) gets Pro.

The constants are real gateway ids rather than labels, because when Bedrock is
unconfigured the requested id is passed through to the fallback gateway
verbatim.

Each environment variable moves one tier and only that tier.
`BEDROCK_MODEL_ID` is the fast tier, which is where Studio, bulk, sequences
and the other light paths live; `BEDROCK_MODEL_ID_PRO` is the strong tier.
Moving one tier without touching code means setting that one variable. The
built-in Pro id is `us.anthropic.claude-sonnet-4-6` (Sonnet 4.6, $3 and $15
per million input and output tokens). Opus 5.5 is not selected unless
`BEDROCK_MODEL_ID_PRO` names it. The US geo Opus id
`us.anthropic.claude-opus-5-5` is $4.40 and $22 per million tokens, from the
account owner's AWS pricing screenshot on 7 Nov 2026: Geo and In-region
Cross-region Inference, region US East (N. Virginia). That screenshot also
lists cache write and cache read; this app does not meter cache tokens, so
those figures are not charged. `global.anthropic.claude-opus-5-5` stays at $4
and $20 per million from the Global cross-region table (region selector US
East Ohio) and is used only when `BEDROCK_MODEL_ID_PRO` is set to that id.
EU, JP, AU, and the bare Opus id have no rate here and are refused before the
request is sent, instead of metered at $0.30/$2.50. Sonnet 4.5 remains $3/$15
if an override names it. Haiku 4.5 remains $1/$5. The AWS account must still
be entitled to the profile. Unset, Pro is Sonnet 4.6, not Opus and not Global.
`src/lib/ai-model-tier.test.ts` checks each constant still lands on the tier
it claims, and that a caller-supplied Opus id does not.

---

## Lead data

| Variable | Read by | Missing |
|---|---|---|
| `RAILWAY_LEADS_API_URL` | `fetch-external-leads`, `enrich-lead`, `search-companies`, `_shared/email-verify.ts` | **Silent.** `search-companies` returns an empty list with a 200. Lead search finds nothing and looks like a search with no matches |
| `RAILWAY_API_KEY` | same | Requests sent unauthenticated. Fine if the service is open, 401 if not |
| `FIRECRAWL_API_KEY` | `_shared/firecrawl.ts`, called by `research-lead` before outside search | **Visible on the research receipt.** `firecrawlConfigured()` is false, no request is sent, and the receipt says `not_configured`. The lead site is not fetched with ordinary HTTP and then labeled Firecrawl. Outside search still runs |
| `PARALLEL_API_KEY` | `_shared/parallel.ts` | **Silent.** `parallelConfigured()` returns false and that provider contributes nothing. Context.dev can still return sources. The receipt records Parallel as not configured |
| `UDC_TREG_API_KEY` | `_shared/treg.ts` | **Silent.** `tregConfigured()` returns false and the Treg fallback is skipped, so a search Railway cannot answer returns no external leads. Also requires `LOVABLE_API_KEY` |
| `CONTEXT_DEV_GATEWAY_URL` + `UDC_CONTEXT_DEV_API_KEY` | `_shared/context-dev.ts`, reached through `_shared/external-research.ts` | **Silent.** `contextDevConfigured()` returns false and this provider contributes nothing. `external-research.ts` runs it alongside Parallel and merges both, so research keeps working on whatever the other one returns — and falls back to the prospect's own site when neither is set. **These two plus `LOVABLE_API_KEY` are all required**: the gateway takes `LOVABLE_API_KEY` as the bearer and `UDC_CONTEXT_DEV_API_KEY` as `X-Connection-Api-Key`, so any one of the three missing disables it |
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
| `CALENDLY_REDIRECT_URI` | `calendly-oauth-init`, `calendly-oauth-callback` — **optional.** Calendly registers one redirect URI and matches it exactly, so both functions pin the value instead of taking the browser's origin. Unset, it is `https://outreign.io/integrations`, which is the string to register in the Calendly app. Set it only to move the flow to another trusted origin (e.g. `https://outreign.lovable.app/integrations` while testing); an untrusted value falls back to the default rather than redirecting off-domain |
| `JEV_MODE` | `generate-email`, `_shared/lead-intelligence.ts` — **optional.** Chooses between `shadow` and `assist` for the AI Lead Intelligence layer while the feature flag is on. Any value other than `shadow` means assist, and unset means assist. It cannot switch the layer on by itself: the workspace feature flag stays the master switch, so turning that off is one click and still means off |
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

### AppSumo licensing

A second billing source, for accounts that bought a license on AppSumo rather
than subscribing through Stripe. All five are needed for redemption to work;
each function refuses with 503 rather than half-redeeming when one is absent.

| Variable | Read by | Missing |
|---|---|---|
| `APPSUMO_CLIENT_ID` | `appsumo-redirect` | `AppSumo sign-in is not configured yet` (503). No license can be exchanged |
| `APPSUMO_CLIENT_SECRET` | `appsumo-redirect` | The same 503 |
| `APPSUMO_REDIRECT_URL` | `appsumo-redirect` | The same 503. Must match the redirect URI registered with AppSumo exactly |
| `APPSUMO_APP_ORIGIN` | `appsumo-redirect` | The redemption redirect falls back to the vetted origin in `_shared/safe-origin.ts`, so a value outside that allowlist is ignored rather than followed |
| `APPSUMO_PRIVATE_KEY` | `appsumo-webhook` | `Licensing is not configured` (503). License events are rejected unsigned, so a plan change on AppSumo never reaches the account |

---

## Notifications

| Variable | Read by | Missing |
|---|---|---|
| `LOVABLE_SEND_URL` | `auth-email-hook`, `_shared/managed-email.ts` | Transactional email cannot send |
| `RESEND_API_KEY` | `send-seo-digest` | Returns `{success: false, error: "Email gateway not configured"}` |
| `MAILCHIMP_GATEWAY_URL` | `send-blog-newsletter` | Returns `{success: false, error: "Mailchimp blog delivery configuration missing"}`. The gateway takes `LOVABLE_API_KEY` as the bearer and `MAILCHIMP_MARKETING_API_KEY` as `X-Connection-Api-Key` |
| `MAILCHIMP_MARKETING_API_KEY` | `send-blog-newsletter` | The same missing-configuration response. Both this and `LOVABLE_API_KEY` are required |
| `MAILCHIMP_BLOG_AUDIENCE_ID` | `send-blog-newsletter` | The same missing-configuration response. The audience the published post is sent to |
| `MAILCHIMP_BLOG_FROM_EMAIL` | `send-blog-newsletter` | The same missing-configuration response |
| `MAILCHIMP_BLOG_SITE_URL` | `send-blog-newsletter` | The same missing-configuration response. Relative links in the post are resolved against it |
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
| `VITE_GOOGLE_CLIENT_ID` | Optional. The Google OAuth client id the sign-in button uses. Public by design, and the app ships with this deployment's id built in, so it is only set to point the browser at a different OAuth client. Changing it does not affect Gmail connection, which reads `GOOGLE_CLIENT_ID` in the edge functions, nor sign-in token verification, which uses the auth provider's own copy |
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

## Visitor Intelligence

Optional. The feature works without it. Set it if you want IP hashes to stay stable across a service-role rotation.

| Variable | Read by | Missing |
|---|---|---|
| `VISITOR_IP_PEPPER` | `visitor-ingest` | The service role key is used as the hash pepper instead. Hashes change if that key rotates. The raw address is still dropped within 24 hours |

---

## Which provider serves a call

Three routes, in order, decided per call in `routeFor`:

1. **Azure (Microsoft Foundry)** when `AZURE_CLAUDE_ENDPOINT` and
   `AZURE_CLAUDE_API_KEY` are both set.
2. **Amazon Bedrock** when it is configured and Azure is not.
3. **The Lovable gateway**, the fallback, when neither is.

Azure is first because it is the one that serves Opus 5.5. The Bedrock Pro
tier sits on Sonnet 4.6 with a comment saying "temporary until the account is
granted Opus 5.5 access": naming a Bedrock model id does not entitle the AWS
account to the model, and Foundry lists `claude-opus-5-5` as generally
available and hosted on Azure.

Setting neither Azure variable changes nothing. The Bedrock path is untouched.

**Sonnet 4.6 has no Azure-hosted deployment** — Foundry lists it only as
hosted on Anthropic infrastructure. That costs nothing here, because the only
reason the Pro tier was on Sonnet 4.6 was the missing Opus entitlement, which
is the thing Azure removes.

**Streaming on the Azure route is buffered**, then re-emitted as server-sent
events. The caller's wire format is identical; only token-by-token arrival is
missing. Foundry streams Claude in Anthropic's own event shape, which is a
second translation that cannot be verified without a live deployment, and the
same buffered fallback already exists for Bedrock models without
ConverseStream.

**Quota is the thing to check before moving real volume.** Foundry's pay-go
defaults for `claude-opus-5-5` are 40 requests and 8,000 output tokens per
minute, per subscription. A bulk run drafting fifty leads will meet that.
Enterprise agreements default far higher, and increases go through a request
form that is not guaranteed to be approved.

---

## Agent evals (CI only, never the app)

Read by `src/test/agent-evals.live.test.ts`, never by an edge function or the
frontend. The suite skips itself unless all four are set, which is why the
scenarios have a grader and had never actually run against a deployed agent.

They point at a **throwaway account on a throwaway sending domain**. The
scenarios draft and enrich for real, and each one's `forbid` list exists to
catch an agent that sends when it was told not to, so the account must be one
it is safe to send from.

| Variable | Read by | Missing |
|---|---|---|
| `EVAL_AGENT_URL` | the eval suite | The suite skips. The `agent-evals` workflow says it is not configured and passes |
| `EVAL_AGENT_JWT` | the eval suite | The same. A user JWT for the throwaway account |
| `EVAL_SUPABASE_ANON_KEY` | the eval suite | The same |
| `EVAL_ACCOUNT_IS_DISPOSABLE` | the eval suite | Anything but `yes` and the suite refuses to start, deliberately rather than as a config oversight |

Run them from the Actions tab: the `agent-evals` workflow is
`workflow_dispatch` only, never on a push, a pull request or a schedule.

---

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

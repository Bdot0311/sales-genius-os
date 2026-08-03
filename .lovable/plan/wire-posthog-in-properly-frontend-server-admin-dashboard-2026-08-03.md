# Wire PostHog in properly (frontend + server + admin dashboard)

PostHog is already partly in the app: it initializes from two manually-set variables, identifies signed-in users, and captures 16 product events (lead search, enrichment, ICP created, workflows, meetings, coaching). What's missing is the important half — no pageviews, no session replay, no funnel/conversion events from the backend, and nothing readable inside OutReign. Now that the connector is linked, its credentials become the single source of truth.

## 1. Switch to the connector and fix initialization

- Read the connector's project key and region instead of the hand-set variables (keep the old ones as a fallback so nothing goes dark mid-deploy), and derive the correct EU/US ingest host from the region.
- Enable **automatic pageview tracking on route changes**. Right now a visitor moving from the landing page to Pricing to Auth registers as a single pageview, which is a large part of why the bounce rate reads 65% and session durations look like 17 seconds. This alone will make your bounce and time-on-site numbers trustworthy.
- Enable **session replay with masking**: all text inputs, email addresses, and password fields masked, recordings on for a sampled share of sessions. This is what will actually show you where people abandon the landing page.
- Attach **person + group properties** on identify: plan tier, account status, trial state, signup date — so every funnel and replay can be sliced by plan. Group analytics keyed by plan lets you compare Free vs paid behaviour.
- Send **Core Web Vitals** (LCP, INP, CLS) as events so the performance work from the bounce-rate fixes is measurable rather than assumed.
- Respect Do Not Track and skip all capture inside the Lovable preview iframe so your own building sessions don't pollute the data.

## 2. Server-side events (the ones the browser can never see)

A shared backend capture helper, wired into the moments that matter and happen outside the browser:

- **Signup** — new user created, with plan and source.
- **Billing lifecycle** — subscription started, upgraded, downgraded, cancelled, invoice failed, auto-paused, grace period started/expired. These come from Stripe webhooks, so the browser never sees them; without this, revenue and churn are invisible in PostHog.
- **Activation milestones** — first search, first enriched lead, first email sent, first sequence launched, mirrored from the existing activation tracking so the activation funnel is queryable.
- **AI SDR usage** — agent run started/completed, drafts generated, replies handled, plus failures with a reason. This tells you which tier actually uses the agent.

Events are keyed by the same user ID the frontend identifies with, so browser and server events land on one person timeline.

## 3. In-app product analytics dashboard

A new **Product analytics** tab on the admin Analytics page, fed by a backend function that queries PostHog (never from the browser, so no key is exposed):

- Visitors, pageviews, sessions, bounce rate, and average session duration over 24h / 7d / 30d.
- Trend chart of visitors and signups.
- Top pages and top referrers — this is what would have shown you the directory-referral traffic spike immediately.
- Signup → first search → first email → paid conversion funnel.
- Retention grid and live event feed for debugging.
- Deep links into PostHog for replays.

**One thing this needs from you:** reading data out of PostHog requires a *personal API key* (starts with `phx_`), which the connector does not provide — the connector only gives the write/ingest key. After you approve, I'll ask for it with a short note on where to generate it in PostHog (Settings → Personal API keys, scoped read-only to this project). Everything in sections 1 and 2 works without it; only the dashboard in section 3 depends on it.

## Technical notes

- `src/lib/posthog.ts` becomes the single init: `VITE_LOVABLE_CONNECTOR_POSTHOG_API_KEY` + `VITE_LOVABLE_CONNECTOR_POSTHOG_REGION` → `https://eu.i.posthog.com` / `https://us.i.posthog.com`, with legacy `VITE_POSTHOG_KEY`/`VITE_POSTHOG_HOST` as fallback. Config: `capture_pageview: false` with manual capture from a route-change listener in `App.tsx` (React Router), `session_recording` with `maskAllInputs: true` and email/text masking, `autocapture` on, exception autocapture kept as-is.
- New `src/lib/analytics-events.ts` consolidates the existing gtag-only `Analytics` helper and PostHog into one call site, so each event fires to both instead of the current split where funnel events only reach gtag.
- New `supabase/functions/_shared/posthog.ts`: `captureServerEvent({ distinctId, event, properties })` POSTing to `{host}/i/v0/e/` with `POSTHOG_API_KEY` from the connector's server-side variable. Fire-and-forget, never blocks or fails the caller. Wired into `notify-new-signup`, `_shared/process-stripe-event.ts`, `agent-run`, `agent-chat`.
- New `supabase/functions/posthog-insights/index.ts`: admin-gated (JWT + `has_role(auth.uid(),'admin')`), validated query params, calls PostHog's HogQL query endpoint with `POSTHOG_PERSONAL_API_KEY` and `POSTHOG_PROJECT_ID`, returns shaped JSON. Short-TTL cache in the existing `api_cache` table to stay well inside PostHog rate limits.
- New `src/components/admin/ProductAnalyticsTab.tsx` added as a tab in `src/pages/admin/Analytics.tsx`, using the existing recharts/ChartContainer patterns. Degrades to a clear "personal API key not configured" state rather than erroring.
- No database schema changes. No changes to Supabase-generated files.

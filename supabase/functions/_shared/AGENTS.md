# Outbound personalization

- Studio bulk sends and sequence dispatch use `personalized-outreach.ts` with one `generate-email` invocation per recipient/touch; shared cadence never authorizes copying another recipient’s body. Why: each outgoing message needs its recipient’s evidence and quality approval.
- Studio and sequence pickers use `src/lib/outreach-lead-pages.ts` with ordered database pages. Why: selecting All must not silently omit recipients beyond the server page size.

# Shared module rules

- Subject-only generation uses the same grounding predicates as sending; fallback subjects use complete research topics or the owned company, never word-count truncation. Why: chopped scraped sentences produced unrelated or unfinished subjects.

- Confirmed saved-draft batches use `queue-saved-drafts` and the atomic `queue_saved_draft_outbox` helper; the existing claimed sender applies research, checker and rubric gates, and queued counts are never delivery counts. Why: chat lifetimes must not truncate approved batches or create duplicate emails.

- Customer paid tiers require Stripe linkage in the database and recognized active/trialing Stripe plans in checkout, polling and reconciliation; AppSumo records attribution only. Why: signup labels, local grants and licensing must not bypass recurring billing.

- Automatic reply budgets take the lesser of the agent preference and the service-only current-subscription allowance; database writes clamp that preference and failed allowance/count reads permit no replies. Why: browser settings, old rows and downgrades cannot raise plan limits.

- All Treg calls go through `_shared/treg.ts`, which sets the customer tag server-side, caps cost per call and logs call id/cost to `treg_usage`; Treg is a fallback only when Railway returns nothing and its results bill like Railway results through the normal save/enrich path. Why: customers pay the same per contact regardless of source, while Treg spend still reconciles per customer.

- Lead and account web research share `external-research.ts`, merging Parallel and Context.dev without replacing either; Context.dev uses the connector gateway URL from environment configuration. Why: both surfaces and existing agent research tools must retain identical retrieval and failure-safe behavior.

- Redirect/return URLs (OAuth redirect_uri, Stripe return_url) go through `_shared/safe-origin.ts`, and tracked email links are HMAC-signed in `_shared/click-tracking.ts`; add new app domains to the allowlist there. Why: request-supplied origins and unsigned link targets made open redirects.

- Edge functions never import supabase-js from esm.sh 2.76+/floating `@2` or npm `2.76.0`; new imports use `npm:@supabase/supabase-js@^2.76.1`, and `process-stripe-event.ts` and its callers share one specifier; `src/lib/edge-runtime-imports.test.ts` guards it. Why: the esm.sh Deno build loads std@0.177.1/node whose shutdown hook crashes with runMicrotasks, and npm 2.76.0 fails to boot (missing tslib).

- Research-led use-case campaign shapes live in `_shared/use-case-campaign.ts`, composed into shared drafting guidance and explicit template/agent-feedback selection. Why: Studio and agent background drafts must use the same shapes without relaxing evidence or quality gates.

- Pinned page and webhook fetches (`_shared/pinned-fetch.ts`) dial the vetted IP with `Deno.connect` + `Deno.startTls({ hostname })` and parse HTTP/1.1 themselves. Why: the `node:http(s)` custom-lookup path silently failed on hosted edge, so every direct site read and outside-source page fetch returned nothing and research approved no facts.
- Lead research ignores profile/social hosts saved as a website (`isProfileHost`) and uses the work-email domain; drafting resolves the owned site the same way. Why: LinkedIn URLs in `company_website` made research read the wrong site and refuse every fact.
- Draft lines outside the quoted research fact must pass `lineGrounding` (offer words only from the sender description, ideas framed as could/might, questions on researched topics; no new numbers, names, results or negations). The guided rewrite has the model choose a fact by number and writes only the idea/question; the fact is inserted verbatim. Why: paraphrased facts can reverse actor/object or quantities, but quote-only emails read robotically.

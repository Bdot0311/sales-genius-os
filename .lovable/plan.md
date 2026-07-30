## Goal

Every generated email should be grounded in real, per-lead research instead of generic filler. Today research is a hidden Gemini-grounded call buried inside `generate-email` (`generate-email/index.ts:583-676`), invisible to users, cached only 24h in `api_cache`, and completely bypassed by the AI SDR path (`agent-chat/index.ts:577-590` forwards only `lead`, `goal`, `tone`).

Plan: extract research into its own service that scrapes the lead's company website, stores a durable per-lead research brief, keeps it fresh, and surfaces it in both Outreach Studio and the AI SDR chat.

## 1. New edge function: `research-lead`

Scrapes the lead's own company site — same technique already proven in `analyze-domain/index.ts` (domain normalization, homepage + candidate paths, HTML→text, timeouts).

- Input: `{ leadId, force?: boolean }`. Auth required; ownership verified against `leads.user_id`.
- Resolve domain from `company_website`, else derive from `contact_email` domain (skip free-mail domains), else fail gracefully.
- Fetch homepage plus high-signal paths: `/about`, `/pricing`, `/product(s)`, `/customers`, `/case-studies`, `/careers`, `/blog`, `/news` (max ~6 pages, 10s timeout each, best effort).
- Feed extracted text + the lead's existing DB context (`job_title`, `industry`, `signals`, `technologies`, `intent_reasons`, `recommended_angle`) to Lovable AI (`google/gemini-2.5-flash`) and return a structured brief:
  - `what_they_do` — one line, plain language
  - `who_they_sell_to` — their customer
  - `observations[]` — 3–5 concrete, quotable facts (each with the source URL it came from)
  - `hooks[]` — 2–3 personalization angles tied to a specific observation
  - `avoid[]` — claims not supported by the site
  - `confidence` — high/medium/low (low when the site is JS-rendered/thin, same signal `analyze-domain` uses)
- Strict no-invention rule: if nothing verifiable is found, return `confidence: "low"` with empty observations rather than plausible-sounding filler (matches existing `NO_HALLUCINATION_RULE` posture and the project's no-fabrication rule).
- Rate limited per user via the existing `_shared/rate-limit.ts`. Returns 200 with `{ error, error_code }` on soft failures, per project convention.

## 2. Storage + freshness

Migration adds to `public.leads`:
- `research_brief jsonb`
- `research_sources text[]`
- `research_confidence text`
- `researched_at timestamptz`

Freshness policy (cache **and** always-current):
- Reuse the stored brief if `researched_at` is within a TTL (14 days).
- If stale, or if the lead's signals/enrichment changed after `researched_at` (`updated_at`/`enriched_at` newer), re-research automatically before generating.
- `force: true` (manual "Refresh research" button) always re-scrapes.
- Research is written to the lead row, so the brief is reusable across Outreach Studio, bulk send, sequences, and the agent — one scrape, many emails.

## 3. Wire into `generate-email`

- Replace the private `researchLead()` helper with: read the lead's stored brief → if missing/stale, call `research-lead` inline → inject the structured brief into the prompt.
- Also start using lead fields the prompt ignores today: `signals`, `signal_type`, `intent_reasons`, `recommended_angle`, `linkedin_url`.
- Precision-edit requests (`goal: custom` + `customInstruction`) keep skipping research, as now.
- Response gains `research: { observations, hooks, sources, confidence, researched_at }` alongside the existing `email` field — additive, so the public `rest-api` proxy (`rest-api/index.ts:440`) keeps working unchanged.
- Guardrail: research failure never blocks generation — it degrades to the current behavior and reports low confidence.

## 4. Wire into the AI SDR agent

- Add a `research_leads` tool to `agent-chat` (batched, reusing the existing `mapLimit` + wall-clock budget helpers).
- `draft_outreach` auto-researches any lead with a missing/stale brief before drafting, and forwards the richer context (`businessDescription` from the agent's ICP snapshot, `senderName`/`senderCompany` from profile) that the UI path already sends but the agent path drops.
- Agent chat surfaces a short "Researched N leads" activity line, and each draft card shows the observation the email was built on.

## 5. UI: show the brief

- **Outreach Studio** (`src/pages/Outreach.tsx`): a collapsible "Lead research" panel above the composer showing `what_they_do`, observations with source links, hooks, confidence badge, `researched_at`, and a "Refresh research" button. Low-confidence state says plainly that the site was thin so the email leans on enrichment data.
- **AI SDR chat**: research findings rendered in the draft card (`src/components/agent/ChatDraftCard.tsx`) so the user can see why the email says what it says before approving.
- New shared component `src/components/outreach/LeadResearchPanel.tsx` used by both surfaces. Semantic tokens only, no hardcoded colors.

## Technical notes

- No new secrets or connectors — scraping is direct `fetch`, reasoning uses the existing Lovable AI gateway key.
- Cost/latency: one scrape+model call per lead per 14 days instead of per email; bulk send and sequences benefit most.
- `api_cache` remains for the transitional path; the durable brief on `leads` becomes the source of truth.
- Files touched: new `supabase/functions/research-lead/index.ts`, new `_shared/lead-research.ts` (brief types + freshness helper), edits to `generate-email/index.ts`, `agent-chat/index.ts`, `src/pages/Outreach.tsx`, `src/components/agent/ChatDraftCard.tsx`, `src/components/outreach/BulkSendDialog.tsx`, plus one migration.

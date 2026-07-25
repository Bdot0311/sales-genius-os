
## Cold Email Engine — Full Integration Plan

Bake the skill's rules into every place OutReign touches cold email: AI prompts, quality checks, sequence generation, and lead scoring UI.

### 1. Generation prompts (`supabase/functions/generate-email/index.ts`)

Rewrite the system prompt for all goals (`reply`, `case_study`, `meeting`, `info`, `custom`) to enforce:
- 50–75 words, 130 word ceiling
- 3–4 sentences, 8th-grade reading level
- One of the three canonical structures (Problem-First / Question-Led / Ultra-Short)
- Named proof point with company + metric + timeframe
- One low-friction CTA (question form)
- Banned tokens list (best, amazing, revolutionary, leverage, optimize, streamline, synergy, cutting-edge, "hope this finds you well", "just checking in", em dashes, emojis)
- Subject line: 2–5 words, <40 chars, colleague tone

Add a shared `_shared/cold-email-rules.ts` module so every function (generate-email, generate-followup-suggestion, ai-coach) pulls the same guardrails.

### 2. Quality Checker (`src/components/outreach/EmailQualityChecker.tsx` + new edge fn `score-email-quality`)

Replace ad-hoc checks with the skill's 7-criteria rubric (0–10 each, 70 total):
1. Authenticity
2. Brevity (word count based)
3. Clarity (jargon detection)
4. Humanness
5. CTA (single question, low friction)
6. Proof (named company + metric + timeframe regex + AI judgment)
7. Specificity (numbers, real names)

Deterministic checks (word count, banned tokens, em dashes, CTA count) run client-side. Subjective checks (authenticity, humanness) run through a lightweight AI call using `openai/gpt-5.5`. Show total score + per-criterion breakdown; "Fix this" targets the lowest-scoring criterion.

### 3. Campaign / Sequence Builder (new)

Add "Generate Sequence" action in Outreach Studio that produces a full 4-touch sequence:
- Email 1 (Day 0): signal-based opener
- Email 2 (Day 3–5): market/industry context
- Email 3 (Day 7–10): timing/clarification
- Email 4 (Day 14): polite breakup

Plus 3 subject line variations per email (curiosity / results / question).

New edge fn `generate-sequence` returns structured JSON via AI SDK `Output.object`. New component `src/components/outreach/SequenceBuilder.tsx` renders touches as tabs, lets user copy/edit each, and can save as a workflow.

### 4. Signal-based targeting UI

`src/components/dashboard/LeadRow.tsx` (and lead detail sheet): add a **Signal Score** column (0–10) computed from the 3-layer framework:
- Layer 1: company fundamentals (size, industry match)
- Layer 2: decision-maker readiness (tenure, seniority)
- Layer 3: timing triggers (new hire, funding, tech change, traffic drop)

Extend `score-lead` edge fn to compute `signal_score`, `signal_layers` (jsonb), and a `signals[]` array of tags (e.g. "new-CFO", "hiring", "tech-migration"). Add DB migration for those columns. Sort/filter leads by signal score in the lead table; badge 3+ signals as "hot".

### 5. Copywriting reference doc

Add `src/pages/CopyPlaybook.tsx` (linked from Outreach Studio "?" icon) surfacing the skill's rules to end users: banned words list, structure templates, example patterns. Read-only reference — no AI calls.

### Files touched

Backend:
- `supabase/functions/_shared/cold-email-rules.ts` (new)
- `supabase/functions/generate-email/index.ts` (rewrite prompts)
- `supabase/functions/generate-followup-suggestion/index.ts` (apply rules)
- `supabase/functions/score-email-quality/index.ts` (new)
- `supabase/functions/generate-sequence/index.ts` (new)
- `supabase/functions/score-lead/index.ts` (add signal_score + signals)
- Migration: `leads.signal_score int`, `leads.signals text[]`, `leads.signal_layers jsonb`

Frontend:
- `src/components/outreach/EmailQualityChecker.tsx` (7-criteria rubric)
- `src/components/outreach/SequenceBuilder.tsx` (new)
- `src/pages/Outreach.tsx` (wire sequence builder + new quality checker)
- `src/components/dashboard/*` lead table (signal column, filters, hot badge)
- `src/pages/CopyPlaybook.tsx` (new)
- `src/App.tsx` (route)

### Scope guardrails
- No changes to billing, credits, or auth.
- Sequence + quality-check calls debit existing AI credit meter.
- All prompts stay server-side; `LOVABLE_API_KEY` never touches client.

### Rollout order
1. Shared rules module + prompt rewrite (fast win, no UI risk)
2. Score-lead signal extension + migration
3. Quality checker rubric
4. Sequence builder
5. Signal UI + Copy Playbook page

Ready to build in that order — reply "go" and I'll start with step 1.

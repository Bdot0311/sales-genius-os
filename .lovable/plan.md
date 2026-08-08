# Demo Mode for Sales Calls

A toggle in the admin panel that fills your own account with realistic demo data so the platform looks alive on prospect calls — and makes sure nothing real gets sent or charged while it's on.

## What you get

**Admin → Settings → new "Demo Mode" card**
- Master toggle: Demo Mode on/off (applies to your admin account only).
- "Seed demo data" button — populates your workspace with a realistic outbound operation.
- "Clear demo data" button — removes every demo record in one click, leaving your real data untouched.
- "Reseed" to refresh timestamps so activity always looks recent.
- Status line showing what's currently seeded (counts per area) and when it was seeded.

**While Demo Mode is on**
- A slim "Demo Mode" badge in the dashboard top bar (visible to you, subtle enough for a screen share).
- All plan gating is bypassed for your account, so you can walk through Pro / Elite / Agency features without hitting paywalls.
- Real outbound is blocked: email sends, lead searches, enrichment and AI-agent runs are simulated with instant fake success instead of hitting providers or spending credits.
- Real customer names/emails are masked to placeholders anywhere they would appear (admin user tables, inbox, activity feeds), so nothing identifying leaks on a shared screen.

## Demo data that gets seeded

Realistic, coherent, and cross-linked so drilling in always lands somewhere populated:
- ~10 companies and ~40 leads with titles, industries, ICP scores, research summaries and pipeline stages spread across New / Contacted / Replied / Meeting / Won / Lost.
- 2 ICP profiles and 2 personas.
- 3 email sequences with steps, plus enrollments at various stages.
- ~60 sent emails with opens, replies and a few bounces spread over the last 30 days, so analytics charts have a real curve.
- Reply threads and inbox messages, including a couple of positive replies to demo the AI agent's classification.
- Deals across pipeline stages, a handful of activities, and an AI agent config with recent run history.
- Deliverability data: a sending domain with passing auth, mailbox health stats and reputation snapshots.

Every seeded row is tagged as demo so clearing is exact and never touches real records.

## Technical notes

- New `admin_settings` key `demo_mode` holding `{ enabled, seeded_at, admin_user_id }`, plus a `demo_seed` boolean column (default false) added to each seeded table and registered in `public.schema_contract`.
- New `admin-demo-data` edge function with `seed` / `clear` / `status` actions, admin-role verified in code via `has_role`, writing with the service role so seeded rows bypass nothing unexpected.
- New `useDemoMode()` hook reading the setting; consumed by `usePlanFeatures` (returns all-unlocked when demo mode is on for the current admin) and by `DashboardLayout` for the badge.
- Outbound blocking is enforced server-side: `send-email`, `send-transactional-email`, `search-prospects`, `search-companies`, `enrich-lead`, `research-lead` and `agent-run` check demo mode for the calling admin and short-circuit with a simulated success response before any provider call or credit deduction.
- Masking is a presentation-layer helper applied to admin user lists, inbox threads and activity feeds; it never alters stored data.
- Tests: seed/clear round-trip leaves zero demo rows, and a demo-mode send returns simulated success with no credit change. Typecheck and test suite run before completion.

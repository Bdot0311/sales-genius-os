# Onboarding questionnaire for new signups

Replace the current mock 3-step "quick start" popup with a real, required onboarding form that runs once after a new user's first sign-in. The answers feed their targeting profile, personalise the dashboard, and tell you which channels bring signups.

## The flow

After signing in, a new user lands on a full-screen onboarding page instead of the dashboard. They cannot navigate away until it's finished — every dashboard route redirects there while onboarding is incomplete. This also puts a human-only step between a signup and the product, which discourages throwaway and automated accounts.

Seven short screens, one question each, with a progress bar and Back button:

1. What best describes your role? — Founder/CEO, Sales, Marketing, RevOps, Agency, Other
2. What type of company are you? — SaaS, Agency, B2B Services, E-commerce, Other
3. How big is your team? — Just me, 2-10, 11-50, 51-200, 200+
4. What are you primarily looking to accomplish? (multi-select) — Find leads, Qualify prospects, Personalize outreach, Automate outreach, Manage pipeline, All of the above
5. Who do you sell to? — job titles, industries, company size range, plus a short "what do you sell / why they buy" text box
6. How are you currently finding prospects? — Clay, Apollo, LinkedIn/Sales Navigator, Manual research, Another tool, Not doing this yet
7. Where did you find OutReign? — X/Twitter, LinkedIn, Google search, Product Hunt / a directory, Reddit, YouTube, Word of mouth, Newsletter, Other (with a free-text box)

Final screen shows a one-line recap and a single **Start your first campaign** button. Clicking it saves everything and opens the dashboard.

## What the answers do

- Question 5 creates the user's first targeting profile (ICP) automatically, so lead search and email drafting are pre-filled rather than empty. Question 2 and the text box also fill in their business description used when writing emails.
- Question 4 reorders the dashboard quick actions and the getting-started checklist toward what they said they came for.
- Question 7 lands in a new admin view: signups grouped by self-reported channel, next to the existing automatic UTM tracking, so you can compare what people say with where their click came from.
- Questions 1, 3, 6 show on the user's row in the admin users table for context.

## Existing behaviour that changes

- The mock quick-start wizard (fake prospects and fake email) is removed.
- The dashboard tour still exists but only starts after onboarding is complete.
- The getting-started checklist drops the "complete your profile" step, since onboarding now covers it.
- Users who signed up before this ship are not forced through it; they see a dismissible one-question prompt asking only where they found OutReign.

## Technical notes

- New table `public.onboarding_responses` (one row per user): `role`, `company_type`, `team_size`, `goals` (jsonb array), `current_tooling`, `monthly_prospect_volume`, `discovery_channel`, `discovery_channel_other`, `completed_at`, timestamps. GRANTs for `authenticated` (own row only, RLS on `auth.uid() = user_id`) and `service_role`; no `anon` grant. Added to `public.schema_contract` in the same migration.
- Add `onboarding_completed boolean not null default false` to `onboarding_progress` (or reuse it) as the single gate flag; a trigger sets it when `onboarding_responses.completed_at` is written.
- New route `/onboarding` rendered outside `DashboardLayout`; a guard in the dashboard layout redirects there when the flag is false. Guard reads server state, not localStorage, so clearing storage can't bypass it.
- On submit, one call writes `onboarding_responses`, upserts `profiles.business_description` / `company_name`, and inserts a default `icp_profiles` row from question 5 (titles/industries/size mapped to `target_titles`, `industries`, `company_size_min/max`, `value_proposition`).
- Admin: new "Signup channels" card on `src/pages/admin/Traffic.tsx` backed by an aggregate RPC over `onboarding_responses`, plus the role/team-size/tooling fields surfaced in `UserTable.tsx`.
- Analytics: `onboarding_started`, `onboarding_step_completed` (with step number), `onboarding_completed` events via `src/lib/analytics-events.ts` so drop-off per question is measurable.
- Delete `src/components/onboarding/QuickStartWizard.tsx` and its usage in `src/pages/Dashboard.tsx`; keep `DashboardTour` gated on the new flag.

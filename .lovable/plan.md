
## Goal

Stop losing signups to the black hole. Every new user gets scored on a 6-step activation funnel; the admin panel shows exactly where each user stalls, auto-classifies them into cohorts, and fires nudge emails when they get stuck.

## The activation funnel

Six milestones, tracked per user, timestamped:

```
1. verified_email     → clicked confirmation link
2. completed_onboarding → finished onboarding wizard
3. first_search       → ran a lead search
4. first_lead_saved   → saved/enriched a lead
5. mailbox_connected  → connected Gmail (highest paid-intent signal)
6. first_email_sent   → sent first outreach email
```

A 7th "activated" flag flips once a user hits ≥4 of the 6.

## Cohort auto-classification (evaluated at day 7)

- **Tire-kicker** — 0–1 milestones. Signed up, poked around, left.
- **Explorer** — 2–3 milestones. Interested but stalled.
- **Active** — 4–5 milestones. Real user, likely to convert.
- **Power user** — all 6. Prime upgrade target.

## What gets built

### 1. `user_activation` table + backfill

One row per user, columns for each milestone timestamp, current stage, cohort, `last_active_at`, `days_since_signup`, `stalled_at_stage`. Backfilled from existing data:

- `verified_email_at` ← `auth.users.email_confirmed_at`
- `completed_onboarding_at` ← `onboarding_progress` flags
- `first_search_at` ← earliest `search_transactions` row
- `first_lead_saved_at` ← earliest `leads` row
- `mailbox_connected_at` ← earliest `integrations` row with Gmail
- `first_email_sent_at` ← earliest `sent_emails` row

### 2. Milestone triggers

DB triggers on `search_transactions`, `leads`, `integrations`, `sent_emails`, `onboarding_progress` that update the matching timestamp column on `user_activation` (only if still NULL — first occurrence wins). Zero code changes needed in the app.

### 3. Admin panel — Activation tab

New tab under `/admin` with three sections:

**Funnel chart** — bar chart showing count + % conversion at each of the 6 steps, filterable by signup date range (7/30/90 days).

```text
Signed up      ████████████████████  100%  (240)
Verified email ████████████████░░░░   82%  (196)
Onboarded      █████████████░░░░░░░   68%  (163)
First search   █████████░░░░░░░░░░░   47%  (113) ← biggest drop-off
First lead     ██████░░░░░░░░░░░░░░   32%   (77)
Mailbox conn.  ███░░░░░░░░░░░░░░░░░   16%   (39)
First email    ██░░░░░░░░░░░░░░░░░░   11%   (26)
```

**Cohort breakdown** — count per cohort (Tire-kicker / Explorer / Active / Power) with % of signups.

**User table** — every signup with columns: email, signup date, cohort, current stage, days stalled, last active. Click a row to open the timeline drawer.

### 4. Per-user timeline drawer

Chronological event log for a single user: signup, email verified, onboarding steps, each search run, each lead saved, mailbox connect, each email sent, each reply received. Pulled from existing tables (`search_transactions`, `leads`, `integrations`, `sent_emails`, `reply_threads`, `login_history`) unioned by timestamp.

### 5. Drop-off alerts (admin)

`system_alerts` rows fired by a daily cron for:
- Signups stalled >3 days at "verified but no search"
- Signups stalled >7 days with 0–1 milestones (dead cohort)
- Any user who hit 5/6 milestones but hasn't upgraded to paid (hot lead)

Shown in the existing admin alerts UI + one weekly email digest to the admin.

### 6. Automated nudge emails to users

Four new app-email templates + a daily cron that queues them once per user via existing `send-transactional-email`:

| Day | Trigger | Template |
|---|---|---|
| 2 | Verified but no search | `nudge-run-first-search` — "Try a search in plain English" |
| 4 | Search but no lead saved | `nudge-save-first-lead` — "Turn results into a shortlist" |
| 6 | Leads saved but no mailbox | `nudge-connect-mailbox` — "You're one step from sending" |
| 10 | Mailbox connected but no email sent | `nudge-send-first-email` — "Ready when you are — offer to draft it" |

Each dedupes on `sent_emails` template name so users receive each nudge at most once. Suppressed/unsubscribed users skipped by existing infrastructure.

## Technical notes

- New table: `public.user_activation` (RLS: owner + admin SELECT, service role write).
- New DB function: `admin_get_activation_funnel(_days int)` returns funnel counts + cohort breakdown.
- New DB function: `admin_get_user_timeline(_user_id uuid)` returns unioned event stream.
- New edge functions: `evaluate-user-cohorts` (daily), `send-activation-nudges` (daily).
- New admin route: `/admin/activation` (tab in existing admin shell).
- New drawer component: `UserTimelineDrawer.tsx`.
- 4 new templates in `supabase/functions/_shared/transactional-email-templates/` + registry update.
- Realtime not required — polls via existing 60s admin auto-refresh.

## Out of scope

- Tracking marketing-site page views (this is post-signup only).
- Session replays / heatmaps.
- Retroactively firing nudge emails to old stalled signups (can be a one-off backfill later if you want).

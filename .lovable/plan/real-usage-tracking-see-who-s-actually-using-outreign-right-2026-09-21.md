# Real usage tracking: see who's actually using OutReign right now

Today the admin user list only shows "last sign in". That tells you someone opened a login screen, not whether they use the product. The visitor log that already exists records anonymous arrivals on the marketing site and does not carry a user identity, so signed-in activity is invisible.

This adds real activity tracking for signed-in users: which pages they open, how long they stay, and who is in the app at this moment.

## What you'll see

**New "Live usage" section on the admin Users page**

- **Online now** — list of people currently in the app, with the page they are on and how long they've been active. Updates live, no refresh needed.
- **Active today / 7 days / 30 days** — counts of people who actually did something, not just signed in.
- Per person: last seen (minutes ago), time spent in the last 7 days, number of visits, and their most used areas (Leads, Outreach, Agent, Sequences, Settings...).

**In the existing user table**

- A green "Active now" dot next to anyone in the app right now.
- "Last active" replaces "last sign in" as the headline column; last sign in stays available.
- Sortable, so dormant accounts are obvious at a glance.

**Per-user detail**

Opening a user shows a simple timeline of their recent visits: date, pages viewed, and time spent. This is what tells you whether a trial user ever really tried the product.

## How it works

While someone is signed in and the tab is visible, the app quietly records a heartbeat every 30 seconds with the page they're on. A person counts as "online now" if their last heartbeat is under 2 minutes old. Heartbeats stop when the tab is hidden or closed, so idle background tabs don't inflate usage.

Nothing is recorded for signed-out visitors here — that stays with the existing visitor log.

## Technical details

**Database (one migration)**

- `public.user_activity_sessions` — `id`, `user_id`, `session_id`, `started_at`, `last_seen_at`, `page_views`, `path` (current), `user_agent`, `is_mobile`. GRANTs: `insert, select, update` to `authenticated`, `all` to `service_role`. RLS: users may insert/update/select only their own rows; admins read all via `has_role(auth.uid(),'admin')`.
- `public.user_page_views` — `id`, `user_id`, `session_id`, `path`, `viewed_at`, `duration_seconds`. Same grant/RLS shape.
- Indexes on `(user_id, last_seen_at desc)`, `(last_seen_at desc)`, `(user_id, viewed_at desc)`.
- Add both tables to `public.schema_contract` in the same migration.
- `ALTER PUBLICATION supabase_realtime ADD TABLE public.user_activity_sessions` so the online-now list is live.
- Admin RPCs (SECURITY DEFINER, `search_path = public`, admin-gated):
  - `admin_get_live_usage()` — online-now rows + active-today/7d/30d counts.
  - `admin_get_user_activity(_user_id uuid)` — recent sessions and page views for one person.
  - `admin_list_user_activity_summary()` — per-user last_seen, minutes in last 7d, session count, top paths; joined into the users list.
- Retention: extend the existing daily cleanup cron to delete `user_page_views` older than 90 days and closed sessions older than 180 days.

**Frontend**

- New `src/lib/usage-heartbeat.ts` + `src/hooks/use-usage-heartbeat.tsx`: one session id per tab (sessionStorage), upsert on mount, `last_seen_at`/`path` update every 30s while `document.visibilityState === "visible"`, page-view row written on each route change with the previous page's dwell time. Best-effort, never blocks or throws.
- Mounted once in the authenticated dashboard shell (`DashboardLayout`), skipped inside the Lovable preview iframe and for admin impersonation so your own building sessions don't count.
- New `src/components/admin/LiveUsageCard.tsx` (online-now + active counts, realtime subscription with proper channel teardown) added to the admin Users page; `UserTable.tsx` gains the active-now dot and last-active column; the existing user detail drawer gains an activity timeline.

**Also**

- What's New entry for the admin-visible change.

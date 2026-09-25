# Scheduling the reply sweep

## The gap

Twenty-one jobs run on `pg_cron`. `sync-inboxes` is not one of them.

Its only caller is `handleSync` in `src/pages/Inbox.tsx` — a button. Replies are
detected when someone opens the Inbox page and clicks Sync, and at no other
time.

So "188 sent, zero replies" is not yet a measurement. Zero replies and zero
*detected* replies are the same number in `sent_emails`, and only one of them is
about the emails. Every other part of the product treats that column as fact:
follow-up targeting reads it, the no-response sweep reads it, the Performance
tab reports it. A lead who replied and was never swept keeps getting follow-ups.

## What already exists

`sync-inboxes` was written to be scheduled. It is not a UI handler that would
need adapting:

- **Guarded for cron.** `requireServiceRole(req)` — service role or the vault's
  `INTERNAL_TRIGGER_SECRET`, same as every other scheduled function.
- **Narrowed before it fans out.** Users with an active `google` integration,
  then only those with a `sent_emails` row that has a `gmail_thread_id`, is
  `agent_thread_status = 'active'`, and was sent in the last 30 days. A user
  with no live threads is never polled.
- **Bounded.** `MAX_USERS = 100` per run, `CONCURRENCY = 4`, and `inbox-sync`
  itself takes `.limit(300)` threads per user.
- **Tolerant.** A disconnected or expired mailbox is recorded in `errors` and
  never fails the sweep, which matters when one bad token must not stop the
  other ninety-nine users.

The work is one `cron.schedule` line in a migration, in the shape the other
twenty-one already use (`net.http_post` with the service key read from vault).

## The cost, honestly

This is polling other people's mailboxes on a timer, which is why it is scoped
rather than just added.

**Gmail API quota.** Per-user: `threads.get` at `format=full` costs 10 quota
units. A user with 300 live threads costs 3,000 units per sweep, against a
per-user limit of 15,000/minute — fine. The project-wide ceiling is
1,000,000,000 units/day and 1.2M units/minute, so 100 users × 3,000 = 300,000
units per sweep sits inside a single minute's allowance. Quota is not the
binding constraint; **wall clock is**, since 100 users at concurrency 4 is 25
serial rounds inside an edge function's ~150s budget.

**Token refresh.** `inbox-sync` refreshes at `oauth2.googleapis.com/token`. On a
timer this happens whether or not anyone is using the app, so a revoked grant
now surfaces as a recurring error rather than at the moment someone clicks. That
is an improvement, but it needs the errors to go somewhere — see below.

**Google only.** `inbox-sync` is Gmail-only (`integration_id = 'google'`).
Scheduling it does not give Outlook users reply detection, and the schedule must
not be described in the product as if it does.

## Recommended shape

**Every 15 minutes.** `*/15 * * * *`.

Hourly is too slow for a reply that should pause a sequence — `process-sequence-step`
and `dispatch-sequence-steps` can send the next touch to someone who already
answered. Every minute buys nothing: replies do not arrive faster than a
quarter hour changes anything, and it multiplies token refreshes by fifteen for
the same result. Fifteen minutes bounds the window in which a sequence can talk
over a live reply, which is the actual harm.

**Stagger from the sends.** `process-scheduled-emails` runs `* * * * *`; there
is no contention to avoid, but a sweep that lands on the same minute as a large
send makes the logs harder to read. `7,22,37,52 * * * *` if that matters.

## What must be true before it ships

1. **Failures are visible.** Today `errors` is returned to whoever called and
   the caller was a human looking at the screen. On a timer nobody reads the
   response. The count belongs in `system-health-daily` or the deliverability
   alerts scan, and a user whose mailbox has been failing for days should be
   told — a silently dead sync is what this change exists to prevent, and
   scheduling it without this just moves where the silence is.
2. **`MAX_USERS = 100` becomes a real limit, not a cap that quietly truncates.**
   With more than 100 eligible users the same first hundred are swept every run
   — ordered by whatever Postgres returns — and the rest are never swept at all.
   It needs a rotation (least-recently-swept first) and a
   `last_synced_at` to order by. This is the twenty-draft ceiling in a different
   costume and it must not ship that way.
3. **One sweep at a time.** A run that overruns 15 minutes must not have a
   second started on top of it. The queue's `FOR UPDATE SKIP LOCKED` claim is
   the existing precedent; a simpler advisory lock is enough here.
4. **The manual button still works.** It is how a user checks *now*, and
   `requireServiceRole` means the page cannot call `sync-inboxes` directly —
   it calls `inbox-sync` for itself, which is unchanged by this.

## What it will and will not tell us

It will make the reply column trustworthy from the moment it ships. It will not
retroactively find replies to the 188 already sent: `inbox-sync` reads threads
still marked active and sent within 30 days, so anything older is already out of
range. For those, one manual Sync from the Inbox page is the whole answer, and
it is worth doing **before** this ships so the two questions stay separate —
whether the emails got replies, and whether the product notices when they do.

## Cost

One migration with a `cron.schedule` call, plus items 1–3 above, which are
changes to `sync-inboxes` rather than new machinery. No change to `inbox-sync`.

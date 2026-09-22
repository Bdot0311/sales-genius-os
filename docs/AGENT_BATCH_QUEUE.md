# Running a big batch without a chat turn holding it up

Scope for the one thing PR #254 deliberately did not fix.

## The problem, measured

A follow-up run over 79 leads failed. #254 fixed five ways that failure was
reported dishonestly; it did not make the work finish, and said so.

The numbers say why it cannot finish today:

| | |
|---|---|
| Edge function wall clock | ~150s before the platform kills it |
| `BUDGET_MS` in agent-chat | 110s, then the pass stops and hands off |
| Passes one request may chain | `MAX_RUN_PASSES = 6` |
| Total compute one request can have | **~11 minutes** |
| Observed cost per lead (research + draft + score) | ~8–10s |
| 79 leads | **~11–13 minutes, plus selection overhead** |

So a 79-lead batch lands exactly on the ceiling and goes over it. Raising the
cap moves the ceiling; it does not remove it, and every pass re-runs the whole
model loop — re-reading history, re-deciding what to do — to perform work that
was already decided on pass one. That is the expensive and non-deterministic
part, and repeating it is the thing to stop doing.

## The shape

Split deciding from doing.

The chat turn keeps the part it is good at: understand the request, resolve
which leads it applies to, price it, and enqueue. Then it answers immediately —
"79 queued, I'll work them and tell you when they're done" — and the turn ends
inside its budget, every time, regardless of batch size.

A drained worker does the items. One item is one lead: research it, draft to
the bar, and either park an approval or send, exactly as the inline path does
now. Deterministic, resumable, and idempotent per item.

This follows a convention the repository already has. `rescore_queue` +
`process-rescore-queue` + a pg_cron drain every five minutes is the same shape,
already in production, and is the model to copy — with one correction noted
below.

## Pieces

### 1. Schema

```
agent_jobs        one batch. thread_id, user_id, agent_config_id, kind,
                  request_text, autonomy, total, done, failed, status
                  (queued|running|paused|done|cancelled), created_at,
                  finished_at, estimated_credits

agent_job_items   one lead. job_id, lead_id, status
                  (pending|claimed|done|failed|skipped), mutation_key,
                  attempts, error, claimed_at, finished_at, result
```

`mutation_key` is not new thinking: `agent_chat_threads.run_mutation_keys`
already exists for exactly this reason, and the continuation path already uses
it to avoid repeating a mutation across passes. Here it moves onto the row.

Partial unique index on `(job_id, lead_id) where status <> 'failed'`, so the
same lead cannot be enqueued twice in one job.

### 2. Claiming — where the precedent must NOT be copied

`process-rescore-queue` selects `status = 'pending'` and processes, without
compare-and-set. Two overlapping drains can pick up the same row. For rescoring
that is a wasted recompute. **For sending it is a duplicate email**, and the
duplicate guard at the send layer is a last line, not a first one.

So the worker claims atomically:

```sql
update agent_job_items set status = 'claimed', claimed_at = now()
where id in (
  select id from agent_job_items
  where job_id = $1 and status = 'pending'
  order by created_at limit $2
  for update skip locked
)
returning *;
```

`for update skip locked` is the whole difference, and it is worth a test that
two concurrent drains claim disjoint sets.

### 3. Worker

`supabase/functions/process-agent-jobs`, drained by pg_cron every minute via a
`trigger_agent_jobs()` function, matching `trigger_rescore_queue()` line for
line including the "nothing pending, return early" guard.

Per invocation: claim a batch sized to fit the 110s budget (start at 8 items),
work them, write results, release. A claimed row untouched for 10 minutes goes
back to pending — the same staleness idea `agent-chat` already uses on
`run_status`.

### 4. Progress

The rows are the truth, so progress is a count, not a narration. The thread
shows a live job card (`done / total`, failures, a Cancel).

The cheap path already exists and it is not realtime. `AgentChat.tsx` runs a
watcher that polls `agent_chat_threads` while a run is active, skipping the
read entirely while the tab is hidden, and uses `updated_at` as the run's
heartbeat. Adding the job's counts to that same read
costs one more column set on a query already being made. `agent_chat_threads`
is **not** on the `supabase_realtime` publication — only the two changelog
tables are — so doing this over realtime means a publication migration and a
second subscription, which is new infrastructure for a number that changes
every few seconds anyway.

One message at the end: what completed, what failed and why, grouped rather than
per lead.

### 5. Cancel

`status = 'cancelled'` on the job; the worker checks before each item. This is
the thing that makes a runaway batch survivable, so it ships with the queue, not
after it.

## What must not change

- **Approval mode.** An item in approval mode parks an `agent_approvals` row and
  sends nothing, identically to today. The queue running unattended makes this
  the most important line in the scope.
- **The 100/100 quality bar**, the discard-on-hold rule, and the duplicate-send
  guard.
- **Credit charging**, and the daily send cap, which is
  `subscriptions.daily_email_limit` against `daily_emails_sent` — read inline in
  `agent-chat/index.ts`, not in `plan-limits.ts`. The worker has to read it the
  same way, per item.

## Risks, named

1. **Unattended sending.** Today a send happens while someone is looking at the
   chat. A cron worker sends when nobody is. Mitigations: approval mode is
   absolute; a per-job send cap; Cancel; and the daily limit above, which the
   worker must check per item rather than once per job — a job enqueued at 09:00
   is still running when the cap is reached at 11:00.
2. **Cost.** 79 leads is 79 research + draft + score cycles. The enqueue step
   prices the job and says the number before starting; a job that would exceed
   the balance is refused at enqueue, not discovered at item 60.
3. **Invocation volume.** A per-minute cron adds invocations. The early-return
   guard when nothing is pending keeps the idle cost near zero, as it does for
   rescore.
4. **Two paths for the same work.** Small batches stay inline; large ones go to
   the queue. Two code paths for "draft an email" is how behaviour drifts. The
   per-item worker must call the same helpers the inline tools call, not a copy.

## Phasing

Each phase is shippable and useful on its own.

**Phase 1 — resume by hand (small).** #254 made the stop honest. Give it a
button: when a run stops short, one tap resends the request with the remaining
set. No schema, no worker. Removes the "type it again" part of the complaint,
leaves the ceiling in place.

**Phase 2 — queue, drafting only (the bulk of the work).** Everything above, but
items research and draft and never send. Drafts are reversible, so the blast
radius of a bug is a drafts folder to clear. This is where the schema, the
worker, the claiming, the progress card and Cancel all land.

**Phase 3 — sending through the queue.** Add the send step, the per-job cap and
the per-item daily-limit check. Small on top of phase 2, and the one that needs
the most care.

## Recommendation

Phase 1 now: it is an afternoon and it removes the part that annoys you daily.

Phase 2 next, as its own PR. Phase 3 only once phase 2 has run a real batch and
the counts in the job card have matched the drafts folder on a run you watched.

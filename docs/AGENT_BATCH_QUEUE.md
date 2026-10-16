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

---

## Fairness across accounts

All three phases shipped. What none of them considered is that the queue is
shared, and `claim_agent_job_items` ordered the batch by `created_at` across
the whole table.

### The measurement

Postgres 16, the real claim function, the real drain rate (`trigger_agent_jobs`
fires up to three passes of twelve a minute):

| | |
|---|---|
| Account A queues | 2,000 leads at 10:00 |
| Account B queues | 5 leads at 10:05 |
| Drain | 36 items/minute |
| **B's wait for its first lead** | **56 minutes** |
| B's UI for those 56 minutes | "queued" |

Linear in the backlog ahead of you: a 20,000-lead import would have made a new
signup's first batch wait most of a day, with nothing to distinguish it from a
queue that had stopped.

This is not a throughput problem. Raising the pass cap moves every number in
that table by the same factor and changes nothing about the ordering.

### The fix

Round-robin across accounts, FIFO within an account:
`20261015230000_fair_agent_job_claim.sql`. Each account's pending items are
numbered oldest-first, and the batch is taken in that `turn` order — everyone's
oldest before anyone's second.

Same scenario after:

| | |
|---|---|
| B's wait for its first lead | 1 minute |
| B's five leads | all claimed in that minute |
| A's share of the first 36 slots | 31 |

A gets every slot nobody else wants, which at one tenant is all of them.

### What was verified, and how

Against a real cluster, not by reading:

- 56 minutes → 1 minute on the scenario above.
- An account's own items still come oldest-first (0 of 36 claims out of order).
- Three simultaneous drains: 12 rows each, 36 total, nothing claimed twice.
  `FOR UPDATE OF c SKIP LOCKED` is what makes that true and is unchanged.
- 50,000 pending across 40 accounts: the first 24 claims went to 24 different
  accounts.
- Cost at 200,000 pending: ~90ms per claim against ~40ms for the unfair
  version, three times a minute.

### Round-robin needed a memory

Review caught what the measurement above missed, and the cluster confirmed it.
Numbering each account's items oldest-first and taking the batch in turn order
produces the *same* order on every call. So with more accounts than slots, the
ones at the back of that order never get in at all:

| | |
|---|---|
| Accounts, each with a 500-item backlog | 13 |
| Batch | 12 |
| Calls | 60 (20 minutes of draining) |
| **Slots the newest account got** | **0 of 720** |

Zero, until one of the twelve ahead of it drained completely. Taking turns
requires remembering whose turn it was, and statelessness was the bug.

`20261016000500_queue_tenant_turn.sql` adds one row per account per queue
holding how many rows were claimed for it recently, and orders accounts
least-served-first. Three versions were measured before one worked:

| ordering | 13 accounts | 20 | 50 | 100 |
|---|---|---|---|---|
| global FIFO | starves | starves | starves | starves |
| stateless round-robin | 0–120 | 60–120 | 24–30 | 13–15 |
| last-served timestamp | 60–120 | 60–120 | 24–30 | 13–15 |
| **recent deficit** | **110–111** | **72** | **28–29** | **14–15** |

(min–max slots per account out of 1,440, across 120 calls of twelve.)

The timestamp version fixes the starvation and not the unfairness: every
account served in a call gets a stamp within microseconds of the others, so the
order among them is arbitrary-but-stable and the same two accounts absorb every
miss. A *lifetime* total fixes the spread and introduces drift — a new account
at zero outranks everyone until it catches up, and an account returning after a
week away outranks the accounts that kept working. Hence a count over a sliding
window: it accumulates while an account keeps being served and resets once the
account has been idle past the window.

Two details that are load-bearing:

- **The count is rows claimed, not calls appeared in.** An account that took
  eleven of twelve slots has been served more than one that took a single row.
- **The stamp is written at claim time, whatever becomes of the work.** This is
  the other half of the same review finding: a capped or paused account's rows
  were claimed, deferred, released, and claimed again the next minute, burning
  a slot a minute while accounts that could work waited. Having a turn and not
  being able to use it still counts as having had it. Measured with one capped
  account of thirteen: 7.8% of slots against a 7.7% fair share.

It is a data-modifying CTE in the same statement as the claim, so a row cannot
be claimed without the turn being recorded.

Cost at 200,000 pending across 40 accounts: ~110-130ms per claim, against ~90ms
for the stateless version and ~40ms for the unfair one. Three times a minute.

### The bound worth knowing about

The obvious implementation ranks every pending row in one window. It sorts the
whole backlog to disk for a twelve-row answer — 2.4MB spilled at 50,000 rows —
and gets worse as the queue deepens. The shipped version uses a lateral per
account, so the work is bounded by the batch size and the number of accounts
with pending items rather than by queue depth.

`p_limit * 8` is headroom for concurrent drains: each pass locks `p_limit` rows
with SKIP LOCKED, so the pool must hold more than `passes * p_limit` claimable
rows or the later passes come back short and throughput halves silently.
`src/lib/agent-job-fairness.test.ts` asserts the factor stays above the pass cap
in `trigger_agent_jobs`, because those two numbers live in different migrations.


---

## The third queue

`rescore_queue` had the same two problems and a worse one of its own, found by
looking for the first two somewhere else.

**A claim nobody came back for was stuck for good.** `claim_rescore_items` set
a row to `processing` and stamped `claimed_at`. Nothing read that column and
nothing returned a `processing` row to `pending` — the word did not appear in
the drain, which only ever wrote `done` or `error`. A run that died after
claiming left those leads holding whatever score they had, with no path back
and nothing anywhere to say so. This queue is how a lead's ICP fit and signal
score stay current, so the symptom is a badge that quietly stops moving, for
exactly the leads whose scores were about to change.

**Global FIFO**, as before: the batch was the oldest rows by `enqueued_at`
across the whole table.

**A colliding drain did nothing.** Selection happened in the edge function —
read the oldest N ids, then ask the RPC to claim *those* ids. Two overlapping
drains read the same ids, `SKIP LOCKED` gave them to one, and the other claimed
zero and returned `processed: 0` instead of taking the next N. It wastes a
whole pass, and does it exactly when the queue is deep enough for the
one-minute backfill job to be running alongside the five-minute one.

`20261016010000_fair_rescore_claim.sql` moves selection into the claim, which
fixes the third for free and is what lets the second be fixed at all. Measured
on a real cluster: three simultaneous drains take 50 rows each, 150 distinct,
where before it was 50 and two empty-handed. A bulk account's 5,000 queued
rescores and a second account's four now share one batch, 46 to 4.

The sweep parts an interrupted row from an unscoreable one by `attempts`:
under three goes back to `pending`, three or more becomes `error` with a
`processed_at`. Rescoring is idempotent — it recomputes from the lead and its
signals — so unlike a send there is no risk in retrying, and the only question
is how many times before calling it a bad row. The drain also has a wall clock
now, and hands back what it did not reach, giving the attempt back with it: a
run stopped by its own budget never tried those rows, and three budget stops in
a row would otherwise retire a lead no rescore was attempted for.

One note for whoever adds the fourth queue: the old claim took `uuid[]`, and
`CREATE OR REPLACE` with a different parameter type adds an overload rather
than replacing. It is dropped explicitly, or PostgREST would have had two
candidates for one RPC name — one of which bypasses the fair ordering.

### The recovery that could not be reached

Two findings from review of the migration above, both reproduced on a cluster
before being fixed.

**The sweep never ran when it mattered most.** It lives at the top of the
drain, and the drain is only ever called by `trigger_rescore_queue`, which
opened by counting pending rows and returning if there were none. A run that
died after claiming the *last* batch leaves rows `processing` and none
`pending` — so the count is zero, the trigger returns, the drain is never
called, and the recovery inside it never runs. The fix was reachable only
while something else was already queued, which is precisely not the stuck
case. The sweep now runs before the count, so recovered rows are counted and
drained on the same tick, matching what `trigger_agent_jobs` already does.

**One conflicting lead aborted recovery for every other.**
`uq_rescore_queue_pending_lead` is unique on `lead_id` WHERE `status =
'pending'`. It does not cover `processing`, so while a lead's row is claimed a
new signal can legitimately enqueue a second, pending row for it. Handing the
claimed row back then violates the index — and as one set-based UPDATE, that
raised and rolled back every other lead's recovery, including the later move
of exhausted rows to `error`. Measured before the fix: four stale rows, one of
them conflicting, and the sweep recovered **none** of them.

The release is now per row with its own exception block, so a conflict is
contained to the row that caused it, and that row is dropped rather than left
stuck — a newer pending row already covers the lead, which is exactly what the
unique index means. Handling it in the exception rather than behind an EXISTS
check is deliberate: a check still loses to an enqueue landing between the
check and the update. After the fix, the same four rows: two recovered, the
subsumed one dropped, the exhausted one retired to `error`.

One trap for whoever edits `trigger_rescore_queue` next. There are two copies
in the repo. The one in `supabase/migrations` signs the drain with the **anon
key**; the live one, mirrored into `drizzle/migrations`, signs with
`internal_job_key()`. The drain is behind `requireServiceRole`, which rejects
the anon key outright, so rebuilding the function from the older copy would
401 the entire queue. `src/lib/rescore-queue-claim.test.ts` asserts the live
definition keeps the internal key.

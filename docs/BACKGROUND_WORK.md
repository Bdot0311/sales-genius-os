# Work that keeps going when you navigate away

## The ask

"Every single function must work in the background. Say you're searching for
leads and go to saved leads — in the meantime it continues to search. When you
get back to search you're in Outreach building an email, then want to go to AI
agent, in the meantime still working."

## What actually breaks, which is not what it looks like

Most of this work already continues. There is **no `AbortController` anywhere in
the app**, and the React Query client is created once at `App.tsx:87` for the
whole tree, so navigating away does not cancel an in-flight request. The edge
function has the request, it finishes, and whatever it writes to the database
lands.

What dies is the **page's knowledge of it**. `AILeadCommand` holds `busy` in
`useState`; the component unmounts on navigation and `busy` goes with it. Come
back and the page looks idle because, as far as it knows, it is.

So "it stopped" and "it finished and nobody told me" look identical from the
outside, and they need different fixes. Three classes:

**1. Server finishes, result persists, the UI forgets.**
Enrichment, scoring, research. `enrich-lead` writes the lead row; the work is
genuinely done and the data is genuinely there. Only the progress and the "done"
signal were lost. *The work needs nothing. The UI needs a durable record to read
back.*

**2. Server finishes, result exists only in the response.**
A search whose results are shown for review and are not written anywhere until
the user clicks Save. Navigate away and the work really is gone — not because it
was cancelled, but because nothing kept it. *Needs the results persisted
server-side before they are returned.*

**3. The browser drives the loop.**
`AccountCommittee.tsx:122` fans out `enrich-lead` per lead with
`Promise.allSettled`. Those are all in flight at once so they do complete, but
anything written as a sequential loop over leads would stop dead mid-way.
*Needs the loop moved server-side.*

Telling a user "still working" while class 1 has already finished would be its
own lie, so the record has to reflect the real state, not a spinner.

## The pattern already exists and is proven

`agent_jobs` + `agent_job_items` + `process-agent-jobs` + `useAgentJob` is
exactly this, working, for one kind of work:

- A durable row per job, `status` in `queued|running|done|cancelled`, with
  `total` / `done` / `failed`.
- Items claimed atomically (`FOR UPDATE SKIP LOCKED`) so two drains never take
  the same row.
- A worker on `pg_cron` every minute with its own time budget.
- A hook that reconstructs progress from the table on mount, so closing the app
  and coming back shows the truth rather than a reset spinner.
- Cancel, expressed as a row state the client may write and the worker respects.

Nothing here needs inventing. It needs generalising and putting in the shell.

## The one real schema obstacle

`agent_job_items.lead_id` is `NOT NULL REFERENCES public.leads(id)`. The table is
lead-shaped, and a search job has no lead yet — finding them is the work. The
unique index `(job_id, lead_id)` that stops a retried enqueue doubling a batch
depends on the same column.

So either:

- **`lead_id` becomes nullable** with a `payload jsonb` beside it, and the
  uniqueness rule becomes a partial index `WHERE lead_id IS NOT NULL`, keeping
  the existing guarantee exactly where it applies today; or
- a second table for non-lead work, which duplicates the claim function and the
  retry logic, and those are the parts that must not drift.

Recommend the first. `kind` already exists on `agent_jobs` and already
distinguishes work; the items table is the only thing that assumes leads.

## Phasing

**Phase 1 — see what is already happening.** No new background work. A
`useBackgroundWork()` reading open jobs for the user, and one indicator in
`DashboardLayout` rather than per page, since the whole point is that it survives
navigation. This alone answers the complaint for class 1, which is most of it,
and it is the phase that proves the surface before anything depends on it.

**Phase 2 — enrichment, scoring and research become jobs.** These are already
per-lead and idempotent, so they fit `agent_job_items` unchanged. `kind` gains
`enrich`, `score`, `research`; `process-agent-jobs` gains a branch per kind and
keeps its budget and claim. The pages enqueue instead of looping.

**Phase 3 — search.** The largest, because it is class 2: the results have to be
written server-side as they are found, which changes what "a search" is. Do it
last and on its own.

## What must not regress

1. **A job that finished says finished.** The record is the truth; a spinner
   that outlives its work is the failure this is meant to remove, not a
   cosmetic issue.
2. **Cancel means cancel.** The worker checks before every item today. Any new
   kind inherits that, and a cancelled job must not leave its items `pending`
   forever — a bug already found and fixed once in the queue's dedupe.
3. **No silent cap.** `MAX_USERS`-shaped truncation is how the drafts folder
   stayed at twenty and how the reply sweep will miss users past a hundred. A
   bound that cannot be raised must be reported, not hidden.
4. **One worker, one claim path.** Two copies of the claim or the retry logic is
   how the inline and batch draft paths drifted, which cost days. Every kind
   goes through `claim_agent_job_items`.
5. **The indicator is honest about scope.** "Still working" must name what —
   three pages away, a bare spinner is worse than nothing.

## Cost

Phase 1 is a hook, a shell component and no schema change. Phase 2 is the
nullable `lead_id` migration, a `kind` branch in the worker, and rewriting three
call sites to enqueue. Phase 3 is its own piece of work and should be scoped
separately once 1 and 2 are running.

The honest note: none of this makes the product faster. It makes what is already
happening visible and makes the two flows that genuinely lose work stop losing
it.

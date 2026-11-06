# Quality checker, reply rubric, and agent infrastructure

Status of this document: the "Built in this change" section is code on this branch. The "Proposed" section is a scope, not an implementation. Nothing here was published, and no live campaign was sent.

Live account reads did not return samples. `get_agent_stats` and `list_recent_sent_emails` failed before any rows. Sign-in also reported the provider temporarily unavailable. That outage is not evidence about why drafts score the way they do.

## What the product already uses

Two different checks, both already in the repo.

**Outbound Quality Check** is deterministic. `scoreEmailQuality` in `src/components/outreach/EmailQualityChecker.tsx` calls `auditEmail` and `deliverabilityReport`. A blocker or a warning is painted as a red row. A note is yellow. The overall number is 100 minus 35 per blocker, 15 per warning, and 5 per note. Green overall means no blocker, no warning, and a score of at least 75. This is the card in Outreach Studio.

**R.E.P.L.Y.** is a model score. `check-email-rubric` asks for five integers from 0 to 5: relevance, empathy, payoff, low-friction ask, you-focused. Growth and above only. `email-quality.ts` rescales the average to 0–100. Below 60 is weak for a human rewrite. The autonomous agent rewrites until 100, meaning 5/5 on every dimension, and also until the deterministic warnings and blockers are gone. It does not send at 80. That 100 is a model's opinion. It is not a reply rate and not proof a sentence is true.

The agent runtime is the existing edge functions: `agent-chat` for a person watching, `agent-run` for the unattended loop, `generate-email` for Outreach Studio and for drafts the chat asks `draft_outreach` to write. Tool results, approvals, and sent rows are ordinary Postgres tables. There is no separate workflow engine.

## Why the card stays red

Three separate causes, each visible in the code.

1. The generator and the card did not share a gate. `generate-email` rewrote for a few patterns (invented figures, a pitch sentence, banned phrases) and then returned the draft. The card scored whatever came back. Send in the studio and in bulk send stopped only when `quality.blockers` was non-empty. A warning is painted red and was not a blocker, so a draft covered in red rows could still be sent.

2. The rubric prompt showed `"score": 0-5` as the JSON shape. `Number("0-5")` is not a number, and the parser stored that as 0. A copied schema is then five red bars. That is a parser bug, not a judgment that the email scored zero. Unparseable scores now fail closed instead of being stored as zeros. The prompt asks for one integer.

3. The autonomous loop can require a perfect model card that the same prompt makes unlikely: the writing rules tell the model to infer a pain and withhold the product, while the card marks "we help" and several stock phrases as red rows. A score of 100 from the model and zero red rows is a high bar. This change does not lower it. When the model scorer is down or returns junk, the agent now holds the draft. A starter plan that is not allowed to call the rubric is unchanged: the deterministic rules still apply, and a clean rule card can send, because blocking every starter email was the previous explicit choice.

The rubric panel also kept the previous dimension scores on screen until the next request returned. Editing the draft could show a pass against text that was no longer in the box. The previous scores are cleared when the subject or body changes.

Word overlap is not one of these checks. A sentence can reuse a page's nouns and still be false. That limit is unchanged. `unsupportedClaims` blocks an event, a quantity about the prospect, a "this just happened" time, or a pain stated as known, unless the research or the lead record says that thing. It does not decide that a paraphrase is true.

## Synthetic fixtures

These are not customer emails. No live account sample was available. `scoreEmailQuality` produced the numbers. A card score is not a reply rate and not proof the sentences are true.

**Pitch, no evidence.** Subject `quick question`. Body states "We help companies like yours build the lead sourcing and campaign infrastructure" and "predictable pipeline without adding headcount." Nothing in the fixture supports either sentence. Card: overall 60, status yellow, red rows for Banned Phrases and Pitch. Send stops.

**Before: category pain stated as fact, no source.** Subject `follow-up`.

> Freight brokers usually lose the second touch. The handoff after the first reply is where it dies.

No fixture evidence says that freight brokers usually lose anything, or that the handoff is where anything dies. An earlier card score of 95 only meant the lexical rules had not caught "usually" or "is where it dies". That score was not a safe draft. The same text now returns two `ungrounded_prospect_claim` blockers. Card: overall 25, status red. `outboundGateFindings` with an empty corpus returns the same rule. Studio, bulk send, `send-email`, sequence queue, and the agent first-touch path all use that rule.

**After: no fact asserted.** Same greeting and sign-off, body replaced with:

> How does follow-up work on your team after the first reply?

No rate, no cause, no event. Card: overall 95, status green, one yellow length note ("13 words"). Blockers empty. The 95 is only the lexical card. It does not mean the question is relevant, and it does not mean anyone will answer it.

**Paraphrase that the fixture does support.** Evidence string: "Acme's own page: second-touch replies drop after the first reply." Email: "Your second-touch replies drop after the first reply." `unsupportedClaims` is empty. The words are the evidence's words, rearranged. A true paraphrase that shares none of those words is not something this check can bless, and a false sentence that avoids "usually", event verbs, and quantities can still pass. Those two limits are the semantic gap.

A sentence that contains the word "hypothesis" is not treated as a stated rate. "Hypothesis: you raised" is still an event claim.

## Where the gate runs

There is no caller flag, score, or "manual" bit that skips the gate. Chat confirmation means the person asked to send. It does not mark the copy as passed. Human-written mail uses the same rules. A person can send a question. They cannot send a red row or an unsupported rate by calling the API directly.

| Path | What is checked | On failure |
|---|---|---|
| `send-email` | `outboundGateFindings` on the plain text after the signature is appended. Evidence is `proofFromLead` for the lead row owned by the caller. No lead id means an empty corpus. | HTTP 422 `quality_checker`. Gmail is not called. |
| Outreach Studio and bulk send | The same findings via `scoreEmailQuality` and `redQualityRows`, on the body about to send. | Toast or per-lead block. The server checks again. |
| `generate-email` | `reviseUntilClear`: check, one rewrite, recheck. Corpus is the fetched brief and lead fields, not recalled text and not a client score. | Blockers are not saved. Warnings return `needs_review`. |
| `agent-run` first touch | `firstTouchBlockers`, which calls `unsupportedClaims`, plus the rubric. A missing rubric is not a pass. A perfect model score does not override a claim blocker. | Held. Nothing is sent or saved. |
| `agent-chat` `draft_outreach` | Goes through `generate-email`. | Same as generate-email. |
| `agent-chat` send | Calls `send-email`. | Same 422. |
| Autonomous replies | `replySendBlockers`, corpus is the prospect's reply plus extra proof, not the sender's offer. | Reply is not sent. |
| Sequence queue and scheduled send | `queuedCopyBlockers` before the row is queued and again before Gmail. | Held or failed as `ungrounded_template`. |

`deliverReserved` is unchanged. It still stops two concurrent sends of one reservation. The quality gate runs before that reservation.

## Built in this change

- The gates in the table above.
- Prevalence and causal wording ("usually", "most teams", "is where it dies") are blockers unless that wording is in the evidence corpus. A question that does not use them is not a claim.
- `reviseUntilClear` is the rewrite loop `generate-email` calls. Tests drive it with a fake model: a failing draft, the checker's note, a revised body, a recheck, and the revised text kept; an unchanged rewrite stays `refused`; a null or throwing rewrite is not `clear`.
- Rubric integers only. `0-5` is unparseable. Panel scores clear when the text changes.
- The first-touch prompt no longer says to invent a pain or to claim an unnamed customer.

Hosted functions are whatever was last published in Lovable. Merging this branch does not deploy them.

## Current runtime, and what to keep

`agent-chat` is a tool loop in one request. `agent-run` still walks leads inside one request. First-touch research, draft, score, hold, and send now claim `outbound_run_steps` when the migration is present. Reply handling in that same request does not. Drafts, approvals, and sent rows are Postgres. `deliverReserved` and the sent-email unique indexes are still the last lock on a duplicate send. Credit locks from the earlier audit stay. Tenant checks on lead id in `send-email` stay.

What failed, and is now gated in this branch: the card and the send did not have to agree, a direct `send-email` did not run the card, and "usually" was invisible to the card.

The rows for a verdict, a resumable run, and a prompt hash now exist in this branch. They are not on the hosted database until a Lovable publish. A named workflow product is still not justified. No vendor is selected here.

## Approved build, implemented in code, not published

The five items below are in the repository and are called from the send and agent-run paths. They are not on the hosted database until a Lovable publish applies the migration and the functions. The canary table is empty, so no account is in canary. The live gate still refuses red rows for everyone. Shadow writes record a verdict and a mismatch flag. They do not authorize a send while the canary is off. If the verdict write fails, the live gate still decides, and a failing gate still refuses.

Rollback is to leave `outbound_gate_canary.enabled` false, or to delete a row that was turned on. Do not restore a path that sends when the live gate has findings. Cancel an in-flight run by posting `{ "cancelRunId": "<id>" }` to the same authorized `agent-run` function. That marks the run cancelled. A later phase claim returns `cancelled` and does not run. An expired lease can be claimed by the next `agent-run` call, which is the recovery entry. `deliverReserved` is still the lock that stops two sends of one reservation.

Publish order, when the owner chooses to publish: apply `20261106140000_outbound_verdicts_and_run_steps.sql` with the functions, then publish the functions. Merging this pull request does not do either. If the functions are published before the migration, `open_outbound_run` throws, `agent-run` keeps `durableFirstTouch: false`, and that request is in memory. `send-email` still enforces the live gate. Leave `outbound_gate_canary` empty.

| Phase | Wired in this branch | Acceptance that executes that code | Not done |
|---|---|---|---|
| 1. Verdict bound to exact text | `send-email` hashes the plain text after the signature is appended, runs `outboundGateFindings` on it, calls `scoreEmailReport` on that same text, and stores that availability and rubric. `evaluateSend` then decides. `agent-run` also stores the pre-signature draft it scored, with that attempt's availability. The two hashes differ once a signature is appended, so the draft row cannot authorize the signed send | `evaluateSend` refuses a changed body and a changed rubric hash when the canary is on. The send function calls `scoreEmailReport` only after `appendSignatureToBody` | No account is canaried. The first clean send of a text has no prior row, so canary-on still allows it when the live gate is clear. Hosted rows do not exist yet. The extra rubric call records availability. It does not add a pass/fail, and it does not change the starter-plan rule |
| 2. Leased first-touch steps | `agent-run` calls `runPhase` for research, draft, score, hold, and send. `open_outbound_run` returns one open run per account under a lock. `close_outbound_run` closes it only when no step is open, leased, or exhausted. A skipped research or draft step restores the stored payload and does not call the provider again | `advanceLead` and `runPhase` against ephemeral Postgres: a resumed run does not replay research; a second worker is `busy` and does not send; an expired lease does not send; cancel stops the next phase; the fourth attempt is `exhausted` | Reply sends in `agent-run` are still in memory (`replyExecution: "in_memory"`). `deliverReserved` is their duplicate lock. If the migration is missing, first touch is also in memory and `durableFirstTouch` is false. This is not the existing `agent_run_steps` trace table. Exhaustion sticks until `{ cancelRunId }` abandons the run |
| 3. Tool receipts | The summary is `buildAgentRunSummary`. Counts of "sent" are `ok` receipts from `classifyProviderSend` on the send-email response. Approval and `accepted_unpersisted` are stored as those statuses. `receiptsFromRun` is gone | A summary built from approved, attempted, or unpersisted receipts says 0 sent. An `ok` receipt does not get a correction | Receipt insert is best-effort until the migration is published. The summary cannot see a send that happened in a previous request |
| 4. Fixture replay | `outboundGateFindings` on the frozen pair, no model | The "usually" sentence fails. The question does not | Not a campaign, and not a reply rate |
| 5. Prompt hashes | `gatePromptHash` is the prevalence and causal patterns the gate uses. `rubricPromptHash` is `RUBRIC_SYSTEM_PROMPT`, the system prompt `check-email-rubric` sends | Same body, two hashes, two rows. Canary refuses a hash mismatch | Does not invent hashes for mail sent before this table |

`claim_agent_run_step`, `open_outbound_run`, `cancel_agent_run`, `record_outbound_verdict`, and the other functions in that migration are `SECURITY DEFINER`. The migration revokes them from `PUBLIC`, `anon`, and `authenticated`, and grants execute to `service_role` when that role exists. `agent-run` and `send-email` call them with the service role after `auth.getUser`, and pass that user id. The local audit database has no `authenticated` role, so that revoke is checked from the migration text. The `PUBLIC` revoke is checked against the database.

## Proposed build, now the implemented contract

Must-have, in order. Each item names the failure it answers.

1. **Verdict on the draft.** Store checker findings, rubric availability, and a hash of the exact subject and body. `send-email` recomputes the hash. A mismatch invalidates the verdict and runs the gate again. Answers the stale-edit hole that a browser score cannot close once the body changes after scoring. Acceptance: a test updates the body and the old verdict does not authorize the send.

2. **Run steps with a lease.** One row per lead per phase (research, draft, score, hold, send) with status, attempt count, and a lease expiry. A second invocation resumes the open step instead of sending again. Cancel sets the step to cancelled and the lease is not renewed. Answers `agent-run` losing its place when the request dies. Acceptance: a test inserts a scored step, kills the fake runner, and the next run does not call send. `deliverReserved` stays the last lock.

3. **Receipts for tools.** `claim-check.ts` already corrects `agent-chat` when the prose says "sent" and the event is an approval. `agent-run` should write the same event list it already returns as counters, and the correction should run on any user-visible summary. Acceptance: the existing claim-check fixtures pass on both entry points.

4. **Fixture replay in CI.** Frozen emails and the findings they must produce, including the "usually" pair above. The live model is not called. Acceptance: a change that lets the "usually" sentence through fails CI. The tests added here are the start of that set, not the whole set.

5. **Prompt and rubric version on the verdict.** The system prompt and the rubric prompt are files. Store their hash next to the verdict so a later reply can be tied to the text that was scored. Acceptance: two verdicts of the same body under two prompt hashes are distinguishable. This does not measure replies.

Optional, not justified by a bug reproduced here: a hosted trace vendor, a sandbox, a vector store, a second model that approves the first, a replacement agent framework. The action log plus the verdict id is the trace until someone can read it and still cannot say why a lead was held.

Rollback of the gate in this branch is not "send on blockers only" again. That was the bypass. Rollback is to keep refusing sends and hold drafts. A future step table can be ignored without dropping the gate.

Shadow: run the verdict write for a period without reading it, compare it to the live gate, then switch send to require the hash. Canary is a single account flag, default off, with the gate still on for everyone. No new paid dependency.

Owner decisions still open: whether a person may override a red row after reading the findings (there is no such flag now); whether starter plans that cannot call the rubric may keep sending when the deterministic gate is clear (they can, today); whether yearly invoices should keep replacing the credit balance; whether a second search with the same filters is a new charge. Workload size of `agent-run` against the edge time limit was not measured. No price or capacity number is stated. Any effort beyond this list is a provisional guess that the five items are each a migration plus tests, not a measured duration.

## What would count as a reply improvement

A staging mailbox can show that a message was handed to Gmail and that a bounce or an autoresponder came back. It cannot establish a prospect reply rate. A rate needs a campaign the owner approves, a denominator of messages that were actually delivered, human replies counted apart from autoresponders, each reply tied to the body hash and the rubric version, and the confounders written down (list, offer, mailbox, time). This change did not send anything. No number here is that rate.

## Limits

A green card means no red row. It does not mean the email is true or that it will be answered. A rubric score is the model. A paraphrase with none of the evidence's words is not certified. A false sentence that avoids the patterns above can still pass. Word overlap is not used as proof of meaning. The functions are not published until Lovable publishes them. Nothing here is a production-ready claim, and no number here is a reply rate. Reply handling inside `agent-run` is not durable execution. A fixture test does not exercise Gmail.

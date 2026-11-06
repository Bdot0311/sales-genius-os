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

## Synthetic fixtures, scored by the real card

These are not customer emails. `scoreEmailQuality` produced the numbers.

**Fails the card.** Subject `quick question`. Body:

> Hi Sarah,
>
> We help companies like yours build the lead sourcing and campaign infrastructure that drives predictable pipeline without adding headcount.
>
> Worth exploring?
>
> Jordan

Result: overall 60, status yellow, with red rows for Banned Phrases and Pitch. `redQualityRows` is non-empty, so studio send and bulk send stop. The evidence for the pitch row is the "We help companies like yours..." sentence. Nothing in this fixture supports that sentence.

**Clears the card except a short-length note.** Subject `second touch`. Body:

> Hi Sam,
>
> Freight brokers usually lose the second touch. The handoff after the first reply is where it dies.
>
> How does that handoff work on your team?
>
> Jordan

Result: overall 95, status green. The only non-green row is Length, yellow, "27 words". There is no pitch row and no unverified-claim row. The length note is the checker's own under-50 rule. This is not a prediction that the email will be answered. It is the card's score for this text.

A false event that copies other words from a page is a different check. Against "Acme builds route planning software for freight brokers. They did not raise a round.", the sentence "You just raised a series B" is an unsupported claim. "Saw you just launched a freight product last week" is allowed when the research says "Launched a freight product last week".

## Built in this change

- Studio send and bulk send refuse when any quality-card row is red, on the body that would be sent, including the signature. Blockers are still named. Warnings that the card paints red now stop the send too. Yellow notes do not.
- `generate-email` runs that same failing-finding list once and rewrites once. Remaining blockers are not saved. Remaining warnings come back as `quality_status: "needs_review"`, which is not a pass.
- `check-email-rubric` only accepts a score that is an integer 0 through 5, or `n/5`. Anything else, including `0-5`, is `unparseable` and no dimensions are returned.
- `agent-run` asks `scoreEmailReport`. Availability `unavailable` does not send. Availability `scored` still requires `isPerfect` (100 and no warning or blocker). Availability `plan_gated` still sends only when the deterministic rules are clean.
- The reply rubric panel drops the previous scores when the text changes.
- Prospect-event checks at the agent first-touch and reply boundaries, and on queued sequence copy, no longer treat a non-empty research blob or a word overlap as permission. The sender's offer is not evidence that the prospect raised, hired, or launched.
- The first-touch prompt no longer says to invent an operational pain and never refuse. The proximity lines no longer say to claim "already working with" a customer who was not named.

Hosted functions are whatever was last published in Lovable. Merging this branch does not deploy them. A red card in production can still be the previous function until that publish.

## Proposed, not built

The custom loop is not, by itself, the reason a draft scores red. The missing piece that reproduces is the gate above: the checker ran, and send did not have to clear the rows the user was looking at. Replacing the loop with a named agent framework would not score the email.

What the current runtime does not have, and a production build would add, in this order:

1. **One saved verdict per draft.** Today the card is recomputed in the browser and the agent stores a rubric snapshot in the action log. A draft row should store the checker findings, the rubric report (or `unavailable` / `plan_gated`), and the exact subject and body those were computed on. Send reads that row. A mismatch between the stored body and the body about to send invalidates the verdict. Acceptance: a changed body cannot send on the old score.

2. **Durable run steps.** `agent-run` keeps counters in memory for one request. A timeout loses the place. A `agent_run_steps` row per lead (research, draft, score, hold or send) with a status, an attempt count, and a lease makes a retry resume instead of starting over. Acceptance: killing the request after a score leaves a step that a second invocation does not send twice. The existing `deliverReserved` unique index stays the send lock.

3. **Typed tool results and the claim check on every path that speaks.** `claim-check.ts` already corrects `agent-chat` when it says it sent and no send event exists. `agent-run` returns counters it computed itself, so that particular lie is less available there. Tool results should stay schema-checked. Acceptance: a fixture where the model says "sent" and the event is an approval is still corrected, on both entry points.

4. **Traces that can be read without a new vendor.** The action log already records skips and scores. Extending it with the verdict id from step 1 is enough to see why a lead was held. A hosted trace product is optional and is not required for the gate. Do not add one until someone can read the log and still cannot answer "why was this held".

5. **Replay of the rubric and the checker on fixtures.** The tests in this change score fixed strings. A later eval set should be frozen emails plus the findings they must produce, run in CI against `scoreEmailQuality` and, separately, against a recorded rubric response. Do not call the live model in CI. Acceptance: a change that paints a known pitch as green fails the fixture.

Must-have before calling the agent enforced: 1, 2, and 5. Optional and not justified by a reproduced bug: a new agent framework, a sandbox, a vector store, a second model that approves the first. The deterministic card is the gate. The model rubric is an additional opinion with a published threshold, not a truth check.

Rollback of the built gate is reverting the send condition to blockers only. Rollback of a future step table is leaving the rows in place and ignoring them; the send lock does not depend on them.

No capacity, price, or latency number is claimed. The workload assumption behind step 2 is the current per-lead loop inside one edge request, which already has `AGENT_MAX_ATTEMPTS` of 4. Whether that request fits the platform's time limit on a large inbox was not measured here.

## What a real reply rate would require

After a publish, on a staging mailbox, a person would send two variants that the card scored, keep the body hash and the verdict, and later count human replies that are not auto-responders. The unit tests in this change do not do that and cannot. No number from those tests is a reply rate.

## Limits

A green card means the deterministic rules found no blocker and no warning. It does not mean the email is true, relevant, or likely to be answered. A rubric score of 100 is the model agreeing with itself. Semantic falsehoods that are not an event, a quantity, a fake time, or a pain stated as known can still pass. Research that was never fetched is still not something this change can see in production until the new functions are published.

# Choosing which playbooks go in front of the model

## The number

Every email generation sends all ten GTM skills. Measured by running
`composeSkillContext` against the compiled bundle:

| skill | tokens | what it is |
|---|---:|---|
| outreach-messaging | 3,042 | R.E.P.L.Y. framework, value-first framing |
| b2b-cold-email-copywriting | 2,871 | principles, CTA shape, banned language, QA checklist |
| six-email-sequence | 2,158 | what each of six touches does that the last did not |
| cold-email-strategist | 2,106 | copy, **plus deliverability, warmup, SPF/DKIM/DMARC** |
| anti-ai-slop-writing | 1,376 | the style floor |
| objection-replies | 1,100 | answering a prospect who pushed back |
| frontal-messaging-templates | 675 | six first-touch shapes |
| email-writing-frameworks | 610 | five first-touch frameworks |
| cold-email-templates-34 | 488 | template library |
| cold-email-4-sequence | 444 | four-touch cadence |
| **total** | **14,869** | on every single email |

The goal changes the *order* and nothing else. An `introduction` and a
`proposal` receive byte-identical content in a different sequence.

For a first-touch cold email, roughly **5,800 tokens — 39% — is material about
something else**: how to answer an objection the prospect has not raised, what
email five of a sequence does, and how to configure DMARC.

## Why "just route by goal again" is the wrong fix

Routing by goal existed and was deliberately removed. `email-skills.ts` says
why, and it is right:

> These used to be filtered out by goal, which meant a "meeting" email never saw
> the frameworks and a "4ts" email never saw the strategist — each function
> effectively deciding which of the house rules applied to it.

That is the real hazard, and it is worse than a long prompt: a first touch and a
follow-up written under different subsets of the house rules do not read like
one company wrote them. Reinstating goal-based filtering reinstates that.

So the split is by **kind**, not by goal.

## The proposal

Classify each skill as one of three kinds, in the bundle itself rather than in a
table here that will drift.

**Invariant — always sent, never selected.** How this company writes: banned
language, brevity, CTA shape, proof rules, the style floor. Nothing may remove
these, which is the property the previous change was protecting.

- `anti-ai-slop-writing` (already the `STYLE_FLOOR`, already its own block)
- `b2b-cold-email-copywriting` (already `CORE`)

~4,250 tokens, unconditional.

**Alternatives — the model is told to read them and pick exactly one.** These
are shapes for the email being written. Carrying eight at once is what dilutes:
the instruction is "pick one", and the more there are the less any one of them
is actually followed.

- `email-writing-frameworks`, `frontal-messaging-templates` — first touches
- `six-email-sequence`, `cold-email-4-sequence` — position in a sequence
- `outreach-messaging` — advancing a conversation
- `cold-email-templates-34` — only when the request names a template

Selected by goal, exactly as `BY_GOAL` already does.

**Out of band — not about writing this email.** Sent only when the task is the
one they describe.

- `objection-replies` — for replying to a pushback, which is `analyze-reply`'s
  job, not `generate-email`'s. Its own description says "Covers the reply
  itself, not a new email needing writing."
- `cold-email-strategist` — carries real copy guidance, but also warmup,
  SPF/DKIM/DMARC and infrastructure. Split it, or send it only where its
  infrastructure half is wanted. Do not delete it: the copy half is good.

## Expected shape after

A first-touch introduction:

- invariant: ~4,250
- alternatives for that goal: ~1,285 (frameworks + frontal)
- plus `outreach-messaging` where the goal calls for it

Roughly **5,500–8,500 tokens instead of 14,869**, with nothing removed that
governs how the company writes.

## What must not regress

1. **No path gets a partial copy of the house rules.** This is the whole reason
   the last selection was removed. A test should assert that every goal in
   `BY_GOAL`, plus an unknown goal, receives every invariant skill.
2. **The style floor stays in its own block** under its own instruction. It is
   not a ninth shape to choose between; that is already documented in the file
   and is easy to undo by accident when restructuring.
3. **Adding a skill must not silently make it universal.** New skills declare
   their kind; an undeclared kind should fail the bundle check rather than
   default to "send it always", which is how the bundle reached ten.
4. **The size is asserted.** A test pinning the per-goal token count makes the
   next regression visible in CI instead of in a prompt nobody reads.

## What this will and will not fix

It will not, on its own, produce replies. 188 sends with zero replies and one
unsubscribe is not first explained by prompt composition — see the deliverability
and reply-detection findings, both of which are cheaper to check and more likely.

What it does fix is a specific, measured defect: the model is asked to pick one
framework and handed eight, and 39% of what it reads is about a different task.
That is worth correcting on its own terms, not as a reply-rate theory.

## Cost

One file, `_shared/email-skills.ts`, plus a kind declaration in the bundle
builder and tests for the four invariants above. No migration, no schema change,
no change to `generate-email`'s call site — `composeSkillContext(opts)` keeps
the same signature.

It changes the text of every email the product generates, which is why it is
scoped here first and why the regression list above is the important half.

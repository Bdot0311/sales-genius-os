# Agent reliability — scope

**Status: not built. For review.**

Last updated 2026-11-05.

The ask was infrastructure: sandboxes, clouds, somewhere real for the agents to
run. After reading the agent path, that is not what is wrong, and buying it
would not move the number. What is wrong is smaller, more specific and more
embarrassing: **the agent is asked to write about companies it knows nothing
about, and nothing stops it.**

---

## 1. Why it hallucinates

Four findings, all from this repository.

### 1.1 It drafts with no facts, by design, and the design is wrong

`agent-run/index.ts` researches a prospect before writing. Every failure path
in `researchBlockForLead` returns an empty string, and the comment above it
says what was intended:

> Failure is silent — a draft without research is still a draft, it just makes
> no site-specific claims.

**Nothing implements the second half of that sentence.** The empty string is
passed into the prompt and the model is still instructed to write a
personalised first touch. A language model asked to personalise with zero
facts does not decline. It invents.

That is the hallucination engine. Not the model, not the prompt wording: the
system hands it an impossible instruction and ships the result.

### 1.2 The research fails far more often than anyone thinks

`docs/ENVIRONMENT.md`, written by us, says **Silent** against provider after
provider:

| Provider | Documented behaviour when it fails |
|---|---|
| Parallel | Silent. Web research skipped, falls back to the prospect's own site |
| Context.dev | Silent. Contributes nothing |
| Bloomberry | `{detected: false}` with a 200 |
| PredictLeads | `{detected: false}` with a 200 |
| Railway lead chain | Drops a leg and the next one answers |

And a missing key is indistinguishable from an exhausted one: both produce an
empty result and a 200. So 1.1 fires whenever a key is unset, a wallet is
empty, a subscription lapses, or a credential has a trailing space — which has
happened twice on record.

The two findings compound. Research quietly returns nothing, generation
quietly proceeds, and the output looks exactly like a working system.

### 1.3 The unattended path has fewer checks than the supervised one

`_shared/claim-check.ts` exists. It compares what the agent says it did against
the tool events that would make that true, and appends a correction when the
claim has nothing behind it. Its own header says:

> Shared so agent-run gets the same treatment as agent-chat. The unattended
> path having fewer checks than the supervised one was backwards.

**`agent-run/index.ts` does not import it.** Only `agent-chat` does. The
sentence describes an intention that was never wired.

So the agent a person is watching gets its claims checked, and the agent
running overnight does not. That is precisely backwards, and it is precisely
the thing being told to customers: that it works while you sleep.

### 1.4 The evals test obedience, not truth

`_shared/agent-scenarios.ts` scores whether the agent picks the right tool:
drafts instead of sending, touches only the named record, stays read-only on a
question, stops for approval. Those are good tests of behaviour.

**Not one of them tests whether the content is true.** There is no scenario in
which the agent is given a lead it has no research for and expected to decline.
Nothing fails when it makes something up, which is why making things up has
never been caught by the test suite.

---

## 2. Why sandboxes are the wrong purchase

The agent's tools read and write rows and send email. It does not execute
arbitrary code, so there is no untrusted code to contain. A sandbox is the
right answer to "the agent might run something dangerous" and this agent
cannot.

Spending on sandboxes, bigger models, or a hosted agent platform would leave
all four findings above exactly as they are. Worth saying plainly before any
money moves.

---

## 3. The fixes, by effect per hour

### Fix 1 — Refuse to write without facts

The single highest-value change, and the smallest.

When the research block is empty, do not draft a personalised first touch.
Three outcomes, in order of preference:

1. Queue the lead for research and move on. It is not ready.
2. If research cannot be obtained, draft from the **category** only, with no
   company-specific claim, and label the draft as such so it is visibly
   different.
3. Never produce something that looks researched and is not.

The current behaviour is the worst available: output indistinguishable from a
researched draft, containing invented facts, sent unattended.

### Fix 2 — Make provider failure loud

`researchBlockForLead` should return a reason, not an empty string, and the
caller should act on it. Same for the providers underneath: a 200 with no data
and a 200 with real data must not be the same value to the code above.

This is the same gap as the provider-headroom finding: exhaustion and
misconfiguration are currently invisible. Fixing it here fixes it for lead
search too.

### Fix 3 — Wire the claim check into the unattended path

`claim-check.ts` is written, tested and imported by exactly one caller. Import
it in `agent-run`. Its own documentation already says this should have
happened.

### Fix 4 — Make every specific claim traceable

Extend the research brief so each observation carries its source, then check
generated copy against it: a company-specific claim that does not appear in the
brief is a fabrication, and the draft is regenerated or rejected rather than
sent.

This is the real anti-hallucination control. The three above stop the agent
writing fiction when it has nothing; this one catches fiction when it has
something and embellishes.

### Fix 5 — Evals that fail on invention

Add scenarios that supply a lead with no research and fail if the output
contains a company-specific claim. Build a golden set from real leads where
the brief is known, and score drafts for unsupported claims.

Until a test fails when the agent makes something up, nothing stops it coming
back.

---

## 4. The infrastructure worth adding

Modest, and mostly free.

| Tool | Cost | What it buys |
|---|---|---|
| **Langfuse** | MIT, free self-hosted; free Hobby cloud tier | Traces of every agent turn, datasets, eval runs, prompt versioning. The one genuinely missing piece |
| **Cloudflare AI Gateway** | Free tier, **already wired** in `_shared/ai-gateway.ts` | Spend analytics, caching, rate limiting. Check whether traffic actually points at it before building anything else |
| **Promptfoo** or **DeepEval** | Open source, free | Runs the eval set in CI so a regression fails a PR |

Prices move and the search that produced these disagreed with itself on
Langfuse's paid tiers, so confirm on the vendor's own pricing page before
committing. The self-hosted MIT core being free is the part that matters here.

What is deliberately **not** on this list: a sandbox provider, a hosted agent
framework, a bigger model, a vector database. None of them address findings
1.1 to 1.4.

---

## 5. Phases

| # | Phase | Depends on | Effect |
|---|---|---|---|
| 1 | **Refuse to write without facts** (Fix 1) | — | Removes the largest source of invention immediately |
| 2 | **Loud provider failure** (Fix 2) | — | Makes 1.2 visible; shares work with the provider-headroom panel |
| 3 | **Claim check on agent-run** (Fix 3) | — | Stops the overnight agent reporting work it did not do |
| 4 | **Tracing** — Langfuse, or confirm the AI Gateway is live | — | Without this, "is it better" is unanswerable |
| 5 | **Grounding check** (Fix 4) | 2, 4 | Catches embellishment, not just invention |
| 6 | **Evals that fail on invention** (Fix 5) | 4, 5 | Keeps it fixed |

Phases 1 to 3 are each small and independent, and together they address the
majority of what is visible to a user today.

---

## 6. How to know it worked

No number exists today, which is why the problem has been arguable. Before
phase 1, measure:

- What share of drafts are generated with an empty research block
- What share of generated emails contain a company-specific claim absent from
  the brief
- How often each provider returns empty

The first of those is probably large, and is probably the whole story.

---

## 7. Needed from the founder

1. Approval of this scope, or amendments.
2. A decision on Langfuse: self-host, or the free cloud tier.
3. Nothing else. No spend is required to start phases 1 to 3.

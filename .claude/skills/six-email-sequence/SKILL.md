---
name: six-email-sequence
description: The six-touch cold sequence over twenty-one days, where each email has a job the previous one did not do. Use when writing or fixing a multi-touch outbound sequence, deciding what a follow-up should say, or diagnosing a sequence that gets opens but no replies.
---

# The six-email sequence

Six touches over twenty-one days. Each email has a job the previous one did
not do. That is the whole design.

**If an email could be deleted without the sequence losing anything, it should
not have been in it.**

## Two reasons sequences fail, and neither is the writing

1. **Every email says the same thing.** They read the first one and ignored it,
   so there is no reason to read the fifth — it carries no new information.
   That is not follow-up, it is repetition with a friendlier tone.
2. **The first email tries to win the whole argument.** Every proof point and
   benefit compressed into one message, on the theory that this is the only
   shot. The opposite is true: a first email is an anchor, not an argument.

```
MOST SEQUENCES   PITCH  PITCH  PITCH  PITCH   PITCH   PITCH
THIS SEQUENCE    ANCHOR MECHANISM PROOF VALUE COST    BREAKUP
```

## The four rules

1. **Each touch adds something new.** A new angle, proof point, or piece of
   value. Six emails repeating one idea is spam with better manners.
2. **Space creates respect.** Days 1, 3, 7, 11, 15, 21. Tight while you are in
   recent memory, widening as the sequence earns less attention. Bunching reads
   as pressure; weeks apart means starting from cold.
3. **Fifty to a hundred words.** Short enough to read on a phone and reply to
   in one line. A short email asks for a short answer, which is the only kind
   you get from a stranger.
4. **One call to action per email.** Two asks is zero asks — they resolve the
   ambiguity by doing nothing, which is the easiest option you handed them.

### Three tests that settle every edit

- **Sentence test** — remove any sentence. If the email still works, it should
  not have been there.
- **Email test** — remove any email. If nothing is lost, it was a nudge, not a
  touch.
- **Reply test** — read the last line aloud. If answering takes more than one
  line, the ask is too big for this stage.

## The nine merge fields

Map these once and the sequence runs unedited.

| Field | What goes in it | Example |
|---|---|---|
| `[FIRST_NAME]` | First name only | Sarah |
| `[COMPANY]` | Company name as they write it | Northfield |
| `[JOB_TITLE]` | Their role, plural-friendly | Head of Sales |
| `[SIGNAL]` | The observable thing that made you write | four open SDR roles posted this month |
| `[PAIN]` | The problem the signal implies | ramp time eating the quarter |
| `[MECHANISM]` | Why that problem happens | managers coaching four new starters at once |
| `[COMPARABLE]` | A similar company you have helped | a fifty-person SaaS team |
| `[METRIC]` | A concrete outcome from that comparable | cut ramp from five months to three |
| `[TRADE_OFF]` | The usual cost of fixing it, which you avoid | adding another manager |

**Two of the nine decide whether this works.**

- `[SIGNAL]` — reach past the obvious one. A signal any AI tool surfaces in
  fifteen seconds no longer reads as personal, it reads as automated.
- `[MECHANISM]` — the bridge from the public event to the private problem. This
  is the step tools consistently fail at. **If you cannot state it, you are
  opening with flattery.**

## The six emails

### Day 1 — The anchor
*Job: plant one hook and earn a reply. Not a decision, not a demo. A reply.*

> **Subject:** [SIGNAL]
>
> [FIRST_NAME],
>
> Noticed [SIGNAL].
> Teams doing that usually hit [PAIN] within a quarter, mostly because [MECHANISM].
> We got [COMPARABLE] past it without [TRADE_OFF].
>
> Worth fifteen minutes to compare notes?

The subject is the signal itself, so it could not have been sent to anyone
else. No signal? Open with `[PAIN]` in their own language and run the same
three lines.

### Day 3 — Sharpen the mechanism
*Job: add the second-order effect. Reply in the same thread, no new subject.*

> [FIRST_NAME], one more thing on this.
>
> The part that catches most [JOB_TITLE]s out is not [PAIN] itself, it is that
> by the time it shows up in the numbers it is already two quarters old.
>
> Is that something you have covered, or not on the radar yet?

A binary closing question is easier to answer than an open one, and either
answer is useful.

### Day 7 — Proof
*Job: one comparable, one outcome, no attachment.*

> **Subject:** how [COMPARABLE] handled this
>
> [FIRST_NAME],
>
> [COMPARABLE] had the same shape of problem.
> They changed one thing in how they onboarded, and [METRIC].
>
> Want the one-page breakdown? No call needed.

The ask is an offer, not a request for time. Accepting costs them nothing,
which is why offer-based CTAs beat meeting requests at this stage. The
comparable must be real and recognisable to them.

### Day 11 — Pure value, no ask
*Job: stop selling for one email.*

> **Subject:** not chasing, thought this was relevant
>
> [FIRST_NAME],
>
> Came across this and it is the clearest thing I have read on [PAIN]. The
> useful part is about a third of the way in.
>
> No reply needed.

**It must link to something you did not write.** Otherwise it is a pitch
wearing a coat. Skipping this email is the commonest edit and the costliest —
it is what buys email five a hearing.

### Day 15 — The cost of standing still
*Job: make the status quo expensive, and give them a clean way out.*

> **Subject:** the maths on this
>
> [FIRST_NAME],
>
> Rough numbers, using your headcount: [PAIN] is costing somewhere north of
> [FIGURE] a quarter. That is the cost of leaving it, not the cost of fixing it.
>
> If you have looked at it and decided to live with it, genuinely fine, say so
> and I will stop.

The figure has to be defensible. An invented number they can disprove in ten
seconds costs the whole sequence. Explicit permission to say no reliably
increases the rate at which people say yes.

### Day 21 — The breakup
*Job: close the loop cleanly and leave the door open.*

> **Subject:** closing this off
>
> [FIRST_NAME],
>
> Assuming this is not a priority right now, which is a fair call.
> I will stop here rather than keep turning up in your inbox.
>
> If [PAIN] moves up the list, reply to this thread and I will pick it straight
> back up.

The most-replied-to email in the sequence, because it removes the obligation to
engage. **No false urgency, no last chance, no expiring offer** unless it
genuinely expires — manufactured scarcity here is the most transparent move in
outbound.

## Fixed vs changed

**Fixed across every account:** the six-email structure, the job of each email,
the timing, the word count, the one-ask rule.

**Changed per account:** the signal, the pain, the mechanism, the comparable
and the metric — which must be theirs. Holding everything else steady is what
makes a weak result readable across accounts.

## Reading the numbers

Reply rate is the number to run the sequence on. Open tracking is unreliable
and pixels hurt placement; older benchmarks quoting 40-55% opens are legacy
context only.

| Metric | Weak | Normal | Strong |
|---|---|---|---|
| Reply rate | under 3% | 3-6% | above 6% |
| Meetings per 100 sends | under 0.5 | 0.5-1.5 | above 1.5 |
| Bounce rate | above 3% | under 2% | under 1% |
| Meeting show rate | under 70% | 70-85% | above 85% |

### Diagnosing a weak sequence

- **Healthy sends, weak replies** → targeting, not the message. Cut the list in
  half on your tightest filter and send to that half only. If the rate moves,
  it was never the copy. Rewriting copy first is the commonest wasted fortnight
  in outbound.
- **Healthy replies, few meetings** → the ask, not the copy above it. Look at
  emails three and five before touching email one. Replace the meeting request
  in three with the one-page offer.
- **Weak everything, bounces rising** → deliverability wearing a copy mask.
  Pause production two to three days, check placement per domain, resume at
  half volume.

## Fourteen ways to lose it

Treating email one as the whole pitch · two CTAs in one email · repeating one
value proposition six times · skipping email four because it does not ask for
anything · using a signal any tool surfaces in seconds · inventing the figure
in email five · mentioning the trigger and stopping · manufacturing urgency in
the breakup · asking for thirty minutes in email one · one mailbox on the
company domain · launching without three to four weeks of warm-up · sending
through a deliverability dip · leaving open tracking on and optimising against
a number that is not real · rebuilding the sequence per client, which destroys
any ability to compare across accounts.

The one that causes most of the others: **deciding the copy is the variable.**
It is the easiest thing to change and almost never the thing that is wrong.

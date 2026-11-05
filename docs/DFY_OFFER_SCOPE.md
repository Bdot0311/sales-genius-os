# Done-for-you offer — scope

**Status: approved 2026-11-05. Delivery process in
[DFY_DELIVERY_RUNBOOK.md](DFY_DELIVERY_RUNBOOK.md).**

Last updated 2026-11-05.

Every number below that is not a price from `stripe-config.ts` or a quoted
InboxKit cost is a **model, not a measurement**. Outreign has no baseline reply
rate, no meetings-booked figure, and no case study. That is the central fact
this document is built around, and the reason the founding cohort exists.

---

## 1. What the offer is for

**This is a proof engine that happens to produce revenue.** Founder's framing,
2026-11-05, and it changes how every decision below gets made.

The problem being solved is credibility, not cash flow. Outreign sells into a
crowded category against funded incumbents, from a solo founder with no logos
and no published numbers. Buyers discount a vendor's account of its own
results to roughly zero, which means the founder promoting it himself cannot
fix this no matter how much of it he does. Only a named third party can.

So the goals rank like this, and ties break downward:

| Rank | Goal | Notes |
|---|---|---|
| 1 | **Testimonials and use cases** | The asset. Named, with numbers. The copy rules forbid inventing any, so they can only be earned |
| 2 | **Users, via referral and reputation** | What the asset is spent on |
| 3 | **Revenue** | Welcome, and it funds the work, but it is not why this exists |

Two consequences follow, and both cut against a normal agency build:

- **Optimise for time-to-first-provable-win, not for margin.** A client who
  produces a quotable result in 30 days is worth more than one paying double
  who produces nothing for 90.
- **Select clients for whose name carries, and who will actually say so.** A
  great result from a client who refuses to be quoted buys nothing.

---

## 2. The binding constraint

Solo founder, no employees, no budget to hire. Delivery capacity is one person's
hours and nothing else.

That single fact kills the obvious version of this offer. A conventional
outbound agency sells hours. Selling hours when you have none, while also
building the product those hours depend on, is how the product stops shipping.

So the offer has to be designed around the autonomous agent doing the work, with
the founder on setup, judgement and QA. Concretely: roughly 4 to 8 hours of
setup per client, then 1 to 2 hours a week. **Five managed clients is the cap.**
Not a scarcity tactic, an arithmetic one.

---

## 3. What already exists

Nothing needs building to sell this. The Agency tier is already a DFY delivery
platform:

- **White-label client portal** and **branded PDF reports** — the client-facing
  surface of an agency engagement, already shipped
- **Elite Agent** — unlimited builds, unlimited sourcing, 500 auto-replies/day,
  fully autonomous, 5-minute delay
- **15,000 prospects/month**, 1,500/day
- **Email Quality Checker**, Payoff Bank and Campaign Briefs — the guardrails
  that stop an autonomous agent writing something embarrassing on a client's
  domain
- **Deliverability dashboard and warmup**, unified reply inbox with AI drafts

The gap between "we sell software" and "we sell outcomes" here is a pricing page
and a delivery process, not a roadmap.

---

## 4. The ladder

Three rungs. Each one is a complete offer, and each one feeds the next.

### Rung 1 — Launch. One-time, hand over the keys.

Build the outbound machine, prove it sends, hand it over. The client continues
on a self-serve plan.

In scope:
- 2 to 3 domains registered and authenticated (SPF, DKIM, DMARC, MTA-STS)
- 9 mailboxes on the client's own Google Workspace, connected, and warmed
  through the product's own warmup
- ICP defined and built in the product, fit and intent
- 3 sequences written to house style, loaded and A/B configured
- First campaign live and sending
- One 60-minute handover session, recorded

Out of scope: ongoing management, list refresh, reply handling.

**This rung is the one that produces SaaS users.** It ends with a client
operating the product on a Growth or Pro plan.

### Rung 2 — Managed. Retainer, we run it.

Everything in Launch, plus ongoing operation: list building, message iteration,
reply QA before the agent sends, monthly reporting through the white-label
portal.

**DFY is this rung.** Capped at five concurrent clients, and client six is
offered Launch or a waitlist seat, never a sixth Managed slot. Founder
decision, 2026-11-05.

That pairing is what makes the cap hold. A cap with no alternative gets broken
the first time someone turns up with money, because turning away revenue is
harder than promising to cope. With Launch as the overflow, nobody is turned
away and the cap never has to be argued about.

### Rung 3 — Agency partner. For firms reselling to their own clients.

An agency buys the Agency tier, we do the first client build with them, they
run the rest under their own brand using the white-label portal.

This rung compounds and the other two do not. One agency partner becomes a
recurring Agency-tier account plus a referral channel, with delivery hours that
stop after the first build.

---

## 5. Pricing and unit economics

### Version 1 ships without InboxKit

InboxKit provisioning is unsigned and its commercial terms are open, so nothing
here waits on it. **The client brings their own domains and mailboxes** — a
Google Workspace account at roughly $7 per mailbox per month, bought by them
and billed to them. We specify what to buy, then do the authentication, the
connection and the warmup through the product.

That is better for a v1 than it looks:

- No dependency on a partnership that is not yet agreed
- No infrastructure float carried on our side
- No exposure if the InboxKit terms land badly
- The offer can be sold this week

The cost is onboarding friction. A client has to go and buy Workspace before
anything starts, and that is the single most common place a setup stalls.
Removing that friction is exactly what InboxKit buys, which makes it a **v2
upgrade to this offer, not a prerequisite for it**.

### Cost to serve, per managed client per month

Modeled from our own list prices. Mailboxes are absent because in v1 the client
pays Google directly.

| Line | Cost to us |
|---|---|
| Mailboxes | $0 in v1, client pays Google ~$63–84 for 9–12 |
| Domains | $0 in v1, client buys, ~$45/yr |
| Platform (Growth $89 to Agency $249, by volume) | $89–249 |
| Lead data and enrichment at 2,000–3,000 prospects | unknown, assume $50–150 |
| **Total cost of goods** | **~$140–400** |
| Founder time | ~6 hours/month |

The spread is wide because one input is unknown: what a reveal actually costs
us at volume. That is the number to pin down, and it does not depend on
InboxKit.

### Proposed prices

| Rung | Price | Notes |
|---|---|---|
| Launch | **$1,500** one-time | Plus the client's own plan from month 2 |
| Managed | **$2,500/month**, 90-day minimum | Market rate for comparable outbound DFY |
| Agency partner | **$3,000** one-time + Agency tier | The build, then they run it |

At $2,500 against $200–520 of cost of goods, gross margin before founder time is
roughly 79 to 92 percent. At six hours a month that is a good use of the hours
that exist.

### Mailboxes are priced separately — decided

Mailboxes get their own pricing structure and are not folded into any plan
tier. Founder decision, 2026-11-05. This governs the future self-serve mailbox
product; in v1 of this offer the client buys their own, so it does not apply
yet.

The arithmetic supports it. Twelve InboxKit mailboxes cost $72–120, which is 29
to 48 percent of the $249 Agency tier before any other cost. Bundling even a
small allocation into a $39 Starter plan would put that plan underwater on its
own.

Two consequences worth stating now, before a pricing page implies otherwise:

- **Self-serve:** mailboxes are bought alongside a plan, never included in one.
  No tier advertises "includes N mailboxes."
- **DFY, once InboxKit lands:** the retainer should cover mailboxes rather than
  quoting them separately, because an agency engagement itemising
  infrastructure reads as nickel-and-diming. At $54–120 the margin absorbs it
  comfortably, and it removes the onboarding stall described above.

---

## 6. Founding cohort

The first five managed clients at **$1,500/month** instead of $2,500, on a
90-day commitment, in exchange for four things written into the agreement:

1. A named case study with real numbers
2. A recorded video testimonial at the end of the term
3. Logo rights on the site
4. **Three warm introductions** to comparable companies, due at day 60

The fourth is new and it is the one that compounds. Referral is the stated
route to users, so it belongs in the contract rather than left to goodwill
after the engagement ends. Five clients at three introductions each is fifteen
warm conversations from people who have already seen the product work.

That is a $3,000 discount over the term against four assets we cannot buy any
other way and are not allowed to fabricate.

**The cohort is also how the benchmark gets built.** Right now there is no
honest answer to "what reply rate should I expect", which means no performance
guarantee can be offered and no number can go in marketing copy. Five clients
over 90 days produces that answer. Price the discount as the cost of acquiring
data, because that is what it is.

---

## 7. Who to sell it to

Ranked by fit, not by size.

1. **Agencies and consultancies** — dev shops, design studios, marketing firms.
   They sell high-ticket, they hate prospecting, and the white-label portal
   means they become Agency-tier accounts and a referral channel. Best fit by a
   distance.
2. **B2B SaaS, seed to Series A** — budget exists, pipeline is the constraint,
   no SDR team yet. The most common buyer of this offer in the market.
3. **Recruiting and staffing firms** — outbound-native, high deal value, already
   believe in cold email.
4. **Fractional execs and boutique advisory** — need a handful of good
   conversations, very high LTV per client.

Deliberately not: anything requiring phone work. Outreign is email outbound
only, and the offer must not imply otherwise at any point.

---

## 8. Client zero runs in the background

An earlier draft made running the playbook on Outreign itself a prerequisite.
That was wrong, for the reason the founder gave: self-promotion is not getting
traction, and a vendor's account of its own results is the weakest evidence
available. Waiting on it would delay the only thing that does build trust.

So it runs in the background, continuously, and nothing waits on it. Its value
is product feedback, not proof.

### What does have to happen first

One bounded reliability pass, once, before a paying client's campaign depends
on the product. Not a 90-day self-campaign, a checklist:

- Sign in, sign up and password reset, on a fresh account
- Connect a Google mailbox end to end
- Build an ICP, run a search, reveal contacts
- Load a sequence and send a real first touch to a seat we control
- Confirm the reply lands in the unified inbox and the agent drafts a response
- Confirm the deliverability dashboard scores the mailbox

The reason is specific rather than cautious. Google sign-in was broken for
several days this week and cost customers. The same failure during a founding
engagement burns the testimonial that engagement exists to produce, and a
founding client who churns over a bug is worse than no founding client.

An afternoon of this is cheap insurance on an asset that cannot be bought.

---

## 9. Earning the testimonials

The copy rules are absolute on this, so the process has to be deliberate.

- **Capture the baseline on day zero.** What were they doing, what did it
  produce, what did it cost. Without this there is no before, and therefore no
  case study, only a screenshot. This is the step everyone skips and it cannot
  be reconstructed afterwards.
- **Ask at the first win**, not at the end. The first positive reply or first
  booked meeting is when enthusiasm is highest. A testimonial requested in
  month three gets a polite sentence.
- **Ask for specifics.** What outbound looked like before, what changed, which
  number moved. Generic praise converts nobody.
- **Named, with logo and title.** Anonymous testimonials are close to worthless.
- **Never draft it for them and never invent one.** Not a style preference, a
  founding principle.

---

## 10. Guardrails

1. **Five managed seats, hard.** The sixth client is the one that stops the
   product shipping.
2. **No meeting guarantees and no pay-per-meeting in v1.** There is no baseline
   to price that risk against. Revisit once the cohort has produced one.
3. **No promise to replace a suspended mailbox.** InboxKit give no such
   guarantee, so neither can we.
3a. **The refund guarantee is a window, never an outcome.** Full refund inside
   30 days, prorated after, infrastructure excluded. An outcome-based refund
   with no measured baseline is an unbounded liability: it lets a client define
   failure at day 90 and reclaim three months of delivered work. Protecting the
   reputation this offer exists to build is the point of refunding at all, and
   it only works if the refund cannot be used to recover a completed
   engagement.
4. **Each client on their own domains.** Reputation follows the domain, so one
   client's complaint rate never reaches another's.
5. **Written scope, in and out, per rung.** Outbound DFY scope creep is usually
   list building and reply handling.
6. **Kill criteria:** if delivery exceeds 10 hours in any week, stop selling and
   work the backlog down. If two consecutive cohort clients produce no positive
   replies in 30 days, the offer is wrong and stops until it is fixed.

---

## 11. Needed from the founder

1. Approve or amend the three rungs and the prices.
2. Approve the founding-cohort discount and its terms.
3. Run the reliability pass in section 8 before the first paying engagement.
4. Decide the first channel for selling the offer itself.
5. Confirm the referral clause in section 6 is acceptable to put in a contract,
   since it is the mechanism the user-growth goal actually rests on.

---

## 12. Open questions

- What does a reveal actually cost us at 2,000–3,000 prospects per month? Cost
  of goods cannot be pinned down without it.
- Is InboxKit warm-up included in the pre-warmed price? Open in the InboxKit
  scope. It does not block v1, and only matters when mailbox provisioning moves
  in-house.
- Does the Launch rung cannibalise Managed, or feed it? Worth watching across
  the first cohort rather than guessing now.
- Is there an agency partner already in the audience who would take Rung 3
  first? That rung compounds and the others do not, so starting there would be
  worth more than starting at the top of the list.

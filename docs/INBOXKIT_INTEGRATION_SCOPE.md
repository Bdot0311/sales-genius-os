# InboxKit integration — build scope

**Status: not built. Awaiting approval.**

Last updated 2026-11-04, incorporating InboxKit support's answers of 2026-11-03.
Nothing in this document has been implemented. It exists to be approved, amended
or rejected before any code is written.

---

## 1. What this buys

Today a customer cannot send from OutReign until they have bought a domain,
configured SPF/DKIM/DMARC, created mailboxes at Google or Microsoft, and
connected each one. Most never finish. InboxKit sells that whole chain through
an API, so the path becomes: pick a plan, pick a sending volume, start sending.

The product claim this unlocks is "everything in house" — domains, mailboxes,
warm-up, sending, reply detection — with no third-party provider for the
customer to configure.

---

## 2. Unit economics

All figures are InboxKit's quoted costs to us, not customer prices.

Confirmed in writing by InboxKit, 2026-11-05. This supersedes the earlier
quote, which was materially worse.

| Item | Cost |
|---|---|
| Fresh mailbox, Google or Microsoft | $3 / month, **$2.70 from ~450 mailboxes** |
| Warm-up on a fresh mailbox | +$3 / month, optional |
| **Pre-warmed, any age** | **$4.50 / month flat, warm-up included** |
| Domain transfer fee | **None from InboxKit.** The receiving registrar charges, per domain |
| Domain registration | billed annually, non-refundable |
| Azure tenant, Microsoft only | $30 / month per tenant, up to 100 mailboxes |

### Pre-warmed is no longer the expensive option

The $6/$7/$9 bands are gone, replaced by $4.50 flat with warm-up included.
That inverts the earlier conclusion: **pre-warmed is now cheaper than fresh
plus warm-up ($6), and ready on day one instead of in two to four weeks.**
Strictly better on both axes, where stock exists.

### The cheapest option is one we can already build

| Option | Per mailbox | 9 mailboxes | Ready | Stock risk |
|---|---|---|---|---|
| Pre-warmed, warm-up included | $4.50 | $40.50/mo | day 1 | **Yes — the last batch sold out in 3 days** |
| Fresh + InboxKit warm-up | $6.00 | $54.00/mo | 2–4 weeks | none |
| **Fresh + our own warm-up** | **$3.00** | **$27.00/mo** | 2–4 weeks | none |
| Fresh + our warm-up, at 450 mailboxes | $2.70 | $24.30/mo | 2–4 weeks | none |

At 50 customers, roughly 450 mailboxes, running our own warm-up on fresh
mailboxes costs **$14,580/year against $24,300** for pre-warmed. That is
**$9,720/year**, and the missing piece — `warmup-orchestrator` — is already
built.

Two things argue the other way, and neither is small. Our warm-up is unproven
at this scale, and warming badly is worse than not warming. And pre-warmed
carries real sending and receiving history, which no warm-up system can
manufacture. The guard in section 5 still applies either way: whichever
warm-up runs, the other must be off.

### Decided: take the $4.50 tier, revisit $2.70 at scale

Both questions answered 2026-11-05. Fresh with their warm-up is $4.50 all-in
for us rather than $6, and running our own warm-up on fresh mailboxes at
$2.70 is explicitly supported.

| Path | Per mailbox | 9 mailboxes | History on day 1 | Stock risk |
|---|---|---|---|---|
| Fresh + our warm-up | $2.70 | $24.30/mo | no | none |
| Fresh + their warm-up | $4.50 | $40.50/mo | no | none |
| Pre-warmed | $4.50 | $40.50/mo | **yes** | sold out in 3 days |

**The $4.50 tier self-heals on stock.** Pre-warmed and fresh-with-their-warm-up
now cost the same, so when inventory runs out the fallback costs nothing extra
and only gives up the sending history. That removes the reason to design
around stock at all.

**Our own warm-up is the wrong choice today, and the reason is in our own
code.** `warmup-orchestrator`'s first line says opted-in mailboxes "send each
other short, natural emails … the way Instantly/Smartlead pools do". Three
consequences:

1. **The pool is other cold-outreach senders.** A curated pool of ordinary
   high-reputation accounts is structurally better than one assembled from
   domains that are themselves cold-emailing, whoever runs it.
2. **It does nothing while the pool is thin.** `if (eligible.length < 2)` it
   returns idle, correctly refusing to fake traffic. Pre-launch that means
   fresh mailboxes arrive in front of paying clients effectively unwarmed,
   which is the worst outcome at any price.
3. **Customers warm against each other.** One client's mailbox sends warm-up
   mail to another's. A client who gets flagged is then a flagged sender
   mailing other clients' inboxes. An external pool has no such path.

**The saving is not available yet, and arrives exactly when it becomes
usable.** $9,720/year is the difference at 450 mailboxes — which is also
roughly the point at which our own pool is large enough to warm properly. So
nothing is lost by starting at $4.50 and revisiting.

**Per DFY customer the difference is $16.20/month**, under 1% of a $2,500
retainer either way. It is not a DFY decision at all. It only matters for a
self-serve mailbox product sold on thin margin, and that is the decision to
reopen at scale.

### Annual rates, offered 2026-11-05

| Path | Monthly | Annual | Saving |
|---|---|---|---|
| Fresh + our warm-up | $2.70 | **$2.30** | 15% |
| Fresh + their warm-up | $4.50 | **not quoted** | — |
| Pre-warmed | $4.50 | **$3.50** | 22% |

Pre-warmed takes the larger discount, so **the gap between the two strategies
narrows from $9,720 to $6,480 a year** at 450 mailboxes. The recommendation
above gets cheaper to follow, not dearer. Pre-warmed on an annual rate is only
$0.80 per mailbox above fresh on the monthly one.

Per DFY customer it is $10.80 a month between them, still under 1.3% of a
$2,500 retainer either way, so it remains a self-serve question rather than a
DFY one.

**Two things this offer does not say, and both matter more than the discount.**

**What is committed?** We have no customers on this yet. "Annual deal" can
mean a locked rate with volume flexing month to month, a committed mailbox
count, or a year paid up front. The first is free money. The second is a bet
on sales not yet made: 450 mailboxes at $3.50 is **$18,900 committed** against
zero current revenue, and 90 mailboxes — ten customers' worth — is still
$3,780. The monthly rates of $2.70 and $4.50 are already agreed with no
commitment, so there is no pressure to answer this quickly.

**What does the stock-out fallback cost?** On monthly pricing pre-warmed and
fresh-with-their-warm-up were both $4.50, so running out of inventory cost
nothing extra and gave up only the sending history. Annual quotes $3.50 for
pre-warmed and $2.30 for bare fresh, and says nothing about fresh with their
warm-up. If that is not also $3.50, the self-healing property described above
does not survive the move to annual, and stock becomes something the product
has to design around again.

### Monthly or annual to start: monthly, unless annual means a locked rate

The 22% discount is the smaller number in this decision. What decides it is
whether annual commits a mailbox count.

**If annual is a locked rate and volume still flexes month to month**, it is
strictly cheaper at every volume and should be taken immediately. $3.50 beats
$4.50 on whatever we actually use, with nothing given up.

**If annual commits a mailbox count** (or prepays a year at one), the discount
has to beat the mailboxes we pay for and do not resell:

| | Cost over 12 months |
|---|---|
| Annual, committed to `N` mailboxes | `N` × $3.50 × 12 = **$42N** |
| Monthly, averaging `U` mailboxes in use | `U` × $4.50 × 12 = **$54U** |

Annual wins only when `$42N < $54U`, i.e. when **average utilisation stays
above 78% of the committed count for the whole year**. Starting from zero
customers, it will not.

Worked against the DFY ramp — five managed clients at nine mailboxes each, one
landing every other month, reaching the 45-mailbox cap in month nine:

| | Mailbox-months billed | Cost |
|---|---|---|
| Monthly at $4.50 | 360 (what we use) | **$1,620** |
| Annual committed at 45 | 540 (the cap, all year) | **$1,890** |

**Annual costs $270 more over the year despite the 22% discount**, because it
bills eight months of capacity that has no customer in it. A slower ramp makes
the gap worse, not better.

And the discount is small in absolute terms where we actually are: at 45
mailboxes it is **$45 a month**. That is not worth a twelve-month commitment
discussion.

**Their own note that prices get rearranged as volume grows argues the same
way.** The rate we could lock today is the rate for pre-launch volume. Both
improvements so far — $2.70 on fresh and $4.50 flat on pre-warmed — came from
asking, and are applied manually on our account rather than by the API. Locking
a pre-launch rate for twelve months trades away that flexibility at exactly the
point where the base is smallest and the renegotiation upside is largest.

**Decision: start monthly at $4.50.** Move to annual only if they confirm it is
a locked rate with volume flexing monthly, or once real utilisation is high
enough that 78% of a committed count is a safe floor.

### Worth one question before committing

Their warm-up is pitched as "a premium pool with dedicated IPs and a private
network of high-reputation accounts we manage directly". That is plausible
and standard for the category, and it is also unverifiable from here. Whether
those accounts are real businesses or ones they created matters: providers do
detect synthetic warm-up networks, and the cost of that lands on our
customers' domains, not on InboxKit's. One line asking how the pool is
composed is cheap diligence, not distrust.

"Warm-up is included" was said about pre-warmed pricing. Fresh is quoted at
$3 and $2.70 with no mention of warm-up, and the earlier answer had it as a
separate $3 subscription. Worth one line of confirmation, because it decides
whether option B above costs $6 or $3.

**The $2.50 partner rate is not live.** InboxKit: "must be approved and
configured on your account; until then, the dashboard and API will continue
returning 3 credits." Our account currently reports
`credits_per_google_mailbox: 3`, which matches. Treat $2.50 as an open
negotiation, not a price.

Wallet: 1 credit = US$1, credits do not expire.

### Worked example — 3 domains x 3 mailboxes

| Option | Monthly | One-time |
|---|---|---|
| Fresh + warm-up | 9 x $6 = **$54** + ~$3.75 amortised domains ≈ **$58** | — |
| Pre-warmed 4–8 weeks | 9 x $7 = **$63** | **$45** transfer fees |

### Capacity is the binding constraint, not cost

InboxKit recommends starting pre-warmed mailboxes at **10–15 campaign emails
per mailbox per day**, increasing only once placement, bounces and complaints
look healthy. Nine mailboxes is therefore **90–135 emails/day** at the start.

A customer wanting 1,000 emails/day needs roughly 25–70 mailboxes depending on
ramp state: **$150–700/month of raw cost**. Flat-rate pricing cannot survive
that. Customer pricing has to be per-mailbox or per-volume.

### Microsoft only pays off at scale

The $30 Azure tenant fee amortises to $6/mailbox at five mailboxes and
$0.30/mailbox at a hundred. Below roughly 30 mailboxes per tenant, Microsoft
costs more than Google and buys nothing but inbox-provider diversity. Offer it
as an explicit upgrade at volume, not as a default.

---

## 3. Commercial items that block billing

InboxKit stated plainly that partner pricing, volume tiers and any reseller
agreement "should be confirmed in writing by our partnerships team before you
build billing around them." Until each line below is answered, the billing
phase cannot be costed, and phase 5 should not start.

| Question | Why it blocks | Status |
|---|---|---|
| Is warm-up included in the pre-warmed price, or additive? | Swings the 9-mailbox example from $63 to $90/month, a 43% change in cost of goods | **Open** |
| Is the $15 transfer fee per domain or per mailbox? | 3x difference on setup cost at 3 mailboxes/domain | **Open** |
| ~~$2.50 partner rate~~ | **Settled.** $2.70 from ~450 mailboxes with no minimum commitment, moving to $2.50 at higher volume. Rates are applied manually on our account, not by the API, and tiers count active mailboxes per month — one message on crossing a threshold | **Closed** |
| ~~Reselling~~ | **Confirmed in writing**: reselling under our brand, billed by us, is permitted. **We are the customer of record for provider suspensions, and end users come to us for support** — that liability is ours, not the customer's, and section 5 carries it | **Closed** |
| ~~Pre-warmed replenishment~~ | **Answered, and it is a constraint.** Restocked irregularly; the last batch sold out in **3 days**. Treat as buy-when-available, never as something a start date can depend on | **Closed** |
| ~~Customer-facing OAuth consent~~ | **Confirmed**: single-mailbox consent works with no domain-wide delegation and no admin registration. Our existing Google connect flow covers these mailboxes, and the app-password/IMAP route drops to a fallback | **Closed** |
| Does fresh still cost +$3 to warm? | Decides whether fresh-plus-their-warm-up is $6 or $3, and whether running our own warm-up saves $9,720/year at 450 mailboxes or nothing | **Open** |
| May we run our own warm-up on their fresh mailboxes? | The $9,720/year question. Our `warmup-orchestrator` already exists | **Open** |
| Volume tiers | Determines whether margin improves with scale or stays flat | **Open** |
| Reseller agreement | Determines whether we can resell at all, and on what terms | **Open** |
| Pre-warmed replenishment lead time | Determines whether "out of stock" is a minutes or weeks problem, which changes the fallback UX | **Open** |

---

## 4. Architecture

### 4.1 Billing: Stripe to InboxKit wallet

Confirmed viable. InboxKit supports pre-funding a wallet and drawing from it
automatically with `use_wallet_balance: true`, plus configurable auto top-up.

The flow is therefore:

1. Customer pays us through Stripe for a plan that includes N mailboxes.
2. We keep the InboxKit wallet funded above a threshold, via auto top-up and a
   low-balance alert of our own.
3. Provisioning draws from the wallet with no payment step per order.

This means **we carry the float**, not the customer, and a failed Stripe charge
does not automatically stop an InboxKit renewal. A customer who stops paying
keeps costing us until we cancel their mailboxes, and cancellation is not
immediate (see 4.9). Dunning has to cancel mailboxes, not just revoke app
access.

### 4.2 Customer isolation: workspaces

InboxKit workspaces give each customer their own wallet, domains, connections
and reporting. We store an InboxKit `workspace_id` per account.

Worth recording what this does **not** do: InboxKit were explicit that "sender
reputation is ultimately determined by the underlying domain, tenant, mailboxes
and provider, not merely the workspace boundary." Isolation here is operational
and billing-level. Reputation isolation comes from each customer having their
own domains, which they do.

### 4.3 Provisioning: asynchronous

Orders return mailboxes in `scheduled` status. Completion arrives via the
`mailbox.status_changed` webhook, with a status endpoint as fallback. Typical
completion is minutes; pre-warmed hand-over is also minutes when stock exists.

This replaces the re-fetch polling approach in the earlier draft. We need:

- a new edge function to receive `mailbox.status_changed`, gated by a shared
  secret in the same style as `ingest-dmarc-report`
- a `scheduled -> active -> failed` state machine on our mailbox rows
- a reconciling poll for webhooks that never arrive, since a dropped webhook
  otherwise strands a paid-for mailbox in `scheduled` forever

Provisioning must throttle to **10 bulk-provisioning requests/minute**. The
standard limit of 5,000/minute is not a concern. Honour the returned
rate-limit headers and back off exponentially on 429.

### 4.4 Credentials

**The `secret` field is not the SMTP password.** InboxKit: "the decrypted
secret for 2FA or secondary authentication." Mailbox credentials come from a
separate credentials endpoint.

Provisioning is therefore two calls, not one, and the credentials land in the
same encrypted path that `_shared/save-integration.ts` already uses. They must
never reach a browser-readable row — the existing rule about credential-bearing
rows applies unchanged.

### 4.5 Connecting a mailbox

InboxKit say a customer-facing consent flow is supported, and separately that
domain-wide access needs the client ID registered with delegated Gmail scopes
in Google Admin. Those are two different things and their answer ran them
together.

If ordinary per-mailbox OAuth consent works, our existing Google connect path
covers InboxKit mailboxes with no new code, and the app-password/IMAP route
drops to a fallback. That is a large difference in scope, so **phase 1 is a
single-domain pilot that answers it**, which is also what InboxKit recommend.

If it does not work, the fallback is app passwords over SMTP/IMAP.
`_shared/smtp-client.ts` already supports `AUTH PLAIN`/`LOGIN` over required
STARTTLS with an injected transport, so the sending half is largely in place.
It has no XOAUTH2 yet.

Hosts are standard and are not always returned in the order response:

- IMAP `imap.gmail.com:993`, SSL/TLS
- SMTP `smtp.gmail.com:587` STARTTLS, or `465` SSL/TLS

For Microsoft, design around OAuth2. Do not assume password-based IMAP works.

### 4.6 Reply detection

Unchanged from the earlier plan and confirmed workable: one IMAP path serves
every provider, rather than three vendor-specific API integrations.

### 4.7 Warm-up: ours must stand down

InboxKit confirmed their warm-up keeps running after purchase, and agreed that
"two warm-up systems should never run simultaneously."

Therefore `supabase/functions/warmup-orchestrator/index.ts` must skip any
mailbox provisioned through InboxKit while InboxKit warm-up is enabled. This is
a correctness requirement, not a preference: two systems warming one mailbox
produces erratic patterns to the receiving provider.

Their background warm-up traffic also counts against the mailbox's total
volume, so our per-mailbox daily caps must be set *below* the provider limit,
not at it.

### 4.8 Health scoring

`src/lib/reputation.ts` sets `MIN_VOLUME_FOR_SCORE = 20`, and
`AccountHealthGrid.tsx` renders "{volume} of 20 sends needed before a
reputation score can be calculated."

A freshly bought 8-week pre-warmed mailbox has real sending history and is
likely the healthiest inbox in the account, but it has zero sends *through us*,
so it would render as unscored and look like the weakest. That is actively
misleading at the exact moment a customer is deciding whether the purchase
worked. Pre-warmed mailboxes need either an imported baseline or distinct
copy.

### 4.9 Cancellation

API deletion **schedules** cancellation. The mailbox stays active until the end
of the paid period, there is no refund or credit for unused days, and mail
should be backed up before cancellation completes.

Our UI and agent tools must say "cancels at period end", never "removed".

### 4.10 Agent tools

Per the repository rule, every outbound feature a user can act on ships with
matching read and edit agent tools in the same change, registered in
`_shared/agent-tool-scope.ts`, the tier caps, and the custom-build picker in
`src/components/agent/AgentRoles.ts`, with `src/lib/agent-tool-coverage.test.ts`
enforcing the wiring.

So mailbox provisioning needs agent tools from day one: list inventory, check
availability, read mailbox status, read credentials status (never the
credential), and schedule cancellation — with the guard in section 5 applying
to the agent tools as strictly as to the UI.

---

## 5. Hard guards

These are not configuration. Each one has to be impossible to reach.

1. **Never cancel an administrator mailbox.** InboxKit: "cancelling one can
   affect the entire domain setup." A confirmation dialog is not sufficient;
   the UI and the agent tools both refuse, and only a deliberate
   domain-level teardown path can touch it.
2. **Never run our warm-up on an InboxKit mailbox with InboxKit warm-up
   enabled.** Enforced in `warmup-orchestrator`, not by convention.
3. **Never promise replacement for a suspended mailbox.** InboxKit give "no
   blanket replacement or credit guarantee for provider suspensions caused by
   sending behaviour, complaints, or policy enforcement." Our copy must not
   imply otherwise.
4. **Never describe deletion as immediate or refundable.**
5. **Never write mailbox credentials to a browser-readable row.**

---

## 6. Testing, with no sandbox

InboxKit confirmed there is no sandbox and no free test credits. They recommend
a minimal live pilot kept in an isolated workspace.

- Unit and integration tests use an injected transport throughout, as
  `_shared/smtp-client.ts` already does. No test reaches InboxKit.
- One paid pilot workspace, roughly $25 one-off, covers the live paths. That
  spend has to be approved before phase 1.
- Pre-warmed availability responses can be cached in `api_cache`, the same
  table and TTL pattern the ATS board probes use, so development does not
  hammer a rate-limited endpoint.

---

## 7. Phases

Each phase is independently shippable and independently abandonable.

| # | Phase | Depends on | Notes |
|---|---|---|---|
| 1 | **Single-domain pilot.** Buy one pre-warmed mailbox by hand, answer the OAuth consent question, confirm IMAP and SMTP, read the credentials endpoint | ~$25 approved spend | Decides the shape of phases 2–4. Do not skip |
| 2 | **Provisioning core.** Order, webhook receiver, state machine, reconciling poll, credential storage, throttling | 1 | No UI |
| 3 | **Connect + send.** Wire provisioned mailboxes into the existing sending and reply paths; warm-up orchestrator guard | 2 | The guard ships here, not later |
| 4 | **Pre-warmed purchase flow.** Availability check, buy, sold-out fallback, domain transfer fee handling | 2 | First-come with no reservation endpoint, so the race is real |
| 5 | **Billing.** Stripe to wallet, auto top-up, low-balance alerting, dunning that cancels mailboxes | Section 3 answered in writing | Blocked on commercial terms |
| 6 | **Health and reporting.** Pre-warmed baseline handling, per-mailbox caps that account for warm-up traffic | 3 | |
| 7 | **Microsoft.** Azure tenant handling, OAuth2-only connection, the 30-mailbox threshold surfaced in pricing | 3 | Only worth building once a customer needs it |

Phases 1–4 can proceed while section 3 is unanswered. Phase 5 cannot.

---

## 8. Needed from Brandon

1. Approval of this scope, or amendments.
2. Approval of ~$25 for the phase 1 pilot.
3. A decision on how to answer InboxKit's volume question. We cannot
   forecast a monthly total before launch. What we can give them is the
   unit shape — roughly 9 mailboxes per customer, so 10 customers is ~90
   mailboxes and 50 is ~450 — and ask for the tier table plus whether a
   rate applies automatically on crossing a threshold or needs manual
   approval each time. If they want a commitment to unlock $2.50, let them
   propose the structure: a minimum monthly spend, a ramp, or a 90-day
   review.
4. Written confirmation from InboxKit of the items in section 3.
5. A decision on customer pricing shape — per-mailbox or per-volume — once the
   warm-up question in section 3 is answered.

---

## 9. Source

InboxKit support, 2026-11-03, answering a 21-question list covering pricing and
billing, pre-warmed inventory, and API behaviour. Quoted phrases in this
document are theirs. Nothing here has been verified against their API beyond
read-only calls to our own account.

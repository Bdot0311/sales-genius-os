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

| Item | Cost |
|---|---|
| Fresh mailbox, Google or Microsoft | $3 / month |
| Warm-up | +$3 / month, optional |
| Pre-warmed, 2–4 weeks history | $6 / month (replaces the $3 mailbox fee) |
| Pre-warmed, 4–8 weeks history | $7 / month |
| Pre-warmed, 8+ weeks history | $9 / month |
| Domain transfer, pre-warmed inventory | ~$15 one-time for a `.com` |
| Domain registration | billed annually, non-refundable |
| Azure tenant, Microsoft only | $30 / month per tenant, up to 100 mailboxes |

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
| $2.50 partner rate | They require our expected initial and ongoing monthly mailbox volume to approve it | **Open — needs a number from us** |
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
3. Expected initial and ongoing monthly mailbox volume, so InboxKit's
   partnerships team can approve the $2.50 rate.
4. Written confirmation from InboxKit of the items in section 3.
5. A decision on customer pricing shape — per-mailbox or per-volume — once the
   warm-up question in section 3 is answered.

---

## 9. Source

InboxKit support, 2026-11-03, answering a 21-question list covering pricing and
billing, pre-warmed inventory, and API behaviour. Quoted phrases in this
document are theirs. Nothing here has been verified against their API beyond
read-only calls to our own account.

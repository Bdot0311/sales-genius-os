# AppSumo licensing

Submission 236273 uses subscription licensing, not lifetime access. Tier 1 maps to Starter (1,000 credits), tier 2 to Growth (2,500), tier 3 to Pro (5,000), and tiers 4 and 5 to Agency (15,000). Done-for-you services are not automatically delivered by a license event.

## Public endpoints

- `appsumo-webhook`: accepts AppSumo HMAC-SHA256 signed lifecycle events, using the timestamp followed by the exact raw body. Requests outside five minutes and malformed signatures fail with HTTP 401. Purchase alone grants no access.
- `appsumo-redirect`: GET without a code returns HTTP 200. With a code, exchanges it server-side at AppSumo, retrieves the license, then signs a linked user in or issues a short-lived, single-use redemption claim. Test licenses return confirmation without creating a real account or granting access.
- `appsumo-account`: requires a verified OutReign session. Redeems a claim for that user; support lookup requires the protected admin role. Client input cannot choose the owner or update a tier.

URLs are registered with AppSumo. Runtime credentials (`APPSUMO_PRIVATE_KEY`, `APPSUMO_CLIENT_ID`, `APPSUMO_CLIENT_SECRET`) and the registered `APPSUMO_REDIRECT_URL` exist only in the encrypted server configuration. Do not put their values in this document, browser code, committed environment files or logs.

## Durable state

`appsumo_licenses` keeps every license identifier, owner, tier, inactive/active state, previous and parent identifiers, test marker and latest signed event. `appsumo_license_events` keeps the original event payload and receipt time. Older/out-of-order events cannot restore a superseded key; duplicate receipts never grant credits twice. AppSumo sends new keys on upgrade/downgrade; the previous identifier is retained, marked inactive, and its owner transferred.

`appsumo_redemption_claims` stores only claim digests and expiration/consumption, never AppSumo access tokens. Active licenses are linked by a service-only atomic RPC. An account with an existing Stripe subscription is not silently overwritten or charged twice.

`appsumo_plan_config` defines the five server-managed tier allowances. Monthly renewal runs from the existing hourly billing reconciliation job, without adding another cron. Starter resets; Growth, Pro and Agency preserve the product's existing rollover rule. No AppSumo customer gets the administrator's unlimited-credit exemption. License deactivation removes only the AppSumo entitlement; reactivation restores the remaining balance, not another full grant.

## Support and checks

Admin → Billing & Churn → AppSumo licenses looks up an exact license key, tier, linked-account state and event history. It cannot change the license or reveal provider credentials.

Run the local signature/lifecycle and database regression tests, then AppSumo `test_licensing` and `run_licensing_conformance`. Open the issued OAuth callback privately and check `get_oauth_test`. Compare each test license's stored state and tier with the final expected state; a successful HTTP response alone does not prove fulfillment.

The self-listing brief defaults to lifetime deals. Saving `dealType: subscription` records the requested monthly model in the draft, but does not establish that AppSumo has approved recurring billing or will collect monthly payments. Confirm those sale terms on the Redemption page before submitting the listing for review. No listing submission or real payment is part of these tests.
# Automatic full-article Mailchimp blogs — November 22, 2026

- [x] Newly published AI/Opinly articles queue once; historical imports and edits do not resend. Immutable full-article snapshot, service-only atomic claim and immediate publication wake plus hourly recovery are installed.
- [x] Deployed worker renders the saved article in the approved BDØT layout, crown/GPT artwork, relevant quoted tip and complete footer. Audience and sender are configured from the approved Mailchimp settings; regular campaigns send only to subscribed contacts.
- [x] Six delivery regressions and rollback-only queue/permission checks passed. Hosted worker preview and real Mailchimp draft save/read-back/checklist passed; every article paragraph retained, five images loaded, no desktop/440px overflow. No test or subscriber send during setup; verification draft remains unsent. First automatic publication/delivery has not yet occurred.

# Mailchimp welcome email — November 21, 2026

- [x] Create separate welcome draft using the BDØT design; saved HTML checked at desktop/phone, five images loaded, no overflow. Mailchimp accepted owner-only test to info@bdotindustries.org (HTTP 204); post-test copy retained. Inbox rendering awaits confirmation.
- [x] Owner approved design; improved welcome body and reliable paragraph spacing, verified outgoing content at desktop/phone and ready checklist for 65 opted-in BDØT Industries subscribers. Send accepted (HTTP 204); follow-up reports sending with emails_sent=65 at 08:16:45 UTC. Individual delivery unverified; no repeat send.

# BDØT footer correction — November 21, 2026

- [x] Replace sample Tip of the week quote with practical featured-blog research/review advice. Mailchimp read-back and desktop/phone rendering verified; no emails sent.
- [x] Restore the original tip bubble, promotional banner, View Blog In Browser button and social/preferences/unsubscribe footer. Separate Mailchimp read-back and desktop/phone checks passed: banner loaded, no overflow, article unchanged. No new test or subscriber send; inbox rendering unverified.

# Edited BDØT template — November 21, 2026

- [x] Use the newly edited November 21 BDØT export: updated crown logo, title band, frame, social footer and full reviewed article/GPT graphics. Actual Mailchimp HTML checked at desktop/phone: eight headings, five loaded images, no overflow. Owner-only test accepted (HTTP 204); separate post-test read retains content. Inbox rendering unconfirmed; no subscribers emailed.

# BDØT saved-template selection — November 21, 2026

- [x] Repair blank BDØT test: old post-test content read is empty and checklist reports missing content. Created standalone exported HTML draft without template binding; repeated pre/post-test checklist confirms custom HTML success and post-test content retains the full article. Desktop/phone checks passed; replacement owner-only test accepted (HTTP 204). Inbox rendering awaits owner confirmation; no subscriber send.
- [x] Locate the owner's BDØT saved template and create a review-only draft with it; old campaign is absent. Separate content read and Mailchimp checklist confirm no content was loaded. No blank test sent; no audience attached.
- [x] Use uploaded BDØT HTML: preserve its logo, black/purple editorial layout and footer; insert the full article and GPT graphics. Separate outgoing content read and desktop/phone checks passed: seven article sections, all three images loaded, no overflow. Mailchimp accepted owner-only test to info@bdotindustries.org (HTTP 204); receipt/IONOS rendering unverified, no audience attached or subscriber send.

# Mailchimp blank-test correction — November 21, 2026

- [x] Confirm outgoing Mailchimp content was an empty template, restore the full illustrated article, then read back the outgoing HTML/plain text rather than relying on a prior preview.
- [x] Returned outgoing HTML checked at desktop/phone widths: seven sections, all three images loaded, no overflow. Replacement owner-only test accepted (HTTP 204); IONOS receipt/rendering remains unverified, no audience send.

# Mailchimp sell-services blog design — November 21, 2026

- [x] Inspect Mailchimp templates: Sell Services is not exposed; adapt actual Sell Products email template 146, preserving the full article, crown logo and highlighted paragraphs.
- [x] Generate two matching OpenAI GPT Image 2 graphics; actual saved Mailchimp email verified at 1280px/390px, all three images load, seven sections and no overflow. Owner-only test to info@bdotindustries.org accepted (HTTP 204); receipt unconfirmed, no audience send.

# Account deletion event repair — November 21, 2026

- [x] Trace the failed deletion to mailbox-removal history attempting to reference a deleted auth owner; add a targeted guard preserving ordinary mailbox events and permissions.
- [x] Five isolated database regressions passed: original foreign-key failure reproduced, full owner/mailbox/event cascade succeeds, normal removal history retained without a profile, pause events and demo exclusion preserved. Hosted guard/security-definer/search-path verified; signed-in Admin Users renders and self-deletion remains refused. No real account deleted during verification; owner may retry the previously failed deletion. No account data restoration attempted.

# Full-article Mailchimp newsletter — November 21, 2026

- [x] Add a beehiiv-style generated editorial graphic, four lavender/mint paragraph bubbles and numbered visual section breaks while retaining the complete article. Actual Mailchimp saved HTML verified at phone/desktop widths: both images load, seven sections, no overflow. Revised owner-only test accepted (HTTP 204); inbox receipt unconfirmed, no audience send.

- [x] Replace the tested newsletter's teaser with the complete seven-section featured article, actual crown logo and OutReign blog styling; remove the read-the-guide button. Email copy excludes unsupported reply-rate figures and keeps human approval explicit; published blog unchanged.
- [x] Desktop/mobile preview has no overflow and logo loads; Mailchimp content saved/read back including full plain-text alternative. Owner-only test to info@bdotindustries.org accepted (HTTP 204); inbox delivery awaits owner confirmation. No subscriber campaign send.

# Leads-used plan display — November 21, 2026

- [x] Resolve the saved lead counter against the current tier's canonical allowance, including Agency; counts, billing and enforcement unchanged.
- [x] Eight display regressions plus 26 canonical tier tests passed; What's New updated. Signed-in Agency credits screen shows 176 of 15,000 (1.2%) without the incorrect upgrade warning; preview build OK.

# Consent-setting reader repair — November 21, 2026

- [x] Restore the missing consent reader, atomic writer and private immutable history; register seven required fields in schema monitoring. Existing choices preserved; training/export prerequisites remain outside this repair.
- [x] Privileged rollback-only read/write/withdrawal/rejected-answer/permission regressions passed (restricted shell connection correctly denied helper access); 92 focused tests passed. Signed-in dashboard consent read returned HTTP 200, page rendered, and preview build OK. No consent answers retained.

# Selected security remediation — November 21, 2026

- [x] Bind placement-test mailbox credentials and refresh writes to the verified owner; require sign-in before blacklist lookups.
- [x] Revoke customer access to integration-secret mutation; require trusted internal credentials for shared webhook dispatch, preserving its existing schedule and configured service address.
- [x] Neutralize spreadsheet formulas in Activity and training exports using one safe CSV serializer.
- [x] 87 focused regressions passed and all four affected handlers deployed; preview build clean. Only the six requested findings reviewed; other findings unchanged.

# Black Friday re-engagement

- [x] Explain that existing inactivity messages are also reengagement, not an exception to the managed account-email restriction; no send attempted or existing automation changed.

- [ ] Blog newsletters use Mailchimp only for opted-in subscribers; awaiting a selected blog and owner approval, no blog published or sent in this request.
- [x] Declined using Lovable account emails for the promotional 67-user campaign; no workaround or send attempted.
- [x] Add optional, unchecked marketing consent on the final onboarding screen; existing users remain not opted in. Explicit choices save in account metadata, separate from authorization and Mailchimp enrollment; 3 consent tests passed.
- [ ] Owner test remains unsent: user clarified Mailchimp is for blogs only. A Mailchimp review-only Black Friday draft was saved before that clarification; no test, audience send or import performed.
- [x] Audit confirms 67 non-admin accounts, all currently Free: 64 verified, 32 onboarded, 18 searched, 14 saved leads, 7 connected mailboxes, 1 sent. Reasons remain hypotheses; draft and safe personalization saved in docs/black-friday-reengagement-2026.md.
- [x] Confirm offer: free personal campaign setup + first month free on any plan, claimed by Black Friday November 27, 2026; payment card required, then regular monthly renewal unless canceled. Draft clearly states terms.
- [ ] Provision and verify the offer's redemption/payment path before delivery; no trial, coupon or customer billing changes made.
- [ ] Campaign sending blocked: Mailchimp is connected, but owner confirms the 67 users did not consent to promotional emails. Do not import them as subscribed; an unsubscribe footer does not establish permission. Nothing sent or granted.

# Admin Settings stability and Agent Missions

- [x] Preserve Settings tabs/editors across timed, focus and realtime refreshes; nested sections use a separate URL key from grouped admin tabs. Signed-in unsaved popup survived 65 seconds and focus; API section restored on reload. 30 related tests passed and preview build OK.
- [x] Explain the November 17 Missions addition and restore its missing setup: four protected tables, six scheduling helpers, 56 monitored fields and the existing five-minute schedule (288 checks/day). Enabled access only for the requesting owner's workspace.
- [x] Signed-in mission create/read-back, pause/reload and edit/read-back passed; temporary mission removed, zero retained missions/runs/sends. Existing worker and tool coverage tests passed. Real scheduled prospecting/drafting/sending was not triggered; customer access unchanged. Public UI changes require publishing.

# Personalized Studio and sequence bulk outreach

- [x] Add 5/10/15/all filtered lead selection and remove Studio preview reuse for bulk sends.
- [x] Generate each sequence touch from its own lead research through the shared generator; retain send gates and retry failures without advancing.
- [x] 71 related tests passed; signed-in Studio and Sequences verified 5/10/15/all selection (172 reachable leads). Two real generation attempts were safely refused by research/quality gates; no mail sent or test drafts saved. Sequence handler deployed and preview build OK. Successful live bulk delivery remains unverified and UI changes require publishing.

# Lead intelligence strategy action

# Admin health warnings

# Repeated billing audit events

- [x] Scheduled downgrades lock the subscription and record only paid-to-Free transitions; settled Free accounts skip repeated writes. Three executable SQL regressions and two import checks passed; signed-in audit returned 82 records with zero no-op reconciliation downgrades. All 2,041 historical no-op rows retained in storage; deployed reconciliation function. No shared customer reconciliation was manually triggered.

- [x] Exempt existing and future protected admin roles from billing; preserve regular customer billing. Existing admins updated; promotion, insert/update, demotion and regular customer rules verified in isolated database tests.
- [x] Correct intentional-private-table policy warnings without widening access. Six executable database regressions passed; signed-in Health refreshed to 10 healthy, zero warnings and zero failures; private-table protections unchanged.

- [x] Add Draft using strategy to evaluated lead profiles, preserving research/quality gates and existing agent draft support. Signed-in Bluejay draft saved/read back with strategy_applied=true and quality_status=clear; dark/light preview checked. No mail sent; temporary draft removed. Backend deployed; public UI requires publishing.

# Research-led use-case campaigns

- [x] Added Three Ideas and One Sentence to shared drafting guidance, explicit Outreach selection and agent-feedback routing. Signed-in selectors both verified; 72 campaign/skill/quality tests passed, preview build OK. Deployed generate-email and agent-run. No email generated or sent; actual model output and draft yield remain unverified.

# Scheduled reply detection

- [x] Restored both sweep tables and all five service-only helpers in managed migration 0061; registered seven fields with schema monitoring and preserved the single existing ten-minute job. Rollback-only live database checks passed for lease locking, rotation, failure recovery and customer denial; 44 related tests passed (restricted local database test skipped, equivalent checks executed through privileged database tools). Invoked the existing cron command: HTTP 200, users=0, newReplies=0, errors=0, deferred=0. No eligible active outreach threads existed, so actual Gmail reply capture was not exercised; no emails sent or test data retained.

# Search traffic implementation — November 16, 2026

- [x] Refresh Apollo alternatives with official vendor sources, dated prices, seven distinct tools, limitations and FAQ; old brand/links removed from this guide.
- [x] Prerender 69 public article bodies from published snapshots; Apollo legacy path redirects to primary guide, excluded from sitemap. Two-product comparison retained with distinct intent.
- [x] Add small-team AI SDR, free AI SDR, lead-generation MCP and human/software cost guides; blog links, static heads, Article metadata and AI discovery updated.
- [x] Verify five guides at desktop/phone widths, blog navigation and redirect without runtime errors; 15 tests pass; server HTML contains H1/article bodies for all 69 articles. Registry manifest passes official JSON schema.
- [ ] Publish and verify live first-response article HTML and submit updated sitemap in Search Console (requires app publishing; no live publishing performed).
- [ ] External listings: SaaSHub/Product Hunt blocked by access challenges and owner sign-in; FutureTools requires CAPTCHA; mcp.so requires sign-in and $39 payment approval; official Registry requires publisher authentication/domain ownership proof. Prepared exact copy and valid server.json in docs/search-distribution.md; nothing submitted or charged.
- [ ] Send honest G2 review invitations (owner must confirm actual customer recipients and sending account; draft prepared, no customer messages sent).

# Agent reply content preservation

# Dashboard service alert

- [x] Restored missing visitor-page tables and gated access definitions; refreshed generated types and registered 106 fields in schema_contract. Preview build OK; 21 visitor tests passed (local PostgreSQL isolation test skipped without its database). Signed-in Visitors stays disabled, health reports zero failures and service-status is empty. No tracking, automation or provider jobs enabled.

- [x] Corrected the private outbound safety-switch predicate without customer grants; live SQL regressions prove lost backend access still fails. Signed-in health reports zero broken checks, matching alert resolved, service-status returns no incidents and dashboard banner is absent. Existing runtime guards: 12 passed. Pre-existing Visitors schema/type errors also cleared.

# Dashboard design refresh

- [x] Populated sequence, deal, team and brief editors checked in both themes with temporary records (removed afterwards); team invite fault fixed.
- [x] Exhaustive visual coverage and safe action tests in both themes; remaining unsafe actions listed in dashboard-design-audit.md.
- [x] Verified branding preview colors and all four ICP editor tabs in both themes, including scrolling Targeting and expanding sections; 135 dashboard/ICP and 21 admin regressions passed. Shared menu keyboard focus restored; current preview build is clean.

- [x] Extend the glow design to all 17 admin page/tab views; verified signed-in dark/light desktop views, mobile Users/Billing and navigation, with no page overflow or runtime errors. All 21 admin regressions pass and preview builds cleanly; admin-only changes excluded from customer What's New. Publishing remains required.
- [x] Adapt the uploaded glow design to shared OutReign navigation, headings, panels and overview without changing data flows.
- [x] Verified signed-in Overview, Saved Leads, Inbox, Pipeline and Settings; desktop/mobile themes, sidebar and metric navigation work, 106 regressions pass and preview builds cleanly. Public publishing remains unchanged.

- [x] Preserve research findings and line boundaries while replacing only batch-status claims; 108 related regressions passed, the reported example retains both bullets and its finding, and agent-chat is deployed. No real research/drafting turn was triggered.

# Agent chat lead lookup accuracy

- [x] Reproduced mixed-filter repeats, seventh lookups and empty batches in the actual dispatcher; refreshed repeat results and cleared implicit batches, passed 18 regressions, and deployed agent-chat. No real research/drafting run was triggered.

# Credit-ledger health alert

- [x] Correct the missing-grant false alarm without giving customers access to the internal credit ledger; migration regression checks passed, signed-in health reports zero broken checks, and dashboard banner is absent. Resolve only the matching alert; the internal-ledger no-policy warning is informational and remains.

# Unified Inbox coverage

- [x] Trace email creation and sending across Outreach Studio, agents, API and MCP; include drafts and all outbound states without adding duplicate send records.
- [x] Add regressions, verify a temporary unsent draft in signed-in Inbox and clean it up, deploy generate-email/rest-api and add What's New.
- [ ] Publish the Inbox and MCP generator changes (requires app publishing); API draft saving is deployed, no real outbound email was sent.

# Documentation completeness review

- [x] Compare published docs with Context.dev's reference and audit API/MCP/webhook contracts; existing introduction works but root still serves older autogenerated reference.
- [x] Add seven detailed feature/client/agent/production/delivery guides (29 total), richer response examples and explicit Mintlify root/introduction redirects.
- [x] Validate Mintlify's official schema, all MDX/navigation links, local OpenAPI references and 30 related contract regressions; reference contains 30 API operations.
- [ ] Verify new guide content and root redirect after Mintlify rebuilds from GitHub (external deployment; app publishing does not rebuild Mintlify).

# API and MCP app-access parity

- [x] Expose real app prospect search and email verification with the same owner, plan and credit checks.
- [x] Extend matching API/MCP enrichment, research and bounded workspace-action access; document exact capabilities and remaining gaps without claiming full parity.
- [x] Run 112 authorization/contract regressions; verify API search, save, score and Saved Leads read-back, MCP authenticated handlers, confirmation previews and temporary-record cleanup; deploy eligible functions.
- [ ] Publish the new MCP revision and verify hosted tool discovery (requires app publishing; local catalog has 24 tools).

# Retire built-in API documentation

- [x] Remove the duplicate API reference and developer help category/articles; keep external documentation links and legacy redirects.
- [x] Verify help navigation and retired-page redirects; both regression tests pass and preview builds cleanly.

# Mintlify repository setup

- [x] Add root Mintlify configuration using the existing public API specification.
- [x] Validate against Mintlify's official schema and discover all 21 API operations.
- [x] Complete Mintlify repository connection at https://docs.outreign.io.

# Developer documentation

- [x] Add 15 readable getting-started, authentication, API, MCP, webhook and integration guides; correct the specification to cover all 24 implemented operations.
- [x] Point documentation entry points and AI discovery to https://docs.outreign.io, preserve old links with a redirect, and deploy the AI-readable documentation update.
- [x] Validate Mintlify's schema, MDX compilation, links, API contracts and app navigation at desktop/mobile widths.
- [x] Verify hosted Guides/API/MCP/Webhooks navigation at the introduction URL; root still serves older reference and is addressed in the documentation completeness task.

# DFY sales-model questions

- [x] Add subscription/high-ticket paths with exact customer values, buying and onboarding timelines; deploy submission support.
- [x] Verify normalization and legacy summaries with 36 tests and all four form paths on desktop/mobile; build clean.
- [ ] Complete a real application submission and read-back (requires human CAPTCHA; not bypassed during automated checks).

# Integration connection repair

- [x] Fix manual integration saving without restoring the single-account Google constraint.
- [x] Check sibling OAuth persistence failures and verify Google, Calendly, HubSpot and Salesforce authorization initiation.
- [x] Run 34 regressions and verify signed-in Zapier/Slack save, reload and disconnect; remove temporary settings.
- [ ] Complete provider authorization and real delivery/sync checks (requires each provider's consent and a real workflow; no messages or workflows triggered).

# What's New editorial control

- [x] Add confirmed deletion for draft, published and archived entries.
- [x] Exclude admin diagnostics and security monitoring from automatic customer drafts.
- [x] Verify cancellation, persistent deletion of the three internal entries shown, and 53 regression checks.

# Context.dev research

- [x] Connect and verify Context.dev securely.
- [x] Supplement existing lead and account web research with deduplicated Context.dev sources.
- [x] Run 56 research regression checks, deploy both research functions, and verify signed-in account research with source links.

# Failed-payment recovery

- [x] Recognize an expired failure episode during enabled automatic payment recovery, after status and count resets.
- [x] Test payment recovery followed by a later failed renewal, reject stale recovery events, and deploy all three affected functions (26 regression tests passed; build green).

# Landing and pricing refresh

- [x] Update homepage feature descriptions for lead intelligence, research, and automatic reply alerts.
- [x] Correct pricing availability for lead evaluation, why-now research, and committee mapping.
- [x] Align AI Sales Coach limits with live enforcement.
- [x] Add regression coverage for plan limits and public allowance terminology.
- [x] Verify homepage and pricing at desktop and phone widths.

# Account profile editing

- [x] Add editable display name and private profile photo under Settings → Profile.
- [x] Show saved name and photo in the bottom-corner account menu.
- [x] Verify saved profile changes and publish a What's New entry.

# Accessible purple themes

- [x] Restore original dark-purple video treatment and effects.
- [x] Swap light mode to pale-purple surfaces and dark, readable text without removing visuals.
- [x] Verify switching themes and preserved visuals in the browser (video tested with a temporary browser-compatible transcode; app keeps original source).

# Generic greeting send block

- [x] Let general greetings, nicknames and titles pass the name check; keep a wrong person's name blocked.
- [x] Match company names whole-word so "ramping" is not read as a miscased "Ramp".
- [x] Stop a content block from counting as a Gmail delivery failure in bulk send.
- [x] Add regression tests at both layers (shared rule, browser send gate).
- [x] Publish a What's New entry.
- [ ] Live end-to-end bulk send with a generic greeting (needs a real campaign to real prospects; not run).

# Search and outreach growth

- [x] Rework RocketReach comparison page around "RocketReach alternatives" (title, heading, why-switch section, new FAQ, links to other comparisons).
- [x] Add related-reading links to the four blog posts sitting on pages 3–6 of Google.
- [x] Comparison pages for Apollo, Lusha, ZoomInfo, Instantly already exist; no new ones needed.
- [x] Draft four weeks of LinkedIn posts (Files).
- [x] First 10 prospects with drafted messages (Files).
- [x] Second batch: 1 confirmed social-post prospect (Caden Boatright); 2 unconfirmed leads.
- [ ] Agency prospects and directory listing rules (first research pass ran out of time; needs another pass).
- [ ] Send messages / publish posts / submit directory listings (needs the owner's go-ahead and accounts).
- [ ] Paid ads (after first users stick around).
- [x] Add logo image to top of account emails and check them.

# Google connection failure

- [x] Reproduce the Google connect failure (auth-code step) and capture the exact error.
- [x] Surface real Google errors + block duplicate code exchange; full connect not verifiable without Google sign-in.

# Treg integration

- [x] Fixed Treg key verification and linked the connection; gateway reaches the account.
- [x] Lead search falls back to Treg when other sources are empty; customer-tagged, capped at $0.50/call, credits held then settled, call IDs and costs logged. 4 billing tests pass; deployed.
- [ ] Run a real Treg-backed search and reconcile it with Treg's usage report (not run yet, to avoid spending your balance).

- [x] ICP editor: buttons, dropdowns, chips match dashboard design
- [x] Dashboard background a little more transparent

# Email worker and full action audit

- [x] Trace the synthetic DMARC email: Cloudflare received all 8 sends; the email Worker cancels before forwarding, and the same catch-all Worker also drops support@outreign.io mail. Prepared a fixed Worker (Cloudflare access is read-only).
- [ ] Owner pastes fixed Worker, verifies a support forwarding inbox, resends test; confirm stored report.
- [x] Real email send to the owner's own address: research, draft and send now succeed (test email delivered to brandon@bdotindustries.com and logged as sent).
- [x] Sequence step sent to owner's own address; bulk drafting+send path reached the same-day duplicate guard (expected). Fixed bulk drafts missing sender name and bulk subjects refused at send.
- [x] Reply test: reply detected; Inbox reply now sends from the thread's own mailbox (fixed send-email); temp records removed.
- [ ] Integration connect flows reach each provider's consent screen (owner completes sign-in).
- [ ] Small paid lead search and enrichment.
- [x] Admin Run Heartbeat (monitoring timestamp only).
- [ ] Admin Run Sweep (emails real inactive customers, no preview mode) and Resolve alert (changes shared alert history) - need owner approval.
- [x] Background job "runMicrotasks" error: caused by the esm.sh build of the database library; all functions moved to the npm build, guarded by a test.

# Bulk research and drafting runs

- [x] Owner-approved bulk runs: estimate, lead cap, background keyset feed, lease, retries/backoff, rate-limit cool-off, credit pause, pause/resume/cancel, live counts, Bulk Runs page, agent tools. Live 2-lead test ran end to end (feed, research, settle, complete).
- [ ] Draft yield depends on lead data quality: the test lead "TF Business Solutions" points at 2btechinc.com, so the evidence check correctly refused it.

# AI Agent background-work integration

- [x] Embedded existing approvals/progress in AI Agent → Background work; removed standalone navigation and redirected old links. Updated and deployed agent directions. Signed-in estimate returned 63 matching leads, tab selection survived reload, both themes checked, no runtime errors; 10 regressions passed and preview build OK. No run approved or paid work started.
- [x] Background drafts: rubric accepts worker calls; research crash on old receipts; progress label counts steps

# AppSumo submission 236273 licensing

- [x] AppSumo connected; authenticated access to draft submission 236273 and its five licensing plans verified.
- [x] Saved subscription deal type in AppSumo and monthly tier configuration; Done-for-you maps to Agency with 15,000 credits. Existing Starter reset and higher-tier rollover preserved; customers never get administrator billing exemption.
- [x] Deployed three licensing functions and billing integration; registered both public HTTPS endpoints through AppSumo and stored returned private key and OAuth credentials only in encrypted server config. Added admin license lookup and account redemption page.
- [x] test_licensing is valid with no warnings; conformance's ten synchronous checks pass, OAuth callback answers 200 and get_oauth_test passes with current credentials. Every final expected test license status/tier matches storage; test licenses remain unlinked. 17 local security/database regressions, Deno checks and app typecheck passed. Signed-in admin lookup and unknown-key state verified in both themes; phone redemption fits without errors.
- [ ] Confirm publishing reaches https://outreign.io/appsumo: publishing requested, first live check still served old 404. Public webhook/OAuth endpoints are already live. Full ordinary-customer browser redemption remains unverified because temporary auth-user creation failed; entitlement/claim flows passed isolated database tests.
- [ ] Owner confirms monthly sale/payment collection on AppSumo’s Redemption page before submission: storing subscription deal type and passing licensing tests do not prove AppSumo will collect recurring payments. Listing not submitted; no real account plans, charges or customer licenses changed.

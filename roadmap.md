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

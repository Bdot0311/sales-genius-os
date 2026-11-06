# Mintlify repository setup

- [x] Add root Mintlify configuration using the existing public API specification.
- [x] Validate against Mintlify's official schema and discover all 21 API operations.
- [x] Complete Mintlify repository connection at https://docs.outreign.io.

# Developer documentation

- [x] Add 15 readable getting-started, authentication, API, MCP, webhook and integration guides; correct the specification to cover all 24 implemented operations.
- [x] Point documentation entry points and AI discovery to https://docs.outreign.io, preserve old links with a redirect, and deploy the AI-readable documentation update.
- [x] Validate Mintlify's schema, MDX compilation, links, API contracts and app navigation at desktop/mobile widths.
- [ ] Verify the redesigned hosted documentation after Mintlify deploys the GitHub default-branch changes (current hosted site still serves the previous reference-only layout).

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

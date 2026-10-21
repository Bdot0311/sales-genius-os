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

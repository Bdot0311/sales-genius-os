# Dashboard design audit

Status as of 2026-11-14. Both themes (dark and light) unless stated.

## Visual review — completed

- [x] 69 dashboard/admin route and tab targets opened in both themes; admin aliases redirect into grouped pages.
- [x] Broad sweep contact sheets `s02`–`s28` reviewed at full size.
- [x] Retry sweep: 329 captures deduplicated into 81 page views and 32 pop-up crops; all 21 page sheets and 6 pop-up sheets reviewed at full size.
- [x] Admin Health > Activity Logs (User Actions, Logins, System Events), Realtime and Alerts, including every Activity/Alerts dropdown — reopened in dark mode after the earlier dark-mode browser crash; now covered in both themes.
- [x] Admin Growth (DFY, Analytics with all five tabs, Traffic, Re-engagement), Users (All, Activation, Signup Logs, Campaign Setup), Add Team Member dialog and plan menu, signup-event and activity-timeline sheets, date/status menus.
- [x] ICP New and existing editors: Basics, Targeting (scrolled, sections expanded), Signals, Strategy.
- [x] Inbox: all folders, thread view and reply composer.
- [x] Objection editor scrolled to its save bar.
- [x] Temporary sequence (branching), deals, team invite and campaign brief: every editor, dropdown, menu, tooltip and confirmation.

## Actions tested with temporary records — passed, then cleaned up

- [x] Deals: create, reload, move stage (no delete button in UI; removed via owner-scoped request).
- [x] Leads: create/delete. Sequences: create/delete. Message blocks: create/edit/delete.
- [x] ICP: create/delete. Campaign briefs: create/edit/delete. Payoff bank: add/delete.
- [x] API keys: create/revoke. Outbound webhook endpoints: add/edit/delete (no delivery).
- [x] Team invite to an `example.invalid` address: create/remove.
- [x] Agent chat thread create/delete; Coach conversation delete; email draft delete.
- [x] Calendar meeting create/edit/delete; email template save/delete.
- [x] Objection add/edit/delete; custom agent create/delete.
- [x] Profile edit, reload, revert; unchanged scoring save; What's New draft edit/delete.
- [x] Database scan after cleanup: no audit test records left. Two `example.invalid` campaign setup requests from 2026-08-19 predate this audit and were left alone.

## Corrections made

- Shared panel headers, integration filter pills, toasts and native controls follow the active theme.
- Branding previews keep the chosen color; keyboard-focused menu items keep a visible indicator.
- Sequence step numbers, branch panels, "LinkedIn Task" option and off toggles.
- Team invites were failing for everyone (activity log owner column); fixed.
- ICP validation colors; duplicate Buying signals / Preferred channels descriptions removed.
- Objection editor sticky save bar no longer lets text show through.
- Dialog/sheet close button shows its focus ring only for keyboard focus.
- Delete/revoke confirmations in Billing, Agent switcher, Calendar and Support access are red like the rest.
- Badges no longer wrap; Activity action filter widened; Re-engagement dates/headings no longer wrap; chart colors readable in both themes.
- Inbox folder tabs wrap instead of being cut off.

## Not safely testable (blockers)

- Sending real email, Inbox replies, sequence launches, bulk sends, campaign-setup access requests: would message real people.
- Connecting Gmail, Calendly, Slack, Zapier, Salesforce, calendar sync and other integrations: needs real account consent.
- Billing (checkout, plan changes, top-ups, removing accounts) and admin plan/role/suspend actions: would change real money or customer access.
- Admin demo-data, Run Sweep Now, Run Heartbeat, Resolve alert: change shared production data.
- Lead search/enrichment and research: spend credits and provider balance.
- Browser push permission: needs a real browser prompt.
- Public publishing: not performed.

## Checks

- 3,602 automated checks pass in the full run; the write-permissions check times out only under full-suite load and passes on its own (5/5). Two layout checks updated to accept the new design classes; Treg key documented. Preview build OK.

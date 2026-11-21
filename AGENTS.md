# Agent rules

- Billing downgrades lock the subscription and log only paid-to-Free transitions; audit reads omit legacy reconciliation no-ops without deleting history. Why: retries must not invent events.

- Admin billing exemption is enforced by protected role/subscription triggers; policy health excludes only vetted internal tables with backend CRUD and no customer grants. Why: future admins and intentionally private tables must not produce false billing/security warnings.

- Lead intelligence's draft action uses generate-email with server-read strategy and normal research/quality gates, then reads back the saved owner-scoped draft. Existing draft_outreach provides agent parity. Why: recommendations become reviewable drafts without a separate generator or auto-send path.

- Scheduled reply sweeps require the cursor/lease tables and five service-only RPCs in the managed Drizzle migration stream; preserve the existing managed cron rather than creating a second HTTP callback. Why: legacy migration files alone did not install the helpers and every scheduled pass failed before polling Gmail.

- Public blog bodies use a committed published-content snapshot for identical first HTML and client hydration; curated search-guide revisions override older generated rows, and metadata/sitemaps use the same priority. Why: crawlers must see real article text without JavaScript and stale database copy must not undo editorial corrections.

- Dashboard and admin visual refinements live under `.dashboard-shell` and shared panel/header classes with semantic CSS tokens; admin uses `.admin-shell` for its navigation and controls; portaled sheets/dialogs/menus are styled via `body.dashboard-active`, set by DashboardLayout. Never override global utilities. Why: every signed-in page shares the requested design without changing the public site or nested functional layouts.

- Workspace action styling excludes `.branding-color-preview`, and keyboard menu options retain a focus indicator. Why: shared appearance must not overwrite user-selected color previews or hide keyboard position.

- Agent confirmed-close filtering operates within lines and removes only complete batch-status statements. Why: research findings and Markdown boundaries must survive counted progress summaries.

- Agent-chat list lookups refresh even for repeated filters within the six-call turn cap; clear implicit lead and draft pools before every lookup and return an explicit unqueried error at the cap. Why: stale ids and counts must never be substituted across filters or after drafting.

- Health grant checks treat the Stripe credit-grant ledger, outbound safety switch, and visitor jobs/caches as internal only while RLS denies customer roles and backend CRUD grants remain present. Why: deliberate privacy must not trigger an outage banner, and missing backend access must still fail monitoring.

- Unified Inbox reads owner-scoped sent_emails and email_drafts without source-specific filtering; external generators save drafts through generate-email, while existing Studio/agent callers retain their own draft writes. Why: all creation channels appear once and unsent mail is never reported as sent.

- API prospect/lookup actions forward the real API key to shared app-user authentication; MCP forwards its OAuth token to app handlers. Why: identity comes from verified credentials, not owner arguments or service-role forwarding, so app credit and plan rules stay authoritative.
- Public action routes are explicitly allowlisted in `api-action-contract.ts`; standalone verification reuses `email-verify.ts` with owner-scoped request quotas and no reveal charge. Why: external callers must not gain arbitrary function access or mistake DNS/catch-all verdicts for confirmed mailboxes.

- Root `docs.json` configures Mintlify using `public/openapi.json` directly. Why: repository onboarding requires a discoverable config, and a single API specification prevents documentation drift.
- Mintlify guides live under `developer-docs/`; `.mintignore` excludes application code, CSS and scripts, and retired `/api-docs` and API help guides redirect to the documentation host instead of maintaining duplicate app pages. Why: sharing the repository must not inject app styles/scripts into docs or leave old bookmarks on a stale reference.
- Developer guides separate CRUD, app-action and MCP response envelopes, and distinguish source contracts from hosted deployment. Why: generated catalogs and repository changes do not prove Mintlify or MCP is serving the newest revision.

- DFY sales-model answers share normalization between the public form and submission function and persist in request metadata; admin summaries retain legacy fields. Why: pricing changes must preserve applicants' actual values and timelines without breaking older requests.

- Manual integration writes run through authenticated `connect-integration`; non-Google OAuth callbacks share `save-integration.ts` and check persistence errors without using the removed user/provider conflict target. Why: Google supports multiple mailboxes and browser writes cannot access credential-bearing rows.

- Keep homepage contrast styling scoped to landing selectors and semantic landing tokens; do not override shared utilities globally because that changes dashboard appearance.

- Theme-specific media treatments and colors live in semantic CSS tokens; both themes render the same media and layout so accessibility changes never remove visuals.

- Account identity uses the owner-scoped profiles record and private profile-avatars bucket with signed URLs; invalidate the shared account-profile query on save so the sidebar updates immediately.

- Every outbound feature a user can act on in the app ships with matching AI agent tools (read + edit) in the same change, registered in `_shared/agent-tool-scope.ts`, the tier caps, and the custom-build picker in `AgentRoles.ts`. Why: custom agents should never answer "I don't have the tooling"; `src/lib/agent-tool-coverage.test.ts` enforces the wiring.

- The backend deploys through Lovable Cloud, which is fully managed: edge functions and migrations ship when the project is published there, and a merge to `main` deploys nothing. There is no token to generate on supabase.com for this project, so a CI deploy workflow cannot be made to work — `SUPABASE_ACCESS_TOKEN` is not a secret somebody forgot to add, it is a secret that cannot exist. Do not build one. Why: it has been built and removed twice (`d2be0121` then `0c1e0545` in August, `ac0f6c1b` then this commit in October). Both times the reasoning was "nothing deploys the edge functions", and both times that was wrong in the same way — a function that looks undeployed means nobody has published since it was merged. Check `git log` on `.github/workflows/deploy-functions.yml` before concluding otherwise.

- `edge-functions-deno` can fail on a file your change never touched, and not reproduce. Before chasing it: check whether the named file is in your diff at all (`git diff --name-only origin/main..HEAD -- 'supabase/functions/**'`) and whether the same job is green on `main`, which carries the same file. If your diff contains no edge function, the failure is not yours. It happened on #355, whose diff was two docs, a test, an admin page and a migration: the job reported one TS2345 in `reconcile-stripe-subscriptions/index.ts`, which was byte-identical to `main` and type-checked clean locally at the same commit, with the same Deno version, after `deno check --reload` to rule out a stale cache. Two things make the job non-deterministic: the workflow pins `deno-version: v2.x`, so a runner can pick up a newer Deno and TypeScript than yours, and `scripts/report-deno-check.mjs` checks files in parallel, which is the same shape of race that made `nodeModulesDir: "auto"` fail with "File exists (os error 17)". Re-running the job needs a permission the app token does not carry, so a genuine re-check needs a real commit; never push an empty one for it. Why: the first encounter cost half an hour of looking for a bug in a file the branch had never opened.

- Root `deno.json` keeps `"nodeModulesDir": "none"` so edge-function type checks resolve npm packages from the Deno cache. Why: "auto" made parallel checks race to symlink into the app's node_modules and fail with "File exists (os error 17)".

- Scheduled email editing round-trips sanitized HTML through `scheduled-email-body`, retaining original body columns on non-body edits. Why: rebuilding HTML from the plain-text alternative destroys signature images and link destinations.

- `src/integrations/supabase/types.ts` is regenerated from the live database, so a hand-added table or view survives only until the next regeneration. Entries for `training_examples`, `dataset_stats` and `lead_feature_snapshots` were written by hand so the typed client would resolve them, and `2741f444` ("Work in progress", the platform) removed all three — the objects existed only in an unpublished migration, so a regeneration from the live schema could not know them. The reply-label tables came back on their own in `da737f0a` once they were published. So: do not hand-edit that file to make an unpublished object resolve. Either keep the object out of frontend `.from("...")` calls until it is published and the types return by themselves, or reach it through an edge function, which needs no client types at all. Why: two phases of the outcome data layer added those entries and both were wiped, the second time silently — nothing referenced the objects by name, so typecheck stayed green and the loss was invisible.

- `supabase/functions/mcp/index.ts` is generated — its first line says so. It is bundled from `src/lib/mcp/**` by the Vite plugin on every `vite build`, so a hand-edit to it survives until the next build and no longer. Fix the tool under `src/lib/mcp/tools/` and rebuild. Why: the `body_text` stripper was applied to the generated file by hand three times and vanished three times — blamed first on a `git stash` cycle, then on commit `406d3450` ("Changes", the platform bot), then on this branch's own `npm run build` two minutes after a test run had confirmed the line was present. None of those was a revert; all three were the generator. `src/lib/plain-text-storage.test.ts` now guards the source, not just the bundle.

- The MCP server pins its OAuth `resource` to the public `api.outreign.io/mcp` URL and advertises metadata from the `mcp-oauth-metadata` function on that host; `src/lib/mcp-public-resource.test.ts` guards it. Why: MCP clients reject a server whose advertised resource differs from the URL they connected to, which surfaced as Grok/Cursor `failed_to_load`.

- `log_audit_trail()` reads the owner through `to_jsonb(NEW/OLD)` (`user_id`, then `team_owner_id`) and skips rows without one. Why: a direct `NEW.user_id` reference made every team-member insert fail.

- Agent research/draft tools accept `all_matching: true`, resolving the full set from the last list_leads filter server-side; overflow goes to the background queue. Why: models paging lead ids hit the lookup cap and stalled large asks.

- Large research/draft asks run as owner-approved bulk runs (`bulk-runs` owner API, `process-bulk-runs` worker, `_shared/bulk-run-logic.ts` rules): keyset-paged feed capped at the approved lead count, per-run lease, per-item backoff, run cool-off on rate limits and pause on credit errors, woken from the existing agent-queue tick. Agents may create/inspect/pause runs but never approve them. Why: model-orchestrated batching lost leads and invented progress at scale; a deterministic queue with database counts cannot.

- Background research/draft approvals and progress are embedded in the AI Agent tabs; the legacy bulk-runs route redirects there. Why: durable jobs support the agent rather than a separate workspace feature.

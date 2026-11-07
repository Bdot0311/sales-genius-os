# Agent rules

- Health grant checks treat the Stripe credit-grant ledger as internal only while RLS denies customer roles and backend CRUD grants remain present. Why: deliberate privacy must not trigger an outage banner, and missing backend access must still fail monitoring.

- Unified Inbox reads owner-scoped sent_emails and email_drafts without source-specific filtering; external generators save drafts through generate-email, while existing Studio/agent callers retain their own draft writes. Why: all creation channels appear once and unsent mail is never reported as sent.

- API prospect/lookup actions forward the real API key to shared app-user authentication; MCP forwards its OAuth token to app handlers. Why: identity comes from verified credentials, not owner arguments or service-role forwarding, so app credit and plan rules stay authoritative.
- Public action routes are explicitly allowlisted in `api-action-contract.ts`; standalone verification reuses `email-verify.ts` with owner-scoped request quotas and no reveal charge. Why: external callers must not gain arbitrary function access or mistake DNS/catch-all verdicts for confirmed mailboxes.

- Root `docs.json` configures Mintlify using `public/openapi.json` directly. Why: repository onboarding requires a discoverable config, and a single API specification prevents documentation drift.
- Mintlify guides live under `developer-docs/`; `.mintignore` excludes application code, CSS and scripts, and retired `/api-docs` and API help guides redirect to the documentation host instead of maintaining duplicate app pages. Why: sharing the repository must not inject app styles/scripts into docs or leave old bookmarks on a stale reference.
- Developer guides separate CRUD, app-action and MCP response envelopes, and distinguish source contracts from hosted deployment. Why: generated catalogs and repository changes do not prove Mintlify or MCP is serving the newest revision.

- DFY sales-model answers share normalization between the public form and submission function and persist in request metadata; admin summaries retain legacy fields. Why: pricing changes must preserve applicants' actual values and timelines without breaking older requests.

- Manual integration writes run through authenticated `connect-integration`; non-Google OAuth callbacks share `save-integration.ts` and check persistence errors without using the removed user/provider conflict target. Why: Google supports multiple mailboxes and browser writes cannot access credential-bearing rows.

- Lead and account web research share `external-research.ts`, merging Parallel and Context.dev without replacing either; Context.dev uses the connector gateway URL from environment configuration. Why: both surfaces and existing agent research tools must retain identical retrieval and failure-safe behavior.

- Keep homepage contrast styling scoped to landing selectors and semantic landing tokens; do not override shared utilities globally because that changes dashboard appearance.

- Theme-specific media treatments and colors live in semantic CSS tokens; both themes render the same media and layout so accessibility changes never remove visuals.

- Account identity uses the owner-scoped profiles record and private profile-avatars bucket with signed URLs; invalidate the shared account-profile query on save so the sidebar updates immediately.

- Every outbound feature a user can act on in the app ships with matching AI agent tools (read + edit) in the same change, registered in `_shared/agent-tool-scope.ts`, the tier caps, and the custom-build picker in `AgentRoles.ts`. Why: custom agents should never answer "I don't have the tooling"; `src/lib/agent-tool-coverage.test.ts` enforces the wiring.

- The backend deploys through Lovable Cloud, which is fully managed: edge functions and migrations ship when the project is published there, and a merge to `main` deploys nothing. There is no token to generate on supabase.com for this project, so a CI deploy workflow cannot be made to work — `SUPABASE_ACCESS_TOKEN` is not a secret somebody forgot to add, it is a secret that cannot exist. Do not build one. Why: it has been built and removed twice (`d2be0121` then `0c1e0545` in August, `ac0f6c1b` then this commit in October). Both times the reasoning was "nothing deploys the edge functions", and both times that was wrong in the same way — a function that looks undeployed means nobody has published since it was merged. Check `git log` on `.github/workflows/deploy-functions.yml` before concluding otherwise.

- Root `deno.json` keeps `"nodeModulesDir": "none"` so edge-function type checks resolve npm packages from the Deno cache. Why: "auto" made parallel checks race to symlink into the app's node_modules and fail with "File exists (os error 17)".

- Scheduled email editing round-trips sanitized HTML through `scheduled-email-body`, retaining original body columns on non-body edits. Why: rebuilding HTML from the plain-text alternative destroys signature images and link destinations.

- `supabase/functions/mcp/index.ts` is generated — its first line says so. It is bundled from `src/lib/mcp/**` by the Vite plugin on every `vite build`, so a hand-edit to it survives until the next build and no longer. Fix the tool under `src/lib/mcp/tools/` and rebuild. Why: the `body_text` stripper was applied to the generated file by hand three times and vanished three times — blamed first on a `git stash` cycle, then on commit `406d3450` ("Changes", the platform bot), then on this branch's own `npm run build` two minutes after a test run had confirmed the line was present. None of those was a revert; all three were the generator. `src/lib/plain-text-storage.test.ts` now guards the source, not just the bundle.

- Redirect/return URLs (OAuth redirect_uri, Stripe return_url) go through `_shared/safe-origin.ts`, and tracked email links are HMAC-signed in `_shared/click-tracking.ts`; add new app domains to the allowlist there. Why: request-supplied origins and unsigned link targets made open redirects.

- The MCP server pins its OAuth `resource` to the public `api.outreign.io/mcp` URL and advertises metadata from the `mcp-oauth-metadata` function on that host; `src/lib/mcp-public-resource.test.ts` guards it. Why: MCP clients reject a server whose advertised resource differs from the URL they connected to, which surfaced as Grok/Cursor `failed_to_load`.

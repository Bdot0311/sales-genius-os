# Agent rules

- Keep homepage contrast styling scoped to landing selectors and semantic landing tokens; do not override shared utilities globally because that changes dashboard appearance.

- Account identity uses the owner-scoped profiles record and private profile-avatars bucket with signed URLs; invalidate the shared account-profile query on save so the sidebar updates immediately.

- Every outbound feature a user can act on in the app ships with matching AI agent tools (read + edit) in the same change, registered in `_shared/agent-tool-scope.ts`, the tier caps, and the custom-build picker in `AgentRoles.ts`. Why: custom agents should never answer "I don't have the tooling"; `src/lib/agent-tool-coverage.test.ts` enforces the wiring.

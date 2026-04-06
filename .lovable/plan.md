

## Plan: OAuth Sign-In for All Integrations

Currently only Google uses OAuth (sign-in button). The other integrations (Calendly, Slack, HubSpot, Salesforce) require users to manually find and paste API keys, which is a hassle. This plan converts all eligible integrations to use OAuth sign-in flows, matching the Google experience.

**Zapier stays webhook-based** — Zapier doesn't offer OAuth for this use case; it's inherently webhook-driven.

---

### What Changes

**1. Create OAuth init edge functions** (one per provider)
- `hubspot-oauth-init/index.ts` — builds HubSpot OAuth URL with scopes for CRM access
- `hubspot-oauth-callback/index.ts` — exchanges code for tokens, stores in `integrations` table
- `salesforce-oauth-init/index.ts` — builds Salesforce OAuth URL
- `salesforce-oauth-callback/index.ts` — exchanges code for tokens
- `calendly-oauth-init/index.ts` — builds Calendly OAuth URL
- `calendly-oauth-callback/index.ts` — exchanges code for tokens
- `slack-oauth-init/index.ts` — builds Slack OAuth URL with scopes for notifications
- `slack-oauth-callback/index.ts` — exchanges code for tokens

Each follows the same pattern as the existing `google-oauth-init` and `google-oauth-callback` functions: generate auth URL → redirect user → exchange code → save tokens to `integrations.config`.

**2. Add secrets for each provider's OAuth credentials**
- `HUBSPOT_CLIENT_ID` + `HUBSPOT_CLIENT_SECRET`
- `SALESFORCE_CLIENT_ID` + `SALESFORCE_CLIENT_SECRET`
- `CALENDLY_CLIENT_ID` + `CALENDLY_CLIENT_SECRET`
- `SLACK_CLIENT_ID` + `SLACK_CLIENT_SECRET`

You'll need to register OAuth apps on each provider's developer portal to obtain these.

**3. Update `src/pages/DashboardIntegrations.tsx`**
- Remove `fields` from Calendly, Slack, HubSpot, Salesforce definitions (no more API key inputs)
- Extend `handleConnect` to route each integration through its OAuth init edge function (same pattern as Google)
- Extend `handleOAuthCallback` to detect which provider returned the code (via `state` parameter containing provider ID)
- Remove the API-key form dialog for OAuth-based integrations
- Keep Zapier as webhook-based (still uses the form dialog)
- Show connected account email/name for each OAuth integration (like Google currently does)

**4. Update landing page CTA**
- In `IntegrationsSection.tsx`, keep "Connect your tools" text — it now accurately describes OAuth sign-in

---

### What Stays the Same
- Google OAuth flow (already working)
- Zapier webhook integration
- Database schema (`integrations` table with JSONB `config`)
- Disconnect logic
- Category filtering

---

### User Action Required
Before implementation, you'll need to create OAuth apps on each platform's developer console and provide the client ID + secret pairs. I'll prompt you for each one during implementation.


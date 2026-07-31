# Auth.md

**Site:** https://outreign.io
**Service:** OutReign — B2B lead intelligence and outbound sales platform
**Contact:** support@bdotindustries.com
**Spec:** https://workos.com/auth-md

## Agent registration for OutReign

Agents act on behalf of a signed-in OutReign user — there are no anonymous agent
credentials.


## Endpoints

- MCP server (protected): `https://ghgfjnepvxvxrncmskys.supabase.co/functions/v1/mcp`
- Protected resource metadata: `https://outreign.io/.well-known/oauth-protected-resource`
- Authorization server metadata: `https://outreign.io/.well-known/oauth-authorization-server`
- OpenID Connect discovery: `https://outreign.io/.well-known/openid-configuration`
- API catalog: `https://outreign.io/.well-known/api-catalog`
- Human setup guide: `https://outreign.io/connect`

## How an agent gets access

1. Register a client dynamically (RFC 7591) at
   `https://ghgfjnepvxvxrncmskys.supabase.co/auth/v1/oauth/clients/register`.
2. Run the OAuth 2.1 authorization code flow with PKCE (`S256`) against
   `.../auth/v1/oauth/authorize`. The user signs in to OutReign and approves the
   client on the consent screen.
3. Exchange the code at `.../auth/v1/oauth/token` for an access token, then call
   the MCP endpoint with `Authorization: Bearer <access_token>`.
4. Refresh with the `refresh_token` grant. Tokens are scoped to the approving
   user; all data access is row-level-security enforced as that user.

## Identity and credential types

- Identity: human-delegated (an OutReign user account).
- Credentials: OAuth 2.1 access tokens (`Bearer`), obtained via authorization
  code + PKCE. Static API keys are not issued for agent access.
- Revocation: the user can revoke a connected client at any time from
  OutReign → Settings, which invalidates that client's tokens.

## Rules for agents

- Do not attempt to read or write data belonging to other users; requests are
  rejected server-side.
- Respect plan limits and credit-based usage gates; failed calls return a
  descriptive error rather than partial data.
- Outbound email sending requires an explicitly connected mailbox and remains
  subject to the user's sending controls.

Contact: support@bdotindustries.com

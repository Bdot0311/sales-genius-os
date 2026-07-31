---
name: outreign-outbound
description: Use OutReign's MCP server to find B2B leads, research and score them against an ICP, then draft and send personalized cold email sequences.
version: 0.2.0
---

# OutReign outbound

Use this skill when a user wants to find B2B prospects, qualify them against an
ideal customer profile (ICP), or draft and send cold outbound email through
OutReign.

## Connect

OutReign exposes a remote MCP server:

- Endpoint: `https://ghgfjnepvxvxrncmskys.supabase.co/functions/v1/mcp`
- Transport: streamable HTTP
- Auth: OAuth 2.1 (authorization code + PKCE). See `https://outreign.io/auth.md`.
- Server card: `https://outreign.io/.well-known/mcp/server-card.json`

## Workflow

1. **Load the ICP.** Call `list_icp_profiles` and use the user's saved profile as
   targeting context. Never invent targeting criteria when a profile exists.
2. **Find leads.** Use `search_leads` for saved leads, or `list_leads` to review
   what already exists before sourcing more.
3. **Qualify.** Prefer leads with a high ICP score and clear buying intent.
4. **Research before writing.** Personalization must come from real findings
   about the lead's company. If the research brief is thin, say so instead of
   inventing detail.
5. **Draft, then confirm.** Present drafts to the user for approval before
   sending. Use the sequence tools to review multi-touch cadence (day 0, 3, 7, 14).
6. **Follow up.** Use `list_recent_replies` and `list_recent_sent_emails` to keep
   threads current.

## Rules

- Never fabricate metrics, case studies, customer names, or results.
- One clear ask per email; keep first touches short and specific.
- Respect the user's sending limits and connected mailbox settings.
- All data is scoped to the signed-in user — do not attempt cross-user access.

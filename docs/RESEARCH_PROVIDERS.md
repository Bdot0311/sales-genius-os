# Research providers

This is what the code does. It is not a statement about a hosted account's env vars or request logs. Those were not read from production.

| Provider | Adapter in this repo | What calls it | Config | Live use verified here |
|---|---|---|---|---|
| Site fetch | `fetchPinnedPage` in `_shared/pinned-fetch.ts`, called by `research-lead` | `research-lead`, reached from `generate-email` and `agent-run` when no trusted snapshot exists and the last receipt is outside 10 minutes | None. Uses the lead's stored website. The name is resolved once; the socket is given that public address and does not resolve again. TLS still checks the hostname. | No. This run did not call a website |
| Parallel | `_shared/parallel.ts` | `externalResearchSearch`, called by `research-lead` on that same fetch. Not called on a retry inside 10 minutes | `PARALLEL_API_KEY`. Missing key returns `not_configured` and does not send HTTP | No |
| Context.dev | `_shared/context-dev.ts` | Same `externalResearchSearch` call, alongside Parallel. An unconfigured call returns before HTTP | `CONTEXT_DEV_GATEWAY_URL`, `LOVABLE_API_KEY`, `UDC_CONTEXT_DEV_API_KEY` | No |
| Firecrawl | None | Nothing | None | No. A site fetch is not Firecrawl |

Search snippets from Parallel and Context.dev are stored as partial and are not approved sentences. A sentence is approved only from a service-written `research_snapshots` row whose page status, host, and text match the lead. `leads.research_brief` is owner-writable and is not that approval.

Generation calls `research-lead` before drafting when that table has no ready fact and the last receipt is older than 10 minutes. A click inside the window holds and does not call the providers again. Refresh passes `force: true` and does spend another retrieval.

ColdIQ is a separate rescue for a page this app's own fetch could not read. It is not Firecrawl and it is not one of the three providers above.

The HTML page fetch dials the address returned by that one public lookup. A later DNS answer is not consulted, and a redirect is checked the same way before the next dial. `robots.txt` and sitemap reads still use ordinary `fetch` with redirects followed. Those are not pinned. No live site was fetched to prove the socket.

A ready fact does not have to contain a number. The model writes the draft with the tenant skills and may state only those sentences. The reply rubric runs before a full email is saved. If it does not return a score, the draft is held, including when the send canary is off. A starter plan that cannot call the rubric is plan-gated and is still held when a writing rule fails. Subject-only and trigger generation keep their own return shapes and still require the research step.

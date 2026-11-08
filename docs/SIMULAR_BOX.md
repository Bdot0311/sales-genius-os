# Simular Box

**Status: not connected. The gate refuses a session, including when a caller sets `enabled: true`.**

Checked 8 Nov 2026 against the public pages only. No Box account was used, the installer was not run, and `https://mcp.box.simular.ai/mcp` was not called.

## What the official pages support

| Source | What it says |
|---|---|
| [box.simular.ai](https://box.simular.ai/) | One cloud Linux desktop per account. It sleeps when idle and wakes when the AI connects. The computer is free. Model calls use the account's daily credits. |
| [install.md](https://box.simular.ai/install.md) | The installer adds the remote MCP server to developer clients (Claude Code, Codex, Cursor, and the other listed apps). It is not a backend provisioner. `shell` and `box_list` are mentioned as tools that show setup is done. |
| [docs/mcp.md](https://box.simular.ai/docs/mcp.md) | Endpoint `https://mcp.box.simular.ai/mcp`, Streamable HTTP. "One box per account, with Chrome and a persistent shell." The desktop can browse, click, type, read the screen, and run commands. |
| [auth.md](https://box.simular.ai/auth.md) | No agent self-registration. OAuth is authorization code + PKCE, scope `boxes`, resource pinned to the MCP URL. A personal key is `Authorization: Bearer cb_...` from a person's Simular account. |

The OAuth screen asks which boxes an app may use and for how long. That is the account holder approving their own desktop. It is not a contract for running one computer per Outreign tenant.

## What is not supported, and blocks a live session

- No verified server-side, multi-tenant desktop. One desktop per Simular account would be the owner's personal computer if this app connected with the owner's key.
- No published credit amount, refill, or per-call price. "The computer is free" does not price the model calls that spend daily credits.
- No published safe tool schema. Shell and browser control are the product, and this app does not accept model-provided shell commands, browser mutations, sends, or external submissions.
- No server credential model that isolates one Outreign tenant from another. Personal OAuth and `cb_` keys are per Simular account.
- [platform.simular.ai](https://platform.simular.ai/) (Sai) is a separate product. It was not adopted and is not a substitute for the missing contract.

`admitBoxAttempt` in `supabase/functions/_shared/simular-box.ts` records a failed receipt and returns `network: "none"`. Research still reads the lead site with Firecrawl and then calls Parallel and Context together. Box is not on that path, and no agent tool exposes it.

## What a later activation would have to add first

All of these, in a change that still does not share one person's desktop:

1. A written per-tenant computer and credential model.
2. A confirmed credit price, and an admission check that runs before the call is billed.
3. An allowlist that excludes shell, browser mutation, send, and external submit.
4. Receipts stored with the existing replay rule: a dispatching, completed, or unknown outcome is not run again.
5. Remote desktop text kept as untrusted data, not as an approved research sentence.

This document does not say those exist.

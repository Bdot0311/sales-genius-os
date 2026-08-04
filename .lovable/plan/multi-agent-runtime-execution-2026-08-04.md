# Make extra AI agent builds actually run

## Confirmed problem
`agent_configs` allows multiple rows per user (Growth 3, Pro 5, Elite unlimited), and `AgentSwitcher` lets users create, name, role-label and enable each one. But every runtime entry point loads exactly one row:

- `supabase/functions/agent-run/index.ts:172-178` — `.order("is_primary").limit(1).single()`
- `supabase/functions/agent-chat/index.ts:499`
- `supabase/functions/agent-test/index.ts:184`
- `supabase/functions/mcp/index.ts:500, 556`

No caller ever passes an agent id, so non-primary agents never execute even when `enabled = true`.

## Plan

1. **Thread an explicit agent id through the runtime**
   - Add optional `agentId` to the request body of `agent-run`, `agent-chat` and `agent-test`.
   - When present, load that row scoped by `user_id` (reject mismatch with 403). When absent, keep the current primary fallback for backwards compatibility.

2. **Run every enabled agent in autonomous mode**
   - In `agent-run`, when no `agentId` is given and `mode === "autonomous"`, fetch all `enabled = true` rows for the user and loop the existing per-agent pipeline, aggregating results per agent in the response and in `agent_actions` (store `agent_config_id` on each action row so activity can be attributed).
   - Add `agent_config_id` to `agent_actions` (nullable, FK to `agent_configs`) via migration, backfilled to the primary agent for existing rows.

3. **Honour the role label**
   - Gate the pipeline phases by `role`: `lead_gen` runs sourcing/enrichment only, `outreach` runs drafting/sending only, `replies` runs classification/reply only, `full_cycle` runs all. Today role is cosmetic.

4. **Frontend wiring**
   - `AgentChat.tsx` and `AgentTestDialog.tsx` pass the currently selected agent id from the switcher.
   - `AgentSwitcher` card badge distinguishes "Active" vs "Active (primary)" so the primary/secondary distinction is visible.

5. **MCP tools**
   - `mcp/index.ts` `get_agent_stats` and `update_agent_config` accept an optional agent name/id and default to the primary; stats aggregate across agents.

6. **Verify and deploy**
   - Redeploy `agent-run`, `agent-chat`, `agent-test`, `mcp`.
   - Test: create a second `lead_gen` agent, enable it, run autonomous mode, confirm `agent_actions` rows appear for both `agent_config_id` values and that role gating limits each agent's phases.

## Risk notes
This touches the core autonomous pipeline and daily-limit accounting (per-agent vs per-user reply caps need a decision: plan-level caps should stay per-user to avoid multiplying send volume by agent count).

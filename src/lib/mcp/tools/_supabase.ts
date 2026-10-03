import { createClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";

export function supabaseForUser(ctx: ToolContext) {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}

export function notAuthed() {
  return { content: [{ type: "text" as const, text: "Not authenticated" }], isError: true };
}

export function err(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

export function ok(payload: unknown, key = "result") {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: { [key]: payload },
  };
}

/**
 * Plan gate for every MCP tool call. Free accounts have no MCP access; paid
 * tiers are rate limited per minute and per day by `public.mcp_consume_call`.
 * Returns an error result to short-circuit the handler, or null to proceed.
 */
export async function planGate(ctx: ToolContext, tool: string) {
  const { data, error } = await supabaseForUser(ctx).rpc("mcp_consume_call" as never, { _tool: tool } as never);
  if (error) return err("Could not verify your plan's MCP access. Try again shortly.");
  const res = data as { allowed?: boolean; reason?: string } | null;
  if (!res?.allowed) return err(res?.reason ?? "MCP access is not available on your plan.");
  return null;
}

import type { ToolContext } from "@lovable.dev/mcp-js";
import { planGate, supabaseForUser, err } from "./tools/_supabase";

// The user's OAuth token reaches the same app handler as a browser request.
// No service credential, owner argument or alternate provider pipeline.
export async function callAppAction(ctx: ToolContext, tool: string, fn: string, body: unknown) {
  if (!ctx.isAuthenticated() || !ctx.getToken()) return err("Not authenticated");
  const blocked = await planGate(ctx, tool);
  if (blocked) return blocked;
  const { data, error } = await supabaseForUser(ctx).functions.invoke(fn, { body });
  if (error) return err("The action could not complete. Check your account access and try again.");
  if (data?.error || data?.success === false) return err(data?.error ?? "The action did not complete.");
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}
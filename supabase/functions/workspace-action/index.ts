import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0?target=deno";
import { corsHeaders as sdkCorsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { resolveAppUser } from "../_shared/app-user.ts";
import { OUTBOUND_TOOL_DEFS, runOutboundTool } from "../_shared/agent-outbound-tools.ts";
import { allowedToolsFor } from "../_shared/agent-tool-scope.ts";
import { agentTierForPlan, capToolsToTier } from "../_shared/agent-tier-scope.ts";
import { validateToolArgs } from "../_shared/tool-args.ts";
const corsHeaders = { ...sdkCorsHeaders, "Access-Control-Allow-Headers": `${sdkCorsHeaders["Access-Control-Allow-Headers"]}, x-api-key` };
Deno.serve(async req => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const caller = await resolveAppUser(req, db);
    if (!caller.user) return json({ error: caller.error }, caller.status);
    const body = await req.json().catch(() => null);
    if (!body || typeof body.action !== "string" || Object.keys(body).some(k => !["action", "args", "agent_id", "confirmed"].includes(k))) return json({ error: "Invalid action request" }, 400);
    const definition = OUTBOUND_TOOL_DEFS.find(t => t.function.name === body.action);
    if (!definition) return json({ error: "Unsupported workspace action" }, 400);
    const args = body.args ?? {};
    if (!args || typeof args !== "object" || Array.isArray(args) || JSON.stringify(args).length > 16000 || Object.keys(args).some(k => !(k in definition.function.parameters.properties))) return json({ error: "Invalid action arguments" }, 400);
    const checked = validateToolArgs(definition.function.parameters, args);
    if (!checked.ok) return json({ error: "Invalid action arguments", problems: checked.errors }, 400);
    const { data: plan, error: planError } = await db.rpc("plan_for_user", { _user_id: caller.user.id });
    if (planError) return json({ error: "Plan check unavailable" }, 503);
    if (!plan || plan === "free") return json({ error: "Workspace API access requires a paid plan" }, 403);
    let config = null;
    if (body.agent_id) {
      const { data, error } = await db.from("agent_configs").select("role,allowed_tools").eq("id", body.agent_id).eq("user_id", caller.user.id).maybeSingle();
      if (error || !data) return json({ error: "Agent not found in this account" }, 404);
      config = data;
    }
    const tools = capToolsToTier(allowedToolsFor(config), agentTierForPlan(plan));
    if (!tools.includes(body.action)) return json({ error: "Action outside this agent's role or plan" }, 403);
    const readOnly = body.action.startsWith("list_") || body.action === "get_outbound_stats";
    if (!readOnly && body.confirmed !== true) return json({ confirmation_required: true, action: body.action, args: checked.args, message: "Review these exact changes and confirm before calling again. Nothing changed." });
    const { data: allowed, error: limitError } = await db.rpc("consume_rate_limit", { _key: `workspace-actions:${caller.user.id}`, _max: 30, _window_seconds: 60 });
    if (limitError) return json({ error: "Usage check unavailable" }, 503);
    if (!allowed) return json({ error: "Workspace action rate limit reached" }, 429);
    const result = await runOutboundTool(body.action, checked.args, {
      admin: db, userId: caller.user.id, toolEvents: [],
      edge: { url: Deno.env.get("SUPABASE_URL") ?? "", serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "" },
    });
    return json(result ?? { error: "Unsupported action" });
  } catch { return json({ error: "Workspace action could not complete" }, 200); }
});
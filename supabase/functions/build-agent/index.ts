import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";
import { aiFetch } from "../_shared/ai-provider.ts";
import {
  ALL_AGENT_TOOLS,
  CORE_TOOLS,
  DESTRUCTIVE_TOOLS,
  TOOL_CATALOG,
  allowedToolsFor,
  withToolPrerequisites,
} from "../_shared/agent-tool-scope.ts";
import {
  blockedToolsFor,
  capToolsToTier,
  resolveAgentTier,
} from "../_shared/agent-tier-scope.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const ROLES = ["full_cycle", "lead_gen", "outreach", "replies", "custom"];
const TONES = ["professional", "friendly", "direct", "casual"];

const SYSTEM = `You turn a plain-English description of a sales agent into a configuration for an AI SDR platform.

Return ONLY raw JSON, no markdown fences, with these keys:
{
  "agent_name": string,             // short, human, no quotes, max 40 chars
  "role": one of ${ROLES.join(" | ")},
  "tone": one of ${TONES.join(" | ")},
  "persona": string,                // 1-2 sentences describing how it behaves
  "company_context": string,        // what the user's company does, only if stated, else ""
  "value_props": string[],          // 0-4 short value props, only if stated
  "role_instructions": string,      // operating rules and boundaries for this build, 2-5 sentences
  "allowed_tools": string[],        // required when role is "custom": pick from the tool list
  "prospecting_job_title": string,  // "" if not stated
  "prospecting_industry": string,
  "prospecting_country": string,
  "prospecting_company_size": string,
  "daily_lead_target": number,      // 0 if the build does not source leads
  "max_daily_new_emails": number    // 0 if the build does not send email
}

Tools available to custom builds (name — what it does). Pick from these names only:
${Object.entries(TOOL_CATALOG).map(([name, desc]) => `- ${name}: ${desc}`).join("\n")}

Rules:
- Default to "custom" with an explicit allowed_tools list. Only use a fixed role when the description matches it exactly end to end.
- Grant every tool the described job actually needs to finish, not just tools whose names sound like the description. Work through the job: to write email you need draft_outreach; to send you need send_drafts or send_outreach; to send later you need schedule_drafts; to act on inbound mail you need list_recent_replies.
- Worked example: "a follow-up agent" reads replies and sent history AND writes, schedules and sends follow-up email — list_recent_replies, list_leads, get_lead, draft_outreach, list_drafts, list_mailboxes, schedule_drafts, list_scheduled_emails, send_drafts, send_outreach. Granting only reply-reading would make that build useless.
- A build must never be granted only read-only tools when the description asks it to do work.
- Never grant sourcing tools (find_leads, search_companies) unless the description asks for new prospects.
- Never grant destructive tools (${DESTRUCTIVE_TOOLS.join(", ")}) unless the description explicitly asks the agent to delete or clean things up.
- Never invent the user's company, customers, metrics or proof. Leave fields empty when they are not stated.
- role_instructions must state clearly what the agent must NOT do.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Authorization required" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: { user }, error: userError } = await admin.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (userError || !user) return json({ error: "Invalid user token" }, 401);

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const description = typeof body.description === "string" ? body.description.trim() : "";
    if (description.length < 10) {
      return json({ error: "Describe the agent in a sentence or two.", error_code: "invalid_input" }, 400);
    }

    // Ground the build in what the user already told us about their business.
    const [{ data: profile }, { data: icp }] = await Promise.all([
      admin.from("profiles").select("full_name, company_name").eq("id", user.id).maybeSingle(),
      admin
        .from("icp_profiles")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    const res = await aiFetch("build-agent", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: 0.3,
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: `Description of the agent to build:\n${description}\n\nAccount context (use only what is relevant, do not invent):\nUser: ${
              profile?.full_name ?? "unknown"
            }\nCompany: ${profile?.company_name ?? "unknown"}\nSaved ICP: ${
              icp ? JSON.stringify(icp).slice(0, 1500) : "none"
            }\n\nJSON:`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const status = res.status;
      return json(
        {
          error:
            status === 429
              ? "Too many requests right now. Try again shortly."
              : "Could not build the agent right now. Try again, or create it manually.",
          error_code: status === 429 ? "rate_limit" : "ai_failed",
        },
        200,
      );
    }

    const data = await res.json();
    const raw: string = data.choices?.[0]?.message?.content ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return json({ error: "Could not read the build result.", error_code: "ai_failed" }, 200);

    let parsed: Record<string, any>;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return json({ error: "Could not read the build result.", error_code: "ai_failed" }, 200);
    }

    const str = (v: unknown, max = 400) => (typeof v === "string" ? v.trim().slice(0, max) : "");
    const num = (v: unknown, fallback: number) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n), 500) : fallback;
    };

    const requestedRole = ROLES.includes(parsed.role) ? parsed.role : "full_cycle";
    const grantedTools = Array.isArray(parsed.allowed_tools)
      ? parsed.allowed_tools.filter((t: unknown) => typeof t === "string" && ALL_AGENT_TOOLS.includes(t))
      : [];

    // Route the build through the account's plan tier: whatever the description
    // asked for, the build can only be granted tools the plan allows. If the
    // plan strips anything from the chosen role, the build becomes a custom one
    // carrying the capped allow-list so the limit is saved, not just displayed.
    const tier = await resolveAgentTier(admin as any, user.id);
    const wanted =
      requestedRole === "custom"
        ? [...new Set([...CORE_TOOLS, ...grantedTools])]
        : allowedToolsFor({ role: requestedRole });
    const cappedTools = capToolsToTier(wanted, tier);
    const removedByPlan = blockedToolsFor(wanted, tier);
    const role = removedByPlan.length > 0 ? "custom" : requestedRole;

    const config = {
      agent_name: str(parsed.agent_name, 40) || "Custom agent",
      role,
      tone: TONES.includes(parsed.tone) ? parsed.tone : "professional",
      persona: str(parsed.persona, 600),
      company_context: str(parsed.company_context, 1200),
      value_props: Array.isArray(parsed.value_props)
        ? parsed.value_props.filter((v: unknown) => typeof v === "string" && v.trim()).slice(0, 4)
        : [],
      role_instructions: str(parsed.role_instructions, 1200),
      allowed_tools: role === "custom" ? cappedTools : null,
      prospecting_job_title: str(parsed.prospecting_job_title, 120),
      prospecting_industry: str(parsed.prospecting_industry, 120),
      prospecting_country: str(parsed.prospecting_country, 120),
      prospecting_company_size: str(parsed.prospecting_company_size, 60),
      daily_lead_target: num(parsed.daily_lead_target, 10),
      max_daily_new_emails: num(parsed.max_daily_new_emails, 20),
    };

    return json({
      success: true,
      config,
      plan_tier: tier,
      removed_by_plan: removedByPlan,
      requested_role: requestedRole,
    });
  } catch (e) {
    console.error("build-agent failed", e);
    return json({ error: "Could not build the agent right now.", error_code: "unexpected" }, 200);
  }
});

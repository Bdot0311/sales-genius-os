import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isDemoMode, demoResponse } from "../_shared/demo-mode.ts";
import { captureServerEvent } from "../_shared/posthog.ts";
import {
  PLAYBOOK_SYSTEM_RULES,
  buildTouchPrompt,
  parseTouches,
  scheduleFollowUps,
} from "../_shared/cold-email-playbook.ts";



const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function callGemini(prompt: string, systemPrompt: string): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
    }),
  });
  const data = await response.json();
  return data.choices[0].message.content;
}

const SPAM_TRIGGERS = [
  "free", "guarantee", "winner", "congratulations", "act now", "limited time",
  "click here", "earn money", "make money", "risk free", "special promotion",
  "no obligation", "100%", "$$$", "discount", "cash bonus",
];

function deliverabilityCheck(subject: string, body: string): { ok: boolean; hits: string[] } {
  const text = `${subject} ${body}`.toLowerCase();
  const hits = SPAM_TRIGGERS.filter((w) => text.includes(w));
  return { ok: hits.length === 0, hits };
}

interface Reply {
  sentEmailId: string;
  gmailMessageId: string;
  fromEmail: string;
  subject: string;
  bodyText: string;
  receivedAt: string;
  gmailThreadId: string;
}

interface AgentConfig {
  id: string;
  enabled: boolean;
  agent_name: string;
  persona: string;
  tone: string;
  company_context: string | null;
  value_props: string[];
  objection_responses: Record<string, string>;
  can_reply_interested: boolean;
  can_handle_objections: boolean;
  can_book_meetings: boolean;
  calendly_url: string | null;
  max_daily_auto_replies: number;
  reply_delay_minutes: number;
  signature: string | null;
  can_find_leads: boolean;
  can_send_outreach: boolean;
  prospecting_job_title: string | null;
  prospecting_industry: string | null;
  prospecting_country: string | null;
  prospecting_company_size: string | null;
  daily_lead_target: number;
  max_daily_new_emails: number;
  icp_profile_id: string | null;
  icp_snapshot: Record<string, any> | null;
}

/** Maps an ICP employee-count range onto the provider's size buckets. */
function bucketFromRange(min?: number | null, max?: number | null): string {
  const lo = typeof min === "number" ? min : 0;
  const hi = typeof max === "number" && max > 0 ? max : lo;
  const mid = hi || lo;
  if (!mid) return "";
  if (mid <= 10) return "1-10";
  if (mid <= 50) return "11-50";
  if (mid <= 200) return "51-200";
  if (mid <= 500) return "201-500";
  if (mid <= 1000) return "501-1000";
  return "1000+";
}

/** Renders the saved ICP profile as prompt/search context so runs stay grounded. */
function buildIcpContext(snap: Record<string, any> | null | undefined): string {

  if (!snap || typeof snap !== "object") return "";
  const list = (v: unknown) => (Array.isArray(v) ? v.filter(Boolean).join(", ") : "");
  const lines: string[] = [];
  if (snap.name) lines.push(`ICP profile: ${snap.name}`);
  if (snap.summary) lines.push(`Summary: ${snap.summary}`);
  if (list(snap.target_titles)) lines.push(`Target titles: ${list(snap.target_titles)}`);
  if (list(snap.seniority_levels)) lines.push(`Seniority: ${list(snap.seniority_levels)}`);
  if (list(snap.departments)) lines.push(`Departments: ${list(snap.departments)}`);
  if (list(snap.industries)) lines.push(`Industries: ${list(snap.industries)}`);
  if (list(snap.geographies)) lines.push(`Geographies: ${list(snap.geographies)}`);
  if (snap.company_size_min || snap.company_size_max) {
    lines.push(`Company size: ${snap.company_size_min ?? "?"}-${snap.company_size_max ?? "?"} employees`);
  }
  if (list(snap.pain_points)) lines.push(`Pain points they feel: ${list(snap.pain_points)}`);
  if (list(snap.buying_signals)) lines.push(`Buying signals: ${list(snap.buying_signals)}`);
  if (list(snap.intent_keywords)) lines.push(`Intent keywords: ${list(snap.intent_keywords)}`);
  if (list(snap.event_triggers)) lines.push(`Trigger events: ${list(snap.event_triggers)}`);
  if (list(snap.hiring_signals)) lines.push(`Hiring signals: ${list(snap.hiring_signals)}`);
  if (list(snap.tech_stack)) lines.push(`Tech stack: ${list(snap.tech_stack)}`);
  if (list(snap.competitor_tools)) lines.push(`Competitor tools: ${list(snap.competitor_tools)}`);
  if (list(snap.use_cases)) lines.push(`Use cases: ${list(snap.use_cases)}`);
  if (snap.value_proposition) lines.push(`Value proposition: ${snap.value_proposition}`);
  if (list(snap.success_metrics)) lines.push(`Success metrics: ${list(snap.success_metrics)}`);
  if (list(snap.objections)) lines.push(`Common objections: ${list(snap.objections)}`);
  if (snap.customer_examples) lines.push(`Customer examples: ${snap.customer_examples}`);
  if (snap.disqualifiers) lines.push(`Disqualifiers: ${snap.disqualifiers}`);
  const excl = [list(snap.exclude_titles), list(snap.exclude_industries), list(snap.exclude_keywords)]
    .filter(Boolean)
    .join(" | ");
  if (excl) lines.push(`Never target: ${excl}`);
  if (snap.notes) lines.push(`Notes: ${snap.notes}`);
  return lines.length ? `IDEAL CUSTOMER PROFILE (use this for relevance and personalization):\n${lines.join("\n")}` : "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const reqBody: { mode?: string; agentId?: string; trigger?: string } = await req.json().catch(() => ({}));

  // Every invocation gets a run id so the UI can group the audit trail into
  // discrete runs, and record *why* a run produced nothing.
  const runId = crypto.randomUUID();
  const triggerSource = typeof reqBody.trigger === "string" ? reqBody.trigger : "manual";
  const auditClient = createClient(supabaseUrl, serviceKey);
  let auditUserId: string | null = null;
  let auditAgentId: string | null = null;

  const logRunEvent = async (row: Record<string, unknown>) => {
    if (!auditUserId) return;
    try {
      await auditClient.from("agent_actions").insert({
        user_id: auditUserId,
        agent_config_id: auditAgentId,
        run_id: runId,
        ...row,
      });
    } catch (logErr) {
      console.error("agent-run audit log failed:", logErr);
    }
  };

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    const {
      data: { user },
      error: authError,
    } = await adminClient.auth.getUser(authHeader.replace("Bearer ", ""));

    // Demo mode: simulate instead of hitting providers or spending credits
    if (user && await isDemoMode(adminClient, user.id)) {
      return demoResponse({ message: 'Agent run simulated in demo mode — no emails sent and no credits spent.', actions: [] }, corsHeaders);
    }
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    auditUserId = user.id;

    // ── Agent resolution ──────────────────────────────────────────────────
    // A user can own several agent builds. When no specific agent is named we
    // fan out over every enabled build (each one runs as its own invocation of
    // this function) so extra builds are not silently ignored.
    const requestedAgentId = typeof reqBody.agentId === "string" ? reqBody.agentId : null;

    let agentConfig: Record<string, any> | null = null;

    if (requestedAgentId) {
      const { data } = await adminClient
        .from("agent_configs")
        .select("*")
        .eq("id", requestedAgentId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!data) {
        await logRunEvent({
          action_type: "skipped",
          status: "skipped",
          description: "Run skipped: this agent build no longer exists.",
          metadata: { phase: "run", reason: "agent_not_found", trigger: triggerSource, requested_agent_id: requestedAgentId },
        });
        return new Response(
          JSON.stringify({ success: false, message: "Agent not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      agentConfig = data as Record<string, any>;
    } else {
      const { data: allAgents } = await adminClient
        .from("agent_configs")
        .select("*")
        .eq("user_id", user.id)
        .order("is_primary", { ascending: false })
        .order("updated_at", { ascending: false });

      const enabledAgents = (allAgents ?? []).filter((a: any) => a.enabled);

      if (enabledAgents.length > 1) {
        const results = await Promise.all(
          enabledAgents.map(async (a: any) => {
            try {
              const res = await fetch(`${supabaseUrl}/functions/v1/agent-run`, {
                method: "POST",
                headers: { Authorization: authHeader, "Content-Type": "application/json" },
                body: JSON.stringify({ ...reqBody, agentId: a.id, trigger: triggerSource }),
              });
              const payload = await res.json().catch(() => ({}));
              return { agentId: a.id, agentName: a.agent_name, role: a.role ?? "full_cycle", ...payload };
            } catch (fanErr: any) {
              return {
                agentId: a.id,
                agentName: a.agent_name,
                role: a.role ?? "full_cycle",
                success: false,
                error: fanErr?.message ?? "run failed",
              };
            }
          })
        );

        const total = (key: string) =>
          results.reduce((sum, r: any) => sum + (typeof r[key] === "number" ? r[key] : 0), 0);

        return new Response(
          JSON.stringify({
            success: results.some((r: any) => r.success),
            multiAgent: true,
            agentsRun: results.length,
            summary: `Ran ${results.length} agent(s): ${results
              .map((r: any) => `${r.agentName || "agent"} (${r.success ? "ok" : "failed"})`)
              .join(", ")}.`,
            leadsFound: total("leadsFound"),
            outreachSent: total("outreachSent"),
            outreachDrafted: total("outreachDrafted"),
            pendingApprovals: total("pendingApprovals"),
            repliesProcessed: total("repliesProcessed"),
            repliesSent: total("repliesSent"),
            meetingsBooked: total("meetingsBooked"),
            threadsChecked: total("threadsChecked"),
            agents: results,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      agentConfig = (enabledAgents[0] ?? (allAgents ?? [])[0] ?? null) as Record<string, any> | null;
    }

    if (!agentConfig) {
      await logRunEvent({
        action_type: "skipped",
        status: "skipped",
        description: "Run skipped: no agent build has been set up yet.",
        metadata: { phase: "run", reason: "no_agent_configured", trigger: triggerSource },
      });
      return new Response(
        JSON.stringify({ success: false, message: "Agent is not enabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const config = agentConfig as unknown as AgentConfig;

    if (!config.enabled) {
      auditAgentId = config.id;
      await logRunEvent({
        action_type: "skipped",
        status: "skipped",
        description: `Run skipped: ${config.agent_name || "this agent"} is switched off.`,
        metadata: { phase: "run", reason: "agent_disabled", trigger: triggerSource },
      });
      return new Response(
        JSON.stringify({ success: false, message: "Agent is not enabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Role gating: a build labelled "lead gen" must not send outreach or answer
    // replies, and so on. "full_cycle" runs every phase.
    const agentRole = String((agentConfig as any).role ?? "full_cycle");
    const runLeadGen = agentRole === "full_cycle" || agentRole === "lead_gen";
    const runOutreach = agentRole === "full_cycle" || agentRole === "outreach";
    const runReplies = agentRole === "full_cycle" || agentRole === "replies";

    // Every action row is attributed to the agent build that produced it.
    auditAgentId = config.id;
    const logAction = (row: Record<string, unknown>) =>
      adminClient.from("agent_actions").insert({ agent_config_id: config.id, run_id: runId, ...row });

    // Reply capacity stays per user, not per agent, so extra builds never
    // multiply the volume the plan allows.
    const { count: dailyReplyCount } = await adminClient
      .from("agent_actions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("action_type", "reply_sent")
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    const remainingReplies = Math.max(
      0,
      (config.max_daily_auto_replies ?? 0) - (dailyReplyCount ?? 0)
    );


    const { data: senderAccounts } = await adminClient
      .from("sending_accounts")
      .select("integration_id, email, status, updated_at")
      .eq("user_id", user.id)
      .in("provider", ["google", "gmail"])
      .not("integration_id", "is", null)
      .order("updated_at", { ascending: false });

    const activeSender = (senderAccounts ?? []).find(
      (account) =>
        account.integration_id &&
        account.status !== "paused" &&
        account.status !== "disabled"
    );

    let googleIntegrationId: string | null = activeSender?.integration_id ?? null;
    const senderEmail: string | null = activeSender?.email ?? null;

    if (!googleIntegrationId) {
      const { data: integration } = await adminClient
        .from("integrations")
        .select("id")
        .eq("user_id", user.id)
        .eq("integration_id", "google")
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      googleIntegrationId = integration?.id ?? null;
    }

    const icpSnapshot = (config as any).icp_snapshot ?? null;
    const icpContext = buildIcpContext(icpSnapshot);
    const icpList = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()) : []);

    const cfgValueProps = Array.isArray(config.value_props) ? config.value_props : [];
    const cfgValuePropsText = cfgValueProps.join("\n");

    // Run mode: "approval" queues drafts for human review, "autonomous" sends directly.
    const approvalMode =
      reqBody.mode === "approval"
        ? true
        : reqBody.mode === "autonomous"
        ? false
        : (agentConfig as any).approval_mode !== false;

    let pendingApprovals = 0;

    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    async function queueApproval(row: Record<string, unknown>) {
      const { error } = await adminClient.from("agent_approvals").insert({
        user_id: user.id,
        status: "pending",
        ...row,
      });
      if (error) {
        console.error("queueApproval error:", error.message);
        return false;
      }
      pendingApprovals++;
      return true;
    }

    // ────────────────────────────────────────────────────────────────────────
    // PHASE 1 — Lead generation
    // ────────────────────────────────────────────────────────────────────────
    let leadsFound = 0;
    if (runLeadGen && config.can_find_leads) {
      try {
        const target = Math.min(Math.max(config.daily_lead_target ?? 10, 1), 25);
        // Rotate the result page as the agent accumulates leads, so consecutive
        // runs don't keep pulling the same first page from the provider.
        const { count: agentLeadCount } = await adminClient
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("source", "ai_agent");
        let searchPage = Math.floor((agentLeadCount ?? 0) / target) + 1;
        const searchBody: Record<string, unknown> = {
          // The saved ICP profile is the source of truth. The legacy single-field
          // targeting on agent_configs is only a fallback for users with no ICP.
          job_title: icpList(icpSnapshot?.target_titles)[0] || config.prospecting_job_title || undefined,
          job_titles: icpList(icpSnapshot?.target_titles).length
            ? icpList(icpSnapshot?.target_titles)
            : undefined,
          industry: icpList(icpSnapshot?.industries)[0] || config.prospecting_industry || undefined,
          industries: icpList(icpSnapshot?.industries).length ? icpList(icpSnapshot?.industries) : undefined,
          country: icpList(icpSnapshot?.geographies)[0] || config.prospecting_country || undefined,
          countries: icpList(icpSnapshot?.geographies).length ? icpList(icpSnapshot?.geographies) : undefined,
          company_size:
            icpSnapshot?.company_size_bucket ||
            bucketFromRange(icpSnapshot?.company_size_min, icpSnapshot?.company_size_max) ||
            config.prospecting_company_size ||
            undefined,
          seniority: icpList(icpSnapshot?.seniority_levels)[0] || undefined,
          seniority_levels: icpList(icpSnapshot?.seniority_levels).length
            ? icpList(icpSnapshot?.seniority_levels)
            : undefined,
          keywords: icpList(icpSnapshot?.intent_keywords).length
            ? icpList(icpSnapshot?.intent_keywords)
            : undefined,
          exclude_titles: icpList(icpSnapshot?.exclude_titles).length
            ? icpList(icpSnapshot?.exclude_titles)
            : undefined,
          exclude_industries: icpList(icpSnapshot?.exclude_industries).length
            ? icpList(icpSnapshot?.exclude_industries)
            : undefined,
          exclude_keywords: icpList(icpSnapshot?.exclude_keywords).length
            ? icpList(icpSnapshot?.exclude_keywords)
            : undefined,
          limit: target,
          // Non-strict so the backend's broadening ladder runs: it only drops
          // secondary filters (industry/seniority/size) that fail to resolve in
          // the provider taxonomy while keeping title and geography, so an ICP
          // returns people instead of 0. Never return people already saved.
          strict: false,
          exclude_seen: true,
        };
        const runSearch = async (pg: number) => {
          const r = await fetch(`${supabaseUrl}/functions/v1/fetch-external-leads`, {
            method: "POST",
            headers: { Authorization: authHeader, "Content-Type": "application/json" },
            body: JSON.stringify({ ...searchBody, page: pg }),
          });
          return await r.json().catch(() => ({}));
        };
        let searchData = await runSearch(searchPage);
        let foundLeads: any[] = Array.isArray(searchData?.leads) ? searchData.leads : [];
        // searchPage is derived from cumulative agent-sourced count, which
        // overshoots once the ICP is exhausted or after the ICP changes (the
        // counter is global). If an advanced page comes back empty, retry from
        // page 1; exclude_seen keeps already-saved leads out, so page 1 only
        // returns genuinely new matches.
        if (foundLeads.length === 0 && !searchData?.error && searchPage > 1) {
          searchPage = 1;
          searchData = await runSearch(searchPage);
          foundLeads = Array.isArray(searchData?.leads) ? searchData.leads : [];
        }

        for (const l of foundLeads) {
          const email = (l.business_email || "").trim().toLowerCase();
          const name = (l.contact_name || "").trim();
          if (!email && !name) continue;

          // Dedupe on email when we have one, otherwise on name + company
          let existingLead: { id: string } | null = null;
          if (email) {
            const { data } = await adminClient
              .from("leads")
              .select("id")
              .eq("user_id", user.id)
              .ilike("contact_email", email)
              .maybeSingle();
            existingLead = data ?? null;
          } else {
            const { data } = await adminClient
              .from("leads")
              .select("id")
              .eq("user_id", user.id)
              .ilike("contact_name", name)
              .ilike("company_name", l.company_name || "Unknown")
              .maybeSingle();
            existingLead = data ?? null;
          }
          if (existingLead) continue;

          const { error: insertLeadErr } = await adminClient.from("leads").insert({
            user_id: user.id,
            contact_name: name || email.split("@")[0],
            contact_email: email || null,
            company_name: l.company_name || "Unknown",
            company_website: l.company_domain || null,
            job_title: l.job_title || null,
            industry: l.industry || null,
            company_size: l.company_size || null,
            linkedin_url: l.linkedin_url || null,
            icp_score: l.scores?.icp_score ?? null,
            intent_score: l.scores?.intent_score ?? null,
            signals: Array.isArray(l.buying_signals) ? l.buying_signals : null,
            source: "ai_agent",
            lead_status: "discovered",
            enrichment_status: email ? "enriched" : "pending",
          });
          if (insertLeadErr) {
            console.error("agent lead insert error:", insertLeadErr.message);
            continue;
          }

          leadsFound++;
          await logAction({
            user_id: user.id,
            action_type: "lead_found",
            status: "completed",
            prospect_email: email || null,
            description: `Found ${l.job_title || "contact"}${name ? ` ${name}` : ""} at ${l.company_name || "company"}${email ? "" : " — no email yet, needs enrichment"}`,
            metadata: { source: "ai_agent", icp_score: l.scores?.icp_score ?? null, has_email: !!email },
          });
        }

        if (foundLeads.length === 0) {
          await logAction({
            user_id: user.id,
            action_type: "skipped",
            status: "skipped",
            description: `Lead search returned no matches for ${
              [
                icpList(icpSnapshot?.target_titles).join(", ") || config.prospecting_job_title,
                icpList(icpSnapshot?.industries).join(", ") || config.prospecting_industry,
                icpList(icpSnapshot?.geographies).join(", ") || config.prospecting_country,
              ]
                .filter(Boolean)
                .join(" · ") || "your targeting"
            }${icpSnapshot?.name ? ` (ICP: ${icpSnapshot.name})` : ""} — try broadening the targeting in your ICP profile.`,
            metadata: { phase: "prospecting", icp_profile: icpSnapshot?.name ?? null },

          });
        }


        if (searchData?.error) {
          await logAction({
            user_id: user.id,
            action_type: "skipped",
            status: "skipped",
            description: `Lead search skipped: ${searchData.error}`,
            metadata: { phase: "prospecting", error_code: searchData.error_code ?? null },
          });
        }
      } catch (prospectErr: any) {
        console.error("agent prospecting error:", prospectErr?.message);
        await logAction({
          user_id: user.id,
          action_type: "error",
          status: "failed",
          description: "Lead generation failed",
          error_message: prospectErr?.message ?? "unknown",
          metadata: { phase: "prospecting" },
        });
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // PHASE 2 — First-touch outreach
    // ────────────────────────────────────────────────────────────────────────
    let outreachSent = 0;
    let outreachDrafted = 0;
    if (runOutreach && config.can_send_outreach && googleIntegrationId) {
      try {
        const dailyCap = Math.min(Math.max(config.max_daily_new_emails ?? 20, 0), 100);
        const { count: sentToday } = await adminClient
          .from("agent_actions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("action_type", "outreach_sent")
          .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

        let remainingOutreach = Math.max(0, dailyCap - (sentToday ?? 0));

        if (remainingOutreach > 0) {
          const { data: pendingLeads, error: pendingLeadsError } = await adminClient
            .from("leads")
            .select("id, contact_name, contact_email, company_name, job_title, industry, signals")
            .eq("user_id", user.id)
            .not("contact_email", "is", null)
            .is("last_contacted_at", null)
            .order("icp_score", { ascending: false, nullsFirst: false })
            .limit(remainingOutreach);

          if (pendingLeadsError) throw pendingLeadsError;

          if ((pendingLeads ?? []).length === 0) {
            await logAction({
              user_id: user.id,
              action_type: "skipped",
              status: "skipped",
              description: "No uncontacted leads with emails are ready for first-touch outreach yet.",
              metadata: { phase: "outreach", reason: "no_pending_leads" },
            });
          }

          for (const lead of pendingLeads ?? []) {
            if (remainingOutreach <= 0) break;
            const to = (lead.contact_email || "").trim();
            if (!to) continue;
            if (!EMAIL_RE.test(to)) {
              await logAction({
                user_id: user.id,
                action_type: "skipped",
                status: "skipped",
                prospect_email: to,
                description: `Skipped ${lead.company_name ?? "lead"} — "${to}" is not a valid email address`,
                metadata: { phase: "outreach", reason: "invalid_email", lead_id: lead.id },
              });
              continue;
            }


            try {
              const { data: alreadySent } = await adminClient
                .from("sent_emails")
                .select("id")
                .eq("user_id", user.id)
                .ilike("to_email", to)
                .limit(1)
                .maybeSingle();
              if (alreadySent) {
                await adminClient
                  .from("leads")
                  .update({ last_contacted_at: new Date().toISOString() })
                  .eq("id", lead.id);
                continue;
              }

              const firstName = (lead.contact_name || "").split(" ")[0] || "there";
              const senderFirstName =
                (config.agent_name ?? "").split(" ")[0] ||
                (senderEmail ?? "").split("@")[0] ||
                "there";
              const outreachSystemPrompt = `You are ${config.agent_name ?? "a sales rep"} writing outbound for a B2B founder. Persona: ${config.persona ?? "direct and helpful"}. Tone: ${config.tone ?? "professional"}.
Company context: ${config.company_context ?? ""}
Value propositions:
${cfgValuePropsText}

${icpContext}

${PLAYBOOK_SYSTEM_RULES}`;
              const outreachPrompt = buildTouchPrompt({
                firstName,
                jobTitle: lead.job_title,
                companyName: lead.company_name,
                industry: lead.industry,
                signals: Array.isArray(lead.signals) ? lead.signals : [],
                senderFirstName,
                companyContext: config.company_context,
                valueProps: cfgValuePropsText,
              });

              const raw = await callGemini(outreachPrompt, outreachSystemPrompt);
              const touches = parseTouches(raw);
              const subject = touches[0]?.subject ?? "";
              const body = touches[0]?.body ?? "";
              if (!subject || !body) {
                await logAction({
                  user_id: user.id,
                  action_type: "skipped",
                  status: "skipped",
                  prospect_email: to,
                  description: `Skipped ${lead.contact_name ?? to} — the agent could not generate a usable 4-touch sequence`,
                  metadata: { phase: "outreach", reason: "generation_failed" },
                });
                continue;
              }


              const check = deliverabilityCheck(subject, body);
              if (!check.ok) {
                await logAction({
                  user_id: user.id,
                  action_type: "skipped",
                  status: "skipped",
                  prospect_email: to,
                  subject,
                  description: `Skipped ${lead.contact_name ?? to} — generated email hit deliverability trigger(s): ${check.hits.join(", ")}`,
                  metadata: { phase: "outreach", reason: "deliverability_block", spam_triggers: check.hits },
                });
                continue;
              }

              if (approvalMode) {
                const queued = await queueApproval({
                  kind: "outreach",
                  lead_id: lead.id,
                  integration_row_id: googleIntegrationId,
                  prospect_email: to,
                  prospect_name: lead.contact_name ?? null,
                  company_name: lead.company_name ?? null,
                  subject,
                  body,
                  reasoning: `Touch 1 of 4 (Cold Email Engine playbook) for ${lead.job_title ?? "contact"} at ${lead.company_name ?? "their company"}. Touches 2-4 (day 3, 7, 14) are scheduled automatically once this is approved.`,
                  metadata: {
                    phase: "outreach",
                    job_title: lead.job_title ?? null,
                    sender_email: senderEmail,
                    playbook: "cold_email_engine_4_touch",
                    follow_up_touches: touches.slice(1, 4),
                  },

                });
                if (!queued) {
                  await logAction({
                    user_id: user.id,
                    action_type: "error",
                    status: "failed",
                    prospect_email: to,
                    subject,
                    description: `Could not queue approval draft for ${lead.contact_name ?? to}`,
                    metadata: { phase: "outreach", lead_id: lead.id },
                  });
                  continue;
                }
                await logAction({
                  user_id: user.id,
                  action_type: "awaiting_approval",
                  status: "pending",
                  prospect_email: to,
                  subject,
                  reply_content: body,
                  description: `Drafted a first-touch email to ${lead.contact_name ?? to} at ${lead.company_name ?? "their company"} — waiting for your approval${senderEmail ? ` from ${senderEmail}` : ""}`,
                  metadata: { phase: "outreach", lead_id: lead.id, sender_email: senderEmail },
                });
                outreachDrafted++;
                remainingOutreach--;
                continue;
              }

              const sendRes = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
                method: "POST",
                headers: { Authorization: authHeader, "Content-Type": "application/json" },
                body: JSON.stringify({
                  to,
                  subject,
                  body,
                  integrationRowId: googleIntegrationId,
                  leadId: lead.id,
                }),
              });
              const sendData = await sendRes.json().catch(() => ({}));

              if (!sendRes.ok || sendData?.error) {
                await logAction({
                  user_id: user.id,
                  action_type: "error",
                  status: "failed",
                  prospect_email: to,
                  subject,
                  error_message: sendData?.error ?? `send-email returned ${sendRes.status}`,
                  description: `Could not send to ${to}: ${sendData?.error ?? `send-email returned ${sendRes.status}`}`,
                  metadata: { phase: "outreach", lead_id: lead.id },
                });
                continue;
              }

              await adminClient
                .from("leads")
                .update({ last_contacted_at: new Date().toISOString(), lead_status: "active" })
                .eq("id", lead.id);

              const scheduled = await scheduleFollowUps(
                adminClient,
                user.id,
                lead.id,
                lead.company_name ?? lead.contact_name ?? to,
                touches,
              );

              await logAction({
                user_id: user.id,
                action_type: "outreach_sent",
                status: "completed",
                prospect_email: to,
                subject,
                reply_content: body,
                description: `Touch 1 of 4 sent to ${lead.company_name ?? to}${scheduled ? " — follow-ups queued for day 3, 7 and 14 (they stop automatically on reply)" : ""}`,
                metadata: {
                  phase: "outreach",
                  lead_id: lead.id,
                  playbook: "cold_email_engine_4_touch",
                  follow_ups_scheduled: scheduled,
                },
              });


              outreachSent++;
              remainingOutreach--;
            } catch (leadErr: any) {
              console.error(`outreach error for ${to}:`, leadErr?.message);
              await logAction({
                user_id: user.id,
                action_type: "error",
                status: "failed",
                prospect_email: to,
                error_message: leadErr?.message ?? "unknown",
                metadata: { phase: "outreach" },
              });
            }
          }
        }
      } catch (outreachErr: any) {
        console.error("agent outreach error:", outreachErr?.message);
        await logAction({
          user_id: user.id,
          action_type: "error",
          status: "failed",
          description: "First-touch outreach failed",
          error_message: outreachErr?.message ?? "unknown",
          metadata: { phase: "outreach" },
        });
      }
    } else if (runOutreach && config.can_send_outreach && !googleIntegrationId) {
      await logAction({
        user_id: user.id,
        action_type: "skipped",
        status: "skipped",
        description: "First-touch outreach skipped because no active Gmail mailbox is available.",
        metadata: { phase: "outreach", reason: "no_active_mailbox" },
      });
    }

    // ────────────────────────────────────────────────────────────────────────
    // PHASE 3 — Reply handling (skipped for lead-gen / outreach-only builds)
    // ────────────────────────────────────────────────────────────────────────
    let replies: Reply[] = [];
    let threadsChecked = 0;

    if (runReplies) {
      const syncRes = await fetch(`${supabaseUrl}/functions/v1/inbox-sync`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
      });

      if (!syncRes.ok) {
        const errBody = await syncRes.text();
        throw new Error(`inbox-sync failed: ${errBody}`);
      }

      const syncData = await syncRes.json();

      if (!syncData.success) {
        throw new Error(syncData.error || "inbox-sync returned failure");
      }

      replies = syncData.replies || [];
      threadsChecked = syncData.threadsChecked ?? 0;
    }


    let repliesProcessed = 0;
    let repliesSent = 0;
    let meetingsBooked = 0;
    let skipped = 0;
    let errors = 0;

    const valuePropsList = Array.isArray(config.value_props) ? config.value_props : [];
    const valuePropsText = valuePropsList.join("\n");

    for (const reply of replies) {
      if (repliesSent >= remainingReplies) break;

      try {
        repliesProcessed++;

        const classifySystemPrompt =
          "You classify sales email replies. Respond ONLY with valid JSON.";
        const classifyPrompt = `Classify this email reply:
Subject: ${reply.subject}
From: ${reply.fromEmail}
Body: ${reply.bodyText}

Classification rules (apply in this order):
1. unsubscribe — asks to stop, remove me, do not contact, hostile "leave me alone".
2. out_of_office / auto_reply — automated away, vacation, or system-generated messages.
3. meeting_request — proposes or agrees to a specific call/meeting/time, asks for a calendar link.
4. objection — ANY hesitation, blocker, deferral or pushback, even if the tone is warm. This includes: "too expensive", "no budget", "not the right time", "already have a solution/vendor", "need to think about it", "need to run it by my team/boss", "circle back later", "not a priority right now", "who is this?" / "how did you get my info?".
5. not_interested — clear rejection with no opening, but no unsubscribe request.
6. interested — positive engagement WITHOUT a blocker: asks for pricing, details, a deck, or says "tell me more" / "sounds interesting, send info".
7. unknown — cannot tell.

Important: a reply that is polite or curious but contains a deferral or condition ("interesting, but I need to think about it", "let me talk to my team first") is objection, NOT interested. Only classify as interested when there is no stated blocker.

Return JSON: { "classification": one of ["interested","objection","meeting_request","not_interested","unsubscribe","out_of_office","auto_reply","unknown"], "confidence": 0.0-1.0, "reasoning": "brief reason", "objection_type": one of ["pricing","timing","competitor","authority","status_quo","no_need"] or null (set only when classification is "objection") }`;

        const classifyRaw = await callGemini(classifyPrompt, classifySystemPrompt);

        let classification = "unknown";
        let confidence = 0;
        let reasoning = "";
        let objectionType: string | null = null;
        try {
          const jsonMatch = classifyRaw.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            classification = parsed.classification ?? "unknown";
            confidence = parsed.confidence ?? 0;
            reasoning = parsed.reasoning ?? "";
            objectionType = parsed.objection_type ?? null;
          }
        } catch {
          // classification stays "unknown"
        }

        await logAction({
          user_id: user.id,
          sent_email_id: reply.sentEmailId,
          action_type: "classify",
          status: "completed",
          prospect_email: reply.fromEmail,
          subject: reply.subject,
          classification,
          description: `Read reply from ${reply.fromEmail} and classified it as "${classification}" (${Math.round(
            (confidence ?? 0) * 100
          )}% confidence)${reasoning ? ` — ${reasoning}` : ""}`,
          metadata: { phase: "reply", confidence, reasoning },
        });


        if (!reply.bodyText.trim()) {
          await logAction({
            user_id: user.id,
            sent_email_id: reply.sentEmailId,
            action_type: "skipped",
            status: "skipped",
            prospect_email: reply.fromEmail,
            subject: reply.subject,
            classification: "unknown",
            metadata: { reason: "empty_body", gmail_message_id: reply.gmailMessageId },
          });
          skipped++;
          continue;
        }

        await adminClient
          .from("sent_emails")
          .update({
            replied_at: reply.receivedAt,
            agent_last_synced_at: new Date().toISOString(),
          })
          .eq("id", reply.sentEmailId)
          .is("replied_at", null);

        await adminClient
          .from("sent_emails")
          .update({ agent_last_synced_at: new Date().toISOString() })
          .eq("id", reply.sentEmailId)
          .not("replied_at", "is", null);

        const { data: existingAnalysis } = await adminClient
          .from("reply_analysis")
          .select("id")
          .eq("sent_email_id", reply.sentEmailId)
          .maybeSingle();

        if (existingAnalysis) {
          await adminClient
            .from("reply_analysis")
            .update({
              processed_by_agent: true,
              triage_category: classification,
            })
            .eq("id", existingAnalysis.id);
        } else {
          await adminClient.from("reply_analysis").insert({
            user_id: user.id,
            sent_email_id: reply.sentEmailId,
            reply_content: reply.bodyText,
            intent_score: confidence,
            intent_classification: classification,
            detected_signals: {
              gmail_message_id: reply.gmailMessageId,
              reasoning,
            },
            requires_human_action: false,
            analyzed_at: new Date().toISOString(),
            processed_by_agent: true,
            triage_category: classification,
          });
        }

        if (classification === "interested" && config.can_reply_interested) {
          const replySystemPrompt = `You are ${config.agent_name}, a sales rep. Your persona: ${config.persona}. Tone: ${config.tone}.
Company context: ${config.company_context ?? ""}
Value propositions: ${valuePropsText}

${icpContext}`;

          const replyPrompt = `A prospect replied to your email positively.
Subject: ${reply.subject}
Prospect reply: ${reply.bodyText}

Write a concise ${config.tone} reply (2-3 sentences) that:
- Acknowledges their interest briefly
- Proposes a specific next step (15-minute call or demo)
- Ends with a clear, low-pressure CTA

Output ONLY the reply body. No subject line. No greeting like "Hi [name]". No signature.`;

          const generatedReply = await callGemini(replyPrompt, replySystemPrompt);

          const delivCheck = deliverabilityCheck(`Re: ${reply.subject}`, generatedReply);
          if (!delivCheck.ok) {
            await logAction({
              user_id: user.id,
              sent_email_id: reply.sentEmailId,
              action_type: "skipped",
              status: "skipped",
              prospect_email: reply.fromEmail,
              subject: reply.subject,
              classification: "interested",
              metadata: { reason: "deliverability_block", spam_triggers: delivCheck.hits },
            });
            skipped++;
            continue;
          }

          if (approvalMode) {
            await queueApproval({
              kind: "reply",
              sent_email_id: reply.sentEmailId,
              integration_row_id: googleIntegrationId,
              prospect_email: reply.fromEmail,
              subject: `Re: ${reply.subject}`,
              body: generatedReply,
              classification: "interested",
              reasoning,
              metadata: { phase: "reply", gmail_message_id: reply.gmailMessageId, confidence },
            });
            await logAction({
              user_id: user.id,
              sent_email_id: reply.sentEmailId,
              action_type: "awaiting_approval",
              status: "pending",
              prospect_email: reply.fromEmail,
              subject: reply.subject,
              classification: "interested",
              reply_content: generatedReply,
              description: `${reply.fromEmail} replied with interest — drafted a response for your approval`,
              metadata: { phase: "reply", confidence },
            });
            continue;
          }

          if (googleIntegrationId) {
            const sendRes = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
              method: "POST",
              headers: { Authorization: authHeader, "Content-Type": "application/json" },
              body: JSON.stringify({
                to: reply.fromEmail,
                subject: `Re: ${reply.subject}`,
                body: generatedReply,
                integrationRowId: googleIntegrationId,
              }),
            });
            const sendData = await sendRes.json().catch(() => ({}));
            if (!sendRes.ok || sendData?.error) {
              throw new Error(sendData?.error ?? `send-email returned ${sendRes.status}`);
            }
          }

          await logAction({
            user_id: user.id,
            sent_email_id: reply.sentEmailId,
            action_type: "reply_sent",
            status: "completed",
            prospect_email: reply.fromEmail,
            subject: reply.subject,
            classification: "interested",
            reply_content: generatedReply,
            metadata: { gmail_message_id: reply.gmailMessageId, confidence },
          });

          await adminClient
            .from("sent_emails")
            .update({ agent_thread_status: "replied" })
            .eq("id", reply.sentEmailId);

          await adminClient
            .from("reply_analysis")
            .update({ agent_reply_sent_at: new Date().toISOString() })
            .eq("sent_email_id", reply.sentEmailId);

          repliesSent++;
        } else if (classification === "objection" && config.can_handle_objections) {
          // Objection Library: pull matching entries (by classified type first,
          // then trigger term in the reply body; top two if several) and ground the
          // draft in them. Fall back to the flat objection_responses map when
          // nothing matches, so an empty library behaves exactly as before.
          const { data: objEntries } = await adminClient
            .from("objection_entries")
            .select("id, type, trigger_terms, positioning, talk_track, proof_points, do_not_say, competitor_name, strengths, weaknesses")
            .eq("user_id", user.id);
          const bodyLower = (reply.bodyText || "").toLowerCase();
          const matched: any[] = [];
          const seen = new Set<string>();
          const push = (e: any) => { if (e && !seen.has(e.id)) { seen.add(e.id); matched.push(e); } };
          for (const e of objEntries || []) { if (objectionType && e.type === objectionType) push(e); }
          for (const e of objEntries || []) {
            if ((e.trigger_terms || []).some((t: string) => t && bodyLower.includes(t.toLowerCase()))) push(e);
          }
          const top = matched.slice(0, 2);

          const usedEntryIds: string[] = [];
          let objectionGuidance = "";
          if (top.length > 0) {
            const blocks = top.map((e: any) => {
              usedEntryIds.push(e.id);
              const pts = Array.isArray(e.proof_points) ? e.proof_points.filter(Boolean) : [];
              const parts = [`Objection type: ${e.type}`];
              if (e.positioning) parts.push(`Positioning: ${e.positioning}`);
              if (e.talk_track) parts.push(`Talk track: ${e.talk_track}`);
              if (e.competitor_name) parts.push(`Competitor named: ${e.competitor_name}`);
              if (e.strengths) parts.push(`Their strengths (do not disparage): ${e.strengths}`);
              if (e.weaknesses) parts.push(`Where we differ: ${e.weaknesses}`);
              if (pts.length) parts.push(`Proof points you may cite (only these, as written): ${JSON.stringify(pts)}`);
              if ((e.do_not_say || []).length) parts.push(`Never say: ${(e.do_not_say).join("; ")}`);
              return parts.join("\n");
            });
            objectionGuidance = `Use this prepared objection guidance. Cite a proof point only if one is listed here. Never invent a customer name, a metric, or a statistic that is not listed.\n\n${blocks.join("\n\n")}`;
          } else if (config.objection_responses && Object.keys(config.objection_responses).length > 0) {
            objectionGuidance = `Prepared guidance for objections: ${JSON.stringify(config.objection_responses)}`;
          }

          const objectionSystemPrompt = `You are ${config.agent_name}. ${config.persona}. Tone: ${config.tone}.`;
          const objectionPrompt = `The prospect raised an objection to your sales email.
Prospect reply: ${reply.bodyText}
${objectionGuidance}
Write a 2-3 sentence reply that acknowledges their concern, provides a brief value-focused response, and offers a low-commitment next step.
Output ONLY the reply body. No subject line or signature.`;

          const generatedReply = await callGemini(objectionPrompt, objectionSystemPrompt);

          const delivCheck = deliverabilityCheck(`Re: ${reply.subject}`, generatedReply);
          if (!delivCheck.ok) {
            await logAction({
              user_id: user.id,
              sent_email_id: reply.sentEmailId,
              action_type: "skipped",
              status: "skipped",
              prospect_email: reply.fromEmail,
              subject: reply.subject,
              classification: "objection",
              metadata: { reason: "deliverability_block", spam_triggers: delivCheck.hits },
            });
            skipped++;
            continue;
          }

          if (approvalMode) {
            await queueApproval({
              kind: "reply",
              sent_email_id: reply.sentEmailId,
              integration_row_id: googleIntegrationId,
              prospect_email: reply.fromEmail,
              subject: `Re: ${reply.subject}`,
              body: generatedReply,
              classification: "objection",
              reasoning,
              metadata: { phase: "reply", gmail_message_id: reply.gmailMessageId, confidence, objection_entry_ids: usedEntryIds },
            });
            await logAction({
              user_id: user.id,
              sent_email_id: reply.sentEmailId,
              action_type: "awaiting_approval",
              status: "pending",
              prospect_email: reply.fromEmail,
              subject: reply.subject,
              classification: "objection",
              reply_content: generatedReply,
              description: `${reply.fromEmail} raised an objection — drafted a response for your approval`,
              metadata: { phase: "reply", confidence, objection_entry_ids: usedEntryIds },
            });
            continue;
          }

          if (googleIntegrationId) {
            const sendRes = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
              method: "POST",
              headers: { Authorization: authHeader, "Content-Type": "application/json" },
              body: JSON.stringify({
                to: reply.fromEmail,
                subject: `Re: ${reply.subject}`,
                body: generatedReply,
                integrationRowId: googleIntegrationId,
              }),
            });
            const sendData = await sendRes.json().catch(() => ({}));
            if (!sendRes.ok || sendData?.error) {
              throw new Error(sendData?.error ?? `send-email returned ${sendRes.status}`);
            }
          }

          await logAction({
            user_id: user.id,
            sent_email_id: reply.sentEmailId,
            action_type: "reply_sent",
            status: "completed",
            prospect_email: reply.fromEmail,
            subject: reply.subject,
            classification: "objection",
            reply_content: generatedReply,
            metadata: { gmail_message_id: reply.gmailMessageId, confidence },
          });

          await adminClient
            .from("sent_emails")
            .update({ agent_thread_status: "replied" })
            .eq("id", reply.sentEmailId);

          await adminClient
            .from("reply_analysis")
            .update({ agent_reply_sent_at: new Date().toISOString() })
            .eq("sent_email_id", reply.sentEmailId);

          repliesSent++;
        } else if (classification === "meeting_request" && config.can_book_meetings) {
          let meetingReply: string;

          if (config.calendly_url) {
            meetingReply = `Thanks for reaching out! You can book time directly on my calendar here: ${config.calendly_url}. Looking forward to connecting!`;
          } else {
            const meetingSystemPrompt = `You are ${config.agent_name}. ${config.persona}. Tone: ${config.tone}.`;
            const meetingPrompt = `A prospect is requesting a meeting in response to your sales email.
Prospect reply: ${reply.bodyText}
Write a short, friendly reply asking for their availability (2-3 time options format or asking when works best).
Output ONLY the reply body. No subject line or signature.`;
            meetingReply = await callGemini(meetingPrompt, meetingSystemPrompt);
          }

          if (approvalMode) {
            await queueApproval({
              kind: "reply",
              sent_email_id: reply.sentEmailId,
              integration_row_id: googleIntegrationId,
              prospect_email: reply.fromEmail,
              subject: `Re: ${reply.subject}`,
              body: meetingReply,
              classification: "meeting_request",
              reasoning,
              metadata: { phase: "reply", gmail_message_id: reply.gmailMessageId, confidence },
            });
            await logAction({
              user_id: user.id,
              sent_email_id: reply.sentEmailId,
              action_type: "awaiting_approval",
              status: "pending",
              prospect_email: reply.fromEmail,
              subject: reply.subject,
              classification: "meeting_request",
              reply_content: meetingReply,
              description: `${reply.fromEmail} asked to meet — drafted a scheduling reply for your approval`,
              metadata: { phase: "reply", confidence },
            });
            continue;
          }

          if (googleIntegrationId) {
            const sendRes = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
              method: "POST",
              headers: { Authorization: authHeader, "Content-Type": "application/json" },
              body: JSON.stringify({
                to: reply.fromEmail,
                subject: `Re: ${reply.subject}`,
                body: meetingReply,
                integrationRowId: googleIntegrationId,
              }),
            });
            const sendData = await sendRes.json().catch(() => ({}));
            if (!sendRes.ok || sendData?.error) {
              throw new Error(sendData?.error ?? `send-email returned ${sendRes.status}`);
            }
          }

          await adminClient
            .from("sent_emails")
            .update({ agent_thread_status: "meeting_booked" })
            .eq("id", reply.sentEmailId);

          await logAction({
            user_id: user.id,
            sent_email_id: reply.sentEmailId,
            action_type: "meeting_booked",
            status: "completed",
            prospect_email: reply.fromEmail,
            subject: reply.subject,
            classification: "meeting_request",
            reply_content: meetingReply,
            metadata: {
              gmail_message_id: reply.gmailMessageId,
              calendly_used: !!config.calendly_url,
              confidence,
            },
          });

          meetingsBooked++;
          repliesSent++;
        } else if (classification === "not_interested") {
          await adminClient
            .from("sent_emails")
            .update({ agent_thread_status: "closed" })
            .eq("id", reply.sentEmailId);

          await logAction({
            user_id: user.id,
            sent_email_id: reply.sentEmailId,
            action_type: "closed_thread",
            status: "completed",
            prospect_email: reply.fromEmail,
            subject: reply.subject,
            classification: "not_interested",
            metadata: { gmail_message_id: reply.gmailMessageId, confidence },
          });
        } else if (classification === "unsubscribe") {
          await adminClient
            .from("email_optouts")
            .upsert(
              { email: reply.fromEmail, opted_out_at: new Date().toISOString() },
              { onConflict: "email" }
            );

          await adminClient
            .from("sent_emails")
            .update({ agent_thread_status: "unsubscribed" })
            .eq("id", reply.sentEmailId);

          await logAction({
            user_id: user.id,
            sent_email_id: reply.sentEmailId,
            action_type: "unsubscribed",
            status: "completed",
            prospect_email: reply.fromEmail,
            subject: reply.subject,
            classification: "unsubscribe",
            metadata: { gmail_message_id: reply.gmailMessageId, confidence },
          });
        } else if (
          classification === "out_of_office" ||
          classification === "auto_reply" ||
          classification === "unknown" ||
          (classification === "interested" && !config.can_reply_interested) ||
          (classification === "objection" && !config.can_handle_objections) ||
          (classification === "meeting_request" && !config.can_book_meetings)
        ) {
          const reason =
            classification === "interested" && !config.can_reply_interested
              ? "agent_reply_disabled"
              : classification === "objection" && !config.can_handle_objections
              ? "objection_handling_disabled"
              : classification === "meeting_request" && !config.can_book_meetings
              ? "meeting_booking_disabled"
              : classification;

          await logAction({
            user_id: user.id,
            sent_email_id: reply.sentEmailId,
            action_type: "skipped",
            status: "skipped",
            prospect_email: reply.fromEmail,
            subject: reply.subject,
            classification,
            metadata: { reason, gmail_message_id: reply.gmailMessageId, confidence },
          });

          skipped++;
        }
      } catch (replyErr: any) {
        console.error(`Error processing reply from ${reply.fromEmail}:`, replyErr.message);
        errors++;

        try {
          await logAction({
            user_id: user.id,
            sent_email_id: reply.sentEmailId,
            action_type: "error",
            status: "failed",
            prospect_email: reply.fromEmail,
            subject: reply.subject,
            error_message: replyErr.message,
            metadata: { gmail_message_id: reply.gmailMessageId },
          });
        } catch {
          // Logging failure must not propagate
        }
      }
    }

    const agentLabel = `${config.agent_name || "Agent"} (${agentRole.replace(/_/g, " ")})`;
    const runSummary = approvalMode
      ? `${agentLabel} finished in approval mode — ${leadsFound} new lead(s) found, ${outreachDrafted} first-touch draft(s) created, ${threadsChecked} thread(s) checked, ${pendingApprovals} total draft(s) waiting for your approval.`
      : `${agentLabel} finished autonomously — ${leadsFound} lead(s) found, ${outreachSent} first-touch email(s) sent, ${threadsChecked} thread(s) checked, ${repliesSent} reply(ies) sent.`;

    await logAction({
      user_id: user.id,
      action_type: "sync",
      status: "completed",
      description: runSummary,
      metadata: {
        mode: approvalMode ? "approval" : "autonomous",
        trigger: triggerSource,
        role: agentRole,
        agent_name: config.agent_name ?? null,
        threads_checked: threadsChecked,
        leads_found: leadsFound,
        outreach_drafted: outreachDrafted,
        outreach_sent: outreachSent,
        pending_approvals: pendingApprovals,
        replies_processed: repliesProcessed,
        replies_sent: repliesSent,
        meetings_booked: meetingsBooked,
        skipped,
        errors,
      },
    });

    await captureServerEvent("agent_run_completed", user.id, {
      mode: approvalMode ? "approval" : "autonomous",
      threads_checked: threadsChecked,
      leads_found: leadsFound,
      outreach_drafted: outreachDrafted,
      outreach_sent: outreachSent,
      pending_approvals: pendingApprovals,
      replies_processed: repliesProcessed,
      replies_sent: repliesSent,
      meetings_booked: meetingsBooked,
      error_count: Array.isArray(errors) ? errors.length : 0,
    });

    return new Response(

      JSON.stringify({
        success: true,
        agentId: config.id,
        agentName: config.agent_name,
        role: agentRole,
        mode: approvalMode ? "approval" : "autonomous",
        summary: runSummary,
        threadsChecked,
        leadsFound,
        outreachDrafted,
        outreachSent,
        pendingApprovals,
        repliesProcessed,
        repliesSent,
        meetingsBooked,
        skipped,
        errors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("agent-run error:", err);
    await logRunEvent({
      action_type: "error",
      status: "failed",
      description: "Run failed before it could finish.",
      error_message: err?.message ?? "Unknown error",
      metadata: { phase: "run", trigger: triggerSource },
    });
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

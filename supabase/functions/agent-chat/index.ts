import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PLAYBOOK_SYSTEM_RULES } from "../_shared/cold-email-playbook.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type DraftPreview = {
  draft_id: string;
  lead_id: string;
  company: string | null;
  contact: string | null;
  contact_email: string | null;
  subject: string;
  body: string;
};

type ToolEvent = {
  name: string;
  label: string;
  status: "ok" | "error" | "queued";
  detail: string;
  approval_id?: string;
  approval_kind?: string;
  approval_summary?: string;
  drafts?: DraftPreview[];
};


const LEAD_FIELDS =
  "id, company_name, contact_name, contact_email, job_title, industry, company_website, linkedin_url, lead_status, icp_score, intent_score, intent_label, signal_score, signals, notes, last_contacted_at, created_at";

const MUTATING_TOOLS = new Set([
  "send_outreach",
  "enroll_lead_in_sequence",
  "run_full_agent",
]);

const TOOLS = [
  {
    type: "function",
    function: {
      name: "list_leads",
      description:
        "List the user's saved leads. Use this first when the user refers to 'my leads', 'the leads I just searched', or a company/person by name.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Free-text match on company, contact name or email" },
          lead_status: { type: "string", description: "Filter by lead_status, e.g. new or active" },
          min_icp_score: { type: "number" },
          needs_enrichment: {
            type: "boolean",
            description: "Only leads missing a contact email or job title",
          },
          limit: { type: "number", description: "Default 25, max 100" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_lead",
      description: "Get the full record for a single lead by id or email.",
      parameters: {
        type: "object",
        properties: { lead_id: { type: "string" }, email: { type: "string" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "enrich_leads",
      description:
        "Enrich one or more leads (find work email, job title, company data) using the OutReign Lead Intelligence Network.",
      parameters: {
        type: "object",
        properties: { lead_ids: { type: "array", items: { type: "string" } } },
        required: ["lead_ids"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "score_leads",
      description:
        "Score/classify one or more leads — returns ICP score, intent score, intent label and a recommended angle.",
      parameters: {
        type: "object",
        properties: { lead_ids: { type: "array", items: { type: "string" } } },
        required: ["lead_ids"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "draft_outreach",
      description:
        "Draft first-touch cold emails following the OutReign cold email playbook. Pass lead_ids to draft for several leads in ONE call (preferred — never call this tool repeatedly in parallel). Does not send anything.",
      parameters: {
        type: "object",
        properties: {
          lead_id: { type: "string", description: "Single lead id (use lead_ids for batches)" },
          lead_ids: {
            type: "array",
            items: { type: "string" },
            description: "Up to 20 lead ids to draft for in one call",
          },
          goal: {
            type: "string",
            enum: ["introduction", "follow-up", "meeting", "demo", "proposal"],
            description: "Email goal. Use 'introduction' for first touches.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "draft_sequence",
      description:
        "Draft a full 4-touch cold email sequence (day 0, 3, 7, 14) for a lead. Does not send anything.",
      parameters: {
        type: "object",
        properties: { lead_id: { type: "string" } },
        required: ["lead_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_outreach",
      description:
        "Send an email to a lead. In approval mode this pauses and shows the user an approve/reject card inline in the chat instead of sending.",
      parameters: {
        type: "object",
        properties: {
          lead_id: { type: "string" },
          subject: { type: "string" },
          body: { type: "string" },
        },
        required: ["lead_id", "subject", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_sequences",
      description: "List the user's saved outreach sequences.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "enroll_lead_in_sequence",
      description: "Enroll a lead into one of the user's sequences.",
      parameters: {
        type: "object",
        properties: { lead_id: { type: "string" }, sequence_id: { type: "string" } },
        required: ["lead_id", "sequence_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_recent_replies",
      description: "List recent inbound replies with their classification.",
      parameters: {
        type: "object",
        properties: { limit: { type: "number" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_lead",
      description: "Update a lead's status or notes.",
      parameters: {
        type: "object",
        properties: {
          lead_id: { type: "string" },
          lead_status: { type: "string" },
          notes: { type: "string" },
        },
        required: ["lead_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_agent_status",
      description:
        "Get the agent configuration, today's activity counts and the number of pending approvals.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "run_full_agent",
      description:
        "Trigger a full AI SDR run: source new leads from the ICP, generate sequences and send or queue first touches, then handle replies.",
      parameters: { type: "object", properties: {} },
    },
  },
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization header" }, 401);
    if (!LOVABLE_API_KEY) return json({ error: "AI is not configured" }, 500);

    const admin = createClient(supabaseUrl, serviceKey);
    const {
      data: { user },
      error: authError,
    } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) return json({ error: "Unauthorized" }, 401);
    const userId = user.id;

    const payload = await req.json().catch(() => ({} as Record<string, unknown>));
    const threadId = String(payload.threadId ?? "");
    const action = String(payload.action ?? "chat");
    if (!threadId) return json({ error: "Missing threadId" }, 400);

    // Wall-clock budget: edge functions get killed around ~150s, which the client
    // surfaces as "Failed to send a request to the Edge Function". Stop early and
    // return partial work instead of dying mid-flight.
    const startedAt = Date.now();
    const BUDGET_MS = 110_000;
    const timeLeft = () => BUDGET_MS - (Date.now() - startedAt);
    const outOfTime = () => timeLeft() <= 8_000;

    // Run async work with bounded concurrency, stopping if the budget runs out.
    const mapLimit = async <T, R>(
      items: T[],
      limit: number,
      fn: (item: T) => Promise<R>,
    ): Promise<{ results: R[]; skipped: T[] }> => {
      const results: R[] = [];
      const skipped: T[] = [];
      let i = 0;
      const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (i < items.length) {
          const idx = i++;
          if (outOfTime()) {
            skipped.push(items[idx]);
            continue;
          }
          results.push(await fn(items[idx]));
        }
      });
      await Promise.all(workers);
      return { results, skipped };
    };


    const callFn = async (name: string, body: unknown) => {
      const res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
          apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        },
        body: JSON.stringify(body ?? {}),
      });
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        return { error: text.slice(0, 300) };
      }
    };

    // --- inline approve / reject from the chat ---------------------------
    if (action === "resolve_approval") {
      const approvalId = String(payload.approvalId ?? "");
      const decision = payload.decision === "approve" ? "approve" : "reject";
      if (!approvalId) return json({ error: "Missing approvalId" }, 400);

      const { data: approval } = await admin
        .from("agent_approvals")
        .select("*")
        .eq("id", approvalId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!approval) return json({ error: "Approval not found" }, 404);
      if (approval.status !== "pending")
        return json({ error: "That request was already handled." }, 409);

      let outcome = "";
      let failed = false;

      if (decision === "reject") {
        outcome = "Rejected — nothing was sent or changed.";
      } else if (approval.kind === "outreach") {
        const r = await callFn("send-email", {
          to: approval.prospect_email,
          subject: approval.subject,
          body: approval.body,
          leadId: approval.lead_id,
        });
        failed = Boolean(r?.error);
        if (!failed) {
          if (approval.lead_id) {
            await admin
              .from("leads")
              .update({ lead_status: "active", last_contacted_at: new Date().toISOString() })
              .eq("id", approval.lead_id)
              .eq("user_id", userId);
          }
          await admin.from("agent_actions").insert({
            user_id: userId,
            action_type: "outreach_sent",
            status: "completed",
            prospect_email: approval.prospect_email,
            subject: approval.subject,
            description: `Sent approved outreach to ${approval.prospect_email} from AI SDR chat`,
            metadata: { source: "agent_chat", thread_id: threadId },
          });
        }
        outcome = failed
          ? `Send failed: ${String(r?.error).slice(0, 200)}`
          : `Approved — email sent to ${approval.prospect_email}.`;
      } else if (approval.kind === "enrollment") {
        const meta = (approval.metadata ?? {}) as Record<string, any>;
        const { error } = await admin.from("sequence_enrollments").insert({
          user_id: userId,
          lead_id: approval.lead_id,
          sequence_id: meta.sequence_id,
          next_action_at: new Date().toISOString(),
        });
        failed = Boolean(error);
        outcome = error
          ? `Enrollment failed: ${error.message}`
          : `Approved — ${approval.company_name ?? approval.prospect_email ?? "the lead"} was enrolled in the sequence.`;
      } else if (approval.kind === "agent_run") {
        const r = await callFn("agent-run", { mode: "autonomous" });
        failed = Boolean(r?.error);
        outcome = failed
          ? `Agent run failed: ${String(r?.error).slice(0, 200)}`
          : `Approved — full agent run complete. ${r?.summary ?? ""}`.trim();
      } else {
        outcome = "Approved.";
      }

      await admin
        .from("agent_approvals")
        .update({
          status: failed ? "pending" : decision === "approve" ? "approved" : "rejected",
          reviewed_at: failed ? null : new Date().toISOString(),
        })
        .eq("id", approvalId)
        .eq("user_id", userId);

      const { data: saved } = await admin
        .from("agent_chat_messages")
        .insert({
          thread_id: threadId,
          user_id: userId,
          role: "assistant",
          content: outcome,
          tool_events: [],
        })
        .select("id, role, content, tool_events, created_at")
        .single();

      await admin
        .from("agent_chat_threads")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", threadId);

      return json({
        message: saved,
        approval: { id: approvalId, status: failed ? "pending" : decision === "approve" ? "approved" : "rejected" },
      });
    }

    const userMessage = String(payload.message ?? "").trim().slice(0, 4000);
    if (!userMessage) return json({ error: "Message is required" }, 400);

    const { data: thread } = await admin
      .from("agent_chat_threads")
      .select("id, user_id, title, autonomy")
      .eq("id", threadId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!thread) return json({ error: "Conversation not found" }, 404);

    const autonomous = thread.autonomy === "autonomous";

    // --- persist the user's message -------------------------------------
    await admin.from("agent_chat_messages").insert({
      thread_id: threadId,
      user_id: userId,
      role: "user",
      content: userMessage,
    });

    if (!thread.title || thread.title === "New conversation") {
      await admin
        .from("agent_chat_threads")
        .update({ title: userMessage.slice(0, 60) })
        .eq("id", threadId);
    }

    // --- load history ----------------------------------------------------
    const { data: history } = await admin
      .from("agent_chat_messages")
      .select("role, content")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .limit(40);

    // --- context ---------------------------------------------------------
    const [{ data: config }, { data: profile }] = await Promise.all([
      admin.from("agent_configs").select("*").eq("user_id", userId).maybeSingle(),
      admin.from("profiles").select("full_name, company_name").eq("id", userId).maybeSingle(),
    ]);

    const invokeFn = async (name: string, body: unknown) => {
      const res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
          apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        },
        body: JSON.stringify(body ?? {}),
      });
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        return { error: text.slice(0, 300) };
      }
    };

    const loadLead = async (leadId: string) => {
      const { data } = await admin
        .from("leads")
        .select("*")
        .eq("id", leadId)
        .eq("user_id", userId)
        .maybeSingle();
      return data;
    };

    const toolEvents: ToolEvent[] = [];

    const runTool = async (name: string, args: Record<string, any>): Promise<unknown> => {
      switch (name) {
        case "list_leads": {
          let q = admin.from("leads").select(LEAD_FIELDS).eq("user_id", userId);
          if (args.lead_status) q = q.eq("lead_status", args.lead_status);
          if (typeof args.min_icp_score === "number") q = q.gte("icp_score", args.min_icp_score);
          if (args.query) {
            const term = String(args.query).replace(/[%,]/g, "");
            q = q.or(
              `company_name.ilike.%${term}%,contact_name.ilike.%${term}%,contact_email.ilike.%${term}%`,
            );
          }
          if (args.needs_enrichment) q = q.is("contact_email", null);
          const limit = Math.min(Math.max(Number(args.limit) || 25, 1), 100);
          const { data, error } = await q
            .order("created_at", { ascending: false })
            .limit(limit);
          if (error) return { error: error.message };
          toolEvents.push({
            name,
            label: "Looked up leads",
            status: "ok",
            detail: `${data?.length ?? 0} lead(s) matched`,
          });
          return { count: data?.length ?? 0, leads: data ?? [] };
        }

        case "get_lead": {
          let q = admin.from("leads").select("*").eq("user_id", userId);
          q = args.lead_id ? q.eq("id", args.lead_id) : q.eq("contact_email", args.email ?? "");
          const { data } = await q.maybeSingle();
          toolEvents.push({
            name,
            label: "Opened lead",
            status: data ? "ok" : "error",
            detail: data ? `${data.company_name ?? "Lead"}` : "Lead not found",
          });
          return data ?? { error: "Lead not found" };
        }

        case "enrich_leads": {
          const ids: string[] = (args.lead_ids ?? []).slice(0, 10);
          const { results, skipped } = await mapLimit(ids, 4, async (id: string) => {
            const r = await invokeFn("enrich-lead", { leadId: id });
            return { lead_id: id, ...r };
          });
          const failed = results.filter((r: any) => r?.error).length;
          toolEvents.push({
            name,
            label: "Enriched leads",
            status: failed === results.length && results.length > 0 ? "error" : "ok",
            detail: `${results.length - failed}/${ids.length} enriched${skipped.length ? ` (${skipped.length} skipped — ran out of time)` : ""}`,
          });
          return { results, skipped_lead_ids: skipped };
        }

        case "score_leads": {
          const ids: string[] = (args.lead_ids ?? []).slice(0, 15);
          const { results, skipped } = await mapLimit(ids, 5, async (id: string) => {
            const r = await invokeFn("score-lead", { leadId: id });
            return { lead_id: id, ...r };
          });
          toolEvents.push({
            name,
            label: "Scored leads",
            status: "ok",
            detail: `${results.length} lead(s) scored${skipped.length ? ` (${skipped.length} skipped — ran out of time)` : ""}`,
          });
          return { results, skipped_lead_ids: skipped };
        }


        case "draft_outreach": {
          const VALID_GOALS = ["introduction", "follow-up", "meeting", "demo", "proposal"];
          const rawGoal = String(args.goal ?? "").trim().toLowerCase();
          const goal = VALID_GOALS.includes(rawGoal) ? rawGoal : "introduction";

          const ids: string[] = (
            Array.isArray(args.lead_ids) && args.lead_ids.length
              ? args.lead_ids
              : [args.lead_id]
          )
            .filter(Boolean)
            .map((x: any) => String(x))
            .slice(0, 20);
          if (ids.length === 0) return { error: "lead_id or lead_ids is required" };

          const genOne = async (id: string) => {
            const lead = await loadLead(id);
            if (!lead) return { lead_id: id, error: "Lead not found" };
            let r = await invokeFn("generate-email", {
              lead,
              goal,
              tone: config?.tone ?? "professional",
            });
            // one retry on upstream rate limiting
            if (!r?.email && /rate limit/i.test(JSON.stringify(r?.error ?? ""))) {
              await new Promise((res) => setTimeout(res, 2500));
              r = await invokeFn("generate-email", {
                lead,
                goal,
                tone: config?.tone ?? "professional",
              });
            }
            const raw: string = typeof r?.email === "string" ? r.email : "";
            let subject = "";
            let body = raw;
            const subjMatch = raw.match(/^\s*subject\s*:\s*(.+)\s*(?:\n|$)/i);
            if (subjMatch) {
              subject = subjMatch[1].trim();
              body = raw.slice(subjMatch[0].length).trim();
            }
            if (!subject) {
              subject = `Quick question${lead.company_name ? ` — ${lead.company_name}` : ""}`;
            }

            let draftId: string | null = null;
            if (raw) {
              const { data: savedDraft } = await admin
                .from("email_drafts")
                .insert({
                  user_id: userId,
                  lead_id: lead.id,
                  subject,
                  body,
                  tone: config?.tone ?? "professional",
                  trigger_context: `AI SDR chat — ${goal}`,
                })
                .select("id")
                .single();
              draftId = savedDraft?.id ?? null;
            }

            return {
              lead_id: id,
              draft_id: draftId,
              company: lead.company_name ?? null,
              contact: lead.contact_name ?? null,
              contact_email: lead.contact_email ?? null,
              subject: raw ? subject : null,
              body: raw ? body : null,
              email: r?.email ?? null,
              error: r?.email ? undefined : (r?.error ?? "Draft failed"),
            };
          };

          const { results: drafts, skipped } = await mapLimit(ids, 3, genOne);


          const okCount = drafts.filter((d) => d.email).length;
          toolEvents.push({
            name,
            label: "Drafted emails",
            status: okCount === 0 ? "error" : "ok",
            detail:
              ids.length === 1
                ? (drafts[0]?.company ?? "lead")
                : `${okCount}/${ids.length} drafted${skipped.length ? ` (${skipped.length} left — ask me to continue)` : ""}`,

            drafts: drafts
              .filter((d) => d.draft_id && d.body)
              .map((d) => ({
                draft_id: d.draft_id as string,
                lead_id: d.lead_id,
                company: d.company,
                contact: d.contact,
                contact_email: d.contact_email,
                subject: d.subject as string,
                body: d.body as string,
              })),
          });
          return {
            goal,
            note:
              "Drafts are saved and shown to the user in the chat with Send / Schedule controls. Do NOT call send_outreach for these unless the user explicitly asks you to send." +
              (skipped.length
                ? ` ${skipped.length} lead(s) were not drafted because this turn ran out of time — tell the user to reply "continue" and you'll draft the rest.`
                : ""),
            skipped_lead_ids: skipped,
            drafts: drafts.map(({ body: _b, ...rest }) => rest),
          };

        }


        case "draft_sequence": {
          const lead = await loadLead(String(args.lead_id ?? ""));
          if (!lead) return { error: "Lead not found" };
          const r = await invokeFn("generate-sequence", {
            lead,
            senderName: profile?.full_name ?? "",
            senderCompany: profile?.company_name ?? config?.company_context ?? "",
            offer: (config?.value_props ?? []).join("; "),
          });
          toolEvents.push({
            name,
            label: "Drafted 4-touch sequence",
            status: r?.touches ? "ok" : "error",
            detail: lead.company_name ?? lead.contact_email ?? "lead",
          });
          return r;
        }

        case "send_outreach": {
          const lead = await loadLead(String(args.lead_id ?? ""));
          if (!lead) return { error: "Lead not found" };
          if (!lead.contact_email) return { error: "Lead has no email address — enrich it first" };
          const subject = String(args.subject ?? "").slice(0, 200);
          const body = String(args.body ?? "");
          if (!subject || !body) return { error: "Subject and body are required" };

          if (!autonomous) {
            const { data: approval, error } = await admin
              .from("agent_approvals")
              .insert({
                user_id: userId,
                kind: "outreach",
                status: "pending",
                lead_id: lead.id,
                prospect_email: lead.contact_email,
                prospect_name: lead.contact_name,
                company_name: lead.company_name,
                subject,
                body,
                reasoning: "Drafted in AI SDR chat — awaiting your approval",
                metadata: { source: "agent_chat", thread_id: threadId },
              })
              .select("id")
              .single();
            if (error) return { error: error.message };
            toolEvents.push({
              name,
              label: "Waiting for your approval",
              status: "queued",
              detail: `Send "${subject}" to ${lead.contact_email}`,
              approval_id: approval.id,
              approval_kind: "outreach",
              approval_summary: body.slice(0, 600),
            });
            return {
              queued_for_approval: true,
              approval_id: approval.id,
              message:
                "Nothing was sent. An approve/reject card is shown to the user right here in the chat — wait for their decision.",
            };
          }

          const r = await invokeFn("send-email", {
            to: lead.contact_email,
            subject,
            body,
            leadId: lead.id,
          });
          const sent = !r?.error;
          if (sent) {
            await admin
              .from("leads")
              .update({ lead_status: "active", last_contacted_at: new Date().toISOString() })
              .eq("id", lead.id)
              .eq("user_id", userId);
            await admin.from("agent_actions").insert({
              user_id: userId,
              action_type: "outreach_sent",
              status: "completed",
              prospect_email: lead.contact_email,
              subject,
              description: `Sent outreach to ${lead.contact_email} from AI SDR chat`,
              metadata: { source: "agent_chat", thread_id: threadId },
            });
          }
          toolEvents.push({
            name,
            label: sent ? "Sent email" : "Send failed",
            status: sent ? "ok" : "error",
            detail: sent ? lead.contact_email : String(r?.error ?? "unknown error"),
          });
          return r;
        }

        case "list_sequences": {
          const { data } = await admin
            .from("email_sequences")
            .select("id, name, status")
            .eq("user_id", userId)
            .limit(50);
          toolEvents.push({
            name,
            label: "Listed sequences",
            status: "ok",
            detail: `${data?.length ?? 0} sequence(s)`,
          });
          return { sequences: data ?? [] };
        }

        case "enroll_lead_in_sequence": {
          const lead = await loadLead(String(args.lead_id ?? ""));
          if (!lead) return { error: "Lead not found" };
          if (!autonomous) {
            const { data: approval, error: apprError } = await admin
              .from("agent_approvals")
              .insert({
                user_id: userId,
                kind: "enrollment",
                status: "pending",
                lead_id: lead.id,
                prospect_email: lead.contact_email,
                prospect_name: lead.contact_name,
                company_name: lead.company_name,
                subject: "Enroll in sequence",
                reasoning: "Requested in AI SDR chat — awaiting your approval",
                metadata: {
                  source: "agent_chat",
                  thread_id: threadId,
                  sequence_id: String(args.sequence_id ?? ""),
                },
              })
              .select("id")
              .single();
            if (apprError) return { error: apprError.message };
            toolEvents.push({
              name,
              label: "Waiting for your approval",
              status: "queued",
              detail: `Enroll ${lead.company_name ?? lead.contact_email} in the sequence`,
              approval_id: approval.id,
              approval_kind: "enrollment",
            });
            return {
              queued_for_approval: true,
              approval_id: approval.id,
              message:
                "Not enrolled yet. An approve/reject card is shown to the user right here in the chat.",
            };
          }
          const { data, error } = await admin
            .from("sequence_enrollments")
            .insert({
              user_id: userId,
              lead_id: lead.id,
              sequence_id: String(args.sequence_id ?? ""),
              next_action_at: new Date().toISOString(),
            })
            .select("id")
            .single();
          toolEvents.push({
            name,
            label: error ? "Enrollment failed" : "Enrolled lead",
            status: error ? "error" : "ok",
            detail: error ? error.message : (lead.company_name ?? lead.contact_email ?? ""),
          });
          return error ? { error: error.message } : { enrollment_id: data.id };
        }

        case "list_recent_replies": {
          const limit = Math.min(Number(args.limit) || 10, 30);
          const { data } = await admin
            .from("reply_analysis")
            .select("*")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(limit);
          toolEvents.push({
            name,
            label: "Checked replies",
            status: "ok",
            detail: `${data?.length ?? 0} recent repl${(data?.length ?? 0) === 1 ? "y" : "ies"}`,
          });
          return { replies: data ?? [] };
        }

        case "update_lead": {
          const update: Record<string, unknown> = {};
          if (args.lead_status) update.lead_status = String(args.lead_status);
          if (args.notes) update.notes = String(args.notes);
          if (!Object.keys(update).length) return { error: "Nothing to update" };
          const { error } = await admin
            .from("leads")
            .update(update)
            .eq("id", String(args.lead_id ?? ""))
            .eq("user_id", userId);
          toolEvents.push({
            name,
            label: error ? "Update failed" : "Updated lead",
            status: error ? "error" : "ok",
            detail: error ? error.message : Object.keys(update).join(", "),
          });
          return error ? { error: error.message } : { success: true };
        }

        case "get_agent_status": {
          const since = new Date();
          since.setHours(0, 0, 0, 0);
          const [{ count: pending }, { data: todayActions }] = await Promise.all([
            admin
              .from("agent_approvals")
              .select("id", { count: "exact", head: true })
              .eq("user_id", userId)
              .eq("status", "pending"),
            admin
              .from("agent_actions")
              .select("action_type")
              .eq("user_id", userId)
              .gte("created_at", since.toISOString()),
          ]);
          toolEvents.push({
            name,
            label: "Checked agent status",
            status: "ok",
            detail: `${pending ?? 0} pending approval(s)`,
          });
          return {
            enabled: config?.enabled ?? false,
            approval_mode: !autonomous,
            pending_approvals: pending ?? 0,
            actions_today: (todayActions ?? []).length,
          };
        }

        case "run_full_agent": {
          if (!autonomous) {
            const { data: approval, error: apprError } = await admin
              .from("agent_approvals")
              .insert({
                user_id: userId,
                kind: "agent_run",
                status: "pending",
                subject: "Run the full AI SDR cycle",
                reasoning:
                  "Requested in AI SDR chat — sources leads, drafts sequences and sends first touches",
                metadata: { source: "agent_chat", thread_id: threadId },
              })
              .select("id")
              .single();
            if (apprError) return { error: apprError.message };
            toolEvents.push({
              name,
              label: "Waiting for your approval",
              status: "queued",
              detail: "Run the full AI SDR cycle (source, draft, send)",
              approval_id: approval.id,
              approval_kind: "agent_run",
            });
            return {
              queued_for_approval: true,
              approval_id: approval.id,
              message:
                "Nothing ran yet. An approve/reject card is shown to the user right here in the chat.",
            };
          }
          const r = await invokeFn("agent-run", { mode: "autonomous" });
          toolEvents.push({
            name,
            label: "Ran agent (autonomous)",
            status: r?.error ? "error" : "ok",
            detail: r?.summary ?? r?.error ?? "Run complete",
          });
          return r;
        }

        default:
          return { error: `Unknown tool ${name}` };
      }
    };

    const systemPrompt = `You are ${config?.agent_name ?? "the OutReign AI SDR"}, an autonomous sales development rep working inside OutReign for ${profile?.full_name ?? "the user"}${profile?.company_name ? ` at ${profile.company_name}` : ""}.

You can take real action on the user's account using your tools: reading their leads, enriching and scoring them, drafting cold emails and 4-touch sequences, sending or queueing outreach, enrolling leads in sequences, reviewing replies, and triggering a full agent run.

HOW TO WORK
- When the user says something like "I just searched some leads, take it from here", find the relevant leads with list_leads first, then chain the work: enrich -> score -> draft -> send/queue. Do not ask permission for read-only or drafting steps; just do them and report back.
- Do several tool calls in a row when needed. Prefer batching lead ids over one-at-a-time calls. For drafting, ALWAYS pass every lead id in a single draft_outreach call via lead_ids — never fire many parallel draft_outreach calls, that trips the rate limiter.
- draft_outreach goal must be one of: introduction, follow-up, meeting, demo, proposal. Use "introduction" for first touches.
- Drafts are auto-saved and rendered in the chat as reviewable cards with Send now / Schedule / Discard buttons. After drafting, tell the user the drafts are below for review — never send them yourself unless the user explicitly asks you to send.

- Never invent leads, metrics, emails or results. Only report what the tools returned.
- Be concise and specific. Short paragraphs, tight bullet lists, real numbers and names. No emojis, no filler.

AUTONOMY
This conversation is in ${autonomous ? "FULL AUTONOMY mode: sending, enrolling and full agent runs execute immediately." : "APPROVAL mode: anything that sends an email, enrolls a lead, or runs the full agent pauses for the user's approval instead of executing. When that happens an approve/reject card appears inline in this chat — say briefly what you want to do and ask them to approve it below. Never tell them to go to another tab or page."}
${autonomous ? "" : "If the user asks you to just get on with it without approving each step, tell them they can switch this conversation to full autonomy with the mode selector at the top of the chat."}

COLD EMAIL RULES (apply to every draft you write or review)
${PLAYBOOK_SYSTEM_RULES}

Company context: ${config?.company_context ?? "not set"}
Value props: ${(config?.value_props ?? []).join("; ") || "not set"}`;

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...(history ?? []).map((m) => ({ role: m.role, content: m.content })),
    ];

    let finalText = "";
    let ranOutOfTime = false;
    for (let step = 0; step < 8; step++) {
      if (outOfTime()) {
        ranOutOfTime = true;
        break;
      }

      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-5.6-sol",
          reasoning_effort: "none",
          messages,
          tools: TOOLS,
        }),
      });

      if (!res.ok) {
        const detail = await res.text();
        console.error("AI gateway error", res.status, detail.slice(0, 500));
        if (res.status === 429) return json({ error: "Rate limited — try again in a moment." }, 429);
        if (res.status === 402)
          return json({ error: "AI credits exhausted. Add credits to continue." }, 402);
        return json({ error: "The agent could not respond right now." }, 500);
      }

      const data = await res.json();
      const choice = data.choices?.[0]?.message;
      if (!choice) break;
      messages.push(choice);

      const calls = choice.tool_calls ?? [];
      if (!calls.length) {
        finalText = choice.content ?? "";
        break;
      }

      for (const call of calls) {
        let args: Record<string, any> = {};
        try {
          args = JSON.parse(call.function?.arguments ?? "{}");
        } catch {
          args = {};
        }
        const toolName = call.function?.name ?? "";
        if (!autonomous && MUTATING_TOOLS.has(toolName)) {
          console.log("approval-mode mutating tool", toolName);
        }
        let result: unknown;
        try {
          result = await runTool(toolName, args);
        } catch (e) {
          result = { error: e instanceof Error ? e.message : "tool failed" };
          toolEvents.push({
            name: toolName,
            label: "Action failed",
            status: "error",
            detail: e instanceof Error ? e.message : "unknown error",
          });
        }
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result).slice(0, 12000),
        });
      }
    }

    if (!finalText) {
      finalText = ranOutOfTime
        ? "That batch was too big to finish in one turn — the work above is saved. Reply \"continue\" and I'll pick up where I left off."
        : toolEvents.length
          ? "I finished the actions above. Tell me what you'd like next."
          : "I couldn't complete that. Try rephrasing what you'd like me to do.";
    } else if (ranOutOfTime) {
      finalText += "\n\nI ran out of time on this turn — reply \"continue\" and I'll finish the rest.";
    }


    const { data: saved } = await admin
      .from("agent_chat_messages")
      .insert({
        thread_id: threadId,
        user_id: userId,
        role: "assistant",
        content: finalText,
        tool_events: toolEvents,
      })
      .select("id, role, content, tool_events, created_at")
      .single();

    await admin
      .from("agent_chat_threads")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", threadId);

    return json({ message: saved, toolEvents });
  } catch (error) {
    console.error("agent-chat error", error);
    return json({ error: "The agent hit an unexpected error." }, 500);
  }
});

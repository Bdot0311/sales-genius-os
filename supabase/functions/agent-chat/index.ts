import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PLAYBOOK_SYSTEM_RULES } from "../_shared/cold-email-playbook.ts";
import { buildIcpContext, icpSearchBody } from "../_shared/icp-context.ts";
import { captureServerEvent } from "../_shared/posthog.ts";

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
  research?: {
    what_they_do?: string;
    observations?: { fact: string; source: string }[];
    hooks?: string[];
    confidence?: string;
    sources?: string[];
    researched_at?: string | null;
    quality?: {
      score: number;
      label: string;
      safe_to_personalize: boolean;
      gaps?: string[];
    } | null;
  } | null;
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

// Mirrors the client-side draft -> HTML conversion used by the chat draft cards
// so a scheduled send renders identically to an immediate one.
const draftBodyToHtml = (body: string) => {
  const escaped = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const paragraphs = escaped
    .split("\n")
    .map((line) => (line.trim() ? `<p>${line.trim()}</p>` : ""))
    .filter(Boolean)
    .join("\n");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px}p{margin:0 0 16px}</style></head><body>${paragraphs}</body></html>`;
};

const MUTATING_TOOLS = new Set([
  "send_outreach",
  "send_drafts",
  "schedule_drafts",
  "cancel_scheduled_email",
  "delete_drafts",
  "delete_inbox_threads",
  "enroll_lead_in_sequence",
  "run_full_agent",
]);

// Read-only, DB-only tools: safe to execute concurrently within one model step.
const PARALLEL_SAFE_TOOLS = new Set([
  "list_leads",
  "get_lead",
  "list_mailboxes",
  "list_drafts",
  "list_scheduled_emails",
  "list_sequences",
  "list_recent_replies",
  "get_agent_status",
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
      name: "research_leads",
      description:
        "Research one or more leads by reading their own company website, producing a brief (what they do, who they sell to, concrete observations and personalization hooks). Results are stored on the lead and reused by drafting. draft_outreach researches automatically, so only call this when the user explicitly asks for research.",
      parameters: {
        type: "object",
        properties: {
          lead_ids: { type: "array", items: { type: "string" } },
          force: { type: "boolean", description: "Re-scrape even if a recent brief exists" },
        },
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
      name: "list_drafts",
      description:
        "List the user's saved email drafts (id, lead, subject, recipient). Use this to get draft ids before sending — including drafts you created in an earlier turn of this conversation.",
      parameters: {
        type: "object",
        properties: {
          lead_ids: { type: "array", items: { type: "string" }, description: "Only drafts for these leads" },
          query: { type: "string", description: "Free-text match on subject, company or contact" },
          limit: { type: "number", description: "Default 20, max 50" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_mailboxes",
      description:
        "List the user's connected sending mailboxes (email address and status). Use this when the user names an inbox to send from, or when you need to know which mailboxes are available.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "send_drafts",
      description:
        "Send already-saved drafts. This is how you send emails you drafted earlier — you do NOT need the subject or body, only the draft ids (or lead ids, or nothing to send every pending draft). Optionally pass from_email to send from a specific connected mailbox. In approval mode each send pauses for the user's approval inline in the chat.",
      parameters: {
        type: "object",
        properties: {
          draft_ids: { type: "array", items: { type: "string" }, description: "Draft ids to send" },
          lead_ids: { type: "array", items: { type: "string" }, description: "Send the latest draft for each of these leads" },
          from_email: { type: "string", description: "Mailbox address to send from, e.g. brandon@example.com" },
          all_pending: { type: "boolean", description: "Send every saved draft (max 20) when no ids are given" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "schedule_drafts",
      description:
        "Schedule already-saved drafts to be sent automatically at a future date and time. Use this whenever the user asks to send later, tomorrow, next week, or at a specific time. Prefer send_at_local (the user's local wall-clock time, e.g. 2026-08-12T09:00) — it is interpreted in the user's timezone. Only pass send_at when the user explicitly gave a UTC time. The drafts are queued and sent by the scheduler — nothing is sent now.",
      parameters: {
        type: "object",
        properties: {
          draft_ids: { type: "array", items: { type: "string" }, description: "Draft ids to schedule" },
          lead_ids: { type: "array", items: { type: "string" }, description: "Schedule the latest draft for each of these leads" },
          all_pending: { type: "boolean", description: "Schedule every saved draft (max 20) when no ids are given" },
          send_at: {
            type: "string",
            description: "When to send, ISO 8601 with an explicit UTC offset or Z, e.g. 2026-08-12T13:00:00Z. Only use this if the user gave you an explicit UTC time.",
          },
          send_at_local: {
            type: "string",
            description:
              "PREFERRED. When to send in the user's own local wall-clock time, no offset, e.g. 2026-08-12T09:00. Use this for every request like \"today at 9am\" or \"tomorrow morning\" — it is converted using the user's timezone shown in CURRENT TIME.",
          },
          stagger_minutes: {
            type: "number",
            description: "Optional gap in minutes between each scheduled email so they don't all go out at once.",
          },
          from_email: { type: "string", description: "Mailbox address to send from, e.g. brandon@example.com" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_scheduled_emails",
      description:
        "List emails already queued to send in the future (id, recipient, subject, scheduled time). Use this to show the user what is scheduled or to get ids before cancelling.",
      parameters: {
        type: "object",
        properties: { limit: { type: "number", description: "Default 20, max 50" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cancel_scheduled_email",
      description:
        "Cancel a scheduled email before it sends, restoring it as a saved draft. Get ids from list_scheduled_emails.",
      parameters: {
        type: "object",
        properties: {
          scheduled_ids: { type: "array", items: { type: "string" }, description: "Ids from list_scheduled_emails" },
        },
        required: ["scheduled_ids"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_drafts",
      description:
        "Permanently delete saved email drafts the user no longer wants. Pass draft_ids (from list_drafts or your own draft_outreach results), lead_ids to remove every draft for those leads, or all_pending to clear every saved draft. Deleting is irreversible — only do it when the user asks.",
      parameters: {
        type: "object",
        properties: {
          draft_ids: { type: "array", items: { type: "string" }, description: "Draft ids to delete" },
          lead_ids: { type: "array", items: { type: "string" }, description: "Delete all drafts for these leads" },
          all_pending: { type: "boolean", description: "Delete every saved draft for the user" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_inbox_threads",
      description:
        "Delete emails/conversations from the user's inbox (removes the stored reply threads). Pass thread_ids, or match_email to clear the conversation with a specific address. Irreversible — only when the user asks to delete or clean up their inbox.",
      parameters: {
        type: "object",
        properties: {
          thread_ids: { type: "array", items: { type: "string" }, description: "Reply thread ids to delete" },
          match_email: { type: "string", description: "Delete threads with this email address" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_leads",
      description:
        "Permanently delete saved lead records from the user's account (and any drafts attached to them). Pass lead_ids from list_leads, or match_company / match_name to find them. Irreversible — only when the user asks to delete or clean up leads.",
      parameters: {
        type: "object",
        properties: {
          lead_ids: { type: "array", items: { type: "string" }, description: "Lead ids to delete" },
          match_company: { type: "string", description: "Delete leads whose company name matches this text" },
          match_name: { type: "string", description: "Delete leads whose contact name matches this text" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_outreach",
      description:
        "Send a brand new email to a lead when you have the subject and body in hand. To send a draft you already created, use send_drafts instead. In approval mode this pauses and shows the user an approve/reject card inline in the chat instead of sending.",
      parameters: {
        type: "object",
        properties: {
          lead_id: { type: "string" },
          subject: { type: "string" },
          body: { type: "string" },
          from_email: { type: "string", description: "Mailbox address to send from" },
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
      name: "find_leads",
      description:
        "Source brand new leads from the lead network and save them. Pass `query` with who the user asked for (any role/industry/company type, in plain English) and the search runs broad on that, using the saved ICP only to score and qualify the results — not as a hard filter. Omit `query` to instead source more people matching the saved ICP. Every search excludes people already in the account and advances the result page, so repeated calls return different people. Use this when the user asks to find/source/prospect new leads.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Plain-English description of who to find, e.g. 'GTM leaders at Series B SaaS companies in the US'. Use the user's request verbatim-ish. When set, the ICP scores results rather than filtering them, so niche or off-ICP searches still return people.",
          },
          count: { type: "number", description: "How many new leads to source (1-25, default 10)." },
        },
      },
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
    let requestedAgentId = typeof payload.agentId === "string" ? payload.agentId : null;
    const action = String(payload.action ?? "chat");
    if (!threadId) return json({ error: "Missing threadId" }, 400);

    // The user's IANA timezone (sent by the client). Everything the model sees or
    // parses as a wall-clock time is resolved against this, never against UTC —
    // otherwise "9am today" gets queued as 09:00Z (5am in New York).
    const userTz = (() => {
      const tz = typeof payload.timezone === "string" ? payload.timezone.trim() : "";
      if (!tz) return "UTC";
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: tz });
        return tz;
      } catch {
        return "UTC";
      }
    })();
    const tzOffsetMs = (date: Date, tz: string) => {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hour12: false,
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      }).formatToParts(date).reduce((acc: Record<string, string>, p) => {
        if (p.type !== "literal") acc[p.type] = p.value;
        return acc;
      }, {});
      const asUtc = Date.UTC(
        Number(parts.year), Number(parts.month) - 1, Number(parts.day),
        Number(parts.hour) % 24, Number(parts.minute), Number(parts.second),
      );
      return asUtc - date.getTime();
    };
    // Parse "2026-08-12T09:00" as wall-clock time in the user's timezone.
    const parseLocalWallClock = (input: string, tz: string): Date | null => {
      const m = input.trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
      if (!m) return null;
      const naive = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
      let guess = new Date(naive - tzOffsetMs(new Date(naive), tz));
      guess = new Date(naive - tzOffsetMs(guess, tz));
      return Number.isNaN(guess.getTime()) ? null : guess;
    };
    const formatLocal = (d: Date) =>
      `${new Intl.DateTimeFormat("en-US", {
        timeZone: userTz, dateStyle: "medium", timeStyle: "short", hour12: true,
      }).format(d)} (${userTz})`;

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
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json",
            apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
          },
          body: JSON.stringify(body ?? {}),
          // Never let one hung sub-function eat the whole turn.
          signal: AbortSignal.timeout(Math.max(5_000, Math.min(45_000, timeLeft() - 5_000))),
        });
        const text = await res.text();
        try {
          return JSON.parse(text);
        } catch {
          return { error: text.slice(0, 300) };
        }
      } catch (e) {
        console.error(`callFn ${name} failed`, e);
        return { error: e instanceof Error ? e.message : `${name} did not respond` };
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
          // Honour the mailbox the agent was told to send from.
          integrationRowId: approval.integration_row_id ?? undefined,
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
        const r = await callFn("agent-run", { mode: "autonomous", agentId: requestedAgentId ?? undefined });
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
      .select("id, user_id, title, autonomy, agent_config_id")
      .eq("id", threadId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!thread) return json({ error: "Conversation not found" }, 404);

    // The conversation is bound to an agent build, so chatting with a
    // non-primary agent uses that build's persona, ICP and capabilities.
    requestedAgentId = requestedAgentId ?? ((thread as any).agent_config_id ?? null);
    if (typeof payload.agentId === "string" && payload.agentId &&
        (thread as any).agent_config_id !== payload.agentId) {
      await admin.from("agent_chat_threads").update({ agent_config_id: payload.agentId }).eq("id", threadId);
    }

    const autonomous = thread.autonomy === "autonomous";

    // --- stop / cancel support -------------------------------------------
    // The UI's Stop button stamps cancel_requested_at on the thread. We clear
    // any stale request at the start of a turn, then poll between model steps
    // and before each mutating tool so an interrupted run never sends anything
    // the user tried to stop.
    await admin
      .from("agent_chat_threads")
      .update({ cancel_requested_at: null })
      .eq("id", threadId);

    let cancelled = false;
    const cancelRequested = async () => {
      if (cancelled) return true;
      const { data } = await admin
        .from("agent_chat_threads")
        .select("cancel_requested_at")
        .eq("id", threadId)
        .maybeSingle();
      if ((data as any)?.cancel_requested_at) {
        cancelled = true;
        return true;
      }
      return false;
    };

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
    const [{ data: config }, { data: profile }, { data: savedIcp }] = await Promise.all([
      requestedAgentId
        ? admin.from("agent_configs").select("*").eq("id", requestedAgentId).eq("user_id", userId).maybeSingle()
        : admin.from("agent_configs").select("*").eq("user_id", userId).order("is_primary", { ascending: false }).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("profiles").select("full_name, company_name").eq("id", userId).maybeSingle(),
      admin
        .from("icp_profiles")
        .select("*")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    // The agent's saved ICP snapshot is the source of truth; fall back to the
    // user's most recently updated ICP profile so chat is never ungrounded.
    const icpSnapshot: Record<string, any> | null =
      ((config as any)?.icp_snapshot as Record<string, any> | null) ?? (savedIcp as any) ?? null;
    const icpContext = buildIcpContext(icpSnapshot);

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
    // Step timing telemetry (Agent > Performance tab reads this).
    const turnId = crypto.randomUUID();
    const turnStartedAt = Date.now();
    const stepMetrics: Array<{
      tool_name: string;
      step_type: string;
      duration_ms: number;
      status: string;
      detail: string | null;
    }> = [];

    type Mailbox = {
      integrationRowId: string;
      email: string;
      status: string | null;
      sendingAccountId?: string | null;
    };

    const loadMailboxes = async () => {
      const { data } = await admin
        .from("sending_accounts")
        .select("id, integration_id, email, status")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });
      return (data ?? []).filter((a: any) => a.integration_id && a.email);
    };

    // Picks the mailbox to send from. `from_email` is matched against the user's
    // connected sending accounts; with one connected mailbox we use it, and with
    // several we ask instead of guessing which inbox a prospect hears from.
    const resolveMailbox = async (
      fromEmail: string | null,
    ): Promise<Mailbox | { error: string }> => {
      const accounts = await loadMailboxes();
      const sendable = accounts.filter((a: any) => a.status !== "paused" && a.status !== "disabled");
      const list = accounts.map((a: any) => a.email).join(", ");
      if (accounts.length === 0)
        return { error: "No mailbox is connected. Connect Gmail on the Integrations page first." };
      if (fromEmail) {
        const wanted = fromEmail.trim().toLowerCase();
        const match = accounts.find((a: any) => String(a.email).toLowerCase() === wanted);
        if (!match) return { error: `No connected mailbox for ${fromEmail}. Connected mailboxes: ${list}.` };
        if (match.status === "paused" || match.status === "disabled")
          return { error: `${match.email} is ${match.status}. Resume it on the Deliverability page or pick another mailbox.` };
        return { integrationRowId: match.integration_id, email: match.email, status: match.status, sendingAccountId: match.id };
      }
      if (sendable.length === 0)
        return { error: `Every connected mailbox is paused or disabled (${list}). Resume one on the Deliverability page.` };
      if (sendable.length === 1)
        return { integrationRowId: sendable[0].integration_id, email: sendable[0].email, status: sendable[0].status, sendingAccountId: sendable[0].id };
      return {
        error: `Several mailboxes are connected (${sendable.map((a: any) => a.email).join(", ")}). Ask the user which one to send from and pass it as from_email.`,
      };
    };

    // Single send path for both send_outreach and send_drafts: in approval mode it
    // queues an inline approve/reject card, otherwise it sends immediately.
    const deliver = async (opts: {
      leadId: string | null;
      to: string;
      contactName: string | null;
      companyName: string | null;
      subject: string;
      body: string;
      mailbox: Mailbox;
      toolName: string;
    }): Promise<{ sent: boolean; summary: Record<string, unknown>; result?: any }> => {
      const { leadId, to, subject, body, mailbox, toolName } = opts;
      if (!subject || !body) return { sent: false, summary: { error: "Subject and body are required" } };

      if (!autonomous) {
        const { data: approval, error } = await admin
          .from("agent_approvals")
          .insert({
            user_id: userId,
            kind: "outreach",
            status: "pending",
            lead_id: leadId,
            integration_row_id: mailbox.integrationRowId,
            prospect_email: to,
            prospect_name: opts.contactName,
            company_name: opts.companyName,
            subject,
            body,
            reasoning: `Drafted in AI SDR chat — send from ${mailbox.email} once approved`,
            metadata: { source: "agent_chat", thread_id: threadId, from_email: mailbox.email },
          })
          .select("id")
          .single();
        if (error) return { sent: false, summary: { error: error.message } };
        toolEvents.push({
          name: toolName,
          label: "Waiting for your approval",
          status: "queued",
          detail: `Send "${subject}" to ${to} from ${mailbox.email}`,
          approval_id: approval.id,
          approval_kind: "outreach",
          approval_summary: body.slice(0, 600),
        });
        return {
          sent: false,
          summary: {
            queued_for_approval: true,
            approval_id: approval.id,
            message:
              "Nothing was sent. An approve/reject card is shown to the user right here in the chat — wait for their decision.",
          },
        };
      }

      const r = await invokeFn("send-email", {
        to,
        subject,
        body,
        leadId: leadId ?? undefined,
        integrationRowId: mailbox.integrationRowId,
      });
      const sent = !r?.error;
      if (sent) {
        if (leadId) {
          await admin
            .from("leads")
            .update({ lead_status: "active", last_contacted_at: new Date().toISOString() })
            .eq("id", leadId)
            .eq("user_id", userId);
        }
        await admin.from("agent_actions").insert({
          user_id: userId,
          action_type: "outreach_sent",
          status: "completed",
          prospect_email: to,
          subject,
          description: `Sent outreach to ${to} from ${mailbox.email} (AI SDR chat)`,
          metadata: { source: "agent_chat", thread_id: threadId, from_email: mailbox.email },
        });
      }
      toolEvents.push({
        name: toolName,
        label: sent ? "Sent email" : "Send failed",
        status: sent ? "ok" : "error",
        detail: sent ? `${to} — from ${mailbox.email}` : String(r?.error ?? "unknown error"),
      });
      return {
        sent,
        summary: sent ? { sent: true, to } : { sent: false, error: String(r?.error ?? "send failed") },
        result: r,
      };
    };

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

        case "research_leads": {
          const ids: string[] = (args.lead_ids ?? []).slice(0, 12).map((x: any) => String(x));
          if (ids.length === 0) return { error: "lead_ids is required" };
          const force = args.force === true;
          const { results, skipped } = await mapLimit(ids, 3, async (id: string) => {
            const r = await invokeFn("research-lead", { leadId: id, force });
            return {
              lead_id: id,
              what_they_do: r?.brief?.what_they_do ?? null,
              who_they_sell_to: r?.brief?.who_they_sell_to ?? null,
              observations: r?.brief?.observations ?? [],
              hooks: r?.brief?.hooks ?? [],
              confidence: r?.confidence ?? null,
              quality_score: r?.quality?.score ?? r?.brief?.quality?.score ?? null,
              quality_label: r?.quality?.label ?? r?.brief?.quality?.label ?? null,
              safe_to_personalize: r?.quality?.safe_to_personalize ?? r?.brief?.quality?.safe_to_personalize ?? null,
              gaps: r?.quality?.gaps ?? r?.brief?.quality?.gaps ?? [],
              error: r?.brief ? undefined : (r?.error ?? "Research failed"),
            };
          });
          const okCount = results.filter((r: any) => !r.error).length;
          const thinCount = results.filter((r: any) => !r.error && r.safe_to_personalize === false).length;
          toolEvents.push({
            name,
            label: "Researched leads",
            status: okCount === 0 ? "error" : "ok",
            detail: `${okCount}/${ids.length} researched from their websites${thinCount ? ` — ${thinCount} too thin to personalize safely` : ""}${skipped.length ? ` (${skipped.length} left — ask me to continue)` : ""}`,
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

          // Sender + offer context the UI path already sends — the agent path
          // used to drop these, which made its emails noticeably more generic.
          const businessDescription = [
            config?.company_context ?? "",
            (config?.value_props ?? []).join("; "),
          ].filter(Boolean).join(" — ").slice(0, 600);

          const basePayload = {
            goal,
            tone: config?.tone ?? "professional",
            senderName: profile?.full_name ?? "",
            senderCompany: profile?.company_name ?? config?.company_context ?? "",
            businessDescription,
          };

          const genOne = async (id: string) => {
            const lead = await loadLead(id);
            if (!lead) return { lead_id: id, error: "Lead not found" };
            // generate-email runs (or reuses) the per-lead website research brief
            // internally, so drafts are grounded in real findings.
            let r = await invokeFn("generate-email", { lead, ...basePayload });
            // one retry on upstream rate limiting
            if (!r?.email && /rate limit/i.test(JSON.stringify(r?.error ?? ""))) {
              await new Promise((res) => setTimeout(res, 2500));
              r = await invokeFn("generate-email", { lead, ...basePayload });
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
              research: r?.research ?? null,
              error: r?.email ? undefined : (r?.error ?? "Draft failed"),
            };
          };


          const { results: drafts, skipped } = await mapLimit(ids, 3, genOne);


          const okCount = drafts.filter((d) => d.email).length;
          const researchedCount = drafts.filter((d: any) => d.research?.observations?.length).length;
          const thinResearchCount = drafts.filter(
            (d: any) => d.email && d.research?.quality?.safe_to_personalize === false,
          ).length;
          if (thinResearchCount > 0) {
            toolEvents.push({
              name,
              label: "Thin research warning",
              status: "ok",
              detail: `${thinResearchCount} draft(s) had too little site research to personalize safely — review before sending, or ask me to re-research those leads.`,
            });
          }
          if (researchedCount > 0) {
            toolEvents.push({
              name,
              label: "Researched leads",
              status: "ok",
              detail: `${researchedCount}/${ids.length} grounded in findings from the prospect's own website`,
            });
          }
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
                research: (d as any).research ?? null,
              })),
          });
          return {
            goal,
            note:
              "Drafts are saved and shown to the user in the chat with Send / Schedule controls. Remember each draft_id — if the user then says to send them, call send_drafts with those draft_ids (plus from_email if they named an inbox); if they want them to go out later, call schedule_drafts with those draft_ids and an ISO send_at. Do not send or schedule until they ask." +
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

        case "list_mailboxes": {
          const accounts = await loadMailboxes();
          toolEvents.push({
            name,
            label: "Listed mailboxes",
            status: "ok",
            detail: accounts.length
              ? accounts.map((a) => `${a.email}${a.status && a.status !== "active" ? ` (${a.status})` : ""}`).join(", ")
              : "no connected mailbox",
          });
          return {
            mailboxes: accounts.map((a) => ({ email: a.email, status: a.status })),
            note: accounts.length
              ? "Pass one of these addresses as from_email when sending."
              : "No mailbox is connected — the user needs to connect Gmail on the Integrations page before anything can be sent.",
          };
        }

        case "list_drafts": {
          const limit = Math.min(Math.max(Number(args.limit ?? 20) || 20, 1), 50);
          let q = admin
            .from("email_drafts")
            .select("id, lead_id, subject, body, created_at, leads(company_name, contact_name, contact_email)")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(limit);
          const leadIds = Array.isArray(args.lead_ids) ? args.lead_ids.map((x: any) => String(x)) : [];
          if (leadIds.length) q = q.in("lead_id", leadIds);
          const { data, error } = await q;
          if (error) return { error: error.message };
          const search = String(args.query ?? "").trim().toLowerCase();
          const rows = (data ?? []).filter((d: any) =>
            !search ||
            [d.subject, d.leads?.company_name, d.leads?.contact_name, d.leads?.contact_email]
              .filter(Boolean)
              .some((v: string) => v.toLowerCase().includes(search)),
          );
          toolEvents.push({
            name,
            label: "Listed drafts",
            status: "ok",
            detail: `${rows.length} saved draft(s)`,
          });
          return {
            drafts: rows.map((d: any) => ({
              draft_id: d.id,
              lead_id: d.lead_id,
              subject: d.subject,
              company: d.leads?.company_name ?? null,
              contact: d.leads?.contact_name ?? null,
              contact_email: d.leads?.contact_email ?? null,
              created_at: d.created_at,
            })),
            note: "Send these with send_drafts using their draft_id — you do not need the body.",
          };
        }

        case "delete_drafts": {
          const draftIds = (Array.isArray(args.draft_ids) ? args.draft_ids : [])
            .filter(Boolean)
            .map((x: any) => String(x));
          const leadIds = (Array.isArray(args.lead_ids) ? args.lead_ids : [])
            .filter(Boolean)
            .map((x: any) => String(x));
          if (!draftIds.length && !leadIds.length && !args.all_pending) {
            return {
              error:
                "Tell me which drafts to delete: pass draft_ids, lead_ids, or all_pending: true. Use list_drafts to look them up.",
            };
          }
          let q = admin.from("email_drafts").delete().eq("user_id", userId);
          if (draftIds.length) q = q.in("id", draftIds);
          else if (leadIds.length) q = q.in("lead_id", leadIds);
          const { data, error } = await q.select("id, subject");
          if (error) {
            toolEvents.push({ name, label: "Delete failed", status: "error", detail: error.message });
            return { error: error.message };
          }
          const deleted = data ?? [];
          toolEvents.push({
            name,
            label: "Deleted drafts",
            status: "ok",
            detail: `${deleted.length} draft(s) deleted`,
          });
          return {
            deleted_count: deleted.length,
            deleted: deleted.map((d: any) => ({ draft_id: d.id, subject: d.subject })),
            note: deleted.length
              ? "These drafts are gone permanently."
              : "No matching drafts were found, so nothing was deleted.",
          };
        }

        case "delete_inbox_threads": {
          const threadIds = (Array.isArray(args.thread_ids) ? args.thread_ids : [])
            .filter(Boolean)
            .map((x: any) => String(x));
          const matchEmail = String(args.match_email ?? "").trim();
          if (!threadIds.length && !matchEmail) {
            return {
              error:
                "Tell me which inbox emails to delete: pass thread_ids or match_email. Use list_recent_replies to find them.",
            };
          }
          let q = admin.from("reply_threads").delete().eq("user_id", userId);
          if (threadIds.length) q = q.in("id", threadIds);
          else q = q.ilike("sender_email", matchEmail);
          const { data, error } = await q.select("id, sender_email, subject");
          if (error) {
            toolEvents.push({ name, label: "Delete failed", status: "error", detail: error.message });
            return { error: error.message };
          }
          const deleted = data ?? [];
          toolEvents.push({
            name,
            label: "Deleted inbox emails",
            status: "ok",
            detail: `${deleted.length} conversation email(s) deleted`,
          });
          return {
            deleted_count: deleted.length,
            deleted: deleted.map((r: any) => ({
              thread_id: r.id,
              from: r.sender_email,
              subject: r.subject,
            })),
            note: deleted.length
              ? "Removed from the user's inbox permanently."
              : "No matching inbox emails were found, so nothing was deleted.",
          };
        }



        case "send_drafts": {
          const draftIds = (Array.isArray(args.draft_ids) ? args.draft_ids : [])
            .filter(Boolean)
            .map((x: any) => String(x));
          const leadIds = (Array.isArray(args.lead_ids) ? args.lead_ids : [])
            .filter(Boolean)
            .map((x: any) => String(x));

          let q = admin
            .from("email_drafts")
            .select("id, lead_id, subject, body, created_at, leads(company_name, contact_name, contact_email)")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(20);
          if (draftIds.length) q = q.in("id", draftIds);
          else if (leadIds.length) q = q.in("lead_id", leadIds);
          const { data: draftRows, error: draftErr } = await q;
          if (draftErr) return { error: draftErr.message };

          let drafts = draftRows ?? [];
          // lead_ids means "the latest draft per lead", not every draft ever written.
          if (!draftIds.length && leadIds.length) {
            const seen = new Set<string>();
            drafts = drafts.filter((d: any) => {
              if (!d.lead_id || seen.has(d.lead_id)) return false;
              seen.add(d.lead_id);
              return true;
            });
          }
          if (drafts.length === 0)
            return { error: "No matching saved drafts. Call list_drafts to see what exists, or draft first." };

          const mailbox = await resolveMailbox(args.from_email ? String(args.from_email) : null);
          if ("error" in mailbox) {
            toolEvents.push({ name, label: "Send blocked", status: "error", detail: mailbox.error });
            return { error: mailbox.error };
          }

          const results: any[] = [];
          for (const d of drafts as any[]) {
            const to = d.leads?.contact_email ?? null;
            const label = d.leads?.company_name ?? d.leads?.contact_name ?? to ?? "lead";
            if (!to) {
              results.push({ draft_id: d.id, lead: label, error: "Lead has no email address — enrich it first" });
              continue;
            }
            const outcome = await deliver({
              leadId: d.lead_id,
              to,
              contactName: d.leads?.contact_name ?? null,
              companyName: d.leads?.company_name ?? null,
              subject: String(d.subject ?? "").slice(0, 200),
              body: String(d.body ?? ""),
              mailbox,
              toolName: name,
            });
            results.push({ draft_id: d.id, lead: label, to, ...outcome.summary });
            if (outcome.sent) {
              await admin.from("email_drafts").delete().eq("id", d.id).eq("user_id", userId);
            }
          }

          const sentCount = results.filter((r) => r.sent).length;
          const queuedCount = results.filter((r) => r.queued_for_approval).length;
          return {
            from: mailbox.email,
            sent: sentCount,
            queued_for_approval: queuedCount,
            results,
            note: autonomous
              ? `Sent ${sentCount} of ${results.length} draft(s) from ${mailbox.email}.`
              : `Nothing was sent yet — ${queuedCount} approve/reject card(s) are shown to the user right here in the chat. Wait for their decision and never tell them to go to another page.`,
          };
        }

        case "schedule_drafts": {
          const localRaw = typeof args.send_at_local === "string" ? args.send_at_local : "";
          const absRaw = typeof args.send_at === "string" ? args.send_at : "";
          let when: Date | null = null;
          if (localRaw) {
            when = parseLocalWallClock(localRaw, userTz);
            if (!when)
              return { error: "send_at_local must look like 2026-08-12T09:00 (local wall-clock, no offset)" };
          } else if (absRaw) {
            // A bare timestamp with no offset is a wall-clock time, not UTC.
            when = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(absRaw.trim())
              ? new Date(absRaw)
              : parseLocalWallClock(absRaw, userTz) ?? new Date(absRaw);
          }
          if (!when || Number.isNaN(when.getTime()))
            return { error: "Provide send_at_local (e.g. 2026-08-12T09:00) or send_at as ISO 8601 with an offset" };
          if (when.getTime() <= Date.now())
            return {
              error: `send time must be in the future (now is ${formatLocal(new Date())})`,
            };

          const draftIds = (Array.isArray(args.draft_ids) ? args.draft_ids : [])
            .filter(Boolean)
            .map((x: any) => String(x));
          const leadIds = (Array.isArray(args.lead_ids) ? args.lead_ids : [])
            .filter(Boolean)
            .map((x: any) => String(x));

          let q = admin
            .from("email_drafts")
            .select("id, lead_id, subject, body, created_at, leads(company_name, contact_name, contact_email)")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(20);
          if (draftIds.length) q = q.in("id", draftIds);
          else if (leadIds.length) q = q.in("lead_id", leadIds);
          const { data: draftRows, error: draftErr } = await q;
          if (draftErr) return { error: draftErr.message };

          let drafts = draftRows ?? [];
          if (!draftIds.length && leadIds.length) {
            const seen = new Set<string>();
            drafts = drafts.filter((d: any) => {
              if (!d.lead_id || seen.has(d.lead_id)) return false;
              seen.add(d.lead_id);
              return true;
            });
          }
          if (drafts.length === 0)
            return { error: "No matching saved drafts. Call list_drafts to see what exists, or draft first." };

          const mailbox = await resolveMailbox(args.from_email ? String(args.from_email) : null);
          if ("error" in mailbox) {
            toolEvents.push({ name, label: "Scheduling blocked", status: "error", detail: mailbox.error });
            return { error: mailbox.error };
          }

          const stagger = Math.max(0, Math.min(Number(args.stagger_minutes ?? 0) || 0, 240));
          const results: any[] = [];
          let index = 0;

          for (const d of drafts as any[]) {
            const to = d.leads?.contact_email ?? null;
            const label = d.leads?.company_name ?? d.leads?.contact_name ?? to ?? "lead";
            if (!to) {
              results.push({ draft_id: d.id, lead: label, error: "Lead has no email address — enrich it first" });
              continue;
            }
            const subject = String(d.subject ?? "").slice(0, 200);
            const body = String(d.body ?? "");
            if (!subject || !body) {
              results.push({ draft_id: d.id, lead: label, error: "Draft is missing a subject or body" });
              continue;
            }
            const sendAt = new Date(when.getTime() + index * stagger * 60_000);

            const { error: insErr } = await admin.from("sent_emails").insert({
              user_id: userId,
              lead_id: d.lead_id,
              to_email: to,
              subject,
              body_html: draftBodyToHtml(body),
              body_text: body,
              status: "scheduled",
              scheduled_at: sendAt.toISOString(),
              sending_account_id: mailbox.sendingAccountId ?? null,
            });
            if (insErr) {
              results.push({ draft_id: d.id, lead: label, error: insErr.message });
              continue;
            }
            await admin.from("email_drafts").delete().eq("id", d.id).eq("user_id", userId);
            await admin.from("agent_actions").insert({
              user_id: userId,
              action_type: "outreach_scheduled",
              status: "completed",
              prospect_email: to,
              subject,
              description: `Scheduled outreach to ${to} from ${mailbox.email} for ${sendAt.toISOString()} (AI SDR chat)`,
              metadata: {
                source: "agent_chat",
                thread_id: threadId,
                from_email: mailbox.email,
                scheduled_at: sendAt.toISOString(),
              },
            });
            results.push({
              draft_id: d.id,
              lead: label,
              to,
              scheduled_at: sendAt.toISOString(),
              scheduled_at_local: formatLocal(sendAt),
            });
            index++;
          }

          const okCount = results.filter((r) => r.scheduled_at).length;
          toolEvents.push({
            name,
            label: okCount ? "Scheduled email" : "Scheduling failed",
            status: okCount ? "ok" : "error",
            detail: okCount
              ? `${okCount} email(s) queued from ${mailbox.email}, first at ${formatLocal(when)}`
              : "No drafts could be scheduled",
          });

          return {
            from: mailbox.email,
            scheduled: okCount,
            results,
            note: okCount
              ? `Queued ${okCount} email(s) from ${mailbox.email}. The scheduler sends them automatically at the times above — the user does not need to do anything. They can be cancelled with cancel_scheduled_email.`
              : "Nothing was scheduled.",
          };
        }

        case "list_scheduled_emails": {
          const limit = Math.min(Math.max(Number(args.limit ?? 20) || 20, 1), 50);
          const { data, error } = await admin
            .from("sent_emails")
            .select("id, lead_id, to_email, subject, scheduled_at, leads(company_name, contact_name)")
            .eq("user_id", userId)
            .eq("status", "scheduled")
            .not("scheduled_at", "is", null)
            .order("scheduled_at", { ascending: true })
            .limit(limit);
          if (error) return { error: error.message };
          return {
            now: new Date().toISOString(),
            now_local: formatLocal(new Date()),
            timezone: userTz,
            scheduled: (data ?? []).map((e: any) => ({
              scheduled_id: e.id,
              lead_id: e.lead_id,
              to: e.to_email,
              subject: e.subject,
              scheduled_at: e.scheduled_at,
              scheduled_at_local: e.scheduled_at ? formatLocal(new Date(e.scheduled_at)) : null,
              company: e.leads?.company_name ?? null,
              contact: e.leads?.contact_name ?? null,
            })),
            note: "Cancel any of these with cancel_scheduled_email using scheduled_id.",
          };
        }

        case "cancel_scheduled_email": {
          const ids = (Array.isArray(args.scheduled_ids) ? args.scheduled_ids : [])
            .filter(Boolean)
            .map((x: any) => String(x));
          if (!ids.length) return { error: "Pass scheduled_ids from list_scheduled_emails" };

          const { data: rows, error } = await admin
            .from("sent_emails")
            .select("id, lead_id, to_email, subject, body_text, scheduled_at")
            .eq("user_id", userId)
            .eq("status", "scheduled")
            .in("id", ids);
          if (error) return { error: error.message };
          if (!rows?.length) return { error: "No matching scheduled emails (they may have already sent)" };

          const cancelled: any[] = [];
          for (const r of rows) {
            const { error: delErr } = await admin
              .from("sent_emails")
              .delete()
              .eq("id", r.id)
              .eq("user_id", userId)
              .eq("status", "scheduled");
            if (delErr) continue;
            if (r.lead_id && r.body_text) {
              await admin.from("email_drafts").insert({
                user_id: userId,
                lead_id: r.lead_id,
                subject: r.subject,
                body: r.body_text,
              });
            }
            cancelled.push({ scheduled_id: r.id, to: r.to_email, was_scheduled_for: r.scheduled_at });
          }
          toolEvents.push({
            name,
            label: cancelled.length ? "Cancelled scheduled email" : "Cancel failed",
            status: cancelled.length ? "ok" : "error",
            detail: `${cancelled.length} of ${rows.length} cancelled`,
          });
          return {
            cancelled: cancelled.length,
            details: cancelled,
            note: "Cancelled sends were restored as saved drafts so they can be edited, re-sent or re-scheduled.",
          };
        }



        case "send_outreach": {
          const lead = await loadLead(String(args.lead_id ?? ""));
          if (!lead) return { error: "Lead not found" };
          if (!lead.contact_email) return { error: "Lead has no email address — enrich it first" };
          const subject = String(args.subject ?? "").slice(0, 200);
          const body = String(args.body ?? "");
          if (!subject || !body) return { error: "Subject and body are required" };

          const mailbox = await resolveMailbox(args.from_email ? String(args.from_email) : null);
          if ("error" in mailbox) {
            toolEvents.push({ name, label: "Send blocked", status: "error", detail: mailbox.error });
            return { error: mailbox.error };
          }

          const outcome = await deliver({
            leadId: lead.id,
            to: lead.contact_email,
            contactName: lead.contact_name ?? null,
            companyName: lead.company_name ?? null,
            subject,
            body,
            mailbox,
            toolName: name,
          });
          return { from: mailbox.email, ...outcome.summary, ...(outcome.result ?? {}) };
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

        case "find_leads": {
          const query = typeof args.query === "string" ? args.query.trim() : "";
          // Either a free-text query OR a saved ICP is enough to search. Only
          // block when we have neither, so there is nothing to search on at all.
          if (!query && !icpSnapshot) {
            return {
              error:
                "No search query and no saved ICP. Ask the user who they want to find, or have them save an ICP on the ICP page.",
            };
          }
          const want = Math.min(Math.max(Number(args.count) || 10, 1), 25);

          // With a free-text query, run the SAME pipeline the manual lead-gen
          // search uses: parse the text into structured filters (title, industry,
          // location, seniority, size, keywords) and search on those ALONGSIDE
          // the raw query, non-strict. A bare-query-only request under-returns
          // because the provider leans on the structured bounds — that regression
          // is why the agent stopped finding leads. `strict` is deliberately
          // absent so the backend's broadening ladder runs and the ICP only
          // scores the results (it is not sent as a filter here at all). If the
          // parser is unavailable we still fall back to searching the raw text.
          // Mirror of buildExternalFilters in src/lib/lead-filters.ts.
          let queryFilters: Record<string, unknown> | null = null;
          if (query) {
            const parsed = await invokeFn("parse-lead-query", { query });
            const f = parsed && typeof parsed === "object" ? (parsed as any).filters : null;
            if (f && typeof f === "object") {
              const arr = (v: unknown): string[] =>
                Array.isArray(v)
                  ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => (x as string).trim())
                  : [];
              const titles = arr(f.jobTitles);
              const industries = arr(f.industries);
              const locations = arr(f.locations);
              const seniorities = arr(f.seniorities);
              const keywords = arr(f.keywords);
              const excludeTitles = arr(f.excludeTitles);
              const excludeIndustries = arr(f.excludeIndustries);
              const excludeKeywords = arr(f.excludeKeywords);
              queryFilters = {
                query,
                job_title: titles[0] || undefined,
                job_titles: titles.length > 1 ? titles : undefined,
                industry: industries[0] || undefined,
                industries: industries.length > 1 ? industries : undefined,
                country: locations[0] || undefined,
                countries: locations.length > 1 ? locations : undefined,
                seniority: seniorities[0] || undefined,
                seniority_levels: seniorities.length > 1 ? seniorities : undefined,
                company_size: arr(f.companySizes)[0] || undefined,
                keywords: keywords.length ? keywords : undefined,
                exclude_titles: excludeTitles.length ? excludeTitles : undefined,
                exclude_industries: excludeIndustries.length ? excludeIndustries : undefined,
                exclude_keywords: excludeKeywords.length ? excludeKeywords : undefined,
              };
            }
            // Parser unconfigured / failed / could not parse: still search on the
            // raw text so the request is never empty.
            if (!queryFilters) queryFilters = { query };
          }

          // Build the search body. With a query, search broad on the parsed
          // filters (ICP only scores results); without one, target the saved ICP
          // but non-strict so the backend's broadening ladder runs — a strict ICP
          // search returned 0 whenever its industry/seniority/size didn't resolve
          // in the provider taxonomy, which is why "find leads" came back empty.
          const buildBody = (pg: number) =>
            query
              ? { ...queryFilters, limit: want, page: pg > 1 ? pg : undefined, exclude_seen: true }
              : icpSearchBody(icpSnapshot, { limit: want, page: pg, strict: false });

          // Advance the provider page as the account fills up so back-to-back
          // searches return different people instead of the same first page.
          const { count: sourcedCount } = await admin
            .from("leads")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId)
            .in("source", ["ai_agent", "ai_sdr_chat"]);
          let page = Math.floor((sourcedCount ?? 0) / want) + 1;

          let res = await invokeFn("fetch-external-leads", buildBody(page));
          let found: any[] = Array.isArray(res?.leads) ? res.leads : [];
          // The page is derived from cumulative sourced count, which overshoots
          // once the source is exhausted or after the ICP/query changes (the
          // counter is global). If an advanced page comes back empty, retry from
          // page 1 so we still surface genuinely new people; exclude_seen keeps
          // already saved leads out, so page 1 only returns unseen matches.
          if (found.length === 0 && !res?.error && page > 1) {
            page = 1;
            res = await invokeFn("fetch-external-leads", buildBody(page));
            found = Array.isArray(res?.leads) ? res.leads : [];
          }
          const saved: string[] = [];
          for (const l of found) {
            const email = String(l.business_email ?? "").trim().toLowerCase();
            const contact = String(l.contact_name ?? "").trim();
            if (!email && !contact) continue;
            const { data: inserted, error: insErr } = await admin
              .from("leads")
              .insert({
                user_id: userId,
                contact_name: contact || email.split("@")[0],
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
                source: "ai_sdr_chat",
                lead_status: "active",
                enrichment_status: email ? "enriched" : "pending",
              })
              .select("id")
              .maybeSingle();
            if (!insErr && inserted?.id) saved.push(inserted.id);
          }

          toolEvents.push({
            name,
            label: `Sourced ${saved.length} new lead${saved.length === 1 ? "" : "s"}`,
            status: res?.error ? "error" : "ok",
            detail:
              res?.error ??
              `${query ? `query "${query}", ICP-scored` : "ICP-matched"}, page ${page}, duplicates excluded`,
          });

          return {
            searched_page: page,
            returned: found.length,
            saved_lead_ids: saved,
            message: res?.message ?? res?.error ?? undefined,
            leads: found.slice(0, 25).map((l) => ({
              contact_name: l.contact_name,
              job_title: l.job_title,
              company_name: l.company_name,
              industry: l.industry,
              icp_score: l.scores?.icp_score ?? null,
            })),
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
          const r = await invokeFn("agent-run", { mode: "autonomous", agentId: (config as any)?.id });
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

You can take real action on the user's account using your tools: reading their leads, enriching and scoring them, drafting cold emails and 4-touch sequences, sending outreach now or scheduling it for a future date/time, cancelling scheduled sends, enrolling leads in sequences, reviewing replies, and triggering a full agent run.

CURRENT TIME: ${formatLocal(new Date())} — the user's local time. In UTC that is ${new Date().toISOString()}. Every time the user mentions ("9am today", "tomorrow morning", "Monday") is in THEIR timezone (${userTz}), never UTC. Resolve relative times against their local time.

HOW TO WORK
- When the user says something like "I just searched some leads, take it from here", find the relevant leads with list_leads first, then chain the work: enrich -> score -> draft -> send/queue. Do not ask permission for read-only or drafting steps; just do them and report back.
- Do several tool calls in a row when needed. Prefer batching lead ids over one-at-a-time calls. For drafting, ALWAYS pass every lead id in a single draft_outreach call via lead_ids — never fire many parallel draft_outreach calls, that trips the rate limiter.
- draft_outreach goal must be one of: introduction, follow-up, meeting, demo, proposal. Use "introduction" for first touches.
- Drafts are auto-saved and rendered in the chat as reviewable cards with Send now / Schedule / Discard buttons. After drafting, tell the user the drafts are below for review — do not send until they ask.
- SENDING: when the user approves the drafts ("send them", "all good, send"), YOU send them — call send_drafts. You never need the subject or body to send a saved draft, only draft ids: use the draft_ids from your draft_outreach results, or call list_drafts (optionally with lead_ids or a name) to look them up again. Pass from_email when the user names an inbox, and use list_mailboxes if you need to know which addresses are connected. Never tell the user to click "Send now" themselves or to open another page, and never claim you lack the lead ids or draft contents — look them up with list_drafts instead.
- SCHEDULING: you CAN send later. When the user asks for a future send ("tomorrow at 9", "Monday morning", "next week"), call schedule_drafts with the draft_ids and send_at_local set to their local wall-clock time with no offset (e.g. "9am today" -> send_at_local: "YYYY-MM-DDT09:00" for today's local date). Never convert to UTC yourself and never pass a bare UTC timestamp for a local time — the tool does the conversion. Use stagger_minutes when queuing several so they don't all fire at once. Confirm the exact date/time you queued, and mention it sends automatically. Use list_scheduled_emails to show what is queued and cancel_scheduled_email to call one back. Never say you cannot schedule and never tell the user to use the Schedule button themselves.
- DELETING: you CAN delete emails. Use delete_drafts to remove saved drafts (by draft_ids, lead_ids, or all_pending) and delete_inbox_threads to remove inbox conversations (by thread_ids or match_email). Deletion is permanent, so only do it when the user asks, confirm briefly what you are about to delete if the request is broad ("delete all my drafts"), then do it and report the count. Never tell the user to delete things manually in the UI.
- Use send_outreach only for a brand new email you just wrote in the conversation and have not saved as a draft.
- To source NEW people, use find_leads. If the user describes who they want (any role, industry, company type, or a one-off ask that is not the ICP), pass that description as \`query\` and the search runs broad on it, using the saved ICP only to score/qualify the results. If they just say "find more leads" or "source from my ICP" with no specific target, omit \`query\` to source people matching the saved ICP. It excludes anyone already in the account and advances the result page, so calling it again returns different people. Do not refuse or narrow an off-ICP request; run it as a query and let the ICP score it. Only say you cannot search if there is neither a query nor a saved ICP.
- Never invent leads, metrics, emails or results. Only report what the tools returned.
- Be concise and specific. Short paragraphs, tight bullet lists, real numbers and names. No emojis, no filler.

AUTONOMY
This conversation is in ${autonomous ? "FULL AUTONOMY mode: sending, enrolling and full agent runs execute immediately." : "APPROVAL mode: anything that sends an email, enrolls a lead, or runs the full agent pauses for the user's approval instead of executing. When that happens an approve/reject card appears inline in this chat — say briefly what you want to do and ask them to approve it below. Never tell them to go to another tab or page."}
${autonomous ? "" : "If the user asks you to just get on with it without approving each step, tell them they can switch this conversation to full autonomy with the mode selector at the top of the chat."}

COLD EMAIL RULES (apply to every draft you write or review)
${PLAYBOOK_SYSTEM_RULES}

Company context: ${config?.company_context ?? "not set"}
Value props: ${(config?.value_props ?? []).join("; ") || "not set"}

${icpContext || "No ICP profile is saved yet, so there is nothing to score results against. You can still source leads when the user names who they want (pass it as find_leads query), but suggest they save an ICP on the ICP page so results get qualified. Do not invent an ICP of your own."}`;

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...(history ?? []).map((m) => ({ role: m.role, content: m.content })),
    ];

    let finalText = "";
    let ranOutOfTime = false;
    // Never lose completed tool work: when the model call fails we stop the loop
    // and still persist an assistant message describing what happened.
    let failureNote = "";

    for (let step = 0; step < 8; step++) {
      if (outOfTime()) {
        ranOutOfTime = true;
        break;
      }
      if (await cancelRequested()) break;

      let res: Response;
      try {
        res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
          signal: AbortSignal.timeout(Math.max(5_000, timeLeft() - 5_000)),
        });
      } catch (e) {
        console.error("AI gateway request failed", e);
        failureNote =
          "The AI service didn't respond in time. Any work above is saved — reply \"continue\" to pick up from here.";
        break;
      }

      if (!res.ok) {
        const detail = await res.text();
        console.error("AI gateway error", res.status, detail.slice(0, 500));
        failureNote =
          res.status === 429
            ? "I'm being rate limited right now. Any work above is saved — wait a few seconds and reply \"continue\"."
            : res.status === 402
              ? "AI credits are exhausted, so I can't continue this turn. Add credits in Settings and reply \"continue\"."
              : "The AI service returned an error, so I stopped here. Any work above is saved — reply \"continue\" to retry.";
        break;
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

      // Read-only tools are cheap and provider-free, so run them concurrently.
      // Anything that writes, sends or hits an external provider stays serial so
      // we don't trip rate limiters or double-send.
      const runOne = async (call: any) => {
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
        const startedAt = Date.now();
        let stepStatus = "success";
        let stepDetail: string | null = null;
        try {
          result = await runTool(toolName, args);
        } catch (e) {
          stepStatus = "error";
          stepDetail = e instanceof Error ? e.message : "unknown error";
          result = { error: stepDetail ?? "tool failed" };
          toolEvents.push({
            name: toolName,
            label: "Action failed",
            status: "error",
            detail: stepDetail ?? "unknown error",
          });
        }
        stepMetrics.push({
          tool_name: toolName || "unknown",
          step_type: PARALLEL_SAFE_TOOLS.has(toolName) ? "tool_parallel" : "tool_serial",
          duration_ms: Date.now() - startedAt,
          status: stepStatus,
          detail: stepDetail ? stepDetail.slice(0, 300) : null,
        });
        return {
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result).slice(0, 12000),
        };
      };

      const nameOf = (c: any) => c.function?.name ?? "";
      const parallel = calls.filter((c: any) => PARALLEL_SAFE_TOOLS.has(nameOf(c)));
      const serial = calls.filter((c: any) => !PARALLEL_SAFE_TOOLS.has(nameOf(c)));

      const parallelResults = parallel.length ? await Promise.all(parallel.map(runOne)) : [];
      const serialResults: any[] = [];
      for (const call of serial) {
        // Last gate before anything that writes or sends: if the user hit Stop
        // while the previous action was running, don't start this one.
        if (MUTATING_TOOLS.has(nameOf(call)) && (await cancelRequested())) {
          toolEvents.push({
            name: nameOf(call),
            label: "Stopped before running",
            status: "error",
            detail: "You stopped this run before this action started.",
          });
          continue;
        }
        serialResults.push(await runOne(call));
      }

      // Keep the tool replies in the order the model asked for them.
      const byId = new Map<string, any>();
      for (const r of [...parallelResults, ...serialResults]) byId.set(r.tool_call_id, r);
      for (const call of calls) {
        const r = byId.get(call.id);
        if (r) messages.push(r);
      }
      if (cancelled) break;
    }

    if (cancelled) {
      await admin
        .from("agent_chat_threads")
        .update({ cancel_requested_at: null })
        .eq("id", threadId);
      finalText = toolEvents.length
        ? "Stopped. Everything above was already done and is saved — nothing further ran. Tell me what to change and I'll pick it back up."
        : "Stopped before anything ran. Nothing was sent or changed.";
    } else if (!finalText) {
      finalText = failureNote
        ? failureNote
        : ranOutOfTime
          ? "That batch was too big to finish in one turn — the work above is saved. Reply \"continue\" and I'll pick up where I left off."
          : toolEvents.length
            ? "I finished the actions above. Tell me what you'd like next."
            : "I couldn't complete that. Try rephrasing what you'd like me to do.";
    } else if (failureNote) {
      finalText += `\n\n${failureNote}`;
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

    // Persist step timing for the Performance tab. Never let telemetry break a turn.
    try {
      const turnStatus = cancelled
        ? "cancelled"
        : stepMetrics.some((m) => m.status === "error") || failureNote
          ? "error"
          : "success";
      const rows = [
        ...stepMetrics,
        {
          tool_name: "__turn__",
          step_type: "turn",
          duration_ms: Date.now() - turnStartedAt,
          status: turnStatus,
          detail: failureNote ? failureNote.slice(0, 300) : null,
        },
      ].map((m) => ({
        ...m,
        user_id: userId,
        thread_id: threadId,
        turn_id: turnId,
        agent_config_id: requestedAgentId ?? null,
      }));
      await admin.from("agent_step_metrics").insert(rows);
    } catch (e) {
      console.error("step metrics insert failed", e);
    }

    await captureServerEvent("agent_chat_turn_completed", userId, {
      thread_id: threadId,
      tools_used: toolEvents.map((t) => t.name),
      tool_count: toolEvents.length,
      had_error: toolEvents.some((t) => t.status === "error"),
      drafts_created: toolEvents.reduce((n, t) => n + (t.drafts?.length ?? 0), 0),
      approvals_requested: toolEvents.filter((t) => !!t.approval_id).length,
    });

    return json({ message: saved, toolEvents });

  } catch (error) {
    console.error("agent-chat error", error);
    return json({ error: "The agent hit an unexpected error." }, 500);
  }
});

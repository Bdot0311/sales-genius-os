import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { playbookEnforcementRules } from "../_shared/cold-email-playbook.ts";
import {
  FOLLOW_UP_GOALS,
  draftForLead,
  goalForLead,
  leadThreads,
  leadsAwaitingReply,
  leadsWithDrafts,
  sentSubjectsFor,
  type ContactState,
} from "../_shared/draft-one.ts";
import { leadIntelligenceMode } from "../_shared/lead-intelligence.ts";
import { chooseMailbox, type RoutableMailbox } from "../_shared/mailbox-routing.ts";
import { invalidArgsResult, validateToolArgs, type ToolSchema } from "../_shared/tool-args.ts";
import { mergeCompleted, resultOk, resumeFrom, supabaseTraceStore, trimResult } from "../_shared/agent-trace.ts";
import { budgetExhausted, budgetNote, carriedTokens, tokensIn, turnTokenBudget } from "../_shared/agent-budget.ts";
import { pruneTurnContext } from "../_shared/turn-context.ts";
import {
  AGENT_MAX_ATTEMPTS,
  AGENT_TARGET_SCORE,
  attemptFeedback,
  isPerfect,
  isSendable,
  isWeak,
  scoreEmail,
  type Attempt,
} from "../_shared/email-quality.ts";
import { signOffStartIndex } from "../_shared/email-rules.ts";
import { findPlaceholders, hasPlaceholder, realValue } from "../_shared/email-rules.ts";
import { asFnResult } from "../_shared/fn-result.ts";
import { UNTRUSTED_CONTENT_RULE, fence, fenceRecords } from "../_shared/untrusted.ts";
import {
  correctionFor,
  emptyTurnWarning,
  statedIntentWithoutAction,
  unbackedClaims,
} from "../_shared/claim-check.ts";
import { capacityFor, shortfallWarning } from "../_shared/send-capacity.ts";
import { decideSend, previewText } from "../_shared/send-confirmation.ts";
import { userConfirmedSend } from "../_shared/user-confirmation.ts";
import { duplicateGuidanceFor } from "../_shared/duplicate-send.ts";
import { wantsCopyAudit } from "../_shared/copy-review-intent.ts";
import { auditEmail, auditSummary } from "../_shared/email-audit.ts";
import { agentProhibitions } from "../_shared/agent-prohibitions.ts";
import { auditDeliverability } from "../_shared/email-deliverability.ts";
import { auditSequence, sequenceSummary } from "../_shared/sequence-audit.ts";
import {
  accountFor,
  batchFetchLimit,
  isShortfall,
  shortfallNote,
} from "../_shared/batch-report.ts";
import { buildIcpContext, icpSearchBody } from "../_shared/icp-context.ts";
import { captureServerEvent } from "../_shared/posthog.ts";
import { getSignatureHtml, appendSignatureToBody } from "../_shared/signature.ts";
import { aiFetch } from "../_shared/ai-provider.ts";
import { allowedToolsFor, scopeNoteFor } from "../_shared/agent-tool-scope.ts";
import { OUTBOUND_TOOL_DEFS, runOutboundTool } from "../_shared/agent-outbound-tools.ts";
import {
  blockedToolsFor,
  capToolsToTier,
  resolveAgentTier,
  tierScopeNote,
} from "../_shared/agent-tier-scope.ts";

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


/**
 * What this build of agent-chat can do, for the deploy probe above.
 *
 * Add a marker in the same change that adds the behaviour, and add its
 * assertion to agent-build-probe.test.ts. A marker whose code is not here is a
 * lie told to whoever is trying to work out why a fix has not taken effect.
 */
const AGENT_CHAT_BUILD = [
  // #243: a turn that promised work and called nothing gets one more chance.
  "continues-a-promised-turn",
  // #254: the run claim is released when a turn throws, the continuation note
  // follows the decision rather than preceding it, and "no response" means
  // silence rather than a null column.
  "releases-run-claim-on-error",
  "says-when-it-stops-short",
  "quiet-period-on-awaiting-reply",
  "refuses-delete-and-redraft",
  // #257: a batch bigger than the inline limit is queued rather than truncated.
  "queues-overflow-batches",
  // #259: the model is told to pass every lead id in one call.
  "asks-for-the-whole-list",
  // #264: drafting knows what it has already written, sizes the inline batch
  // to the time actually left, and reports the drafts table rather than a count
  // the model worked out for itself.
  "skips-leads-that-have-drafts",
  "sizes-inline-batch-to-budget",
  "reports-real-draft-totals",
  // #265: the turn finishes the set it was given, however the model slices it.
  "finishes-the-whole-outstanding-set",
  "one-batch-job-per-turn",
] as const;

const LEAD_FIELDS =
  "id, company_name, contact_name, contact_email, job_title, industry, company_website, linkedin_url, lead_status, pipeline_stage, tier, icp_score, intent_score, intent_label, signal_score, signals, notes, last_contacted_at, created_at";

/**
 * A uuid no row can carry, for a filter whose matching set is empty.
 *
 * `.in("id", [])` is rejected by PostgREST, and skipping the filter instead
 * would silently widen the query to every lead — which is the exact failure
 * this filter exists to stop.
 */
const NO_MATCH_ID = "00000000-0000-0000-0000-000000000000";

const DEAL_STAGES = ["new", "contacted", "qualified", "proposal", "negotiation", "closed_won", "closed_lost"] as const;
const DEAL_FIELDS = ["title", "company_name", "contact_name", "lead_id", "value", "stage", "probability", "expected_close_date", "notes"];
const LEAD_FIX_FIELDS = ["contact_name", "contact_email", "contact_phone", "job_title", "company_name", "company_website", "linkedin_url", "industry", "country"];
const PIPELINE_STAGES = [
  "new", "contacted", "no_response", "replied", "bounced",
  "meeting_booked", "qualified", "not_interested", "won", "lost",
] as const;

// Mirrors the client-side draft -> HTML conversion used by the chat draft cards
// so a scheduled send renders identically to an immediate one.
const draftBodyToHtml = (body: string) => {
  const escaped = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  // Every non-empty line used to become its own <p> with a 16px gap, so the
  // signature rendered as a stack of floating fragments rather than a block.
  const lines = escaped.split("\n");
  const signOffAt = signOffStartIndex(lines);

  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (signOffAt >= 0 && i === signOffAt) {
      // Collect the signature into one paragraph, joined by <br>, so name and
      // title sit on consecutive lines the way a person writes them.
      const block: string[] = [];
      let j = i;
      while (j < lines.length && !/^p\.?\s?s\.?[\s:.-]/i.test(lines[j].trim())) {
        if (lines[j].trim()) block.push(lines[j].trim());
        j++;
      }
      out.push(`<p style="margin:0">${block.join("<br>")}</p>`);
      i = j - 1;
      continue;
    }
    out.push(`<p>${line}</p>`);
  }
  const paragraphs = out.join("\n");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px}p{margin:0 0 16px}</style></head><body>${paragraphs}</body></html>`;
};

/**
 * Whether a tool call actually changed something, and so should be remembered
 * as done.
 *
 * "No error key" is not the same as "it happened". send_outreach answers
 * needs_rewrite when the draft scored too low and was NOT sent, and answers
 * queued_for_approval when a human still has to press the button. Neither
 * carries an error, so treating them as completed would record a send that
 * never occurred — and then refuse the model's corrected retry as a duplicate,
 * leaving the prospect with nothing and the agent believing it had sent.
 */
function didMutate(result: unknown): boolean {
  if (!result || typeof result !== "object") return true;
  const r = result as Record<string, unknown>;
  if ("error" in r) return false;

  const summary = (r.summary && typeof r.summary === "object" ? r.summary : r) as Record<string, unknown>;
  if (summary.needs_rewrite === true) return false;

  // Both shapes, because both exist. deliver() returns a per-email summary
  // where queued_for_approval is `true` and sent is `false`; send_drafts and
  // schedule_drafts return a BATCH where the same keys are counts. The checks
  // were `=== true` and `=== false`, so a batch reporting {sent: 0,
  // queued_for_approval: 2} matched neither, and two emails that were merely
  // parked for a human to confirm were recorded as a completed send — which is
  // exactly what this function exists to prevent.
  const asCount = (v: unknown): number | null =>
    typeof v === "number" ? v : typeof v === "boolean" ? (v ? 1 : 0) : null;
  const queued = asCount(summary.queued_for_approval) ?? asCount(r.queued_for_approval);
  const sent = asCount(summary.sent) ?? asCount(r.sent);
  // When a result reports a send count at all, that count is the answer: a
  // partial batch (one sent, one queued) IS a mutation, and treating it as
  // nothing would let the one that went out be sent a second time on retry.
  if (sent !== null) return sent > 0;
  if (queued !== null && queued > 0) return false;

  return true;
}

/**
 * Identity of a mutating action, for the "already did this" guard.
 *
 * The default is the whole argument object, which answers "were these the exact
 * same instructions". For sending, the question that matters is different: did
 * this person already get an email this request. Keying a send on its arguments
 * means rewording the body produces a new key, so a model that redrafts and
 * re-sends delivers twice to the same prospect — and the rewrite path added by
 * the quality gate makes exactly that sequence likely.
 *
 * Recipient identity is therefore the key for sends. Everything else keeps
 * argument identity, which is correct for tools whose repeat cost is wasted
 * work rather than a second email to a real person.
 */
function mutationKeyFor(toolName: string, args: Record<string, unknown>): string | null {
  if (!MUTATING_TOOLS.has(toolName)) return null;

  if (toolName === "send_outreach") {
    const who = String(args.lead_id ?? args.to ?? "").trim().toLowerCase();
    if (who) return `send_outreach:recipient:${who}`;
  }

  return `${toolName}:${JSON.stringify(args, Object.keys(args).sort())}`;
}

const TOOL_RESULT_LIMIT = 12000;

/**
 * Serialise a tool result for the model without ever handing it broken JSON.
 *
 * This used to be JSON.stringify(result).slice(0, 12000). Any result over the
 * limit reached the model as a string that starts like JSON and stops
 * mid-token — and a model given a truncated record does not report a truncated
 * record, it infers what the rest probably said. draft_outreach returns up to
 * twenty drafts each carrying the full generated email, so passing the limit is
 * routine rather than exceptional.
 *
 * Oversized results are shrunk structurally instead: the longest array is
 * trimmed, element by element, until the whole thing fits, and the result says
 * how many were dropped so the model can ask for the rest rather than invent
 * it. What survives is always valid JSON.
 */
function serialiseToolResult(result: unknown): string {
  let out = JSON.stringify(result) ?? "null";
  if (out.length <= TOOL_RESULT_LIMIT) return out;

  if (result && typeof result === "object") {
    // Work on a shallow clone so the caller's object is untouched.
    const clone: Record<string, unknown> = Array.isArray(result)
      ? ({ items: [...result] } as Record<string, unknown>)
      : { ...(result as Record<string, unknown>) };

    // The biggest array is what blew the budget; trim that one.
    let longestKey: string | null = null;
    let longestLen = 0;
    for (const [k, v] of Object.entries(clone)) {
      if (Array.isArray(v) && v.length > longestLen) {
        longestKey = k;
        longestLen = v.length;
      }
    }

    if (longestKey) {
      const items = [...(clone[longestKey] as unknown[])];
      let dropped = 0;
      while (items.length > 1) {
        items.pop();
        dropped++;
        clone[longestKey] = items;
        clone.truncated = true;
        clone.truncated_note =
          `${dropped} more ${longestKey} were omitted because the result was too large. ` +
          `Ask for them by id if you need them — do not assume what they contained.`;
        out = JSON.stringify(clone);
        if (out.length <= TOOL_RESULT_LIMIT) return out;
      }
    }
  }

  // Nothing structural to trim (one enormous string, say). Say so in valid JSON
  // rather than emitting a severed object.
  return JSON.stringify({
    truncated: true,
    truncated_note:
      "This result was too large to return and could not be trimmed structurally. " +
      "Re-run the tool for fewer items rather than assuming what it contained.",
  });
}

/*
 * How many model steps one turn gets.
 *
 * Named because the resume guard has to agree with the loop: a stored step at
 * or past this number means the turn already spent its budget and there is
 * nothing to resume into.
 */
const MAX_TURN_STEPS = 8;

const MUTATING_TOOLS = new Set([
  "enrich_leads",
  "score_leads",
  "research_leads",
  "draft_outreach",
  "draft_sequence",
  "send_outreach",
  "send_drafts",
  "schedule_drafts",
  "cancel_scheduled_email",
  "delete_drafts",
  "delete_inbox_threads",
  "delete_leads",
  "update_lead",
  "find_leads",
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
  "list_sent_emails",
  "get_email_thread",
  "get_agent_status",
  "search_companies",
]);

const TOOLS = [
  ...OUTBOUND_TOOL_DEFS,
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
          pipeline_stage: { type: "string", enum: [...PIPELINE_STAGES], description: "Filter by the visible pipeline label" },
          min_icp_score: { type: "number" },
          needs_enrichment: {
            type: "boolean",
            description: "Only leads missing a contact email or job title",
          },
          awaiting_reply: {
            type: "boolean",
            description:
              "Only leads that were emailed and never replied, and whose last email went out at least quiet_for_days ago. THIS IS WHAT 'no-response leads', 'people who never replied' and 'everyone I haven't heard back from' MEAN — use it whenever the user scopes a request that way, and combine it with without_draft when drafting for them. Without it you get leads that have never been contacted at all, and they get follow-ups to emails that were never sent.",
          },
          quiet_for_days: {
            type: "number",
            description:
              "How long a lead must have been silent to count as no-response. Default 3, max 60. Only used with awaiting_reply.",
          },
          tier: {
            type: "string",
            enum: ["A", "B", "C", "unscored"],
            description:
              "Filter by the lead's grade. A is strong ICP fit WITH a live buying signal, B is strong fit with no signal fired yet, C is weak fit, unscored has never been through scoring. 'My best leads', 'top leads', 'the good ones' mean A. 'B leads', 'the second tier', 'the ones nobody has worked' mean B — that is the largest segment on most accounts and the one with the most unworked pipeline in it, because a person working a list by hand takes the A's and never reaches the rest.",
          },
          without_draft: {
            type: "boolean",
            description:
              "Only leads that do not already have a saved draft. USE THIS WHENEVER YOU ARE DRAFTING FOR A GROUP — it is the only way to get the leads still outstanding. Without it you get the same leads back every time and redraft work that is already done. The reply also carries remaining_without_draft: the real size of what is left, which is the number to quote to the user.",
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
      name: "get_lead_intelligence",
      description: "Read the SAVED AI evaluation (fit, buying intent, priority, recommended next step, email strategy) for up to 10 leads. Read-only: it never runs a new evaluation. Leads with no saved evaluation come back as not_evaluated.",
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
        "Draft first-touch cold emails following the OutReign cold email playbook. Pass EVERY lead id in ONE call, however many there are — the overflow is queued and drafted in the background, and splitting the list yourself is what stops that happening. Does not send anything. THIS IS ALSO HOW YOU REDRAFT: to revise an email the user is unhappy with, call this again for the same lead with `feedback` describing what to change. It replaces that lead's draft. Never rewrite email copy yourself in the chat — copy you write by hand is not checked against the playbook, the banned-phrase list, or the proof rules, and it will read like generic marketing.",
      parameters: {
        type: "object",
        properties: {
          lead_id: { type: "string", description: "Single lead id (use lead_ids for batches)" },
          lead_ids: {
            type: "array",
            items: { type: "string" },
            description:
              "Every lead id to draft for, in ONE call. Do not split a large list into batches of ten or twenty — pass all of them. The first twelve are drafted while the user watches and the rest are queued and drafted in the background automatically, so a list of seventy-nine is one call, not eight.",
          },
          goal: {
            type: "string",
            enum: ["introduction", "follow-up", "meeting", "demo", "proposal"],
            description: "Email goal. Use 'introduction' for first touches.",
          },
          feedback: {
            type: "string",
            description:
              "What to change, when redrafting. Pass the user's own words (e.g. 'too salesy, cut the product pitch'). Forces a structurally different email rather than a reword of the same one.",
          },
          redraft: {
            type: "boolean",
            description:
              "Rewrite leads that already have a draft. Off by default: a lead with a draft is skipped, because writing its draft again replaces the one that is there and leaves the user with no more drafts than before. Only set this when the user asked for these emails to be rewritten.",
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
        "Send already-saved drafts. This is how you send emails you drafted earlier — you do NOT need the subject or body, only the draft ids (or lead ids, or nothing to send every pending draft). Pass from_email to force one mailbox, or from_emails to rotate across specific mailboxes/domains. When neither is given, sends are automatically rotated across every healthy connected mailbox (least-used domain first). In approval mode, calling this WITHOUT confirmed sends nothing and returns what is about to go out so you can show the user and ask; call it again with confirmed: true once their next message agrees.",
      parameters: {
        type: "object",
        properties: {
          draft_ids: { type: "array", items: { type: "string" }, description: "Draft ids to send" },
          lead_ids: { type: "array", items: { type: "string" }, description: "Send the latest draft for each of these leads" },
          from_email: { type: "string", description: "Single mailbox address to send everything from, e.g. brandon@example.com" },
          from_emails: {
            type: "array",
            items: { type: "string" },
            description: "Rotate sends across these connected mailbox addresses (multi-domain sending)",
          },
          all_pending: { type: "boolean", description: "Send every saved draft when no ids are given" },
          confirmed: {
            type: "boolean",
            description:
              "Set true ONLY when the user's newest message agreed to this exact send (\"yes\", \"send them\", \"go ahead\"). Never set it on the first call, never carry it over from an earlier batch, and never set it because you asked and assumed.",
          },
          allow_duplicate: {
            type: "boolean",
            description:
              "Set true ONLY when the user has been told these people already received this exact email and has explicitly asked to send it again anyway. Never set it to work around a duplicate_send refusal on your own initiative — that refusal is protecting the user's sending domain.",
          },
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
          all_pending: { type: "boolean", description: "Schedule every saved draft when no ids are given" },
          confirmed: {
            type: "boolean",
            description:
              "Set true ONLY when the user's newest message agreed to this exact schedule. Never on the first call, never carried over from an earlier batch.",
          },
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
          from_email: { type: "string", description: "Single mailbox address to schedule everything from, e.g. brandon@example.com" },
          from_emails: {
            type: "array",
            items: { type: "string" },
            description: "Rotate the scheduled sends across these connected mailbox addresses (multi-domain sending)",
          },
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
        "Send a brand new email to a lead when you have the subject and body in hand. To send a draft you already created, use send_drafts instead. In approval mode, calling this without confirmed sends nothing and reports what would go out; call it again with confirmed: true once the user's next message agrees.",
      parameters: {
        type: "object",
        properties: {
          lead_id: { type: "string" },
          subject: { type: "string" },
          body: { type: "string" },
          from_email: { type: "string", description: "Mailbox address to send from" },
          confirmed: {
            type: "boolean",
            description:
              "Set true ONLY when the user's newest message agreed to this exact send (\"yes\", \"send it\", \"go ahead\"). Never set it on the first call.",
          },
          allow_duplicate: {
            type: "boolean",
            description:
              "Set true ONLY when the user has been told these people already received this exact email and has explicitly asked to send it again anyway. Never set it to work around a duplicate_send refusal on your own initiative — that refusal is protecting the user's sending domain.",
          },
        },
        required: ["lead_id", "subject", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "audit_email",
      description:
        "Run every mechanical cold-email rule this product knows over a subject and body, and get back the specific violations with fixes. Use it whenever the user pastes an email and asks what is wrong with it, asks you to review or improve copy, or before sending anything you did not generate yourself. It checks unfilled merge fields, unbacked result claims, banned openers (including the pronoun-dropped variants), length, the one-call-to-action rule, whether a named trigger is actually bridged to a problem, and — when lead_id is given — whether the names in the copy match the lead record. Pass position (1-6) when the email is a numbered touch in a sequence — several rules only apply at a position.",
      parameters: {
        type: "object",
        properties: {
          subject: { type: "string" },
          body: { type: "string" },
          position: {
            type: "number",
            description: "Which touch in a sequence this is, 1-6. Omit for a standalone email.",
          },
          verified_proof: {
            type: "string",
            description: "A result the sender can actually back, so a figure inside it is not reported as invented.",
          },
          lead_id: {
            type: "string",
            description:
              "The lead this email was written for. Pass it whenever you know it: the company and contact are then read from the record and the copy is checked against them, which catches a misspelled company name or the wrong first name.",
          },
        },
        required: ["body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "audit_sequence",
      description:
        "Audit a whole saved sequence, not one email at a time. Catches the two failures that kill sequences and that no single-email check can see: touches that repeat what an earlier one already said, and spacing that is bunched or scattered. Also runs the per-email rules with each step's position. Use it when the user asks why a sequence is not getting replies, or after building one.",
      parameters: {
        type: "object",
        properties: {
          sequence_id: { type: "string", description: "The sequence to audit." },
        },
        required: ["sequence_id"],
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
      name: "list_sent_emails",
      description:
        "Read the inbox history of email ALREADY SENT from the connected mailboxes: who was emailed, the subject, the body that went out, when it sent, whether it was opened and whether they replied. Use this before writing any follow-up so the follow-up references the real first email, and to check whether someone has already been contacted.",
      parameters: {
        type: "object",
        properties: {
          lead_id: { type: "string", description: "Only emails sent to this lead" },
          email: { type: "string", description: "Only emails sent to this address (partial match ok)" },
          days: { type: "number", description: "Look back this many days (default 30, max 180)" },
          awaiting_reply: {
            type: "boolean",
            description:
              "Only emails that have had no reply yet AND have been sitting unanswered long enough to count as silence — the real follow-up candidates. Someone emailed this morning has not failed to reply; they have not had the chance.",
          },
          quiet_for_days: {
            type: "number",
            description:
              "With awaiting_reply, how long an email must have gone unanswered to count (default 3, min 1, max 60).",
          },
          include_body: { type: "boolean", description: "Include the full sent body (default true)" },
          limit: { type: "number", description: "Default 20, max 50" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_email_thread",
      description:
        "Read one full conversation thread: every email sent to that person plus any inbound replies with their classification. Use it before replying or following up so you have the exact wording of the earlier messages.",
      parameters: {
        type: "object",
        properties: {
          sent_email_id: { type: "string", description: "Any email id from list_sent_emails" },
          email: { type: "string", description: "The prospect's email address" },
          lead_id: { type: "string" },
        },
      },
    },
  },

  {
    type: "function",
    function: {
      name: "update_lead",
      description: "Update a lead's visible pipeline label or notes. Outreach labels belong in pipeline_stage; lead_status is an internal record lifecycle and is not editable here.",
      parameters: {
        type: "object",
        properties: {
          lead_id: { type: "string" },
          pipeline_stage: { type: "string", enum: [...PIPELINE_STAGES] },
          notes: { type: "string" },
          contact_name: { type: "string" },
          contact_email: { type: "string" },
          contact_phone: { type: "string" },
          job_title: { type: "string" },
          company_name: { type: "string" },
          company_website: { type: "string" },
          linkedin_url: { type: "string" },
          industry: { type: "string" },
          country: { type: "string" },
        },
        required: ["lead_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_lead_issues",
      description: "Scan the account's lead records for CRM data problems: missing or malformed emails, duplicate emails, missing contact names or company names, and leads stuck in a stage. Returns lead ids grouped by issue so you can fix them with update_lead.",
      parameters: { type: "object", properties: { limit: { type: "number", description: "Max leads per issue (default 50)" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "list_deals",
      description: "List pipeline deals (stage, value, probability, close date, linked lead).",
      parameters: { type: "object", properties: { stage: { type: "string", enum: [...DEAL_STAGES] }, limit: { type: "number" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "create_deal",
      description: "Create a pipeline deal, optionally linked to a lead.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" }, company_name: { type: "string" }, contact_name: { type: "string" },
          lead_id: { type: "string" }, value: { type: "number" }, stage: { type: "string", enum: [...DEAL_STAGES] },
          probability: { type: "number" }, expected_close_date: { type: "string", description: "YYYY-MM-DD" }, notes: { type: "string" },
        },
        required: ["title", "company_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_deal",
      description: "Update a pipeline deal's stage, value, probability, close date, contact or notes.",
      parameters: {
        type: "object",
        properties: {
          deal_id: { type: "string" }, title: { type: "string" }, company_name: { type: "string" }, contact_name: { type: "string" },
          lead_id: { type: "string" }, value: { type: "number" }, stage: { type: "string", enum: [...DEAL_STAGES] },
          probability: { type: "number" }, expected_close_date: { type: "string" }, notes: { type: "string" },
        },
        required: ["deal_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_deal",
      description: "Permanently delete a pipeline deal. Only when the user asked for it or it is a clear duplicate.",
      parameters: { type: "object", properties: { deal_id: { type: "string" } }, required: ["deal_id"] },
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
      name: "search_companies",
      description:
        "Search for target COMPANIES (accounts) by name, brand or keyword — returns matching companies with domain, location and employee range. Use this when the user wants to identify or verify target accounts (e.g. 'find companies like Notion', 'is Acme in the network?', 'give me the domain for Stripe') BEFORE sourcing people. To source actual people/contacts use find_leads instead. Results are not saved; feed a company name or domain into find_leads' query to prospect people there.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Company name, brand or keyword to search for (at least 2 characters).",
          },
          queries: {
            type: "array",
            items: { type: "string" },
            description: "Optional: search several companies in one call (max 5).",
          },
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
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

  // Recipients the model has already been asked to rewrite for, this request.
  // One rewrite per recipient: without a bound, a model that cannot lift the
  // score would be told to try again forever, burning tokens on every turn and
  // never sending anything.
  // How many rewrites each draft has already been sent back for. A set only
  // ever allowed one, which meant the second attempt shipped however it scored.
  const rewriteRounds = new Map<string, number>();

  /**
   * Gives the thread's run claim back.
   *
   * Set once the claim is taken, and called from the catch at the end. Without
   * it an unexpected error left the thread marked "running" until the
   * twenty-minute staleness window expired, and every message sent in between
   * was refused with "this conversation already has a run in progress" — which
   * is what being made to send the same job twice looks like from the outside.
   */
  let releaseRunClaim: (() => Promise<void>) | null = null;

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

    /*
     * Which build is actually deployed.
     *
     * Merging is not deploying here: edge functions ship through Lovable, so a
     * fix can sit on main for hours while the running function is older. That
     * has been diagnosed the slow way more than once — most recently a chat
     * that said "continuing…" and then stopped, which the merged code cannot
     * do, because it only says that when it has already decided to continue.
     *
     * Each marker is named beside the behaviour it describes and asserted
     * against the source by a test, so this cannot drift into claiming a
     * feature the deployed file does not have.
     */
    if (action === "build") {
      /*
       * The decision layer's mode belongs here rather than in the admin panel's
       * own queries, because it is an edge-function environment variable: the
       * database cannot see it, and nothing in the UI could report it. The
       * panel below this one shows evaluations and failures, which are equally
       * true in shadow and in assist — so the one thing that says whether those
       * decisions reach the email was the one thing nobody could check.
       */
      let leadIntelligence: string;
      try {
        leadIntelligence = await leadIntelligenceMode(admin);
      } catch {
        leadIntelligence = "unknown";
      }
      return json({ build: AGENT_CHAT_BUILD, leadIntelligence });
    }

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
        timeZone: userTz, weekday: "short", month: "short", day: "numeric",
        year: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
      }).format(d)} (${userTz})`;

    /**
     * The named calendar, spelled out.
     *
     * A batch was scheduled for "Monday, September 8" and September 8 was a
     * Tuesday: the model was given a bare timestamp with no weekday and did the
     * day-name arithmetic itself, one day out. The emails then sat correctly
     * queued for a day the user had not asked for, which reads in the product
     * as "scheduling is broken". Weekday-to-date mapping is a fact, not
     * something to infer, so it is stated.
     */
    const localDateKey = (d: Date) =>
      new Intl.DateTimeFormat("en-CA", { timeZone: userTz, dateStyle: "short" }).format(d);
    const localWeekday = (d: Date) =>
      new Intl.DateTimeFormat("en-US", { timeZone: userTz, weekday: "long" }).format(d);
    const upcomingCalendar = () => {
      const out: string[] = [];
      for (let i = 0; i <= 7; i++) {
        const d = new Date(Date.now() + i * 86_400_000);
        const label = i === 0 ? "today" : i === 1 ? "tomorrow" : localWeekday(d);
        out.push(`${label} = ${localDateKey(d)} (${localWeekday(d)})`);
      }
      return out.join("; ");
    };


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
        return asFnResult(name, res.status, res.ok, await res.text());
      } catch (e) {
        console.error(`callFn ${name} failed`, e);
        return { error: e instanceof Error ? e.message : `${name} did not respond` };
      }
    };

    // Execute a single approval decision. Shared by the (legacy) inline
    // resolve_approval action and the chat-driven approval tools so a plain
    // "yes, send it" message does exactly what a button click used to.
    const userMessage = String(payload.message ?? "").trim().slice(0, 4000);
    if (!userMessage) return json({ error: "Message is required" }, 400);

    const { data: thread } = await admin
      .from("agent_chat_threads")
      .select("id, user_id, title, autonomy, agent_config_id, run_status, run_request, run_started_at, updated_at")
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

    const autoContinue = payload.autoContinue === true;
    const continuationStartedAt = typeof payload.runStartedAt === "string" ? payload.runStartedAt : null;

    // A continuation belongs to one exact run. If a newer user request has
    // replaced it, stop before loading history, calling the model, or touching
    // run state. This prevents a late background pass from replaying old work.
    if (autoContinue) {
      const activeStartedAt = (thread as any).run_started_at
        ? new Date((thread as any).run_started_at).toISOString()
        : null;
      const expectedStartedAt = continuationStartedAt
        ? new Date(continuationStartedAt).toISOString()
        : null;
      if (
        (thread as any).run_status !== "running" ||
        (thread as any).run_request !== userMessage.slice(0, 500) ||
        !activeStartedAt ||
        activeStartedAt !== expectedStartedAt
      ) {
        return json({ staleContinuation: true, runStatus: (thread as any).run_status ?? "idle" });
      }
    }

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
    // Auto-continuation turns are the client resuming a batch that ran out of
    // wall clock, not a real user message — keep them out of the transcript.
    const completedMutationKeys = new Set<string>(
      Array.isArray(payload.completedMutationKeys)
        ? payload.completedMutationKeys.filter((value: unknown): value is string => typeof value === "string").slice(0, 100)
        : [],
    );
    // A run is owned by the server, not the browser tab. We stamp it on the
    // thread so closing the tab / swiping out of the PWA doesn't abandon the
    // work, and the UI can rejoin the same run when the user comes back.
    const runPass = autoContinue ? Math.max(1, Number(payload.pass ?? 1)) : 0;
    const runStartedAt = autoContinue
      ? continuationStartedAt as string
      : new Date().toISOString();
    if (autoContinue) {
      await admin
        .from("agent_chat_threads")
        .update({ run_status: "running", run_pass: runPass })
        .eq("id", threadId)
        .eq("run_started_at", runStartedAt);
    } else {
      // Atomically claim this thread. The client guard is per-tab only; this
      // compare-and-set prevents retries, double taps, and second tabs from
      // running independent tool loops against the same drafts/leads.
      const heartbeatMs = (thread as any).updated_at
        ? new Date((thread as any).updated_at).getTime()
        : 0;
      const existingRunIsStale =
        (thread as any).run_status === "running" &&
        heartbeatMs > 0 &&
        Date.now() - heartbeatMs > 20 * 60 * 1000;

      if ((thread as any).run_status === "running" && !existingRunIsStale) {
        return json({
          error: "This conversation already has a run in progress.",
          runStatus: "running",
          runRequest: (thread as any).run_request,
        });
      }

      let claim = admin
        .from("agent_chat_threads")
        .update({
          run_status: "running",
          run_pass: 0,
          run_request: userMessage.slice(0, 500),
          run_started_at: runStartedAt,
          run_mutation_keys: [],
        })
        .eq("id", threadId)
        .eq("run_status", (thread as any).run_status);
      if ((thread as any).run_started_at) {
        claim = claim.eq("run_started_at", (thread as any).run_started_at) as typeof claim;
      } else {
        claim = claim.is("run_started_at", null) as typeof claim;
      }
      const { data: claimedThread, error: claimError } = await claim.select("id").maybeSingle();
      if (claimError) throw claimError;
      if (!claimedThread) {
        return json({
          error: "This conversation already has a run in progress.",
          runStatus: "running",
        });
      }
    }

    releaseRunClaim = async () => {
      await admin
        .from("agent_chat_threads")
        .update({ run_status: "idle", run_pass: 0 })
        .eq("id", threadId)
        .eq("run_started_at", runStartedAt);
      /*
       * The turn is over, so what it already did stops counting.
       *
       * These rows exist to stop one turn repeating an action across a
       * restart. Left behind they would block the same action in the next
       * conversation — someone asking to send to the same lead tomorrow is
       * not repeating themselves.
       *
       * The store is built here rather than closed over: `trace` is declared
       * further down and this runs on paths that reach it first, which would
       * be a temporal dead zone rather than a null check.
       */
      await supabaseTraceStore(admin).clearMutations(threadId);
    };

    if (!autoContinue) {
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
    }



    // --- load history ----------------------------------------------------
    const { data: recentHistory } = await admin
      .from("agent_chat_messages")
      .select("role, content, tool_events")
      .eq("thread_id", threadId)
      // Fetch the newest messages, not the oldest messages in long threads.
      // The prior ascending LIMIT 40 silently dropped the current request once
      // a thread exceeded 40 messages, making the model repeat stale work.
      .order("created_at", { ascending: false })
      .limit(40);
    /**
     * History, bounded by size rather than by row count.
     *
     * Forty rows is forty rows whether they are one-liners or long run
     * summaries, so the same limit produced wildly different context loads and
     * nothing distinguished them. On a thread of long messages this is what
     * eventually walks into a context-limit failure.
     *
     * Newest first, kept until the budget runs out, then reversed back into
     * order — so what survives is always the most recent conversation rather
     * than an arbitrary window.
     */
    const HISTORY_TOKEN_BUDGET = 12_000;
    const approxTokens = (text: string) => Math.ceil(text.length / 4);

    const history: typeof recentHistory = [];
    let historyTokens = 0;
    for (const message of recentHistory ?? []) {
      const cost = approxTokens(String(message.content ?? ""));
      if (historyTokens + cost > HISTORY_TOKEN_BUDGET && history.length > 0) break;
      historyTokens += cost;
      history.push(message);
    }
    history.reverse();

    /**
     * The user's own agreement to the send that was proposed last turn.
     *
     * Sending is otherwise gated on a flag the model sets, which is a two-step
     * protocol run by the least reliable component here: when it does not set
     * the flag, nothing ever sends and the loop repeats — preview, "yes",
     * preview — while the model invents reasons for the non-send out of
     * whatever else the tool mentioned.
     *
     * The permission comes from a person, so it is read from what the person
     * wrote. Both halves are required: a bare "yes" only counts when the
     * previous turn actually asked.
     */
    const confirmedByUser = userConfirmedSend(userMessage, history as any[]);
    if (confirmedByUser) console.log("[agent-chat] user confirmed the pending send in chat");

    // --- context ---------------------------------------------------------
    const [{ data: config }, { data: profile }, { data: savedIcp }, { data: isStaff }] = await Promise.all([
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
      // Folded into this batch rather than fetched on its own: it is only read
      // to decide whether internal detail is safe to show, and that is not
      // worth a second round trip on every turn.
      admin.rpc("has_role", { _user_id: userId, _role: "admin" }),
    ]);
    const showsInternals = isStaff === true;

    // The agent's saved ICP snapshot is the source of truth; fall back to the
    // user's most recently updated ICP profile so chat is never ungrounded.
    const icpSnapshot: Record<string, any> | null =
      ((config as any)?.icp_snapshot as Record<string, any> | null) ?? (savedIcp as any) ?? null;
    const icpContext = buildIcpContext(icpSnapshot);

    // Role/custom-build scope: the tool catalog handed to the model, and the
    // scope wording injected into the prompt.
    // The role/custom allow-list is then capped by the account's plan tier, so
    // a custom build can never grant itself capabilities the plan doesn't have.
    const agentTier = await resolveAgentTier(admin as any, userId);
    const roleTools = allowedToolsFor(config as any);
    const allowedTools = capToolsToTier(roleTools, agentTier);
    const tierRemoved = blockedToolsFor(roleTools, agentTier);

    // Whether this turn must run the checker before it may answer. Decided
    // from the request, because the model demonstrably will not decide it —
    // see the tool_choice below.
    const forceAudit = allowedTools.includes("audit_email") && wantsCopyAudit(userMessage);
    if (forceAudit) console.log("[agent-chat] copy review: requiring audit_email");
    const scopedTools = TOOLS.filter((t: any) => allowedTools.includes(t.function?.name));
    /*
     * The schemas, indexed by the name the model calls.
     *
     * Built from TOOLS rather than written out again, so a tool added to that
     * array — including anything spread in from OUTBOUND_TOOL_DEFS — is
     * validated the moment it exists, and a schema can never drift from the
     * one the model was actually shown.
     */
    const TOOL_SCHEMAS = new Map<string, ToolSchema>(
      (TOOLS as any[])
        .filter((t) => t.function?.name)
        .map((t) => [String(t.function.name), (t.function.parameters ?? {}) as ToolSchema]),
    );
    const scopeNote = scopeNoteFor(config as any) + tierScopeNote(agentTier, tierRemoved);

    const invokeFn = async (name: string, body: unknown): Promise<any> => {
      const res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
          apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        },
        body: JSON.stringify(body ?? {}),
      });
      return asFnResult(name, res.status, res.ok, await res.text());
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
    /**
     * Batches that acted on fewer records than were asked for.
     *
     * The prompt tells the model to report a shortfall. Telling is not
     * enforcing: a user asked for 32 sends, got 11, and was told everything had
     * gone out. These are appended to the reply in code at the end of the turn,
     * so the true numbers reach the user whatever the model chose to say.
     */
    const batchShortfalls: string[] = [];
    /**
     * Sends refused because the recipient already got that exact subject.
     *
     * Kept apart from sendFailures because the remedy is different and the
     * agent kept choosing the wrong one: it read "duplicate" as a problem with
     * the drafts and offered to delete and regenerate them, which cannot clear
     * a block that lives in the sent history. The guidance appended at the end
     * of the turn names that wrong move explicitly.
     */
    const duplicateRefusals: { to: string; subject: string; previouslySentAt: string | null }[] = [];
    /**
     * Whether the user asked for drafts to be thrown away in this message.
     *
     * The duplicate guard in delete_drafts must never stand between someone and
     * their own "delete those drafts".
     */
    const userAskedToDelete = /\b(delete|remove|clear|discard|throw away|bin)\b/i.test(userMessage);
    /**
     * Sends that were refused, and why.
     *
     * The send path already returns each failure with its reason and tells
     * the model to report them in plain language. It reported twenty-one sends
     * instead. The reasons are the actionable half — "every mailbox hit its
     * daily limit" is something a user can fix, where "no send ran" leaves them
     * guessing — so they are surfaced in code rather than entrusted to the
     * summary.
     */
    const sendFailures: string[] = [];
    /*
     * What drafting actually did this turn, counted where it happened.
     *
     * The model was announcing "43 drafted, 39 remaining" on a turn whose
     * drafts folder held twenty and never moved. It was not lying about a
     * tool result — it was adding up its own previous sentences, because no
     * tool result ever told it the total. These are the totals, and they are
     * put above the reply rather than left for it to summarise.
     */
    const draftTally = { written: 0, queued: 0, skippedAlreadyDrafted: 0, failed: 0 };
    /*
     * A drafting call that produced nothing stops the rest of the turn.
     *
     * The observed turn ran draft_outreach twice after the budget was gone;
     * both returned 0/12 and both spent twelve generate-email round trips
     * getting there. Twenty-four generations, no drafts, no reason shown.
     */
    let draftingProducedNothing = false;

    /*
     * One queue job for the whole turn, and one place that fills it.
     *
     * The model was told to pass every lead id in one call and it split eighty-
     * two into twelve, twelve, ten, ten, ten — five calls, five separate jobs,
     * and twenty-eight leads it simply never got to. The progress card read
     * "0 of 6" because it counts a job, and there were five of them.
     *
     * So the job belongs to the turn, not to the call. Every draft_outreach
     * call appends to the same one, and the sweep at the end of the turn
     * appends whatever the model missed. How the model chooses to slice the
     * list stops mattering.
     */
    let batchJobId: string | null = null;
    /** Drafted inline or queued this turn — never queued twice. */
    const handledLeadIds = new Set<string>();
    /*
     * Every lead still without a draft, as list_leads last reported it.
     *
     * without_draft is the model saying "give me the ones still outstanding,
     * I am about to draft them", so this is the set the turn is responsible
     * for finishing. The sweep below holds it to that.
     */
    let outstandingPool: string[] = [];
    let outstandingGoal = "introduction";
    let outstandingFeedback: string | null = null;

    /**
     * Put leads on the queue, creating the turn's job the first time.
     *
     * Returns how many were actually added: already-pending leads and ones
     * this turn has already handled are dropped, because a worker that drafts
     * a lead twice writes one draft and pays for two generations.
     */
    const queueForDrafting = async (
      leadIds: string[],
      goal: string,
      feedback: string | null,
    ): Promise<{ queued: number; alreadyPending: number }> => {
      const fresh = leadIds.filter((id) => !handledLeadIds.has(id));
      if (fresh.length === 0) return { queued: 0, alreadyPending: leadIds.length };

      const { data: pendingItems } = await admin
        .from("agent_job_items")
        .select("lead_id, job_id")
        .eq("user_id", userId)
        .eq("status", "pending");
      /*
       * Only items of a job a worker will still claim.
       *
       * A cancelled batch leaves its items pending forever, and counting those
       * as "already queued" blocks those leads from ever being drafted again —
       * from here and from the sweep, which is why the check lives in the one
       * helper rather than at the call site it arrived at.
       */
      const pendingRows = (pendingItems ?? []) as Record<string, unknown>[];
      const jobIds = [...new Set(pendingRows.map((r) => String(r.job_id ?? "")).filter(Boolean))];
      const liveJobs = new Set<string>();
      if (jobIds.length > 0) {
        const { data: jobs } = await admin
          .from("agent_jobs")
          .select("id")
          .in("id", jobIds)
          .in("status", ["queued", "running"]);
        for (const j of (jobs ?? []) as Record<string, unknown>[]) liveJobs.add(String(j.id));
      }
      const alreadyQueued = new Set(
        pendingRows
          .filter((r) => liveJobs.has(String(r.job_id ?? "")))
          .map((r) => String(r.lead_id ?? "")),
      );
      const toQueue = fresh.filter((id) => !alreadyQueued.has(id));
      const alreadyPending = leadIds.length - toQueue.length;
      if (toQueue.length === 0) return { queued: 0, alreadyPending };

      if (!batchJobId) {
        const { data: job, error: jobError } = await admin
          .from("agent_jobs")
          .insert({
            user_id: userId,
            thread_id: threadId,
            agent_config_id: requestedAgentId,
            kind: "draft",
            request_text: userMessage.slice(0, 500),
            autonomy: (thread as any).autonomy ?? "approval",
            goal,
            feedback: feedback || null,
            status: "queued",
            total: 0,
          })
          .select("id")
          .single();
        if (jobError || !job) {
          console.error("[agent-chat] could not open the batch job:", jobError?.message);
          return { queued: 0, alreadyPending };
        }
        batchJobId = String((job as { id: unknown }).id);
      }

      const { error: itemsError } = await admin.from("agent_job_items").insert(
        toQueue.map((leadId) => ({
          job_id: batchJobId,
          user_id: userId,
          lead_id: leadId,
          status: "pending",
        })),
      );
      if (itemsError) {
        console.error("[agent-chat] could not queue the items:", itemsError.message);
        // A job with no items sits at 0 of N forever and reads as stuck.
        const { count } = await admin
          .from("agent_job_items")
          .select("id", { count: "exact", head: true })
          .eq("job_id", batchJobId);
        if (!count) {
          await admin.from("agent_jobs").delete().eq("id", batchJobId);
          batchJobId = null;
        }
        return { queued: 0, alreadyPending };
      }

      for (const id of toQueue) handledLeadIds.add(id);
      draftTally.queued += toQueue.length;
      // The card counts this, so it has to be the batch and not the call.
      const { count: itemCount } = await admin
        .from("agent_job_items")
        .select("id", { count: "exact", head: true })
        .eq("job_id", batchJobId);
      await admin.from("agent_jobs").update({ total: itemCount ?? 0 }).eq("id", batchJobId);
      return { queued: toQueue.length, alreadyPending };
    };

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
        // One string literal, never a concatenation: supabase-js infers the row
        // type by parsing this as a literal type, and `"a" + "b"` widens to
        // string, which collapses the inference. The two other multi-line
        // selects in this file are written the same way for the same reason.
        .select(
          "id, integration_id, email, status, provider, daily_limit, sent_today, sent_today_date, reputation_score, warmup_enabled, last_sent_at",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: true });
      return (data ?? []).filter((a: any) => a.integration_id && a.email);
    };

    /**
     * Room to send today, across mailboxes and under the plan cap.
     *
     * Asked before a batch is queued rather than discovered one failed send at
     * a time — which is how 103 approvals nobody could clear accumulated.
     */
    const sendCapacity = async () => {
      const [accounts, { data: sub }] = await Promise.all([
        loadMailboxes(),
        admin
          .from("subscriptions")
          .select("daily_email_limit, daily_emails_sent")
          .eq("user_id", userId)
          .maybeSingle(),
      ]);
      const today = new Date().toISOString().slice(0, 10);
      return capacityFor(
        (accounts as any[]).map((a) => ({
          id: a.id,
          email: a.email,
          dailyLimit: Number(a.daily_limit ?? 0),
          // A counter from an earlier day has already reset in practice; the
          // send path rolls it over. Reading it as today's usage would report
          // a mailbox as full the morning after a busy day.
          sentToday: a.sent_today_date === today ? Number(a.sent_today ?? 0) : 0,
          status: a.status,
        })),
        Number(sub?.daily_email_limit ?? 0),
        Number(sub?.daily_emails_sent ?? 0),
      );
    };

    const toMailbox = (a: any): Mailbox => ({
      integrationRowId: a.integration_id,
      email: a.email,
      status: a.status,
      sendingAccountId: a.id,
    });

    /*
     * A sending_accounts row as the router reads it.
     *
     * A counter from an earlier day has already rolled over in practice, so
     * reading it as today's usage would report a mailbox as full the morning
     * after a busy day — the same rollover sendCapacity above applies.
     */
    const toRoutable = (a: any, today: string): RoutableMailbox => ({
      id: String(a.id),
      email: String(a.email),
      provider: a.provider ?? null,
      reputationScore: a.reputation_score === null || a.reputation_score === undefined
        ? null
        : Number(a.reputation_score),
      status: String(a.status ?? "active"),
      sentToday: a.sent_today_date === today ? Number(a.sent_today ?? 0) : 0,
      dailyLimit: Number(a.daily_limit ?? 0),
      warmupEnabled: !!a.warmup_enabled,
      lastSentAt: a.last_sent_at ?? null,
    });

    /*
     * Which mailboxes may send at all, and why not when none may.
     *
     * chooseMailbox has existed in _shared/mailbox-routing.ts the whole time,
     * with eighteen tests and no caller. This path had its own ordering that
     * sorted on a 24-hour send count and nothing else, so a mailbox that had
     * already sent its full daily allowance was still handed a send. The
     * fields were loaded for it — daily_limit and sent_today were read into
     * the exact shape the router takes — and never compared.
     *
     * The router decides eligibility: active, and with allowance left. The
     * rotation below still decides the order, because spreading volume across
     * domains is a separate concern from whether a mailbox may send, and that
     * behaviour is what the tool description promises the model.
     */
    const eligibleToSend = (accounts: any[]): { kept: any[]; reason: string } => {
      const today = new Date().toISOString().slice(0, 10);
      const decision = chooseMailbox(accounts.map((a) => toRoutable(a, today)));
      const allowed = new Set(decision.considered.map((c) => c.id));
      return { kept: accounts.filter((a) => allowed.has(String(a.id))), reason: decision.explanation };
    };

    // Orders mailboxes so the least-recently-used domain goes first. This keeps
    // volume spread across every connected sending domain instead of hammering one.
    const orderByLoad = async (accounts: any[]) => {
      if (accounts.length < 2) return accounts;
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data } = await admin
        .from("sent_emails")
        .select("sending_account_id, created_at")
        .eq("user_id", userId)
        .gte("created_at", since)
        .not("sending_account_id", "is", null);
      const counts = new Map<string, number>();
      for (const row of data ?? []) {
        const key = String((row as any).sending_account_id);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      return [...accounts].sort(
        (a, b) => (counts.get(String(a.id)) ?? 0) - (counts.get(String(b.id)) ?? 0),
      );
    };

    // Resolves the pool of mailboxes to send from. Explicit from_email/from_emails
    // wins; otherwise every healthy mailbox is used in rotation so multi-domain
    // outbound spreads naturally across domains.
    const resolveMailboxPool = async (
      fromEmail: string | null,
      fromEmails?: unknown,
      opts: { forSchedule?: boolean } = {},
    ): Promise<{ pool: Mailbox[] } | { error: string }> => {
      const accounts = await loadMailboxes();
      const sendable = accounts.filter((a: any) => a.status !== "paused" && a.status !== "disabled");
      const list = accounts.map((a: any) => a.email).join(", ");
      if (accounts.length === 0)
        return { error: "No mailbox is connected. Connect Gmail on the Integrations page first." };

      const wantedList: string[] = [];
      if (Array.isArray(fromEmails)) {
        for (const v of fromEmails) if (typeof v === "string" && v.trim()) wantedList.push(v.trim().toLowerCase());
      }
      if (fromEmail && fromEmail.trim()) wantedList.push(fromEmail.trim().toLowerCase());

      if (wantedList.length > 0) {
        const picked: Mailbox[] = [];
        for (const wanted of [...new Set(wantedList)]) {
          const match = accounts.find((a: any) => String(a.email).toLowerCase() === wanted);
          if (!match) return { error: `No connected mailbox for ${wanted}. Connected mailboxes: ${list}.` };
          if (match.status === "paused" || match.status === "disabled")
            return { error: `${match.email} is ${match.status}. Resume it on the Deliverability page or pick another mailbox.` };
          picked.push(toMailbox(match));
        }
        return { pool: picked };
      }

      if (sendable.length === 0)
        return { error: `Every connected mailbox is paused or disabled (${list}). Resume one on the Deliverability page.` };

      // A mailbox at its daily cap used to be sent from anyway.
      // Scheduled sends are held and retried by the scheduler when capacity
      // returns, so today's spent allowance must not block scheduling.
      if (opts.forSchedule) return { pool: (await orderByLoad(sendable)).map(toMailbox) };
      const { kept, reason } = eligibleToSend(sendable);
      if (kept.length === 0) return { error: `${reason} (${list})` };

      const ordered = await orderByLoad(kept);
      return { pool: ordered.map(toMailbox) };
    };

    const resolveMailbox = async (
      fromEmail: string | null,
    ): Promise<Mailbox | { error: string }> => {
      const res = await resolveMailboxPool(fromEmail);
      if ("error" in res) return res;
      return res.pool[0];
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
      /**
       * True when the model composed this subject and body itself, rather than
       * sending a stored draft that generate-email already scored.
       *
       * Only model-authored copy pays for a rubric call. Re-scoring a bulk send
       * of stored drafts would add one LLM round-trip per recipient to buy a
       * verdict that was already bought at generation time.
       */
      modelAuthored: boolean;
      /**
       * Set only when the user's newest message agreed to this exact send.
       * Per call rather than per conversation: a flag that persisted would let
       * the second batch inherit the first batch's permission, which is the
       * failure the approval queue had.
       */
      confirmed?: boolean;
      /**
       * Deliberate resend of something this person already received.
       *
       * Set only when the user asked for it in their own words. The guard it
       * disables is what keeps a domain out of the spam folder.
       */
      allowDuplicate?: boolean;
    }): Promise<{ sent: boolean; summary: Record<string, unknown>; result?: any }> => {
      const { leadId, to, subject, body, mailbox, toolName, modelAuthored, contactName, companyName } = opts;
      if (!subject || !body) return { sent: false, summary: { error: "Subject and body are required" } };

      // Quality gate. Drafts made by draft_outreach come from generate-email,
      // which already scores them — but send_outreach lets the model compose a
      // subject and body inline and hand them straight to send-email, so that
      // copy reached real prospects having passed nothing.
      //
      // An unfilled merge token is not a judgement call, so it is refused in
      // both modes. Naming the tokens lets the model fix and re-call rather
      // than guess at what went wrong.
      if (hasPlaceholder(subject) || hasPlaceholder(body)) {
        const found = [...findPlaceholders(subject), ...findPlaceholders(body)];
        return {
          sent: false,
          summary: {
            error: `The draft still has unfilled placeholders: ${found.join(", ")}. Rewrite it with the real values and call this tool again.`,
            placeholders: found,
          },
        };
      }

      // A weak score buys one rewrite, informed by the rubric's own objections.
      // The second failure stops trying: it queues for a human instead of
      // sending, which matches what agent-run does rather than looping.
      //
      // A null score means no verdict was available — the rubric is plan-gated
      // to growth and above — and never blocks a send.
      let forceApproval = false;
      const rubric = modelAuthored
        ? await scoreEmail(supabaseUrl, authHeader, anonKey, { subject, body })
        : null;

      // The same bar agent-run writes to, for the same reason: nothing the
      // agent sends gets read by a person first. The rule audit runs alongside
      // the rubric, because a banned phrase or a misspelled company name is not
      // something a good score forgives.
      const blocking = modelAuthored
        ? auditEmail({ subject, body, position: 1, lead: { company: companyName, contactName } })
            .filter((f) => f.severity !== "note")
            .map((f) => ({ rule: f.rule, severity: f.severity, why: f.why, fix: f.fix }))
        : [];
      const attempt: Attempt = { subject, body, rubric, blocking };

      if (modelAuthored && rubric && !isPerfect(attempt)) {
        const attemptKey = `${leadId ?? to}`;
        const round = rewriteRounds.get(attemptKey) ?? 0;
        if (round < AGENT_MAX_ATTEMPTS - 1) {
          rewriteRounds.set(attemptKey, round + 1);
          return {
            sent: false,
            summary: {
              needs_rewrite: true,
              score: rubric.overall,
              attempt: round + 1,
              of: AGENT_MAX_ATTEMPTS,
              message:
                `This draft scored ${rubric.overall}/100 and has to reach ${AGENT_TARGET_SCORE} before it can send` +
                `${blocking.length ? `, and a rule check found ${blocking.length} problem${blocking.length === 1 ? "" : "s"}` : ""}. ` +
                `Rewrite it addressing the points below, then call this tool again with the new subject and body.`,
              feedback: attemptFeedback(attempt),
            },
          };
        }
        // Out of rewrites, in a conversation, with a person looking at the
        // draft and able to edit it. Worth offering for approval at 4/5 across
        // the rubric; below that it is not worth their time either. This is a
        // lower bar than agent-run's, which sends nothing autonomously short of
        // a perfect card — there, nobody is looking.
        if (!isSendable(attempt)) forceApproval = true;
      } else if (modelAuthored && !rubric && (isWeak(rubric) || blocking.length > 0)) {
        // No rubric available on this plan. The rule audit still applies.
        forceApproval = true;
      }

      // A draft that failed the quality bar twice is held whatever the mode:
      // confirmation is about the user's intent, not about the copy being fit
      // to send.
      const gate = decideSend(autonomous ? "autonomous" : "approval", opts.confirmed === true);
      if (!gate.send || forceApproval) {
        // No queue. In approval mode the tool reports what it is about to do
        // and writes nothing: the draft is already the pending state, and a
        // second copy in an approvals table is what went stale, outlived its
        // conversation, and piled up to 103 rows nobody could drain.
        toolEvents.push({
          name: toolName,
          label: forceApproval ? "Held for review — low quality score" : "Waiting for your go-ahead",
          status: "queued",
          detail: `Ready to send "${subject}" to ${to} from ${mailbox.email}`,
        });
        return {
          sent: false,
          summary: {
            awaiting_confirmation: true,
            to,
            from: mailbox.email,
            subject,
            message: forceApproval
              ? "Not sent: this draft scored below the quality bar even after a rewrite. Show it to the user and ask whether to send it anyway."
              : gate.reason,
          },
        };
      }

      const r = await invokeFn("send-email", {
        to,
        subject,
        body,
        leadId: leadId ?? undefined,
        integrationRowId: mailbox.integrationRowId,
        appendSignature: true,
        // Only ever true when the user asked for a deliberate resend. Passing
        // it by default would disable the one guard that stops a prospect
        // getting the same email twice.
        ...(opts.allowDuplicate === true ? { allowDuplicate: true } : {}),
      });
      const sent = !r?.error;

      // A repeat is not a send failure, it is a fact about what already went
      // out — and the remedy is different from every other refusal, so it is
      // carried separately rather than folded into sendFailures.
      if (!sent && r?.code === "duplicate_send") {
        duplicateRefusals.push({ to, subject, previouslySentAt: (r.previously_sent_at as string) ?? null });
      }
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
        summary: sent
          ? { sent: true, to }
          : {
              sent: false,
              error: String(r?.error ?? "send failed"),
              // Carried onto the per-record result so a batch can tell a repeat
              // apart from a real failure, and answer it differently.
              ...(r?.code ? { code: String(r.code) } : {}),
              ...(r?.code === "duplicate_send"
                ? { subject, previously_sent_at: r.previously_sent_at ?? null, redraft_will_not_help: true }
                : {}),
            },
        result: r,
      };
    };

    const runTool = async (name: string, rawArgs: Record<string, any>): Promise<unknown> => {
      let args: Record<string, any> = rawArgs;
      // Hard scope gate: even if the model hallucinates a tool it wasn't given,
      // an out-of-role action never runs.
      if (!allowedTools.includes(name)) {
        return {
          error: "out_of_scope",
          note:
            `This agent's role (${config?.role ?? "full_cycle"}) does not allow "${name}". Tell the user this agent is scoped differently and suggest switching agents. Do not attempt another tool to work around it.`,
        };
      }

      /*
       * The call checked against the schema the model was given.
       *
       * Thirty-five tools declare parameters and nothing read them back, so a
       * call that did not match its own schema became strange behaviour
       * further down rather than a rejection. The worst of it was silent: a
       * missing lead_ids read as an empty list and the tool reported doing
       * nothing to nobody, and unparseable arguments became {} — which for
       * list_leads is every lead on the account.
       *
       * Refused the same way an out-of-scope tool is, because the model
       * already recovers from that shape. Arguments are coerced first: "25"
       * for a number and "true" for a boolean are what models send and what
       * the hand-written call sites accepted anyway.
       */
      const checked = validateToolArgs(TOOL_SCHEMAS.get(name), args);
      if (!checked.ok) {
        console.warn(`[agent-chat] ${name} called with invalid arguments: ${checked.errors.join("; ")}`);
        return invalidArgsResult(name, checked.errors);
      }
      args = checked.args;
      // Which of these ids the account actually owns.
      //
      // A batch arrived with three ids the user does not have — carried over
      // from earlier in the conversation rather than looked up — and each one
      // cost a full edge-function invocation before failing: three opens,
      // three enrich calls, three research calls, all reported to the user in
      // red before the agent gave up and ran list_leads. One indexed query
      // answers the same question for all of them, so an id the model
      // imagined costs a round trip instead of a fan-out, and the model is
      // told plainly to look them up rather than left to infer it from N
      // identical failures.
      const ownedLeadIds = async (ids: string[]): Promise<{ owned: string[]; unknown: string[] }> => {
        if (ids.length === 0) return { owned: [], unknown: [] };
        const { data } = await admin
          .from("leads")
          .select("id")
          .eq("user_id", userId)
          .in("id", ids);
        const owned = new Set((data ?? []).map((r: any) => String(r.id)));
        return { owned: ids.filter((i) => owned.has(i)), unknown: ids.filter((i) => !owned.has(i)) };
      };

      {
        const handled = await runOutboundTool(name, args as Record<string, any>, { admin, userId, toolEvents: toolEvents as any });
        if (handled !== undefined) return handled;
      }
      switch (name) {
        case "list_leads": {
          /*
           * "Everyone who hasn't replied", as a filter.
           *
           * Resolved before the query rather than inside it: silence lives in
           * sent_emails, not on the lead, and it is a fact about the whole
           * thread — a reply to the first email and nothing on the second is
           * not an unanswered lead. Computed once and applied to every query
           * below, so the page, the outstanding count and the set the turn
           * commits to finishing all mean the same thing.
           */
          const wantsAwaitingReply = args.awaiting_reply === true;
          const awaitingIds = wantsAwaitingReply
            ? [...await leadsAwaitingReply(
                admin,
                userId,
                typeof args.quiet_for_days === "number" ? args.quiet_for_days : 3,
              )]
            : null;

          const applyFilters = (base: any) => {
            let b = base.eq("user_id", userId);
            if (args.pipeline_stage) b = b.eq("pipeline_stage", args.pipeline_stage);
            if (typeof args.min_icp_score === "number") b = b.gte("icp_score", args.min_icp_score);
            if (args.query) {
              const term = String(args.query).replace(/[%,]/g, "");
              b = b.or(
                `company_name.ilike.%${term}%,contact_name.ilike.%${term}%,contact_email.ilike.%${term}%`,
              );
            }
            if (args.needs_enrichment) b = b.is("contact_email", null);
            // "unscored" is an answer, not an absence: a lead nobody has
            // graded is the one most worth finding, and .eq would never match
            // a NULL.
            if (args.tier === "unscored") b = b.is("tier", null);
            else if (typeof args.tier === "string" && args.tier) b = b.eq("tier", args.tier);
            // An empty list means nobody is waiting on a reply, which has to
            // narrow to nothing rather than be skipped as a falsy filter.
            if (awaitingIds) b = b.in("id", awaitingIds.length > 0 ? awaitingIds : [NO_MATCH_ID]);
            return b;
          };
          const q = applyFilters(admin.from("leads").select(LEAD_FIELDS));
          const limit = Math.min(Math.max(Number(args.limit) || 25, 1), 100);

          const wantsUndrafted = args.without_draft === true;
          // Scan wider than the page when filtering, or a page of already-drafted
          // leads comes back empty and reads as "nothing left to do".
          const scanLimit = wantsUndrafted ? 500 : limit;
          const { data, error } = await q
            .order("created_at", { ascending: false })
            .limit(scanLimit);
          if (error) return { error: error.message };

          const rows = (data ?? []) as Record<string, unknown>[];
          // Ids come off the rows, never off the annotated copy: spreading a
          // Record<string, unknown> drops the index signature, so the spread's
          // type is `{ has_draft: boolean }` and reading .id from it does not
          // compile. Keeping them here is also the clearer way to say it.
          const rowIds = rows.map((r) => String(r.id));
          const drafted = await leadsWithDrafts(admin, userId, rowIds);
          const undraftedIds = rowIds.filter((id) => !drafted.has(id));
          const annotated = rows.map((r) => ({ ...r, has_draft: drafted.has(String(r.id)) }));
          const pool = wantsUndrafted ? annotated.filter((r) => !r.has_draft) : annotated;
          const leads = pool.slice(0, limit);

          /*
           * The outstanding figure covers every matching lead, not the page.
           *
           * main paged the whole account for this, and it is the number the
           * model is told to quote — a count taken from a 500-row scan would
           * under-report the backlog on a bigger account and read as "nearly
           * done". Kept, and the sweep below now works from the same full set
           * rather than from the page, which makes it strictly better than the
           * version it replaced.
           */
          const allIds: string[] = [];
          for (let from = 0; from < 20000; from += 1000) {
            const { data: idRows, error: idErr } = await applyFilters(
              admin.from("leads").select("id"),
            )
              .order("created_at", { ascending: false })
              .range(from, from + 999);
            if (idErr) break;
            const batch = (idRows ?? []) as Record<string, unknown>[];
            for (const r of batch) allIds.push(String(r.id));
            if (batch.length < 1000) break;
          }
          const draftedAll =
            allIds.length > rows.length ? await leadsWithDrafts(admin, userId, allIds) : drafted;
          const allUndrafted = allIds.length > 0
            ? allIds.filter((id) => !draftedAll.has(id))
            : undraftedIds;
          const outstanding = Math.max(undraftedIds.length, allUndrafted.length);
          if (wantsUndrafted) {
            /*
             * The set this turn commits to finishing — bounded by what was
             * actually asked for.
             *
             * This was allUndrafted: every matching lead on the account,
             * ignoring the limit on the call that produced it. So "draft for
             * these 49 new leads" called list_leads with limit 49, and the
             * sweep at the end of the turn committed the account's whole
             * backlog of 162 and queued the other 140 under a line saying
             * "the whole set is accounted for". The user got a hundred and
             * forty drafts they never asked for and no way to tell which
             * forty-nine they wanted.
             *
             * The limit the model passed IS its statement of scope. The
             * account-wide figure is still reported as remaining_without_draft,
             * which is the number worth quoting; it is just no longer a
             * commitment. Taken from the same ordering as the page, so the
             * pool always contains the ids the model was shown.
             */
            outstandingPool = allUndrafted.slice(0, limit);
          }

          toolEvents.push({
            name,
            label: "Looked up leads",
            status: "ok",
            detail: `${leads.length} lead(s) matched${
              wantsUndrafted
                ? ` — ${outstanding} still without a draft`
                : outstanding < annotated.length
                  ? ` (${outstanding} without a draft)`
                  : ""
            }`,
          });
          return {
            count: leads.length,
            // The figure to quote. The model was subtracting its own running
            // tally from the total and announcing the result as fact.
            remaining_without_draft: outstanding,
            truncated: pool.length > leads.length,
            leads,
          };
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

        case "get_lead_intelligence": {
          const requestedIds: string[] = (args.lead_ids ?? []).slice(0, 10).map((x: any) => String(x));
          const { owned } = await ownedLeadIds(requestedIds);
          const { data: rows } = await admin
            .from("lead_decisions")
            .select("*")
            .eq("user_id", userId)
            .in("lead_id", owned.length ? owned : ["00000000-0000-0000-0000-000000000000"]);
          const byLead = new Map((rows ?? []).map((r: any) => [r.lead_id, r]));
          const out = owned.map((id) => {
            const row = byLead.get(id);
            if (!row || row.status !== "ok") return { lead_id: id, not_evaluated: true };
            return {
              lead_id: id,
              evaluated_at: row.evaluated_at,
              icp_fit: row.icp_fit,
              buying_intent: row.buying_intent,
              email_priority: row.email_priority,
              send_recommendation: row.send_recommendation,
              personalization_depth: row.personalization_depth,
              subject_strategy: row.subject_strategy,
              cta_strategy: row.cta_strategy,
              sequence_length: row.sequence_length,
              follow_up_timing: row.follow_up_timing,
              automation_review: row.automation_review,
              confidence: {
                icp_fit: row.icp_fit_confidence,
                buying_intent: row.buying_intent_confidence,
                email_priority: row.email_priority_confidence,
                send_recommendation: row.send_recommendation_confidence,
              },
            };
          });
          const evaluated = out.filter((o: any) => !o.not_evaluated).length;
          toolEvents.push({
            name,
            label: "Read lead intelligence",
            status: "ok",
            detail: `${evaluated}/${owned.length} lead(s) have a saved evaluation`,
          });
          return { leads: out };
        }

        case "enrich_leads": {
          const requested: string[] = (args.lead_ids ?? []).slice(0, 10).map((x: any) => String(x));
          const { owned: ids, unknown } = await ownedLeadIds(requested);
          if (unknown.length) {
            toolEvents.push({
              name,
              label: "Unknown lead ids",
              status: "error",
              detail: `${unknown.length} id(s) are not in this account — call list_leads to get real ones.`,
            });
          }
          if (ids.length === 0) {
            return { error: "None of those lead ids exist in this account. Call list_leads first, then retry with the ids it returns.", unknown_lead_ids: unknown };
          }
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
          return { results, skipped_lead_ids: skipped, unknown_lead_ids: unknown };
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
          const requested: string[] = (args.lead_ids ?? []).slice(0, 12).map((x: any) => String(x));
          if (requested.length === 0) return { error: "lead_ids is required" };
          const { owned: ids, unknown } = await ownedLeadIds(requested);
          if (unknown.length) {
            toolEvents.push({
              name,
              label: "Unknown lead ids",
              status: "error",
              detail: `${unknown.length} id(s) are not in this account — call list_leads to get real ones.`,
            });
          }
          if (ids.length === 0) {
            return { error: "None of those lead ids exist in this account. Call list_leads first, then retry with the ids it returns.", unknown_lead_ids: unknown };
          }
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
              external_research: r?.external_research ?? null,
              error: r?.brief ? undefined : (r?.error ?? "Research failed"),
            };
          });
          const okCount = results.filter((r: any) => !r.error).length;
          const thinCount = results.filter((r: any) => !r.error && r.safe_to_personalize === false).length;

          /*
           * Say it out loud when only the prospect's own site was read.
           *
           * research-lead degrades quietly without PARALLEL_API_KEY: a brief is
           * still written and saved, and every source on it points back at the
           * lead's own website. Reported as "researched from their website",
           * which is true, it reads as the research having worked. The half
           * that makes an observation datable is the half that is missing.
           */
          const externalOff = results.find(
            (r: any) => r.external_research && r.external_research.ran === false,
          ) as any;
          if (externalOff?.external_research?.note) {
            toolEvents.push({
              name,
              label: "Only their own website was read",
              status: "error",
              detail: String(externalOff.external_research.note),
            });
          }
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

          const requested: string[] = [
            ...new Set(
              (Array.isArray(args.lead_ids) && args.lead_ids.length
                ? args.lead_ids
                : [args.lead_id]
              )
                .filter(Boolean)
                .map((x: any) => String(x)),
            ),
          ];
          if (requested.length === 0) return { error: "lead_id or lead_ids is required" };

          /**
           * More than this many leads goes to the queue.
           *
           * The old code took `.slice(0, 20)` and said nothing, so asking for
           * seventy-nine drafts quietly produced twenty. Above the threshold the
           * work is enqueued and a worker does it, which is the whole point of
           * docs/AGENT_BATCH_QUEUE.md: a turn that finishes inside its budget
           * whatever the batch size.
           *
           * Decided here rather than asked for in the prompt. A rule the model
           * has to remember is a rule that gets forgotten on the turn it matters.
           */
          const INLINE_DRAFT_LIMIT = 12;

          // Sender + offer context the UI path already sends — the agent path
          // used to drop these, which made its emails noticeably more generic.
          const businessDescription = [
            config?.company_context ?? "",
            (config?.value_props ?? []).join("; "),
          ].filter(Boolean).join(" — ").slice(0, 600);

          // A redraft is the user rejecting the email they were shown, so it has
          // to come back structurally different rather than reworded. feedback
          // reaches generate-email as customInstruction, and variantNum pushes
          // the skill router to a different framework — regenerating with the
          // same inputs mostly reproduces the same email, which reads to the
          // user as the request having been ignored.
          const feedback = String(args.feedback ?? "").trim().slice(0, 2000);

          if (draftingProducedNothing) {
            return {
              error: "drafting_already_failed_this_turn",
              note:
                "An earlier draft_outreach call this turn produced nothing, and calling it again will " +
                "produce nothing too. Do not call it a third time. Tell the user what the failure was " +
                "and stop.",
            };
          }

          /*
           * Leads that already have a draft are not drafted again.
           *
           * saveDraft replaces a lead's draft rather than adding one, so
           * redrafting a lead the folder already holds is a write that leaves
           * the count exactly where it was. That is the whole of "did so much
           * work and only 20 was drafted": four passes over the same twelve
           * leads, each one overwriting the last, the total pinned at one
           * batch while the reply counted upwards.
           *
           * Decided here rather than asked for in the prompt, for the same
           * reason the queue threshold is: a rule the model has to remember is
           * a rule that gets forgotten on the turn it matters. A redraft is
           * still a redraft — feedback, or an explicit redraft flag, means the
           * user asked for this lead's email to be rewritten, and that is the
           * one case where overwriting is the point.
           */
          const isRedraft = feedback.length > 0 || args.redraft === true;
          let pending = requested;
          if (!isRedraft) {
            const have = await leadsWithDrafts(admin, userId, requested);
            const already = requested.filter((id) => have.has(id));
            pending = requested.filter((id) => !have.has(id));
            if (already.length > 0) {
              draftTally.skippedAlreadyDrafted += already.length;
              toolEvents.push({
                name,
                label: "Already drafted",
                status: "ok",
                detail:
                  `${already.length} of these ${already.length === 1 ? "lead" : "leads"} already had a draft, so ${already.length === 1 ? "it was" : "they were"} left alone. ` +
                  `Ask me to redraft if you want ${already.length === 1 ? "it" : "them"} rewritten.`,
              });
            }
            if (pending.length === 0) {
              return {
                error: "every_lead_already_drafted",
                already_drafted: already.length,
                note:
                  "Every lead in that list already has a saved draft, so nothing was written and nothing " +
                  "needed to be. Do not call this again with the same ids. To find leads that still need " +
                  "drafting, call list_leads with without_draft: true — its remaining_without_draft is the " +
                  "real number outstanding. To rewrite these, call again with feedback saying what to change.",
              };
            }
          }

          /*
           * How many of these this turn can actually finish.
           *
           * Every draft is a website-research pass and a generation, and the
           * turn budget is shared with everything the model already did before
           * reaching this call. The observed failure was twelve drafts started
           * on the eighth tool call of a turn: each generate-email fetch was
           * given whatever was left of the budget as its abort timeout, every
           * one of the twelve was cut off, and the tool reported "0/12 drafted"
           * with no reason and no work saved.
           *
           * So the inline batch is sized against the clock rather than a
           * constant. The estimate is deliberately conservative and both ways
           * of being wrong are safe: too low and the work goes to the queue,
           * which is where a batch this size belongs anyway; too high and
           * mapLimit's own budget check stops and reports the remainder. What
           * is no longer possible is starting twelve generations that cannot
           * finish.
           */
          const PER_WAVE_MS = 22_000;
          const DRAFT_CONCURRENCY = 3;
          const RESERVE_MS = 15_000;
          const affordableWaves = Math.floor((timeLeft() - RESERVE_MS) / PER_WAVE_MS);
          const inlineLimit = Math.max(
            0,
            Math.min(INLINE_DRAFT_LIMIT, affordableWaves * DRAFT_CONCURRENCY),
          );
          const ids = pending.slice(0, inlineLimit);
          const overflow = pending.slice(inlineLimit);
          if (inlineLimit === 0 && overflow.length > 0) {
            toolEvents.push({
              name,
              label: "Queued instead of drafting here",
              status: "ok",
              detail:
                `Not enough time left in this turn to write a draft properly, so all ${overflow.length} ` +
                `went to the background queue rather than being started and cut off.`,
            });
          }

          /*
           * The rest go to the queue, and they go before the inline drafts are
           * written rather than after.
           *
           * If this turn dies partway — the phone backgrounds, the platform
           * kills the pass — the queued work is already durable. Enqueuing
           * afterwards would lose exactly the part that was too big to do here.
           */
          const { queued: queuedCount, alreadyPending } = overflow.length > 0
            ? await queueForDrafting(overflow, goal, feedback || null)
            : { queued: 0, alreadyPending: 0 };
          const queuedJobId = batchJobId;
          if (alreadyPending > 0) {
            toolEvents.push({
              name,
              label: "Already queued",
              status: "ok",
              detail: `${alreadyPending} of these were already waiting in the queue.`,
            });
          }
          if (queuedCount > 0) {
            toolEvents.push({
              name,
              label: "Queued the rest",
              status: "ok",
              detail: `${queuedCount} more lead(s) queued — they draft in the background and appear as they finish.`,
            });
          }

          // Outreach Studio has always fallen back to the connected mailbox
          // address when the profile carries no name; the agent did not, and
          // passed "". generate-email then told the model the sender was named
          // "Sender", which is where the "[Sender Name]" placeholders came
          // from — reported to the user as an unexplained generator fault.
          const mailboxes = await loadMailboxes();
          const senderEmail = String(mailboxes[0]?.email ?? "");

          const basePayload = {
            goal,
            tone: config?.tone ?? "professional",
            senderName: profile?.full_name ?? "",
            senderEmail,
            senderCompany: profile?.company_name ?? config?.company_context ?? "",
            businessDescription,
            ...(feedback
              ? {
                  customInstruction:
                    `The user rejected the previous draft for this lead. What they want changed: ${feedback}. ` +
                    `Write a different email — different opening beat and different structure, not a reword of the last one.`,
                  variantNum: 1,
                }
              : {}),
          };

          // What this person has already been sent.
          //
          // A regenerated draft that lands on the same subject line is refused
          // at the send step, after it has been written, saved and shown — and
          // the generator had no way of knowing, so it reproduced the same
          // subject every time it was asked to try again. Fetched once for the
          // whole batch rather than per lead.
          const sentSubjects = await sentSubjectsFor(admin, userId, ids);

          /*
           * The goal is one word for the whole call, and it decided the shape
           * of every email in the batch.
           *
           * Asked to follow up with a set that turned out to include people
           * who had never been contacted, each of them got an email written to
           * refer back to a first one. `4ps_followup` opens with fixed text —
           * "I reached out the other day" — so to a stranger that is not a
           * clumsy email, it is a false statement. Which lead has been emailed
           * is a fact in sent_emails, so it is read rather than assumed.
           */
          const threads = await leadThreads(admin, userId, ids);
          const stateOf = (id: string): ContactState => threads.get(id)?.state ?? "never_contacted";
          const firstTouches = ids.filter((id) => stateOf(id) === "never_contacted");
          if (FOLLOW_UP_GOALS.has(goal) && firstTouches.length > 0) {
            const one = firstTouches.length === 1;
            toolEvents.push({
              name,
              label: "Wrote first touches instead",
              status: "ok",
              detail:
                `${firstTouches.length} of these ${one ? "leads has" : "leads have"} never been emailed, so ` +
                `${one ? "it got an opener" : "they got openers"} rather than a follow-up to a message that ` +
                `was never sent.`,
            });
          }

          const settingsFor = (id: string) => {
            const thread = threads.get(id);
            const leadGoal = goalForLead(goal, thread?.state ?? "never_contacted");
            return {
              goal: leadGoal,
              tone: config?.tone ?? "professional",
              senderName: basePayload.senderName,
              senderEmail: basePayload.senderEmail,
              senderCompany: basePayload.senderCompany,
              businessDescription: basePayload.businessDescription,
              ...(feedback
                ? { customInstruction: basePayload.customInstruction as string, variantNum: 1 }
                : {}),
              triggerContext: `AI SDR chat — ${leadGoal}`,
              thread,
            };
          };

          // One draft path, shared with the queue worker. See _shared/draft-one.ts:
          // two copies of this is how the batch run and the inline run drift.
          const genOne = async (id: string) => {
            const lead = await loadLead(id);
            if (!lead) return { lead_id: id, error: "Lead not found" } as any;
            return await draftForLead(
              { admin, userId, invokeFn },
              lead as any,
              settingsFor(id),
              sentSubjects.get(id) ?? [],
            );
          };

          const { results: drafts, skipped } = await mapLimit(ids, DRAFT_CONCURRENCY, genOne);


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
          // Copy problems the generator found and shipped anyway.
          //
          // Unlike the playbook names below, these are the customer's business:
          // a draft carrying a misspelled company name or filler off the banned
          // list is one they are about to send. The generator already detects
          // both and retries once; when the retry does not clear them it keeps
          // the better draft and says nothing, which is how "KOgenie" and
          // "without adding headcount" reached a real prospect.
          // Corrected automatically, and said out loud. The value came from the
          // lead row, so it is a repair rather than a judgement call — but a
          // prospect's name being rewritten is exactly the sort of thing that
          // should never happen invisibly.
          const nameFixes = [
            ...new Set(drafts.flatMap((d: any) => d.name_repairs ?? [])),
          ] as string[];
          if (nameFixes.length) {
            toolEvents.push({
              name,
              label: "Fixed name capitalisation",
              status: "ok",
              detail: `${nameFixes.join(", ")} — corrected from the lead record before drafting finished.`,
            });
          }

          const nameFlags = drafts.flatMap((d: any) =>
            (d.name_warnings ?? []).map((w: string) => `${d.company ?? "lead"}: ${w}`),
          );
          if (nameFlags.length) {
            toolEvents.push({
              name,
              label: "Wrong name in draft",
              status: "error",
              detail: `${nameFlags.join("; ")} — could not be corrected from the lead record, so it needs you; a wrong name is the one thing a reader cannot read past.`,
            });
          }
          const styleFlags = [
            ...new Set(drafts.flatMap((d: any) => d.style_warnings ?? [])),
          ] as string[];
          if (styleFlags.length) {
            toolEvents.push({
              name,
              label: "House-style filler survived",
              status: "queued",
              detail: `${styleFlags.map((w) => `"${w}"`).join(", ")} — on the banned list, rewrite attempted and did not clear them. Ask me to redraft those lines.`,
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

          // Which playbooks wrote these.
          //
          // The skills are compiled into the prompt and the routing is logged
          // server-side, which answers nothing for someone watching the chat
          // and wondering whether any of it is switched on. Naming them makes
          // it checkable instead of a matter of faith.
          const skillsUsed: string[] = [
            ...new Set(
              drafts.flatMap((d) => Array.isArray(d.skills_used) ? d.skills_used as string[] : []),
            ),
          ];
          // Staff only. These are internal module names — anti-ai-slop-writing,
          // cold-email-templates-34 — and they were surfaced so the routing
          // could be checked rather than taken on faith. That is a reason for
          // an operator to see them, not a customer: to a customer it reads as
          // the machinery showing through, and it publishes how the drafting
          // is assembled to anyone who opens the chat.
          //
          // The count still goes to everyone below, which is the part that
          // means something to them: how many drafts came out.
          if (skillsUsed.length && showsInternals) {
            toolEvents.push({
              name,
              label: "Playbooks applied",
              status: "ok",
              detail: skillsUsed.join(", "),
            });
          }
          /*
           * Why they failed, said out loud.
           *
           * "0/12 drafted" was the entire report. The reason for each failure
           * was sitting on the result the whole time — draftForLead sets
           * `error` to whatever generate-email came back with — and the event
           * threw it away, so a run that burned twenty-four generations across
           * two calls told nobody anything. Hours went into working out from
           * screenshots what one line of this would have said.
           */
          /*
           * Too soon to follow up is settled, not failed.
           *
           * Without this, a batch that correctly declined to email people
           * contacted that morning would report every one of them as a
           * failure, and the obvious reading of "89 failed" is that the
           * product is broken.
           */
          const tooSoon = drafts.filter((d: any) => d.skipped);
          const failureReasons = [
            ...new Set(
              drafts
                .filter((d: any) => !d.email && !d.skipped)
                .map((d: any) => String(d.error ?? "Draft failed").slice(0, 160)),
            ),
          ] as string[];
          draftTally.written += okCount;
          draftTally.failed += drafts.length - okCount - tooSoon.length;
          if (okCount === 0 && ids.length > 0) draftingProducedNothing = true;
          for (const d of drafts) if (d.draft_id) handledLeadIds.add(String(d.lead_id));
          outstandingGoal = goal;
          outstandingFeedback = feedback || null;

          // Nothing was drafted here because nothing was meant to be — the
           // whole batch went to the queue. "0/0 drafted" under a warning
           // triangle reads as a failure, and there were four of them in a row
           // on a turn where the queueing worked exactly as intended.
          if (ids.length > 0) toolEvents.push({
            name,
            label: "Drafted emails",
            status: okCount === 0 ? "error" : "ok",
            detail:
              ids.length === 1 && okCount === 1
                ? (drafts[0]?.company ?? "lead")
                : `${okCount}/${ids.length} drafted${skipped.length ? ` (${skipped.length} left — ask me to continue)` : ""}${overflow.length ? `, ${overflow.length} queued` : ""}${
                  okCount === 0 && failureReasons.length
                    ? ` — ${failureReasons.slice(0, 2).join("; ")}`
                    : ""
                }`,

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
          /*
           * A call that wrote nothing says so, and says stop.
           *
           * The model treated "0/12 drafted, 8 queued" as partial progress,
           * added the eight to a running total it was keeping itself, and
           * announced twenty-eight drafts on a turn that produced none.
           */
          if (okCount === 0 && ids.length > 0) {
            return {
              error: "nothing_was_drafted",
              attempted: ids.length,
              reasons: failureReasons,
              queued: draftTally.queued,
              note:
                `Not one of the ${ids.length} drafts was written. ${
                  failureReasons.length ? `The generator returned: ${failureReasons.join("; ")}. ` : ""
                }` +
                "Nothing is saved for these leads. Do NOT call draft_outreach again this turn and do NOT " +
                "count these, or anything queued, as drafted — queued means a background worker has not " +
                "written them yet. Tell the user plainly that this many failed and why, and stop.",
            };
          }

          return {
            goal,
            note:
              "Drafts are saved and shown to the user in the chat with Send / Schedule controls. Remember each draft_id — if the user then says to send them, call send_drafts with those draft_ids (plus from_email if they named an inbox); if they want them to go out later, call schedule_drafts with those draft_ids and send_at_local as their local wall-clock time (see SCHEDULING). Do not send or schedule until they ask." +
              (skipped.length
                ? ` ${skipped.length} lead(s) were not drafted because this turn ran out of time — tell the user to reply "continue" and you'll draft the rest.`
                : ""),
            // Counting is not the model's job. It was adding tool results to
            // its own earlier sentences and reporting the sum as fact.
            drafted_this_call: okCount,
            drafts_written_this_turn: draftTally.written,
            note_on_counting:
              "drafted_this_call is the only number of drafts this call produced. Queued leads are NOT " +
              "drafted. Never add up counts across calls yourself — call list_leads with without_draft: " +
              "true and quote its remaining_without_draft.",
            skipped_lead_ids: skipped,
            /*
             * Failures on a call that mostly worked.
             *
             * The model reported "2 drafts failed (Cosmic Labs, monar) — will
             * regenerate in next batch". Nothing regenerates them. A failed
             * item is terminal: process-agent-jobs writes status "failed" and
             * never claims it again. This path returned the successes and said
             * nothing at all about the two that did not make it, so the model
             * filled the silence with a promise the product does not keep, and
             * two leads ended the run with no draft and no one looking for it.
             */
            ...(tooSoon.length
              ? {
                  too_soon: {
                    count: tooSoon.length,
                    reasons: [...new Set(tooSoon.map((d: any) => String(d.skipped)))].slice(0, 4),
                    note:
                      `${tooSoon.length} lead(s) got no draft because they were contacted too recently — ` +
                      "the sender's own cadence is 0, 3, 7, 12, 18 days and a second email inside that " +
                      "window burns the domain for no extra reply. This is the product working, not a " +
                      "failure: say so plainly, say when they are due, and do NOT queue them again this " +
                      "turn or call draft_outreach for them to try to get the number up.",
                  },
                }
              : {}),
            ...(drafts.length > okCount + tooSoon.length
              ? {
                  failed: {
                    count: drafts.length - okCount - tooSoon.length,
                    reasons: failureReasons,
                    note:
                      `${drafts.length - okCount - tooSoon.length} lead(s) got no draft. Say that plainly and say why, ` +
                      "using reasons. Nothing retries them: there is no next batch for a failed lead, so " +
                      "never say one will regenerate, be picked up later, or be covered by the queue. If " +
                      "the user wants another attempt they have to ask for it, and most of these reasons " +
                      "(a figure the research cannot back, a date it cannot support) will repeat until " +
                      "the lead is enriched.",
                  },
                }
              : {}),
            drafts: drafts.map(({ body: _b, ...rest }) => rest),
            // Without this the model reports twelve drafts as the whole job and
            // the user believes the other sixty-seven were never asked for.
            ...(queuedJobId
              ? {
                  queued: {
                    job_id: queuedJobId,
                    count: queuedCount,
                    note:
                      `${queuedCount} further lead(s) are ALREADY BEING DRAFTED by a background worker ` +
                      "that is running right now. They are not outstanding work and they are not waiting on " +
                      "anything from you or from the user. " +
                      "Tell the user the count plainly, that the drafts appear in Outreach as they finish, and " +
                      "that they can cancel the batch from the chat. " +
                      "Never describe these as remaining, left to do, still to draft, or not yet started, and " +
                      "never offer to continue them, draft the rest, or pick them up later — there is nothing " +
                      "to continue and the user who waits for that offer waits forever. " +
                      "Do not call draft_outreach again for those leads: the queue already has them, and " +
                      "drafting them here would write each draft twice.",
                  },
                }
              : {}),
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
          // A duplicate refusal is not a draft problem, and deleting the draft
          // does not clear it: the block lives on the sent history. The system
          // prompt has said so in plain words for a while and the model still
          // answers "blocked \u2014 deleting and redrafting", which burns a pass,
          // destroys work the user can still use, and arrives back at the same
          // refusal. Prose was the wrong place for it, so the tool refuses.
          if (duplicateRefusals.length > 0 && !userAskedToDelete) {
            return {
              error: "redraft_will_not_help",
              note:
                `${duplicateRefusals.length} send(s) this turn were refused because that person already received that exact subject. ` +
                "Deleting these drafts changes nothing \u2014 the block is on what was already sent, not on the draft. " +
                "Do not delete and do not redraft for this reason. Tell the user who already got what and when, then offer exactly two things: " +
                "a follow-up on a genuinely new angle with a new subject (draft_outreach with feedback describing the angle), " +
                "or sending the same email again on purpose (the send tool with allow_duplicate: true, only after they say so in their own words).",
            };
          }
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

        case "delete_leads": {
          const leadIds = (Array.isArray(args.lead_ids) ? args.lead_ids : [])
            .filter(Boolean)
            .map((x: any) => String(x));
          const matchCompany = String(args.match_company ?? "").trim();
          const matchName = String(args.match_name ?? "").trim();
          if (!leadIds.length && !matchCompany && !matchName) {
            return {
              error:
                "Tell me which leads to delete: pass lead_ids, match_company or match_name. Use list_leads to look them up.",
            };
          }

          let targetIds = leadIds;
          if (!targetIds.length) {
            let lookup = admin.from("leads").select("id").eq("user_id", userId);
            if (matchCompany) lookup = lookup.ilike("company_name", `%${matchCompany}%`);
            if (matchName) lookup = lookup.ilike("contact_name", `%${matchName}%`);
            const { data: found, error: lookupError } = await lookup.limit(200);
            if (lookupError) return { error: lookupError.message };
            targetIds = (found ?? []).map((l: any) => l.id);
          }
          if (!targetIds.length) {
            return { deleted_count: 0, note: "No matching leads were found, so nothing was deleted." };
          }

          // Remove dependent rows first so the lead delete cannot be blocked.
          await admin.from("email_drafts").delete().eq("user_id", userId).in("lead_id", targetIds);

          const { data, error } = await admin
            .from("leads")
            .delete()
            .eq("user_id", userId)
            .in("id", targetIds)
            .select("id, contact_name, company_name");
          if (error) {
            toolEvents.push({ name, label: "Delete failed", status: "error", detail: error.message });
            return { error: error.message };
          }
          const deleted = data ?? [];
          toolEvents.push({
            name,
            label: "Deleted leads",
            status: "ok",
            detail: `${deleted.length} lead(s) deleted`,
          });
          return {
            deleted_count: deleted.length,
            deleted: deleted.map((l: any) => ({
              lead_id: l.id,
              contact: l.contact_name,
              company: l.company_name,
            })),
            note: deleted.length
              ? "These lead records and their drafts are gone permanently."
              : "No matching leads were found, so nothing was deleted.",
          };
        }


        case "send_drafts": {
          const draftIds = (Array.isArray(args.draft_ids) ? args.draft_ids : [])
            .filter(Boolean)
            .map((x: any) => String(x));
          const leadIds = (Array.isArray(args.lead_ids) ? args.lead_ids : [])
            .filter(Boolean)
            .map((x: any) => String(x));

          // Fetch what was actually asked for. A fixed page size here is what
          // turned "send these 32" into eleven sends reported as a complete job.
          const requestedCount = draftIds.length || leadIds.length;
          let q = admin
            .from("email_drafts")
            .select("id, lead_id, subject, body, created_at, leads(company_name, contact_name, contact_email)")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(batchFetchLimit(requestedCount));
          if (draftIds.length) q = q.in("id", draftIds);
          else if (leadIds.length) q = q.in("lead_id", leadIds);
          const { data: draftRows, error: draftErr } = await q;
          if (draftErr) return { error: draftErr.message };

          const fetchedCount = (draftRows ?? []).length;
          let drafts = draftRows ?? [];
          // One email per person, always.
          //
          // This dedupe used to be skipped when the model passed no arguments —
          // which is the documented "send every pending draft" path, and the
          // one most likely to be holding duplicates. Explicit draft_ids are
          // still honoured exactly: naming two drafts means the operator meant
          // two, and rows already ordered newest-first so the survivor is the
          // most recent.
          if (!draftIds.length) {
            const seen = new Set<string>();
            drafts = drafts.filter((d: any) => {
              if (!d.lead_id) return true;
              if (seen.has(d.lead_id)) return false;
              seen.add(d.lead_id);
              return true;
            });
          }
          if (drafts.length === 0)
            return { error: "No matching saved drafts. Call list_drafts to see what exists, or draft first." };

          const poolRes = await resolveMailboxPool(
            args.from_email ? String(args.from_email) : null,
            args.from_emails,
          );
          if ("error" in poolRes) {
            toolEvents.push({ name, label: "Send blocked", status: "error", detail: poolRes.error });
            return { error: poolRes.error };
          }
          const pool = poolRes.pool;

          // Ask whether there is room before doing the work. A batch bigger
          // than today's ceiling used to be discovered one refused send at a
          // time, and every refusal left an approval nobody could clear.
          const capacity = await sendCapacity();
          const capacityNote = shortfallWarning(drafts.length, capacity);
          if (capacityNote) {
            toolEvents.push({
              name,
              label: "Not enough send capacity today",
              status: capacity.available === 0 ? "error" : "queued",
              detail: capacityNote,
            });
            sendFailures.push(capacityNote);
            if (capacity.available === 0) {
              // Nothing can go out. Queuing the batch anyway would add another
              // day's worth of approvals to a queue that already cannot drain.
              return {
                sent: 0,
                attempted: 0,
                capacity,
                error: capacityNote,
                note: "Nothing was queued or sent. Tell the user this figure plainly and stop.",
              };
            }
          }

          const results: any[] = [];
          let rotation = 0;
          for (const d of drafts as any[]) {
            const to = d.leads?.contact_email ?? null;
            const label = d.leads?.company_name ?? d.leads?.contact_name ?? to ?? "lead";
            if (!to) {
              results.push({ draft_id: d.id, lead: label, error: "Lead has no email address — enrich it first" });
              continue;
            }
            const mailbox = pool[rotation % pool.length];
            rotation++;
            const outcome = await deliver({
              leadId: d.lead_id,
              to,
              contactName: d.leads?.contact_name ?? null,
              companyName: d.leads?.company_name ?? null,
              subject: String(d.subject ?? "").slice(0, 200),
              body: String(d.body ?? ""),
              mailbox,
              toolName: name,
              // Stored drafts come from generate-email, which scored them.
              modelAuthored: false,
              confirmed: args.confirmed === true || confirmedByUser,
              allowDuplicate: args.allow_duplicate === true,
            });
            results.push({ draft_id: d.id, lead: label, to, from: mailbox.email, ...outcome.summary });
            if (outcome.sent) {
              await admin.from("email_drafts").delete().eq("id", d.id).eq("user_id", userId);
            }
          }

          const sentCount = results.filter((r) => r.sent).length;
          const queuedCount = results.filter((r) => r.queued_for_approval).length;
          const failedCount = results.filter((r) => !r.sent && !r.queued_for_approval).length;
          const usedFrom = [...new Set(results.map((r) => r.from).filter(Boolean))];

          // Repeats get their own sentence in the tool result, not just the
          // per-record error, because the model reading "duplicate" reliably
          // reached for the one remedy that cannot work.
          const dupes = results.filter((r) => r.code === "duplicate_send");
          const duplicateNote = dupes.length
            ? duplicateGuidanceFor(dupes.length, dupes.map((d) => String(d.subject ?? "")))
            : "";

          // Account for the whole request, not just the rows this call saw.
          const accounting = accountFor(requestedCount, fetchedCount, drafts.length);
          const acted = autonomous ? sentCount : queuedCount;
          const shortfall = shortfallNote(accounting, "were sent", acted);
          if (isShortfall(accounting) || failedCount > 0) {
            batchShortfalls.push(
              `You asked for ${accounting.requested || drafts.length} — ${acted} ${
                autonomous ? "actually sent" : "queued for your approval"
              }${failedCount > 0 ? `, ${failedCount} failed` : ""}${
                accounting.deduped > 0 ? `, ${accounting.deduped} skipped as duplicates for the same person` : ""
              }${
                accounting.overCeiling > 0
                  ? `, ${accounting.overCeiling} not found among your saved drafts`
                  : ""
              }.`,
            );
          }

          return {
            from: usedFrom.join(", ") || pool[0].email,
            rotated_across: usedFrom.length,
            requested: requestedCount || drafts.length,
            attempted: results.length,
            sent: sentCount,
            failed: failedCount,
            queued_for_approval: queuedCount,
            accounting,
            results,
            note: [
              autonomous
                ? `Sent ${sentCount} of ${results.length} draft(s) attempted, rotated across ${usedFrom.length || 1} mailbox(es): ${usedFrom.join(", ") || pool[0].email}.`
                : `NOTHING WAS SENT — ${queuedCount} email(s) are ready and waiting on the user. Nothing is queued or stored; the drafts are untouched. Tell them who and how many, ask them to confirm, then call send_drafts again with confirmed: true and the same ids. Never mention buttons or other pages.`,
              failedCount > 0
                ? `${failedCount} did NOT go out — the per-record errors are in results. Report the failures, do not round them off.`
                : "",
              duplicateNote,
              shortfall,
            ].filter(Boolean).join(" "),
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

          // Same accounting as send_drafts: a scheduling request for 32 that
          // quietly queues 11 is the same failure arriving later.
          const requestedCount = draftIds.length || leadIds.length;
          let q = admin
            .from("email_drafts")
            .select("id, lead_id, subject, body, created_at, leads(company_name, contact_name, contact_email)")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(batchFetchLimit(requestedCount));
          if (draftIds.length) q = q.in("id", draftIds);
          else if (leadIds.length) q = q.in("lead_id", leadIds);
          const { data: draftRows, error: draftErr } = await q;
          if (draftErr) return { error: draftErr.message };

          const fetchedCount = (draftRows ?? []).length;
          let drafts = draftRows ?? [];
          // One scheduled email per person — same rule as send_drafts. A
          // duplicate scheduled instead of sent is the same duplicate arriving
          // later, and the no-argument call is the one likeliest to hold them.
          if (!draftIds.length) {
            const seen = new Set<string>();
            drafts = drafts.filter((d: any) => {
              if (!d.lead_id) return true;
              if (seen.has(d.lead_id)) return false;
              seen.add(d.lead_id);
              return true;
            });
          }
          if (drafts.length === 0)
            return { error: "No matching saved drafts. Call list_drafts to see what exists, or draft first." };

          const poolRes = await resolveMailboxPool(
            args.from_email ? String(args.from_email) : null,
            args.from_emails,
            { forSchedule: true },
          );
          if ("error" in poolRes) {
            toolEvents.push({ name, label: "Scheduling blocked", status: "error", detail: poolRes.error });
            return { error: poolRes.error };
          }
          const pool = poolRes.pool;


          const stagger = Math.max(0, Math.min(Number(args.stagger_minutes ?? 0) || 0, 240));
          // Scheduled sends bypass send-email, so bake the signature in now.
          const scheduleSignature = await getSignatureHtml(admin, userId, null);
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
            const mailbox = pool[index % pool.length];

            // Scheduling is a send with a delay, so in approval mode it pauses
            // like every other send.
            //
            // This used to write straight into sent_emails, which meant a mode
            // that promises "anything that sends an email pauses for the user's
            // approval" had one tool that did not. The model follows the mode
            // instruction rather than the hole in it, so a request to schedule
            // was routed through send_drafts instead — parking an approval and
            // dropping the requested time on the floor. That is why the
            // approvals table filled up while no row in the database has ever
            // carried a scheduled_at.
            //
            // Unconfirmed: describe what would be queued and write nothing.
            // The draft stays a draft, so a confirmation on the next turn has
            // the same records to work from.
            if (!autonomous && args.confirmed !== true && !confirmedByUser) {
              results.push({
                draft_id: d.id,
                lead: label,
                to,
                from: mailbox.email,
                awaiting_confirmation: true,
                would_send_at: sendAt.toISOString(),
                would_send_at_local: formatLocal(sendAt),
              });
              index++;
              continue;
            }

            const { error: insErr } = await admin.from("sent_emails").insert({
              user_id: userId,
              lead_id: d.lead_id,
              to_email: to,
              subject,
              body_html: draftBodyToHtml(appendSignatureToBody(body, scheduleSignature)),
              body_text: appendSignatureToBody(body, scheduleSignature),
              status: "scheduled",
              scheduled_at: sendAt.toISOString(),
              // sent_at defaults to now() in the table, so a row that has not
              // been sent was arriving stamped with a send time — which reads
              // everywhere (the sent list, the monthly usage count) as already
              // delivered. Nothing has been sent yet, so it carries no time.
              sent_at: null,
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
              from: mailbox.email,
              scheduled_at: sendAt.toISOString(),
              scheduled_at_local: formatLocal(sendAt),
            });
            index++;
          }

          const okCount = results.filter((r) => r.scheduled_at).length;
          const queuedCount = results.filter((r) => r.queued_for_approval).length;
          const usedFrom = [...new Set(results.map((r) => r.from).filter(Boolean))];
          if (!queuedCount) {
            toolEvents.push({
              name,
              label: okCount ? "Scheduled email" : "Scheduling failed",
              status: okCount ? "ok" : "error",
              detail: okCount
                ? `${okCount} email(s) queued from ${usedFrom.join(", ")}, first at ${formatLocal(when)}`
                : "No drafts could be scheduled",
            });
          }

          const accounting = accountFor(requestedCount, fetchedCount, drafts.length);
          const shortfall = shortfallNote(accounting, "were scheduled", queuedCount || okCount);
          if (isShortfall(accounting)) {
            batchShortfalls.push(
              `You asked to schedule ${accounting.requested || drafts.length} — ${queuedCount || okCount} were queued${
                accounting.deduped > 0 ? `, ${accounting.deduped} skipped as duplicates for the same person` : ""
              }${
                accounting.overCeiling > 0
                  ? `, ${accounting.overCeiling} not found among your saved drafts`
                  : ""
              }.`,
            );
          }

          return {
            from: usedFrom.join(", ") || pool[0].email,
            rotated_across: usedFrom.length,
            requested: requestedCount || drafts.length,
            attempted: results.length,
            scheduled: okCount,
            queued_for_approval: queuedCount,
            accounting,
            results,
            note: [
              queuedCount
                ? `NOTHING IS SCHEDULED — ${queuedCount} email(s) are ready to go out at the times above. Nothing is queued; the drafts are untouched. Tell them who and when, ask them to confirm, then call schedule_drafts again with confirmed: true and the same ids and time.`
                : okCount
                  ? `Queued ${okCount} email(s) rotated across ${usedFrom.join(", ")}. The scheduler sends them automatically at the times above — the user does not need to do anything. They can be cancelled with cancel_scheduled_email.`
                  : "Nothing was scheduled.",
              shortfall,
            ].filter(Boolean).join(" "),
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
            let restoreError: string | null = null;
            if (r.lead_id && r.body_text) {
              // One draft per lead is enforced by a unique index, so a plain
              // insert loses the cancelled wording whenever the lead already
              // has a draft. Clear the lead's draft first (same as
              // draft_outreach) so the cancelled copy always survives.
              await admin.from("email_drafts").delete().eq("user_id", userId).eq("lead_id", r.lead_id);
              const { error: draftErr } = await admin.from("email_drafts").insert({
                user_id: userId,
                lead_id: r.lead_id,
                subject: r.subject,
                body: r.body_text,
              });
              if (draftErr) {
                restoreError = draftErr.message;
                console.error(`[agent-chat] cancel restore-draft failed: ${draftErr.message}`);
              }
            }

            cancelled.push({
              scheduled_id: r.id,
              to: r.to_email,
              was_scheduled_for: r.scheduled_at,
              ...(restoreError ? { draft_restore_error: restoreError } : {}),
            });
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
            // The model wrote this subject and body in the chat turn.
            modelAuthored: true,
            // send_outreach was the one send path that never passed this, so in
            // approval mode it could only ever return "awaiting confirmation" —
            // the user saying "yes, send it" changed nothing and the email was
            // never delivered by this tool at all.
            confirmed: args.confirmed === true || confirmedByUser,
            allowDuplicate: args.allow_duplicate === true,
          });
          return { from: mailbox.email, ...outcome.summary, ...(outcome.result ?? {}) };
        }

        case "audit_email": {
          // Deterministic only. The rubric already buys a model's opinion; what
          // belongs here is the set of things that are simply true or false
          // about the text, so the same email always audits the same way and
          // the agent cannot talk itself out of a finding.
          // Read from the row, never from the arguments. If the model supplied
          // the company name it would be checking the copy against its own
          // memory of it, which is the thing that was wrong in the first place.
          let auditLead: { company?: string | null; contactName?: string | null } | undefined;
          if (args.lead_id) {
            const { data: leadRow } = await admin
              .from("leads")
              .select("company_name, contact_name")
              .eq("id", String(args.lead_id))
              .eq("user_id", userId)
              .maybeSingle();
            if (leadRow) {
              auditLead = { company: leadRow.company_name, contactName: leadRow.contact_name };
            }
          }
          const auditSubject = args.subject ? String(args.subject) : "";
          const auditBody = String(args.body ?? "");
          const auditPosition = typeof args.position === "number" ? args.position : undefined;
          // Both rule sets, because the quality card the user is looking at
          // shows both. An agent that audits an email and says nothing about
          // the three links in it is reporting half the answer, and the user
          // can see the other half.
          const findings = [
            ...auditEmail({
              subject: auditSubject,
              body: auditBody,
              position: auditPosition,
              verifiedProof: args.verified_proof ? String(args.verified_proof) : "",
              lead: auditLead,
            }),
            ...auditDeliverability({
              subject: auditSubject,
              body: auditBody,
              isFirstTouch: auditPosition === undefined || auditPosition === 1,
            }),
          ];
          const blockers = findings.filter((f) => f.severity === "blocker").length;
          toolEvents.push({
            name,
            label: findings.length === 0 ? "Audited — clean" : `Audited — ${findings.length} finding(s)`,
            status: blockers > 0 ? "error" : findings.length ? "queued" : "ok",
            detail: findings.length
              ? findings.map((f) => f.rule).join(", ")
              : "no rule violations",
          });
          return {
            findings,
            blockers,
            summary: auditSummary(findings),
            note:
              "Report every finding to the user in your own words, quoting the evidence. " +
              "Do not soften a blocker into a suggestion, and do not claim the email is fine when findings exist.",
          };
        }

        case "audit_sequence": {
          const sequenceId = String(args.sequence_id ?? "");
          if (!sequenceId) return { error: "sequence_id is required. Use list_sequences to find it." };
          const { data: seq } = await admin
            .from("email_sequences")
            .select("id, name")
            .eq("id", sequenceId)
            .eq("user_id", userId)
            .maybeSingle();
          if (!seq) return { error: "That sequence does not exist on this account." };

          const { data: steps, error: stepErr } = await admin
            .from("sequence_steps")
            .select("step_number, subject_template, body_template, delay_days")
            .eq("sequence_id", sequenceId)
            .order("step_number", { ascending: true });
          if (stepErr) return { error: stepErr.message };
          const rows = steps ?? [];
          if (rows.length === 0) {
            return { error: `"${seq.name}" has no steps yet, so there is nothing to audit.` };
          }

          // delay_days on a step is the wait BEFORE the next one, so the day a
          // step lands is the running total of everything before it.
          let cursor = 1;
          const withDays = rows.map((r) => {
            const row = r as Record<string, unknown>;
            const day = cursor;
            cursor += Number(row.delay_days ?? 0) || 0;
            return {
              step_number: Number(row.step_number ?? 0),
              subject_template: (row.subject_template as string) ?? "",
              body_template: (row.body_template as string) ?? "",
              day,
            };
          });

          const findings = auditSequence(withDays);
          const blockers = findings.filter((f) => f.severity === "blocker").length;
          toolEvents.push({
            name,
            label: findings.length === 0 ? `Audited "${seq.name}" — clean` : `Audited "${seq.name}" — ${findings.length} finding(s)`,
            status: blockers > 0 ? "error" : findings.length ? "queued" : "ok",
            detail: findings.length
              ? [...new Set(findings.map((f) => f.rule))].join(", ")
              : `${rows.length} step(s), no rule violations`,
          });
          return {
            sequence: seq.name,
            steps: rows.length,
            findings,
            blockers,
            summary: sequenceSummary(findings, rows.length),
            note: "Name the step number for every finding. Do not report a clean audit when findings exist.",
          };
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
          if (!autonomous && args.confirmed !== true && !confirmedByUser) {
            // No queue. Say what would happen and write nothing; the user's
            // next message decides.
            toolEvents.push({
              name,
              label: "Waiting for your go-ahead",
              status: "queued",
              detail: "Ready to enrol — nothing has run yet",
            });
            return {
              awaiting_confirmation: true,
              message:
                "Nothing ran. Tell the user exactly what you are about to do and ask them to confirm. When their next message agrees, call this tool again with confirmed: true.",
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
          // Reply bodies are written by prospects. Fenced so the model reads
          // them as evidence rather than as instructions addressed to it.
          return {
            replies: fenceRecords(
              (data ?? []) as Record<string, unknown>[],
              ["reply_content", "reply_snippet", "subject"],
              (r) => `reply from ${String(r.from_email ?? r.prospect_email ?? "a prospect")}`,
            ),
          };
        }

        case "list_sent_emails": {
          const limit = Math.min(Math.max(Number(args.limit ?? 20) || 20, 1), 50);
          const days = Math.min(Math.max(Number(args.days ?? 30) || 30, 1), 180);
          const includeBody = args.include_body !== false;
          const since = new Date(Date.now() - days * 86_400_000).toISOString();
          let q = admin
            .from("sent_emails")
            .select(
              "id, lead_id, to_email, subject, body_text, sent_at, status, open_count, last_opened_at, replied_at, gmail_thread_id, sequence_step, leads(company_name, contact_name, pipeline_stage)",
            )
            .eq("user_id", userId)
            .neq("status", "scheduled")
            .not("sent_at", "is", null)
            .gte("sent_at", since)
            .order("sent_at", { ascending: false })
            .limit(limit);
          if (args.lead_id) q = q.eq("lead_id", String(args.lead_id));
          if (args.email) q = q.ilike("to_email", `%${String(args.email)}%`);
          if (args.awaiting_reply === true) {
            // "No response" is a claim about elapsed time, not just a null
            // column. Without the quiet period every email sent in the last
            // hour came back as a follow-up candidate, and the agent, asked to
            // follow up with everyone who had not responded, wrote second
            // emails to people who had been contacted that morning.
            const quietDays = Math.min(Math.max(Number(args.quiet_for_days ?? 3) || 3, 1), 60);
            q = q
              .is("replied_at", null)
              .lte("sent_at", new Date(Date.now() - quietDays * 86_400_000).toISOString());
          }
          const { data, error } = await q;
          if (error) return { error: error.message };
          const rows = data ?? [];
          const ids = rows.map((r: any) => r.id);
          const replyMap = new Map<string, any>();
          if (ids.length) {
            const { data: replies } = await admin
              .from("reply_analysis")
              .select("sent_email_id, intent_classification, reply_content, created_at")
              .eq("user_id", userId)
              .in("sent_email_id", ids);
            for (const r of replies ?? []) replyMap.set(String((r as any).sent_email_id), r);
          }
          toolEvents.push({
            name,
            label: "Read sent inbox history",
            status: "ok",
            detail: `${rows.length} sent email${rows.length === 1 ? "" : "s"} reviewed`,
          });
          return {
            timezone: userTz,
            sent: rows.map((e: any) => {
              const reply = replyMap.get(String(e.id));
              return {
                sent_email_id: e.id,
                lead_id: e.lead_id,
                to: e.to_email,
                company: e.leads?.company_name ?? null,
                contact: e.leads?.contact_name ?? null,
                pipeline_stage: e.leads?.pipeline_stage ?? null,
                subject: e.subject,
                body: includeBody ? (e.body_text ?? null) : undefined,
                sent_at: e.sent_at,
                sent_at_local: e.sent_at ? formatLocal(new Date(e.sent_at)) : null,
                sequence_step: e.sequence_step ?? null,
                opens: e.open_count ?? 0,
                last_opened_at: e.last_opened_at,
                replied: Boolean(e.replied_at || reply),
                reply_classification: reply?.intent_classification ?? null,
                reply_snippet: reply?.reply_content ? String(reply.reply_content).slice(0, 400) : null,
                thread_id: e.gmail_thread_id ?? null,
              };
            }),
            note:
              "This is what already went out. Use get_email_thread for the full conversation, and reference the real earlier wording in any follow-up instead of guessing." +
              (args.awaiting_reply === true
                ? ` These are only the emails unanswered for at least ${Math.min(Math.max(Number(args.quiet_for_days ?? 3) || 3, 1), 60)} day(s). Anyone contacted more recently is deliberately not here and must not be followed up yet.`
                : ""),
          };
        }

        case "get_email_thread": {
          let base: any = null;
          if (args.sent_email_id) {
            const { data } = await admin
              .from("sent_emails")
              .select("id, to_email, lead_id, gmail_thread_id")
              .eq("user_id", userId)
              .eq("id", String(args.sent_email_id))
              .maybeSingle();
            base = data;
          }
          const targetEmail = base?.to_email ?? (args.email ? String(args.email) : null);
          const targetLead = base?.lead_id ?? (args.lead_id ? String(args.lead_id) : null);
          if (!targetEmail && !targetLead) {
            return { error: "Pass sent_email_id, email or lead_id. Use list_sent_emails to find one." };
          }
          let q = admin
            .from("sent_emails")
            .select(
              "id, lead_id, to_email, subject, body_text, sent_at, status, open_count, replied_at, gmail_thread_id, sequence_step",
            )
            .eq("user_id", userId)
            .order("sent_at", { ascending: true })
            .limit(50);
          q = targetEmail ? q.eq("to_email", targetEmail) : q.eq("lead_id", targetLead);
          const { data: msgs, error } = await q;
          if (error) return { error: error.message };
          const rows = msgs ?? [];
          if (!rows.length) return { messages: [], note: "No sent email found for that person yet." };
          const { data: replies } = await admin
            .from("reply_analysis")
            .select("sent_email_id, intent_classification, intent_score, reply_content, created_at")
            .eq("user_id", userId)
            .in("sent_email_id", rows.map((r: any) => r.id))
            .order("created_at", { ascending: true });
          toolEvents.push({
            name,
            label: "Read email thread",
            status: "ok",
            detail: `${rows.length} message${rows.length === 1 ? "" : "s"} with ${targetEmail ?? "lead"}`,
          });
          return {
            with: targetEmail,
            lead_id: rows[0].lead_id,
            timezone: userTz,
            messages: rows.map((e: any) => ({
              sent_email_id: e.id,
              direction: "outbound",
              subject: e.subject,
              body: e.body_text ?? null,
              sent_at: e.sent_at,
              sent_at_local: e.sent_at ? formatLocal(new Date(e.sent_at)) : null,
              status: e.status,
              opens: e.open_count ?? 0,
              sequence_step: e.sequence_step ?? null,
            })),
            // Outbound messages above are the account's own words. These came
            // from the other side of the conversation, so they are fenced.
            replies: (replies ?? []).map((r: any) => ({
              direction: "inbound",
              in_reply_to: r.sent_email_id,
              classification: r.intent_classification,
              intent_score: r.intent_score,
              body: r.reply_content
                ? fence(`reply from ${targetEmail ?? "the prospect"}`, r.reply_content)
                : null,
              received_at: r.created_at,
            })),
          };
        }



        case "update_lead": {
          const update: Record<string, unknown> = {};
          if (args.pipeline_stage) {
            const stage = String(args.pipeline_stage);
            if (!PIPELINE_STAGES.includes(stage as typeof PIPELINE_STAGES[number])) {
              return { error: `Unsupported pipeline stage. Use one of: ${PIPELINE_STAGES.join(", ")}` };
            }
            update.pipeline_stage = stage;
          }
          if (args.notes) update.notes = String(args.notes);
          for (const f of LEAD_FIX_FIELDS) {
            if (typeof args[f] === "string") update[f] = String(args[f]).trim() || null;
          }
          if (typeof update.contact_email === "string" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(update.contact_email as string)) {
            return { error: "That email address is not valid" };
          }
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

        case "find_lead_issues": {
          const cap = Math.min(Math.max(Number(args.limit) || 50, 1), 200);
          const { data: rows, error } = await admin
            .from("leads")
            .select("id, contact_name, contact_email, company_name, pipeline_stage, updated_at")
            .eq("user_id", userId)
            .limit(5000);
          if (error) return { error: error.message };
          const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          const missingEmail: string[] = [], badEmail: string[] = [], noName: string[] = [], noCompany: string[] = [], stale: string[] = [];
          const byEmail = new Map<string, string[]>();
          const staleCut = Date.now() - 30 * 86400000;
          for (const r of rows ?? []) {
            const e = (r.contact_email ?? "").trim().toLowerCase();
            if (!e) missingEmail.push(r.id);
            else if (!emailRe.test(e)) badEmail.push(r.id);
            else byEmail.set(e, [...(byEmail.get(e) ?? []), r.id]);
            if (!(r.contact_name ?? "").trim()) noName.push(r.id);
            if (!(r.company_name ?? "").trim()) noCompany.push(r.id);
            if (r.pipeline_stage && !["won", "lost"].includes(String(r.pipeline_stage)) && new Date(r.updated_at).getTime() < staleCut) stale.push(r.id);
          }
          const duplicates = [...byEmail.entries()].filter(([, ids]) => ids.length > 1).map(([email, ids]) => ({ email, lead_ids: ids }));
          const total = missingEmail.length + badEmail.length + noName.length + noCompany.length + duplicates.length + stale.length;
          toolEvents.push({ name, label: "Checked CRM records", status: "ok", detail: `${total} issues across ${rows?.length ?? 0} leads` });
          return {
            leads_checked: rows?.length ?? 0,
            missing_email: { count: missingEmail.length, lead_ids: missingEmail.slice(0, cap) },
            invalid_email: { count: badEmail.length, lead_ids: badEmail.slice(0, cap) },
            missing_contact_name: { count: noName.length, lead_ids: noName.slice(0, cap) },
            missing_company: { count: noCompany.length, lead_ids: noCompany.slice(0, cap) },
            duplicate_emails: { count: duplicates.length, groups: duplicates.slice(0, cap) },
            stale_over_30_days: { count: stale.length, lead_ids: stale.slice(0, cap) },
          };
        }

        case "list_deals": {
          let q = admin
            .from("deals")
            .select("id, title, company_name, contact_name, value, stage, probability, expected_close_date, lead_id, notes, updated_at")
            .eq("user_id", userId)
            .order("updated_at", { ascending: false })
            .limit(Math.min(Math.max(Number(args.limit) || 50, 1), 200));
          if (args.stage) q = q.eq("stage", String(args.stage));
          const { data, error } = await q;
          if (error) return { error: error.message };
          toolEvents.push({ name, label: "Read pipeline", status: "ok", detail: `${data?.length ?? 0} deals` });
          return { deals: data ?? [] };
        }

        case "create_deal":
        case "update_deal": {
          const row: Record<string, unknown> = {};
          for (const f of DEAL_FIELDS) if (args[f] !== undefined && args[f] !== null && args[f] !== "") row[f] = args[f];
          if (row.stage && !DEAL_STAGES.includes(String(row.stage) as typeof DEAL_STAGES[number])) {
            return { error: `Unsupported deal stage. Use one of: ${DEAL_STAGES.join(", ")}` };
          }
          if (row.probability !== undefined) row.probability = Math.min(100, Math.max(0, Math.round(Number(row.probability))));
          if (row.value !== undefined) row.value = Number(row.value);
          if (row.lead_id) {
            const { data: own } = await admin.from("leads").select("id").eq("id", String(row.lead_id)).eq("user_id", userId).maybeSingle();
            if (!own) return { error: "That lead is not in this account" };
          }
          let res;
          if (name === "create_deal") {
            if (!row.title || !row.company_name) return { error: "title and company_name are required" };
            res = await admin.from("deals").insert({ ...row, user_id: userId }).select("id, title, stage").single();
          } else {
            delete row.deal_id;
            if (!Object.keys(row).length) return { error: "Nothing to update" };
            res = await admin.from("deals").update(row).eq("id", String(args.deal_id ?? "")).eq("user_id", userId).select("id, title, stage").maybeSingle();
            if (!res.error && !res.data) return { error: "Deal not found" };
          }
          toolEvents.push({
            name,
            label: res.error ? "Deal change failed" : name === "create_deal" ? "Created deal" : "Updated deal",
            status: res.error ? "error" : "ok",
            detail: res.error ? res.error.message : `${res.data?.title ?? ""}`,
          });
          return res.error ? { error: res.error.message } : { success: true, deal: res.data };
        }

        case "delete_deal": {
          const { data, error } = await admin.from("deals").delete().eq("id", String(args.deal_id ?? "")).eq("user_id", userId).select("id, title");
          if (!error && !data?.length) return { error: "Deal not found" };
          toolEvents.push({ name, label: error ? "Delete failed" : "Deleted deal", status: error ? "error" : "ok", detail: error ? error.message : data?.[0]?.title ?? "" });
          return error ? { error: error.message } : { success: true };
        }

        case "get_agent_status": {

          const since = new Date();
          since.setHours(0, 0, 0, 0);
          const [{ count: pending }, { data: todayActions }] = await Promise.all([
            // Drafts are the pending state now that there is no queue.
            admin
              .from("email_drafts")
              .select("id", { count: "exact", head: true })
              .eq("user_id", userId),
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

        case "search_companies": {
          const raw = [
            ...(typeof args.query === "string" ? [args.query] : []),
            ...(Array.isArray(args.queries) ? args.queries : []),
          ]
            .map((q: any) => String(q ?? "").trim())
            .filter((q) => q.length >= 2);
          const queries = [...new Set(raw)].slice(0, 5);
          if (!queries.length) {
            toolEvents.push({ name, label: "Company search", status: "error", detail: "no query" });
            return { error: "Give a company name or keyword of at least 2 characters." };
          }
          const results = await Promise.all(
            queries.map(async (q) => {
              const res = await invokeFn("search-companies", { query: q });
              const companies = Array.isArray(res?.companies) ? res.companies : [];
              return { query: q, companies, error: res?.error ?? undefined };
            }),
          );
          const total = results.reduce((n, r) => n + r.companies.length, 0);
          toolEvents.push({
            name,
            label: "Searched companies",
            status: total ? "ok" : "error",
            detail: total
              ? `${total} match${total === 1 ? "" : "es"} for ${queries.join(", ")}`
              : `no matches for ${queries.join(", ")}`,
          });
          return {
            results,
            note: total
              ? "These are target accounts only — no people were saved. To prospect contacts at one of them, call find_leads with the company name or domain in the query."
              : "No companies matched. Try a shorter or differently spelled name.",
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
          if (!autonomous && args.confirmed !== true && !confirmedByUser) {
            // No queue. Say what would happen and write nothing; the user's
            // next message decides.
            toolEvents.push({
              name,
              label: "Waiting for your go-ahead",
              status: "queued",
              detail: "Ready to run the full agent — nothing has run yet",
            });
            return {
              awaiting_confirmation: true,
              message:
                "Nothing ran. Tell the user exactly what you are about to do and ask them to confirm. When their next message agrees, call this tool again with confirmed: true.",
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

${scopeNote}
TOOLS AVAILABLE TO YOU: ${allowedTools.join(", ")}. You have no other capabilities on this account. Never promise or claim work you have no tool for.

You can take real action on the user's account using your tools: reading their leads, enriching and scoring them, drafting cold emails and 4-touch sequences, sending outreach now or scheduling it for a future date/time, cancelling scheduled sends, enrolling leads in sequences, reviewing replies, and triggering a full agent run.

CURRENT TIME: ${formatLocal(new Date())} — the user's local time. In UTC that is ${new Date().toISOString()}. Every time the user mentions ("9am today", "tomorrow morning", "Monday") is in THEIR timezone (${userTz}), never UTC. Resolve relative times against their local time.
CALENDAR (never compute a weekday-to-date mapping yourself, read it here): ${upcomingCalendar()}. When you name a day in your reply, the day name and the date MUST match this list. If the user names a weekday that is today and the hour has already passed, say so and offer the next occurrence rather than silently choosing a later day.

HOW TO WORK
- When the user says something like "I just searched some leads, take it from here", find the relevant leads with list_leads first, then chain the work: enrich -> score -> draft -> send/queue. Do not ask permission for read-only or drafting steps; just do them and report back.
- DRAFTING FOR A GROUP: call list_leads once with the filters that match what the user actually asked for, then pass EVERY id it returns to draft_outreach in ONE call. Always include without_draft: true — without it you get the same leads back on every pass and redraft work that is already done, which is how a request for eighty-two drafts produced twenty. draft_outreach skips any lead that already has a draft regardless, so a repeat call is wasted, not additive.
- SCOPE THAT CALL TO WHAT THEY ASKED FOR. The set you pass to list_leads is the set this turn commits to finishing, so a filter you leave off is work the user never requested. "No-response leads", "everyone who never replied", "people I haven't heard back from" all mean awaiting_reply: true — they do NOT mean every lead without a draft. Asked for eighty-six no-response leads and given only without_draft, you return one hundred and five, because without_draft includes everyone who has never been contacted at all. Those people cannot be followed up with; they have heard nothing from this user.
- NEVER COUNT DRAFTS YOURSELF. Do not add this call's result to something you said earlier and report the sum, and do not subtract your running total from the list size to get a "remaining" figure. Queued is not drafted YET, but it is not outstanding either: a worker is drafting those leads right now and they need nothing from you or the user. So they are never "remaining", "left to draft", "still to do" or "not started", and you must never close a turn by offering to continue, resume or pick up leads that are already queued — the user who waits for that offer waits for a batch that was never stopped. The only two numbers you may quote are drafted_this_call from draft_outreach and remaining_without_draft from list_leads, called with the same filters you drafted against. If you want a current total, call list_leads and read it — it costs one call and it is the number the user sees in their drafts folder.
- When a tool comes back with an error, say what the error was and stop. Do not call it again with the same arguments, and do not describe the attempt as progress.
- Do several tool calls in a row when needed. Prefer batching lead ids over one-at-a-time calls. For drafting, ALWAYS pass every lead id in a single draft_outreach call via lead_ids — never fire many parallel draft_outreach calls, that trips the rate limiter.
- NEVER write, rewrite or "improve" email copy yourself in the chat. Every email the user sees must come from draft_outreach, which runs the playbook, the banned-phrase list, the proof rules and the quality rubric. When the user dislikes a draft ("redraft this", "too salesy", "make it shorter"), call draft_outreach again for that lead with feedback set to what they said — it replaces the draft. Copy you compose by hand is checked by nothing and reads like generic marketing, which is the single most common complaint about this product.
- NEVER invent proof. No case studies, no "one company saw a significant increase", no anonymized customer stories, no metrics — not even vague ones — unless the exact proof was given to you in the lead data or by the user. An invented result is worse than no result.

${agentProhibitions(profile?.full_name)}
- draft_outreach goal must be one of: introduction, follow-up, meeting, demo, proposal. Use "introduction" for first touches.
- INBOX HISTORY: before drafting a follow-up, replying, or claiming someone has or hasn't been contacted, read what already went out — list_sent_emails (use awaiting_reply: true for follow-up candidates, lead_id/email to narrow) and get_email_thread for the full conversation. Follow-ups must reference the real earlier email's angle and timing; never guess at what was sent and never repeat the same pitch.

- Drafts are auto-saved and rendered in the chat as read-only preview cards. There are no buttons anywhere in this chat — everything happens through messages. After drafting, tell the user the drafts are below for review and ask them to reply when they want them sent or scheduled.
- QUALITY: send_outreach scores anything you wrote yourself before it goes out. If it answers needs_rewrite, the email was NOT sent: rewrite it against the feedback it returned and call send_outreach again with the new subject and body. Do not re-send the same text, do not tell the user it went out, and do not work around the check by saving it as a draft and sending that instead. If it answers with unfilled placeholders, fill in the real values and call again.
- SENDING: when the user approves the drafts ("send them", "all good, send"), YOU send them — call send_drafts. You never need the subject or body to send a saved draft, only draft ids: use the draft_ids from your draft_outreach results, or call list_drafts (optionally with lead_ids or a name) to look them up again. Pass from_email when the user names one inbox, or from_emails to rotate across several. When they do not name one, leave both off: sends automatically rotate across every healthy connected mailbox (least-used domain first), which is what you want for outbound volume. Use list_mailboxes if you need to know which addresses are connected, and never claim you can only send from one domain. Never tell the user to click "Send now" themselves or to open another page, and never claim you lack the lead ids or draft contents — look them up with list_drafts instead.
- REVIEWING COPY: when the user pastes an email and asks what is wrong with it, asks you to review or improve copy, or asks why a sequence gets no replies, call audit_email (or audit_sequence for a whole sequence) FIRST and answer from what it returns. Do not give copywriting opinions in place of it — the audit checks unfilled merge fields, unbacked result claims, banned openers, length, the one-call-to-action rule and whether a named trigger is bridged to a real problem, and it is the same check the generator is held to. Report every finding with its evidence, never soften a blocker into a suggestion, and never call an email fine when the audit returned findings. You may add judgement on top of the findings; you may not replace them with it.
- REPEATS: a send refused with code duplicate_send means that person already received that exact subject line within the last two weeks. This is NOT a problem with the draft and it is NOT something drafting can fix. Deleting the drafts and generating new ones does not clear it — the block is on the sent history, not on the drafts — so never offer that. Say who already got what and when, then offer exactly two things: write a follow-up on a genuinely new angle with a new subject (call draft_outreach again with feedback describing the new angle), or resend the same email deliberately (call the send tool again with allow_duplicate: true, but only after the user has said in their own words to send it again anyway).
- SCHEDULING: you CAN send later. When the user asks for a future send ("tomorrow at 9", "Monday morning", "next week"), call schedule_drafts with the draft_ids and send_at_local set to their local wall-clock time with no offset (e.g. "9am today" -> send_at_local: "YYYY-MM-DDT09:00" for today's local date). Never convert to UTC yourself and never pass a bare UTC timestamp for a local time — the tool does the conversion. Use stagger_minutes when queuing several so they don't all fire at once. Confirm the exact date/time you queued, and mention it sends automatically. Use list_scheduled_emails to show what is queued and cancel_scheduled_email to call one back. Never say you cannot schedule and never tell the user to use the Schedule button themselves.
- DELETING: you CAN delete emails AND lead records. Use delete_drafts to remove saved drafts (by draft_ids, lead_ids, or all_pending), delete_inbox_threads to remove inbox conversations (by thread_ids or match_email), and delete_leads to permanently remove saved lead records (by lead_ids, match_company or match_name — it also clears any drafts attached to them). Deletion is permanent, so only do it when the user asks, confirm briefly what you are about to delete if the request is broad ("delete all my drafts", "delete all my leads"), then do it and report the count. Never say you lack a way to delete leads and never tell the user to delete things manually in the UI.
- Treat the newest real user message as the current job. Never resume or repeat an older run merely because it appears in conversation history. Only continue an older job when the newest user message explicitly says to continue it.
- A successful mutation is final. Do not call the same delete, send, schedule, enroll, or run tool again in the same request. If a tool reports zero matches after an earlier successful deletion, do not claim the earlier deletion failed.
- Use send_outreach only for a brand new email you just wrote in the conversation and have not saved as a draft.
- To identify or verify target COMPANIES (accounts), use search_companies — it returns company name, domain, location and size and saves nothing. Use it when the user asks about companies rather than people, or to resolve a company name/domain before prospecting; then pass that company into find_leads to source contacts there.
- To source NEW people, use find_leads. If the user describes who they want (any role, industry, company type, or a one-off ask that is not the ICP), pass that description as \`query\` and the search runs broad on it, using the saved ICP only to score/qualify the results. If they just say "find more leads" or "source from my ICP" with no specific target, omit \`query\` to source people matching the saved ICP. It excludes anyone already in the account and advances the result page, so calling it again returns different people. Do not refuse or narrow an off-ICP request; run it as a query and let the ICP score it. Only say you cannot search if there is neither a query nor a saved ICP.
- Never invent leads, metrics, emails or results. Only report what the tools returned.
- NUMBERS THE USER CANNOT BACK ARE FORBIDDEN. Never put a percentage, multiplier ("3x"), dollar amount, customer/team count, time saving, or "doubled/tripled" claim into an email, a subject line, or a message unless the exact figure came from the user's own business context, a saved proof point, or a tool result. No hedged versions ("up to 80%", "most teams see"). If you have no verified figure, write the point with no quantity at all. If a draft comes back rejected for an invented figure, say so plainly and ask the user for a real proof point instead of regenerating the same claim.
- Never sign an email with a stand-in identity ("Sender Name", "Your Name", "Your Company"). Use the sender's real name and company, and if you do not have them, say so instead of guessing.
- Do exactly what was asked, on the records named. No extra steps, no assumed intent, no substituted scope. If the request is ambiguous, ask one short question rather than guessing.
- Be concise and specific. Short paragraphs, tight bullet lists, real numbers and names. No emojis, no filler.

AUTONOMY
This conversation is in ${autonomous ? "FULL AUTONOMY mode: sending, scheduling, enrolling and full agent runs execute immediately." : "APPROVAL mode. There is no approval queue and no buttons — approval is a message in this chat.\n\nHow it works: call the tool WITHOUT confirmed. It sends nothing, changes nothing and stores nothing; it hands back exactly what would go out. Show that to the user in plain language — how many, to whom, from which mailbox, at what time if scheduled — and then STOP and wait.\n\nWhen their next message agrees ('yes', 'send it', 'go ahead', 'do it'), call the SAME tool again with confirmed: true and the same ids. That is the send. Report what actually came back.\n\nWhen they decline, do nothing and say so — there is nothing to cancel, because nothing was ever queued. The drafts simply stay drafts.\n\nNever set confirmed on a first call. Never carry it from one batch to the next: agreement to send twelve is not agreement to send the twelve after them. Never tell the user to click something or visit another page."}

${autonomous ? "" : "If the user asks you to just get on with it without approving each step, tell them they can switch this conversation to full autonomy with the mode selector at the top of the chat."}

${UNTRUSTED_CONTENT_RULE}

COLD EMAIL RULES (apply to every draft you write or review)
${playbookEnforcementRules()}

Company context: ${config?.company_context ?? "not set"}
Value props: ${(config?.value_props ?? []).join("; ") || "not set"}

${icpContext || "No ICP profile is saved yet, so there is nothing to score results against. You can still source leads when the user names who they want (pass it as find_leads query), but suggest they save an ICP on the ICP page so results get qualified. Do not invent an ICP of your own."}`;

    // Role/custom-build scope, applied to the PROMPT as well as the catalog.
    // The how-to bullets below describe sending, scheduling and deleting in
    // detail; if an agent cannot do those things, seeing those bullets makes it
    // offer the work anyway ("no drafts to send — what would you like to do?").
    // Strip every instruction whose tools this build does not have.
    const SCOPE_GATED_PREFIXES: Array<{ marker: string; tools: string[] }> = [
      { marker: "You can take real action", tools: [] },
      { marker: "- When the user says something like", tools: ["draft_outreach"] },
      { marker: "- NEVER write, rewrite", tools: ["draft_outreach"] },
      { marker: "- draft_outreach goal", tools: ["draft_outreach"] },
      { marker: "- Drafts are auto-saved", tools: ["draft_outreach"] },
      { marker: "- INBOX HISTORY:", tools: ["list_sent_emails", "get_email_thread"] },
      { marker: "- QUALITY:", tools: ["send_outreach"] },
      { marker: "- SENDING:", tools: ["send_drafts", "send_outreach"] },
      { marker: "- REVIEWING COPY:", tools: ["audit_email"] },
      { marker: "- REPEATS:", tools: ["send_drafts", "send_outreach"] },
      { marker: "- SCHEDULING:", tools: ["schedule_drafts"] },
      { marker: "- DELETING:", tools: ["delete_drafts", "delete_leads", "delete_inbox_threads"] },
      { marker: "- Use send_outreach only", tools: ["send_outreach"] },
      { marker: "- To identify or verify target COMPANIES", tools: ["search_companies"] },
      { marker: "- To source NEW people", tools: ["find_leads"] },
      { marker: "COLD EMAIL RULES", tools: ["draft_outreach", "send_outreach"] },
    ];
    const capabilityLine = (() => {
      const bits: string[] = ["reading the user's leads and account status"];
      if (allowedTools.includes("find_leads") || allowedTools.includes("search_companies")) bits.push("sourcing new leads and companies");
      if (allowedTools.includes("enrich_leads") || allowedTools.includes("score_leads") || allowedTools.includes("research_leads")) bits.push("enriching, researching and scoring leads");
      if (allowedTools.includes("draft_outreach") || allowedTools.includes("draft_sequence")) bits.push("drafting cold emails and sequences");
      if (allowedTools.includes("send_drafts") || allowedTools.includes("send_outreach")) bits.push("sending outreach");
      if (allowedTools.includes("schedule_drafts")) bits.push("scheduling sends for later");
      if (allowedTools.includes("list_recent_replies")) bits.push("reviewing inbound replies");
      if (allowedTools.includes("list_sent_emails") || allowedTools.includes("get_email_thread")) bits.push("reading the inbox history of email already sent");
      if (allowedTools.includes("run_full_agent")) bits.push("triggering a full agent run");
      return `On this account you can do exactly this and nothing more: ${bits.join(", ")}.`;
    })();
    const scopedSystemPrompt = systemPrompt
      .split("\n")
      .map((line) => {
        if (line.startsWith("You can take real action")) return capabilityLine;
        return line;
      })
      .filter((line) => {
        const rule = SCOPE_GATED_PREFIXES.find((r) => r.marker !== "You can take real action" && line.startsWith(r.marker));
        if (!rule) return true;
        return rule.tools.some((t) => allowedTools.includes(t));
      })
      .join("\n") +
      `\n\nHARD SCOPE LIMIT (overrides everything above)\nYour only tools are: ${allowedTools.join(", ")}.\nIf the user asks for anything that would need another tool — sending, scheduling, drafting, deleting, sourcing, enrolling, running the agent — do NOT attempt it, do NOT ask them what they would like you to send/do instead, and do NOT list options for that work. Reply in one or two sentences: state that this build (${config?.agent_name ?? "this agent"}) is not scoped to that, name what it is scoped to, and tell them to switch agents with the selector at the top of the chat. Never imply the work is merely blocked by missing drafts, approvals or data.`;

    /**
     * Past turns, with the evidence attached.
     *
     * History used to replay as plain text, so the agent's own past assertions
     * arrived indistinguishable from things that actually happened. A claim it
     * made falsely on Tuesday was in Wednesday's context as established
     * history, and it reasoned from it — the model reinforcing its own
     * hallucination one turn later.
     *
     * Now every assistant message carries a one-line record of what its tools
     * actually did. Where the words and the record disagree, the record is
     * right there next to them.
     */
    const evidenceFor = (m: { role: string; content: string; tool_events?: unknown }) => {
      if (m.role !== "assistant") return null;
      const events = Array.isArray(m.tool_events) ? (m.tool_events as ToolEvent[]) : [];
      if (events.length === 0) return null;
      return events
        .map((e) => `${e.name ?? "tool"}: ${e.status ?? "?"}${e.detail ? ` — ${e.detail}` : ""}`)
        .slice(-12)
        .join("; ");
    };

    /**
     * The evidence goes in its own turn, not appended to the assistant message.
     *
     * Appending it made the annotation part of the assistant's own voice in the
     * transcript, and the model started reproducing the format in new replies —
     * writing a "[what actually ran…]" line of its own invention underneath a
     * summary. An annotation the model can copy is worse than none: it looks
     * exactly like the verified record while being another sentence it made up.
     *
     * As a separate non-assistant turn it is plainly something the system said
     * about the previous turn, which is what it is.
     */
    const replayWithEvidence = (messages: typeof history) => {
      const out: { role: string; content: string }[] = [];
      for (const m of messages) {
        out.push({ role: m.role, content: m.content });
        const evidence = evidenceFor(m);
        if (evidence) {
          out.push({
            role: "user",
            content: `[system record, not from the user — what the tools actually did on that turn: ${evidence}. Where your reply above disagrees with this, this is what happened. Never write a line like this yourself.]`,
          });
        }
      }
      return out;
    };

    const messages: any[] = [
      { role: "system", content: scopedSystemPrompt },
      ...replayWithEvidence(history),
      ...(autoContinue
        ? [{
            role: "user",
            content: `Continue only the unfinished parts of the newest request. Do not repeat completed work and do not return to older requests. Completed mutation keys for this request: ${
              completedMutationKeys.size ? [...completedMutationKeys].join("; ") : "none"
            }. Recent completed actions: ${JSON.stringify(
              history
                .slice(-4)
                .flatMap((message: any) => Array.isArray(message.tool_events) ? message.tool_events : [])
                .filter((event: any) => event?.status === "ok" || event?.status === "queued")
                .map((event: any) => `${event.name}: ${event.detail}`)
                .slice(-12),
            )}. If the newest request is already complete, summarize the verified result and stop without calling tools.`,
          }]
        : []),

    ];

    /*
     * Pick up where the last attempt died, if it left a step behind.
     *
     * A turn is up to eight model steps and nothing recorded them, so a worker
     * restart threw away every search, enrichment and draft the turn had
     * already paid for and the user began again from their first sentence.
     * Each completed step now stores the working message array, so resuming is
     * a continuation rather than a replay.
     *
     * resumeFrom refuses anything it cannot trust — no row, an empty array, a
     * step past the ceiling — and starting over is the answer in those cases.
     * A turn that resumes into a half-remembered conversation behaves strangely
     * and cannot be explained afterwards, which is worse than repeating work.
     */
    const trace = supabaseTraceStore(admin);
    let resumeAt = 0;
    /*
     * What this turn has spent, across every step and every resume.
     *
     * outOfTime() was the only ceiling, and a resumed turn restarts its clock
     * while its spend carries on — so a turn could loop through a restart and
     * pay for the whole thing twice with nothing to stop it.
     */
    const tokenBudget = turnTokenBudget(Deno.env.get("AGENT_TURN_TOKEN_BUDGET"));
    let tokensUsed = 0;
    let stoppedOnBudget = false;
    try {
      const resumed = resumeFrom(await trace.latestStep(threadId, runPass), MAX_TURN_STEPS);
      if (resumed) {
        messages.length = 0;
        messages.push(...(resumed.messages as any[]));
        resumeAt = resumed.nextStep;
        tokensUsed = carriedTokens(resumed.usage);
        console.log(
          `[agent-chat] resuming thread ${threadId} pass ${runPass} at step ${resumeAt}, ${tokensUsed} tokens already spent`,
        );
      }
      // What already ran, from the client's list and from what actually
      // completed. Neither survives everything on its own.
      for (const key of mergeCompleted(payload.completedMutationKeys, await trace.listMutations(threadId))) {
        completedMutationKeys.add(key);
      }
    } catch (e) {
      console.warn(`[agent-chat] trace unavailable, starting fresh: ${e instanceof Error ? e.message : e}`);
    }

    let finalText = "";
    let ranOutOfTime = false;
    // Never lose completed tool work: when the model call fails we stop the loop
    // and still persist an assistant message describing what happened.
    let failureNote = "";
    /** One self-correction per turn. See the empty-turn check in the loop. */
    let retriedEmptyTurn = false;

    /**
     * How many steps get a reasoning budget.
     *
     * Almost every turn resolves in one or two tool rounds; by step five the
     * model is summarising rather than deciding. Spending reasoning on the
     * early steps buys the decisions and skips the write-up.
     */
    const REASONING_STEPS = 5;

    for (let step = resumeAt; step < MAX_TURN_STEPS; step++) {
      /*
       * Checked before the call, not after: knowing the budget is gone once
       * the money is spent is a report, not a limit.
       */
      if (budgetExhausted(tokensUsed, tokenBudget)) {
        stoppedOnBudget = true;
        console.warn(`[agent-chat] turn stopped on budget: ${tokensUsed}/${tokenBudget} tokens`);
        break;
      }
      if (outOfTime()) {
        ranOutOfTime = true;
        break;
      }
      if (await cancelRequested()) break;

      /*
       * Shed what this turn has finished with, before paying to send it again.
       *
       * Nothing ever removed anything from this array, so a turn that listed a
       * hundred leads carried that payload into every later step — paid for on
       * each call, and slower on each call, on a function with a 110-second
       * ceiling. The tools that act later read their records back by id, so
       * the raw payload is weight rather than context.
       *
       * In place, so the step the trace stores for a resume is the pruned one
       * and a restart does not re-inflate it. The full result is still in the
       * trace's own tool_results column for anyone reading back.
       */
      const pruned = pruneTurnContext(messages);
      if (pruned.prunedCount > 0) {
        console.log(
          `[agent-chat] pruned ${pruned.prunedCount} stale tool result(s): ` +
            `${pruned.tokensBefore} -> ${pruned.tokensAfter} tokens`,
        );
      }

      let res: Response;
      try {
        res = await aiFetch("agent-chat", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "openai/gpt-5.6-sol",
            // Reasoning was pinned to "none" on every call, including the ones
            // that decide which of forty tools to run, on which records, in
            // which order. A model that cannot think before acting
            // pattern-matches on the prompt instead — which is most of what
            // "it assumed" and "it did something I didn't ask for" looked like.
            //
            // The last step of a turn is usually just writing up work that is
            // already done, and that genuinely does not need reasoning. So the
            // budget goes where decisions are made and nowhere else.
            reasoning_effort: step >= REASONING_STEPS ? "none" : "low",
            messages,
            tools: scopedTools,
            // Require the checker when the user asked for copy to be checked.
            //
            // The prompt already says "call audit_email FIRST and answer from
            // what it returns. Do not give copywriting opinions in place of
            // it." Asked twice to audit the same email, with the tool in scope
            // and that line in context, it answered from the skills instead —
            // six bullets, then seven, which a deterministic checker cannot do,
            // and one of them quoted a 75-word ceiling that exists in a skill
            // file and nowhere in the rules.
            //
            // So the request shape decides, not the model. Only on the first
            // step, and only when the tool is in scope: afterwards it is back
            // to auto so the turn can go on to redraft, send or anything else.
            ...(step === 0 && forceAudit
              ? { tool_choice: { type: "function", function: { name: "audit_email" } } }
              : {}),
          }),
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
        let upstreamMessage = "";
        try {
          const parsed = JSON.parse(detail);
          upstreamMessage = parsed?.error?.message ?? parsed?.message ?? "";
        } catch {
          upstreamMessage = "";
        }
        const blockedNote = upstreamMessage
          ? `AI access is blocked: ${upstreamMessage}`
          : "AI access is blocked — the workspace AI credit limit was reached or Lovable AI is turned off. Raise the limit or add credits, then reply \"continue\".";
        failureNote =
          res.status === 429
            ? "I'm being rate limited right now. Any work above is saved — wait a few seconds and reply \"continue\"."
            : res.status === 402
              ? "AI credits are exhausted, so I can't continue this turn. Add credits in Settings and reply \"continue\"."
              : res.status === 403
                ? `${blockedNote} Any work above is saved.`
                : `The AI service returned an error (${res.status}${upstreamMessage ? `: ${upstreamMessage}` : ""}), so I stopped here. Any work above is saved — reply "continue" to retry.`;
        break;
      }

      // Track AI gateway usage for the workspace and alert admins at thresholds.
      // Fire-and-forget so the agent loop isn't blocked.
      void (async () => {
        try {
          await admin.rpc("increment_ai_gateway_usage", { p_credits: 1 });
          await admin.rpc("check_ai_gateway_usage_alert");
        } catch (e) {
          console.error("AI gateway usage tracking failed", e);
        }
      })();

      const data = await res.json();
      // Counted here, where the cost is actually incurred, so the check at the
      // top of the next step is looking at a real number.
      tokensUsed += tokensIn(data?.usage);
      const choice = data.choices?.[0]?.message;
      if (!choice) break;
      messages.push(choice);

      const calls = choice.tool_calls ?? [];
      if (!calls.length) {
        finalText = choice.content ?? "";

        // The turn ended with a summary and no work.
        //
        // A user asked for 21 emails to be scheduled and got back a confident
        // schedule with times and a stagger. schedule_drafts was never called,
        // and the drafts were still sitting in the drafts folder — which
        // scheduling deletes on success, so nothing had happened at all.
        //
        // Reporting that afterwards is worth doing and is not enough. Given a
        // turn that changed nothing while claiming otherwise, the model gets
        // exactly one chance to actually do the thing, or to say plainly that
        // it cannot. Once, because a model that will not act on the second ask
        // will not act on the fifth, and looping burns the user's budget to
        // arrive at the same place.
        //
        // The same turn fails the other way round too, and more often: the
        // model answers "Redrafting Den clean now, then sending all 4. One
        // moment.", calls nothing, and stops. No past-tense marker to catch,
        // so the check above never sees it — and the user sits watching a
        // promise, then has to send another message to restart work the agent
        // already said it was doing.
        const claimedDone = emptyTurnWarning(finalText, toolEvents);
        const promisedWork = claimedDone ? "" : statedIntentWithoutAction(finalText, toolEvents);
        if (!retriedEmptyTurn && (claimedDone || promisedWork) && step < MAX_TURN_STEPS - 1 && !outOfTime()) {
          retriedEmptyTurn = true;
          console.warn(
            promisedWork
              ? "[agent-chat] turn promised work and called nothing — continuing it once"
              : "[agent-chat] empty turn claimed completion — asking once for the work",
          );
          messages.push({
            role: "user",
            content: promisedWork
              ? "[system check, not from the user] You said you were starting that work, and then the turn ended without calling any tool, so nothing happened and the user is still waiting. " +
                "Do it now: call the tool that does it. " +
                "If you cannot — a record is missing, a limit is in the way, or you need the user to decide something — say exactly that in one or two sentences instead. " +
                "Do not say you are about to start, and do not promise it again."
              : "[system check, not from the user] Your reply says the work is done, but you called no tool that changes anything, so nothing happened. " +
                "If the user asked you to do something, call the tool that does it now. " +
                "If you cannot — the build is not scoped for it, a record is missing, a limit is in the way — say that plainly in one or two sentences. " +
                "Do not restate the summary you just wrote, and do not describe the work as complete.",
          });
          continue;
        }
        break;
      }

      // Read-only tools are cheap and provider-free, so run them concurrently.
      // Anything that writes, sends or hits an external provider stays serial so
      // we don't trip rate limiters or double-send.
      const runOne = async (call: any) => {
        const toolName = call.function?.name ?? "";
        /*
         * Arguments that will not parse are not no arguments.
         *
         * This swallowed the error and ran the tool with {}, which for a tool
         * whose parameters are all filters means no filters: list_leads with
         * an unparseable body returned every lead on the account, and the
         * model had no idea its call had been mangled.
         */
        let args: Record<string, any> = {};
        const rawArguments = call.function?.arguments;
        if (rawArguments !== undefined && rawArguments !== null && String(rawArguments).trim() !== "") {
          try {
            const parsed = JSON.parse(String(rawArguments));
            if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
              throw new Error("not an object");
            }
            args = parsed;
          } catch {
            console.warn(`[agent-chat] ${toolName} sent arguments that do not parse as JSON`);
            return {
              role: "tool",
              tool_call_id: call.id,
              content: JSON.stringify(
                invalidArgsResult(toolName, ["arguments were not valid JSON for an object"]),
              ),
            };
          }
        }
        const mutationKey = mutationKeyFor(toolName, args);
        if (mutationKey && completedMutationKeys.has(mutationKey)) {
          return {
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify({
              already_completed: true,
              note: "This exact action already succeeded during this request. Do not run it again; continue only unfinished work.",
            }),
          };
        }
        if (!autonomous && MUTATING_TOOLS.has(toolName)) {
          console.log("approval-mode mutating tool", toolName);
        }
        let result: unknown;
        const startedAt = Date.now();
        let stepStatus = "success";
        let stepDetail: string | null = null;
        try {
          result = await runTool(toolName, args);
          if (mutationKey && didMutate(result)) {
            completedMutationKeys.add(mutationKey);
            /*
             * And on disk, because the in-memory Set dies with the worker.
             *
             * This is the guard that stops a send going twice. It was exactly
             * right for one request and worth nothing across the restart that
             * causes a resume — which is the moment a repeat is most likely.
             */
            void trace.saveMutation(threadId, userId, mutationKey, toolName).catch((e) =>
              console.warn(`[agent-chat] completed mutation not recorded: ${e instanceof Error ? e.message : e}`)
            );
          }
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
        const stepRow = {
          tool_name: toolName || "unknown",
          step_type: PARALLEL_SAFE_TOOLS.has(toolName) ? "tool_parallel" : "tool_serial",
          duration_ms: Date.now() - startedAt,
          status: stepStatus,
          detail: stepDetail ? stepDetail.slice(0, 300) : null,
        };
        stepMetrics.push(stepRow);

        // Written as it happens, not batched at the end of the turn.
        //
        // These rows were only inserted once everything had finished, which
        // made them useless as progress: the chat's status card had nothing
        // real to read, so it guessed a step list from a regex on the user's
        // message and advanced it on a four-second timer. A turn that spent
        // ninety seconds researching leads showed "Wrapping up".
        //
        // Not awaited — a progress write must never slow down or fail the work
        // it is describing.
        void admin
          .from("agent_step_metrics")
          .insert({
            ...stepRow,
            user_id: userId,
            thread_id: threadId,
            turn_id: turnId,
            agent_config_id: requestedAgentId ?? null,
          })
          .then(({ error }) => {
            if (error) console.warn("live step metric insert failed:", error.message);
          });
        return {
          role: "tool",
          tool_call_id: call.id,
          content: serialiseToolResult(result),
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

      /*
       * The step, written down before the next one starts.
       *
       * This is the resume point and the trace at once: the working array so a
       * restart continues, and what was called with what so a fault can be
       * explained from the system instead of from a screenshot. Results are
       * trimmed — a lead list is megabytes and this is for reading.
       *
       * Never allowed to fail the turn. The user's work is the email, not the
       * record of how it was made.
       */
      try {
        await trace.saveStep({
          threadId,
          userId,
          runPass,
          stepIndex: step,
          messages,
          toolCalls: calls.map((c: any) => ({
            name: c.function?.name ?? "",
            args: c.function?.arguments ?? null,
          })),
          toolResults: calls.map((c: any) => {
            const r = byId.get(c.id);
            return trimResult(c.function?.name ?? "", resultOk(r?.content), r?.content ?? null);
          }),
          usage: { ...(data?.usage ?? {}), cumulative_tokens: tokensUsed },
          status: "done",
        });
      } catch (e) {
        console.warn(`[agent-chat] step ${step} not recorded: ${e instanceof Error ? e.message : e}`);
      }

      if (cancelled) break;
    }


    /**
     * How far a single request is allowed to chain.
     *
     * Named rather than inlined because the message the user reads when it is
     * reached has to quote the same number.
     */
    const MAX_RUN_PASSES = 6;
    // `truncated` tells the client to auto-continue this turn instead of making
    // the user type "continue" after every long batch.
    const normalizedRequest = userMessage.toLowerCase();
    const requestedDeleteTools = [
      /\b(delete|remove|clear|discard)\b[\s\S]*\b(saved\s+)?leads?\b/.test(normalizedRequest) ? "delete_leads" : null,
      /\b(delete|remove|clear|discard)\b[\s\S]*\bdrafts?\b/.test(normalizedRequest) ? "delete_drafts" : null,
    ].filter((name): name is string => Boolean(name));
    const completedToolNames = new Set(
      [...completedMutationKeys].map((key) => key.slice(0, key.indexOf(":"))),
    );
    const deletionRequestComplete =
      requestedDeleteTools.length > 0 && requestedDeleteTools.every((name) => completedToolNames.has(name));

    const willContinue =
      ranOutOfTime && !cancelled && !deletionRequestComplete && runPass < MAX_RUN_PASSES;

    /**
     * Out of time, and not coming back on its own.
     *
     * This used to be indistinguishable from the case that does continue: the
     * turn appended "Still more to do here — continuing…" whenever it ran out
     * of time, and the decision about whether anything would in fact continue
     * was taken seventy lines further down. On the last pass the user was told
     * the work was carrying on when it was not, so they waited, and then sent
     * the same job again.
     */
    const stoppedShort = ranOutOfTime && !willContinue && !cancelled && !deletionRequestComplete;
    const stoppedShortNote =
      `That is as far as I can carry one request in a single run (${MAX_RUN_PASSES} passes). ` +
      "Everything above is saved and nothing was lost. Tell me to keep going and I'll pick up from exactly here.";

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
          ? willContinue
            ? "Big batch — the work above is saved. Picking up where I left off…"
            : stoppedShortNote
          : toolEvents.length
            ? "I finished the actions above. Tell me what you'd like next."
            : "I couldn't complete that. Try rephrasing what you'd like me to do.";
    } else if (failureNote) {
      finalText += `\n\n${failureNote}`;
    } else if (willContinue) {
      finalText += "\n\nStill more to do here — continuing…";
    } else if (stoppedShort) {
      finalText += `\n\n${stoppedShortNote}`;
    }

    /*
     * A turn that stopped on spend says so.
     *
     * Appended rather than branched into the chain above because it is true
     * alongside whatever else happened: the model may have produced a perfectly
     * good summary of the work it did before the budget ran out, and that
     * summary should survive. What must not survive is the impression that the
     * request finished.
     */
    if (stoppedOnBudget) {
      const note = budgetNote(tokensUsed, tokenBudget);
      finalText = finalText ? `${finalText}\n\n${note}` : note;
    }

    // The model is not the only witness to its own actions.
    //
    // In approval mode every send parks an agent_approvals row and the tool
    // says so in plain terms — send_drafts returns "Nothing was sent yet — N
    // email(s) are paused waiting on the user." A user asked repeatedly why
    // emails were not arriving and was told "sent" each time, while the
    // approvals table filled up with rows nothing had ever reviewed.
    //
    // So a claim of sending is checked against what the tools actually did
    // this turn. Nothing here rewrites the model's words; it appends the
    // correction, because silently editing what an agent said is its own kind
    // of lie.
    // Every claim the agent makes is checked against the events, not just the
    // one about sending. "I enriched them", "I scheduled those", "I deleted
    // them" were all shipped unverified because the original check was written
    // for a single reported failure and never widened.
    const claims = unbackedClaims(finalText, toolEvents);
    if (claims.length > 0) {
      const anythingQueued = toolEvents.some((e) => e.status === "queued");
      const { count: stillPending } = await admin
        .from("email_drafts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);

      // The correction goes FIRST, not last.
      //
      // A user was shown eight hundred words of ticked-off names claiming
      // twenty-one sends, with the correction underneath it. Anyone skimming
      // sees the ticks and stops reading. A contradiction that arrives after
      // the thing it contradicts has already been believed.
      let correction = correctionFor(claims);
      if (claims.some((c) => c.id === "sent")) {
        correction += anythingQueued
          ? " The email is waiting on your confirmation."
          : " No send ran.";
        if (stillPending) {
          correction +=
            ` You have ${stillPending} draft(s) saved. Say "send them" and I will.`;
        }
      }
      finalText = `⚠️ ${correction}\n\nWhat it said below is not reliable on that point:\n\n${finalText}`;
      console.warn(
        `[agent-chat] corrected unbacked claim(s): ${claims.map((c) => c.id).join(", ")}`,
      );
    }

    // A partial batch is the other way the agent tells the truth and misleads.
    //
    // The send-claim check above only fires when NOTHING went out. It does not
    // catch the case that actually reached a user: 32 asked for, 11 sent, and a
    // reply saying they had all gone. The tool result carried the real numbers
    // and the summary rounded them off, so the numbers are appended here where
    // no summarising step can drop them.
    // Last line of defence, and the only one that does not read the words.
    // A reply announcing a finished job on a turn where nothing succeeded is
    // wrong however it is phrased — which is what makes this catch the
    // phrasings the patterns above will always miss.
    const emptyTurn = emptyTurnWarning(finalText, toolEvents);
    if (emptyTurn) {
      finalText = `⚠️ ${emptyTurn}\n\n${finalText}`;
      console.warn("[agent-chat] flagged a completion claim on a turn that changed nothing");
    }

    /*
     * Finish the job the turn was given.
     *
     * "It must be able to do all the work it is asked of in one sitting." The
     * model was told to pass all eighty-two lead ids in one call, and it passed
     * twelve, then twelve, then ten, ten, ten — fifty-four of eighty-two, and
     * then said the batch was complete and offered to send. Twenty-eight people
     * were never drafted for and nothing in the system noticed.
     *
     * Instructions did not hold and a second instruction would not either. So
     * the turn closes the gap itself: list_leads with without_draft is the
     * model declaring which leads still need drafting, and anything in that set
     * this turn neither wrote nor queued is queued here. Whether the model
     * splits the list, miscounts it, or stops early stops being able to lose
     * anybody.
     *
     * Only ever queued, never sent, and only what the model itself just asked
     * for — the cost of overreaching is a draft nobody wanted, sitting in a
     * folder, not an email to a prospect.
     */
    let sweptQueued = 0;
    let sweptBeyondLimit = 0;
    const drewFromPool = outstandingPool.some((id) => handledLeadIds.has(id));
    if (outstandingPool.length > 0 && drewFromPool) {
      const missed = outstandingPool.filter((id) => !handledLeadIds.has(id));
      /*
       * A second bound, under the one the pool already carries.
       *
       * outstandingPool is capped at the limit the model passed to list_leads,
       * so it cannot exceed 100 any more and this rarely bites. It stays
       * because the pool is only as careful as the call that set it, and a
       * runaway here queues generations nobody asked for.
       *
       * Truncating quietly is what produced the original twenty-draft ceiling,
       * so this does the opposite: the event says how many were left and how
       * to get them.
       */
      const SWEEP_LIMIT = 500;
      const sweeping = missed.slice(0, SWEEP_LIMIT);
      const beyondLimit = missed.length - sweeping.length;
      if (sweeping.length > 0) {
        const { queued } = await queueForDrafting(sweeping, outstandingGoal, outstandingFeedback);
        sweptQueued = queued;
        sweptBeyondLimit = beyondLimit;
        if (queued > 0) {
          toolEvents.push({
            name: "draft_outreach",
            label: "Queued the leads it skipped",
            status: "ok",
            detail:
              `${queued} of the ${outstandingPool.length} lead(s) in this request were not drafted or ` +
              `queued by the steps above, so they were added to the batch.` +
              (beyondLimit > 0
                ? ` ${beyondLimit} more are still without a draft — say "keep going" and I'll queue the next ${SWEEP_LIMIT}.`
                : " The whole set is accounted for."),
          });
          console.warn(
            `[agent-chat] sweep queued ${queued} lead(s) the model left out of ${outstandingPool.length}`,
          );
        }
      }
    }

    /*
     * The drafts total, from the drafts table.
     *
     * Everything above checks the reply against the tool events. This checks
     * it against the database, which is the only thing that settles it: the
     * user opened Outreach Studio, saw twenty drafts, and had just been told
     * forty-three. Both the agent and its own event log said forty-three,
     * because the same twelve leads had been drafted four times and each pass
     * replaced the last.
     *
     * So when a turn drafts at all, the count comes from email_drafts and
     * goes above the reply, where nothing can summarise it away.
     */
    const draftTouched =
      draftTally.written + draftTally.queued + draftTally.skippedAlreadyDrafted + draftTally.failed;
    if (draftTouched > 0) {
      const { count: draftsNow } = await admin
        .from("email_drafts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      const parts = [`wrote ${draftTally.written}`];
      if (draftTally.skippedAlreadyDrafted > 0) {
        parts.push(`left ${draftTally.skippedAlreadyDrafted} that already had one alone`);
      }
      if (draftTally.failed > 0) parts.push(`${draftTally.failed} failed`);
      if (draftTally.queued > 0) {
        parts.push(`queued ${draftTally.queued} to be written in the background`);
      }
      /*
       * Why the reply below can disagree with the line above it.
       *
       * The sweep runs after the model has finished writing, so a reply saying
       * "10 queued, 95 still to go" was true when it was written and stale by
       * the time it was read — the 95 went into the queue a moment later. Both
       * numbers appeared in the same message with nothing to say which was
       * current, and the honest reading of "95 more to go" is that the user
       * has to ask again. They do not.
       */
      const sweepNote = sweptQueued > 0
        ? ` ${sweptQueued} of those were added at the end to cover leads the steps above left out, so` +
          (sweptBeyondLimit > 0
            ? ` ${sweptBeyondLimit} are still without a draft — say "keep going" for the next batch.`
            : ` nothing from that set is still waiting. Any smaller count below this line was written before they were queued.`)
        : "";
      finalText =
        `📝 Your drafts folder holds ${draftsNow ?? 0}. This turn ${parts.join(", ")}.${sweepNote}` +
        `\n\n${finalText}`;
      console.log(
        `[agent-chat] draft tally written=${draftTally.written} queued=${draftTally.queued} ` +
          `skipped=${draftTally.skippedAlreadyDrafted} failed=${draftTally.failed} total=${draftsNow ?? 0}`,
      );
    }

    // Repeats are surfaced before anything else, because the reply above them
    // is the one the user has been reading for days: "these are duplicates,
    // shall I delete and redraft?" — a question whose only answer leads back
    // here. The facts go in code so they cannot be summarised into that offer
    // again.
    if (duplicateRefusals.length > 0) {
      const lines = duplicateRefusals.map((d) =>
        `- ${d.to} already received "${d.subject}"${
          d.previouslySentAt ? ` on ${d.previouslySentAt.slice(0, 10)}` : ""
        }`
      );
      finalText =
        `⚠️ ${duplicateRefusals.length} email(s) were not sent because that person already got that exact email.\n` +
        lines.join("\n") +
        `\n\nThe drafts are fine — deleting and redrafting them will not change this, because the block is on ` +
        `what already went out. Either write a follow-up on a new angle with a new subject, or tell me to ` +
        `resend it anyway and I will.\n\n${finalText}`;
      console.warn(`[agent-chat] ${duplicateRefusals.length} send(s) refused as duplicates`);
    }

    if (sendFailures.length > 0) {
      finalText =
        `⚠️ Sends were refused.\n` +
        sendFailures.map((line) => `- ${line}`).join("\n") +
        `\n\nThey are still queued, so they can go out once that is fixed.\n\n${finalText}`;
      console.warn(`[agent-chat] surfaced ${sendFailures.length} send failure reason(s)`);
    }

    if (batchShortfalls.length > 0) {
      // Also first, and for the same reason: a shortfall reported under a
      // summary that reads as success is a shortfall nobody reads.
      finalText =
        `⚠️ ${batchShortfalls.length === 1 ? "Not everything went through." : "Some of that did not go through."}\n` +
        batchShortfalls.map((line) => `- ${line}`).join("\n") +
        `\n\n${finalText}`;
      console.warn(`[agent-chat] prepended ${batchShortfalls.length} batch shortfall note(s)`);
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
      // Only the turn summary here: the individual steps were already written
      // as they completed, and re-inserting them would double every row the
      // Performance tab counts.
      const rows = [
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



    if (willContinue) {
      // Keep the batch moving on the server. The continuation is fired as a
      // background task, so it survives the client closing the tab or the PWA
      // being swiped away mid-run.
      await admin
        .from("agent_chat_threads")
        .update({
          run_status: "running",
          run_pass: runPass + 1,
          run_mutation_keys: [...completedMutationKeys].slice(0, 100),
        })
        .eq("id", threadId)
        .eq("run_started_at", runStartedAt);

      const continueRun = fetch(`${supabaseUrl}/functions/v1/agent-chat`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          apikey: serviceKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          threadId,
          message: userMessage,
          timezone: userTz,
          autoContinue: true,
          pass: runPass + 1,
          runStartedAt,
          completedMutationKeys: [...completedMutationKeys],
          ...(requestedAgentId ? { agentId: requestedAgentId } : {}),
        }),
      })
        .then(async (r) => {
          if (!r.ok) throw new Error(`continuation failed: ${r.status}`);
          await r.text();
        })
        .catch(async (e) => {
          console.error("agent-chat continuation error", e);
          // Say so. The turn that fired this continuation already told the user
          // it was carrying on, and this path used to flip the thread to idle
          // and write nothing — so the chat stopped mid-batch, under a message
          // promising more, with no way to tell that anything had gone wrong.
          try {
            await admin.from("agent_chat_messages").insert({
              thread_id: threadId,
              user_id: userId,
              role: "assistant",
              content:
                "I lost the thread of that batch partway through — everything above is saved, " +
                "but the rest did not run. Tell me to keep going and I'll pick up from exactly here.",
              tool_events: [],
            });
          } catch (noteError) {
            console.error("agent-chat could not record the continuation failure", noteError);
          }
          await releaseRunClaim?.();
        });

      const waitUntil = (globalThis as any).EdgeRuntime?.waitUntil;
      if (typeof waitUntil === "function") waitUntil(continueRun);
    } else {
      await releaseRunClaim?.();
    }

    return json({
      message: saved,
      toolEvents,
      truncated: willContinue,
      // The client reads this off the conversation too, so a reload keeps the
      // offer. Returning it saves the first render waiting for the message.
      stoppedShort,
      runStatus: willContinue ? "running" : "idle",
      completedMutationKeys: [...completedMutationKeys],
    });



  } catch (error) {
    console.error("agent-chat error", error);
    // The run must not stay claimed by a turn that has already died.
    try {
      await releaseRunClaim?.();
    } catch (releaseError) {
      console.error("agent-chat could not release the run claim", releaseError);
    }
    return json({ error: "The agent hit an unexpected error." }, 500);
  }
});

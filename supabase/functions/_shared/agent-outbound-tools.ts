// Agent tools for the outbound areas that had no agent coverage: ICP,
// sequences/enrollments, inbox triage, mailboxes and deliverability, templates,
// objections, campaign briefs and performance stats.
//
// Every tool here is registered in agent-tool-scope.ts and the custom-build UI
// (src/components/agent/AgentRoles.ts). src/lib/agent-tool-coverage.test.ts fails
// if a tool is defined in one place and not the others.

import { toSignalFacts, type SignalEventRow } from "./signal-facts.ts";

type Admin = { from: (t: string) => any };
type ToolEvent = { name: string; label: string; status: "ok" | "error"; detail?: string };

const fn = (name: string, description: string, properties: Record<string, unknown> = {}, required: string[] = []) => ({
  type: "function",
  function: { name, description, parameters: { type: "object", properties, required } },
});
const str = { type: "string" };
const num = { type: "number" };
const strList = { type: "array", items: { type: "string" } };

const ICP_FIELDS = [
  "name", "industries", "target_titles", "seniority_levels", "geographies", "departments",
  "company_size_min", "company_size_max", "pain_points", "buying_signals", "intent_keywords",
  "exclude_industries", "exclude_titles", "exclude_domains", "exclude_geographies", "disqualifiers", "notes",
];
const BRIEF_FIELDS = ["name", "offer", "proof", "pain_by_persona", "forbidden_claims", "replaces"];
const TEMPLATE_FIELDS = ["name", "goal", "suggested_subject", "trigger_context", "social_proof"];
const OBJECTION_FIELDS = ["label", "type", "competitor_name", "talk_track", "positioning", "proof_points", "do_not_say", "trigger_terms", "strengths", "weaknesses"];
const REPLY_CLASSES = ["interested", "meeting_request", "not_interested", "objection", "out_of_office", "referral", "unsubscribe", "question", "other"];

export const OUTBOUND_TOOL_DEFS = [
  fn("list_icp_profiles", "List the account's ICP (ideal customer profile) definitions."),
  /*
   * Signals had no agent tooling at all. Ninety-four tools were registered and
   * not one of them could read `signal_events` or ask a detector to look
   * again, so an agent asked "why now for this company" had to answer from the
   * lead record — the standing description — while the dated, sourced evidence
   * sat in a table it could not see. `AGENTS.md` exists to stop exactly that.
   *
   * Read and refresh, the pair that rule asks for. Refresh covers hiring only,
   * because the news and tech detectors spend a third-party credit per
   * uncached lookup and an agent should not be able to spend those in a loop.
   */
  fn("list_signals", "Read the detected buying signals for a lead: hiring, funding, tech-stack changes and news, each with its date, source and weight. This is the dated evidence an email can open on, as opposed to the lead's standing description.", {
    lead_id: str, limit: num,
  }, ["lead_id"]),
  fn("refresh_signals", "Re-read a lead's public job board now and record any new hiring signal. Free and safe to call; it reads public ATS boards and spends no credits. Does not refresh news or tech-stack signals, which cost credits per lookup.", {
    lead_id: str,
  }, ["lead_id"]),
  fn("update_icp_profile", "Edit an ICP profile: target industries, titles, seniority, geographies, company size, pains, signals and exclusions. Pass only fields to change; list fields replace the old list.", {
    icp_id: str, name: str, industries: strList, target_titles: strList, seniority_levels: strList, geographies: strList,
    departments: strList, company_size_min: num, company_size_max: num, pain_points: strList, buying_signals: strList,
    intent_keywords: strList, exclude_industries: strList, exclude_titles: strList, exclude_domains: strList,
    exclude_geographies: strList, disqualifiers: strList, notes: str,
  }, ["icp_id"]),
  fn("list_sequence_enrollments", "List leads enrolled in sequences with status, current step and next send time.", {
    sequence_id: str, status: { type: "string", enum: ["active", "paused", "completed", "stopped"] }, limit: num,
  }),
  fn("update_enrollment", "Pause, resume or stop one lead's sequence enrollment.", {
    enrollment_id: str, action: { type: "string", enum: ["pause", "resume", "stop"] }, reason: str,
  }, ["enrollment_id", "action"]),
  fn("update_sequence_status", "Activate or pause a whole sequence.", {
    sequence_id: str, status: { type: "string", enum: ["active", "paused", "draft"] },
  }, ["sequence_id", "status"]),
  fn("classify_reply", "Set an inbound reply's classification and/or mark it read.", {
    reply_id: str, classification: { type: "string", enum: REPLY_CLASSES }, read: { type: "boolean" },
  }, ["reply_id"]),
  fn("list_sending_accounts", "List connected sending mailboxes with status, daily limit, sent today, reputation score and warm-up."),
  fn("update_sending_account", "Pause or resume a sending mailbox, or change its daily send limit.", {
    account_id: str, status: { type: "string", enum: ["active", "paused"] }, daily_limit: num, reason: str,
  }, ["account_id"]),
  fn("list_deliverability_alerts", "List open deliverability alerts (blacklists, bounces, auth problems, reputation drops).", { include_resolved: { type: "boolean" } }),
  fn("resolve_deliverability_alert", "Mark a deliverability alert resolved after the cause was dealt with.", { alert_id: str }, ["alert_id"]),
  fn("list_email_templates", "List the account's saved email templates."),
  fn("save_email_template", "Create a template, or update one when template_id is given.", {
    template_id: str, name: str, goal: str, suggested_subject: str, trigger_context: str, social_proof: str,
  }),
  fn("list_objections", "List the objection and competitor library (talk tracks, positioning, do-not-say)."),
  fn("save_objection", "Create an objection/competitor entry, or update one when objection_id is given.", {
    objection_id: str, label: str, type: { type: "string", enum: ["objection", "competitor"] }, competitor_name: str,
    talk_track: str, positioning: str, proof_points: strList, do_not_say: strList, trigger_terms: strList, strengths: strList, weaknesses: strList,
  }),
  fn("list_campaign_briefs", "List campaign briefs (offer, proof, pain by persona, forbidden claims)."),
  fn("save_campaign_brief", "Create a campaign brief, or update one when brief_id is given.", {
    brief_id: str, name: str, offer: str, proof: str, pain_by_persona: str, forbidden_claims: str, replaces: str,
  }),
  fn("get_outbound_stats", "Outbound performance for the last N days: sent, failed, opened, clicked, replied and rates, overall and per sending mailbox.", { days: num }),
];

export const OUTBOUND_TOOL_NAMES = OUTBOUND_TOOL_DEFS.map((t) => t.function.name);

const pick = (args: Record<string, unknown>, fields: string[]) => {
  const out: Record<string, unknown> = {};
  for (const f of fields) if (args[f] !== undefined && args[f] !== null) out[f] = args[f];
  return out;
};

/** Returns undefined when `name` is not one of these tools. */
export async function runOutboundTool(
  name: string,
  args: Record<string, any>,
  /*
   * `edge` is passed in rather than read from `Deno.env` here.
   *
   * This module is imported by tests that run under Node, and reaching for a
   * Deno global put `Cannot find name 'Deno'` into the app's typecheck the
   * moment one of them pulled it in. Taking the two values as arguments fixes
   * that and is better anyway: a tool that calls another function can be
   * tested by passing it a URL, with no global to stub.
   */
  ctx: {
    admin: Admin;
    userId: string;
    toolEvents: ToolEvent[];
    edge?: { url: string; serviceKey: string };
  },
): Promise<Record<string, unknown> | undefined> {
  if (!OUTBOUND_TOOL_NAMES.includes(name)) return undefined;
  const { admin, userId, toolEvents, edge } = ctx;
  const done = (label: string, error: { message: string } | null | undefined, detail = "", payload: Record<string, unknown> = {}) => {
    toolEvents.push({ name, label: error ? `${label} failed` : label, status: error ? "error" : "ok", detail: error ? error.message : detail });
    return error ? { error: error.message } : { success: true, ...payload };
  };
  const list = async (table: string, cols: string, label: string, key: string, order = "updated_at", limit = 100) => {
    const { data, error } = await admin.from(table).select(cols).eq("user_id", userId).order(order, { ascending: false }).limit(limit);
    return done(label, error, `${data?.length ?? 0}`, { [key]: data ?? [] });
  };
  // Upsert scoped to the user: update by id when given, else insert.
  const save = async (table: string, id: unknown, row: Record<string, unknown>, label: string, required?: string) => {
    if (!Object.keys(row).length) return { error: "Nothing to save" };
    if (id) {
      const { data, error } = await admin.from(table).update(row).eq("id", String(id)).eq("user_id", userId).select("id").maybeSingle();
      if (!error && !data) return { error: "Not found in this account" };
      return done(`Updated ${label}`, error, String(row.name ?? row.label ?? ""), { id: data?.id });
    }
    if (required && !row[required]) return { error: `${required} is required` };
    const { data, error } = await admin.from(table).insert({ ...row, user_id: userId }).select("id").single();
    return done(`Created ${label}`, error, String(row.name ?? row.label ?? ""), { id: data?.id });
  };
  const updateOwned = async (table: string, id: unknown, row: Record<string, unknown>, label: string) => {
    if (!Object.keys(row).length) return { error: "Nothing to update" };
    const { data, error } = await admin.from(table).update(row).eq("id", String(id ?? "")).eq("user_id", userId).select("id").maybeSingle();
    if (!error && !data) return { error: "Not found in this account" };
    return done(label, error, Object.keys(row).join(", "));
  };

  switch (name) {
    case "list_icp_profiles":
      return list("icp_profiles", ["id", ...ICP_FIELDS, "updated_at"].join(", "), "Read ICP profiles", "icp_profiles");
    case "update_icp_profile":
      return updateOwned("icp_profiles", args.icp_id, pick(args, ICP_FIELDS), "Updated ICP");

    case "list_signals": {
      /*
       * Newest first, and the facts rendered the same way the email copy
       * renders them — an agent reading raw metadata would paraphrase
       * `top_role_url` into prose, which is how an unsourced claim gets into
       * an email.
       */
      const { data, error } = await admin.from("signal_events")
        .select("signal_type, occurred_at, source, weight, metadata")
        .eq("lead_id", String(args.lead_id ?? "")).eq("user_id", userId)
        .order("occurred_at", { ascending: false })
        .limit(Math.min(Math.max(Number(args.limit) || 20, 1), 100));
      if (error) return done("Read signals", error);
      const rows = (data ?? []) as SignalEventRow[];
      return done("Read signals", null, `${rows.length}`, {
        signals: rows,
        facts: toSignalFacts(rows).map((f) => ({ fact: f.fact, source: f.source, occurred_at: f.occurred_at })),
      });
    }

    case "refresh_signals": {
      /*
       * The lead is confirmed to belong to this account before the detector is
       * asked, so a lead_id from another account cannot be used to make the
       * platform fetch on its behalf. The detector checks ownership again
       * itself; this is the cheaper refusal.
       */
      const leadId = String(args.lead_id ?? "");
      const { data: lead } = await admin.from("leads").select("id").eq("id", leadId).eq("user_id", userId).maybeSingle();
      if (!lead) return done("Refresh signals", { message: "Lead not found in this account" });

      if (!edge?.url || !edge?.serviceKey) return done("Refresh signals", { message: "Signal refresh is not configured" });
      const { url, serviceKey } = edge;

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20_000);
      try {
        const res = await fetch(`${url}/functions/v1/detect-hiring-signals`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({ leadId }),
          signal: ctrl.signal,
        });
        const out = await res.json().catch(() => null);
        if (!res.ok) return done("Refresh signals", { message: out?.error || `Job board read failed (${res.status})` });
        return done("Refreshed signals", null, out?.signal_type ? String(out.signal_type) : "no change", {
          detected: !!out?.detected,
          deduped: !!out?.deduped,
          signal_type: out?.signal_type ?? null,
          reason: out?.reason ?? null,
        });
      } catch (e) {
        return done("Refresh signals", { message: e instanceof Error ? e.message : String(e) });
      } finally {
        clearTimeout(timer);
      }
    }

    case "list_sequence_enrollments": {
      let q = admin.from("sequence_enrollments")
        .select("id, lead_id, sequence_id, status, current_step, next_action_at, paused_reason, last_activity_at")
        .eq("user_id", userId).order("updated_at", { ascending: false })
        .limit(Math.min(Math.max(Number(args.limit) || 100, 1), 500));
      if (args.sequence_id) q = q.eq("sequence_id", String(args.sequence_id));
      if (args.status) q = q.eq("status", String(args.status));
      const { data, error } = await q;
      return done("Read enrollments", error, `${data?.length ?? 0}`, { enrollments: data ?? [] });
    }
    case "update_enrollment": {
      const action = String(args.action);
      /*
       * Every branch clears paused_until.
       *
       * A reply saying "try me in March" holds an enrollment by setting that
       * date, and resume_due_enrollments brings back anything paused whose
       * date has come. Pausing without clearing it meant the sweep resumed an
       * enrollment the agent had deliberately paused, on a date from an
       * unrelated earlier decision — the agent's pause is not time-boxed, so
       * it must not inherit someone else's clock.
       *
       * Resume and stop clear it too. Neither is reachable by the sweep today
       * (it only takes 'paused'), but leaving a date on a row that is no
       * longer holding is how the next person to pause it inherits a hold
       * nobody asked for.
       */
      const row: Record<string, unknown> =
        action === "pause" ? { status: "paused", paused_until: null, paused_reason: String(args.reason ?? "Paused by agent") }
        : action === "resume" ? { status: "active", paused_until: null, paused_reason: null }
        : action === "stop" ? { status: "stopped", paused_until: null, paused_reason: String(args.reason ?? "Stopped by agent"), completed_at: new Date().toISOString() }
        : {};
      return updateOwned("sequence_enrollments", args.enrollment_id, row, `Enrollment ${action}`);
    }
    case "update_sequence_status":
      if (!["active", "paused", "draft"].includes(String(args.status))) return { error: "status must be active, paused or draft" };
      return updateOwned("email_sequences", args.sequence_id, { status: String(args.status) }, "Updated sequence");

    case "classify_reply": {
      const row: Record<string, unknown> = {};
      if (args.classification) {
        if (!REPLY_CLASSES.includes(String(args.classification))) return { error: `Use one of: ${REPLY_CLASSES.join(", ")}` };
        row.classification = String(args.classification);
      }
      if (typeof args.read === "boolean") row.read = args.read;
      return updateOwned("reply_threads", args.reply_id, row, "Updated reply");
    }

    case "list_sending_accounts":
      return list("sending_accounts", "id, email, provider, status, paused_reason, daily_limit, sent_today, reputation_score, warmup_enabled, last_sent_at", "Read mailboxes", "sending_accounts");
    case "update_sending_account": {
      const row: Record<string, unknown> = {};
      if (args.status) {
        if (!["active", "paused"].includes(String(args.status))) return { error: "status must be active or paused" };
        row.status = String(args.status);
        row.paused_reason = row.status === "paused" ? String(args.reason ?? "Paused by agent") : null;
      }
      if (args.daily_limit !== undefined) {
        const n = Math.round(Number(args.daily_limit));
        if (!Number.isFinite(n) || n < 1 || n > 500) return { error: "daily_limit must be between 1 and 500" };
        row.daily_limit = n;
      }
      return updateOwned("sending_accounts", args.account_id, row, "Updated mailbox");
    }
    case "list_deliverability_alerts": {
      let q = admin.from("deliverability_alerts")
        .select("id, alert_type, severity, status, domain, message, sending_account_id, created_at, resolved_at")
        .eq("user_id", userId).order("created_at", { ascending: false }).limit(100);
      if (!args.include_resolved) q = q.is("resolved_at", null);
      const { data, error } = await q;
      return done("Read deliverability alerts", error, `${data?.length ?? 0}`, { alerts: data ?? [] });
    }
    case "resolve_deliverability_alert":
      return updateOwned("deliverability_alerts", args.alert_id, { status: "resolved", resolved_at: new Date().toISOString() }, "Resolved alert");

    case "list_email_templates":
      return list("user_email_templates", ["id", ...TEMPLATE_FIELDS, "updated_at"].join(", "), "Read templates", "templates");
    case "save_email_template":
      return save("user_email_templates", args.template_id, pick(args, TEMPLATE_FIELDS), "template", "name");
    case "list_objections":
      return list("objection_entries", ["id", ...OBJECTION_FIELDS, "updated_at"].join(", "), "Read objection library", "objections");
    case "save_objection":
      return save("objection_entries", args.objection_id, pick(args, OBJECTION_FIELDS), "objection", "label");
    case "list_campaign_briefs":
      return list("campaign_briefs", ["id", ...BRIEF_FIELDS, "updated_at"].join(", "), "Read campaign briefs", "briefs");
    case "save_campaign_brief":
      return save("campaign_briefs", args.brief_id, pick(args, BRIEF_FIELDS), "campaign brief", "name");

    case "get_outbound_stats": {
      const days = Math.min(Math.max(Math.round(Number(args.days) || 30), 1), 365);
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const { data, error } = await admin.from("sent_emails")
        .select("status, opened_at, clicked_at, replied_at, sending_account_id")
        .eq("user_id", userId).gte("created_at", since).limit(20000);
      if (error) return done("Read stats", error);
      type Tally = { sent: number; failed: number; opened: number; clicked: number; replied: number };
      const blank = (): Tally => ({ sent: 0, failed: 0, opened: 0, clicked: 0, replied: 0 });
      const all = blank();
      const per = new Map<string, Tally>();
      for (const r of data ?? []) {
        const t = per.get(r.sending_account_id ?? "unknown") ?? blank();
        for (const x of [all, t]) {
          if (r.status === "failed" || r.status === "bounced") x.failed++;
          else if (r.status === "sent" || r.status === "delivered") x.sent++;
          if (r.opened_at) x.opened++;
          if (r.clicked_at) x.clicked++;
          if (r.replied_at) x.replied++;
        }
        per.set(r.sending_account_id ?? "unknown", t);
      }
      const rate = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);
      const withRates = (t: Tally) => ({ ...t, open_rate_pct: rate(t.opened, t.sent), reply_rate_pct: rate(t.replied, t.sent) });
      toolEvents.push({ name, label: "Read outbound stats", status: "ok", detail: `${all.sent} sent in ${days}d` });
      return {
        days,
        overall: withRates(all),
        by_sending_account: [...per.entries()].map(([id, t]) => ({ sending_account_id: id, ...withRates(t) })),
        note: "Opens are approximate: some inboxes block or prefetch tracking pixels.",
      };
    }
  }
  return undefined;
}

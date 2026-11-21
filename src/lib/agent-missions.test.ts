import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PLAN_FEATURES } from "@/lib/plan-features";
import {
  PLAN_AGENT_CAPS,
  canAutopilotMission,
  canEditMission,
  clampLeadCap,
  effectiveMode,
  remainingLeadSlots,
  icpSearchFilters,
  inSendWindow,
  isNegativeReply,
  knownSearchLead,
  missionDraftReady,
  missionReport,
  missionSendDecision,
  nextRunAt,
  pauseDecision,
  scheduleInsideWindow,
  spendExceeded,
  windowKey,
} from "../../supabase/functions/_shared/agent-mission-logic";
import { runMissionItem } from "../../supabase/functions/_shared/agent-mission-runner";

const WORKER = readFileSync("supabase/functions/process-agent-jobs/index.ts", "utf8");
const WORKER_CODE = WORKER.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const MIGRATION = readFileSync("supabase/migrations/20261117120000_agent_missions.sql", "utf8");

describe("mission schedule", () => {
  it("picks the next weekday morning in the mission timezone", () => {
    const next = nextRunAt({
      from: new Date("2026-11-16T22:00:00.000Z"),
      timeZone: "America/New_York",
      daysOfWeek: [1, 2, 3, 4, 5],
      hour: 7,
      minute: 0,
    });
    expect(next.toISOString()).toBe("2026-11-17T12:00:00.000Z");
    expect(windowKey(next, "America/New_York")).toBe("2026-11-17");
  });

  it("holds a finished draft until the send window opens", () => {
    const when = scheduleInsideWindow({
      from: new Date("2026-11-17T07:30:00.000Z"),
      timeZone: "America/New_York",
      windowStart: "08:00",
      windowEnd: "17:00",
      staggerIndex: 0,
    });
    expect(when.toISOString()).toBe("2026-11-17T13:00:00.000Z");
    expect(inSendWindow(when, "America/New_York", "08:00", "17:00")).toBe(true);
  });
});

describe("mission caps follow the existing agent plan", () => {
  it("does not invent a higher lead cap or a new auto-send right", () => {
    for (const plan of ["free", "starter", "growth", "pro", "agency"] as const) {
      expect(PLAN_AGENT_CAPS[plan].dailyLeads).toBe(PLAN_FEATURES[plan].agentDailyLeadSourcing);
      expect(PLAN_AGENT_CAPS[plan].autoSend).toBe(PLAN_FEATURES[plan].agentAutoSend);
    }
    expect(clampLeadCap("free", 400)).toBe(25);
    expect(effectiveMode("autopilot", "free")).toBe("approval");
    expect(effectiveMode("autopilot", "pro")).toBe("autopilot");
    expect(remainingLeadSlots({ plan: "free", missionCap: 25, usedOnMission: 0, usedByWorkspace: 20 })).toBe(5);
    expect(remainingLeadSlots({ plan: "pro", missionCap: 10, usedOnMission: 4, usedByWorkspace: 4 })).toBe(6);
    expect(canEditMission("member")).toBe(true);
    expect(canAutopilotMission("member")).toBe(false);
    expect(canAutopilotMission("admin")).toBe(true);
    expect(canEditMission("none")).toBe(false);
  });

  it("stops spending when the mission cap is hit", () => {
    expect(spendExceeded(5, 5)).toBe(true);
    expect(spendExceeded(4.99, 5)).toBe(false);
  });
});

describe("mission guardrails", () => {
  it("pauses on bounce rate, negative replies, open alerts and provider errors", () => {
    expect(pauseDecision({ sent: 20, bounced: 2, replies: 0, negativeReplies: 0, openAlerts: 0 }).pause).toBe(true);
    expect(pauseDecision({ sent: 19, bounced: 19, replies: 0, negativeReplies: 0, openAlerts: 0 }).pause).toBe(false);
    expect(pauseDecision({ sent: 0, bounced: 0, replies: 8, negativeReplies: 2, openAlerts: 0 }).pause).toBe(true);
    expect(pauseDecision({ sent: 0, bounced: 0, replies: 0, negativeReplies: 0, openAlerts: 1 }).reason).toMatch(/deliverability/);
    expect(pauseDecision({ sent: 0, bounced: 0, replies: 0, negativeReplies: 0, openAlerts: 0, providerError: "upstream 503" }).pause).toBe(true);
    expect(isNegativeReply("unsubscribe")).toBe(true);
    expect(isNegativeReply("interested")).toBe(false);
  });

  it("does not save a search row that is missing a name, a company or an email", () => {
    expect(knownSearchLead({ business_email: "a@acme.test", contact_name: "Ada", company_name: "Unknown" })).toEqual({
      skip: "No company on the search result. Nothing was guessed.",
    });
    expect(knownSearchLead({ business_email: "a@acme.test", contact_name: "Ada", company_name: "Acme" })).toMatchObject({
      lead: { contact_email: "a@acme.test", company_name: "Acme" },
    });
  });

  it("searches with the ICP the user saved and does not relax it", () => {
    const filters = icpSearchFilters(
      { target_titles: ["VP Sales"], industries: ["Software"], geographies: ["United States"] },
      null,
      "Find ops leaders",
      10,
    );
    expect(filters.strict).toBe(true);
    expect(filters.relax).toBe(false);
    expect(filters.job_titles).toEqual(["VP Sales"]);
  });
});

describe("mission sends", () => {
  const sources = ["Acme ships widgets from a warehouse in Ohio"];
  const clear = {
    mode: "autopilot" as const,
    subject: "Acme warehouse",
    body: "Acme ships widgets from a warehouse in Ohio",
    sources,
    qualityStatus: "clear",
    qualityWeak: false,
    rubricAvailability: "scored",
    contentHash: "hash",
    promptHash: "prompt",
    rubricPromptHash: "rubric",
    userId: "user-1",
  };

  it("holds approval, ungrounded copy, a weak score and a missing verdict", () => {
    expect(missionDraftReady({ ...clear, mode: "approval" }).ready).toBe(false);
    expect(missionDraftReady({ ...clear, body: "Acme grew 3x last quarter" }).reason).toMatch(/3x/);
    expect(missionDraftReady({ ...clear, qualityStatus: "needs_review" }).ready).toBe(false);
    expect(missionDraftReady({ ...clear, rubricAvailability: "unavailable" }).ready).toBe(false);
    expect(missionSendDecision({ ...clear, persisted: false, stored: null }).allow).toBe(false);
  });

  it("schedules only when the stored verdict matches this account and this text", () => {
    const allowed = missionSendDecision({
      ...clear,
      persisted: true,
      stored: {
        contentHash: "hash",
        gateStatus: "clear",
        promptHash: "prompt",
        rubricPromptHash: "rubric",
        userId: "user-1",
      },
    });
    expect(allowed.allow).toBe(true);
    const otherAccount = missionSendDecision({
      ...clear,
      persisted: true,
      stored: {
        contentHash: "hash",
        gateStatus: "clear",
        promptHash: "prompt",
        rubricPromptHash: "rubric",
        userId: "someone-else",
      },
    });
    expect(otherAccount.allow).toBe(false);
  });

  it("writes an overnight report a person can read", () => {
    const report = missionReport({
      missionName: "Ops leaders",
      leads: 2,
      drafts: 1,
      scheduled: 0,
      waiting: [{ who: "Ada at Acme", subject: "Warehouse" }],
      skipped: [{ reason: "No company on the search result.", source: "lead search" }],
    });
    expect(report.summary).toMatch(/2 new leads/);
    expect(report.summary).toMatch(/waiting for approval/);
    expect(report.steps.some((step) => step.detail?.includes("lead search"))).toBe(true);
  });
});

describe("the queue owns mission work", () => {
  it("enqueues into the existing worker and still schedules instead of sending", () => {
    expect(MIGRATION).toContain("kind IN ('draft', 'enrich', 'score', 'research', 'search', 'mission')");
    expect(MIGRATION).toContain("pg_advisory_xact_lock");
    expect(MIGRATION).toContain("GRANT EXECUTE ON FUNCTION public.claim_agent_mission_run(uuid) TO service_role");
    expect(MIGRATION).toContain("'agentMissions'");
    expect(MIGRATION).toContain("false");
    expect(MIGRATION).toContain("'dispatch-agent-missions'");
    expect(WORKER_CODE).toContain('job.kind === "mission"');
    expect(WORKER_CODE.indexOf('job.kind === "mission"')).toBeLessThan(WORKER_CODE.indexOf('.eq("id", item.lead_id)'));
    expect(WORKER_CODE).toContain("release_agent_job_items");
    expect(WORKER_CODE).toContain("scheduleDraft");
    expect(WORKER_CODE).not.toContain("send-email");
    expect(WORKER_CODE).toContain("agent-mission-digest");
    expect(WORKER_CODE).toContain("finish_agent_mission_run");
    const runner = readFileSync("supabase/functions/_shared/agent-mission-runner.ts", "utf8");
    expect(runner).toContain('count: "exact"');
    expect(runner).not.toContain(".limit(500)");
    expect(runner).toContain("claim_agent_mission_send");
    expect(runner).toContain("agent_mission_leads_used_today");
    const guards = readFileSync("supabase/migrations/20261121120000_agent_mission_guards.sql", "utf8");
    expect(guards).toContain("job_attempts >= 3");
    expect(guards).toContain("uq_agent_missions_one_active");
    expect(guards).toContain("Only the workspace owner or an admin can turn on autopilot");
  });
});

describe("a mission pass", () => {
  const userId = "11111111-1111-4111-8111-111111111111";
  const missionId = "22222222-2222-4222-8222-222222222222";
  const runId = "33333333-3333-4333-8333-333333333333";
  const leadId = "44444444-4444-4444-8444-444444444444";

  function adminFor(seed: Record<string, Record<string, unknown>[]>) {
    const tables: Record<string, Record<string, unknown>[]> = structuredClone(seed);
    const scheduled: string[] = [];
    const from = (table: string) => {
      const filters: { key: string; value: unknown; op: string }[] = [];
      let pendingUpdate: Record<string, unknown> | null = null;
      let pendingInsert: Record<string, unknown> | null = null;
      const matched = () => (tables[table] ?? []).filter((row) => filters.every((filter) => {
        const cell = row[filter.key];
        if (filter.op === "ilike") return String(cell ?? "").toLowerCase() === String(filter.value).toLowerCase();
        return cell === filter.value;
      }));
      const api: Record<string, unknown> = {
        select: () => api,
        eq: (key: string, value: unknown) => { filters.push({ key, value, op: "eq" }); return api; },
        ilike: (key: string, value: unknown) => { filters.push({ key, value, op: "ilike" }); return api; },
        gte: () => api,
        is: () => api,
        in: () => api,
        order: () => api,
        limit: () => api,
        maybeSingle: async () => ({ data: matched()[0] ?? null, error: null }),
        single: async () => ({ data: pendingInsert ? { id: `${table}-id`, ...pendingInsert } : matched()[0], error: null }),
        insert: (values: Record<string, unknown>) => {
          pendingInsert = values;
          tables[table] = [...(tables[table] ?? []), { id: `${table}-id`, ...values }];
          return api;
        },
        update: (values: Record<string, unknown>) => {
          pendingUpdate = values;
          return api;
        },
        then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
          if (pendingUpdate) {
            for (const row of matched()) Object.assign(row, pendingUpdate);
          }
          return Promise.resolve({ data: matched(), error: null }).then(resolve, reject);
        },
      };
      return api;
    };
    return {
      from,
      rpc: async (name: string) => {
        if (name === "claim_agent_mission_send") return { data: true, error: null };
        if (name === "agent_mission_leads_used_today") return { data: 0, error: null };
        return { data: "verdict-1", error: null };
      },
      scheduled,
      tables,
    };
  }

  const base = () => adminFor({
    agent_missions: [{
      id: missionId,
      user_id: userId,
      name: "Ops leaders",
      goal: "Find ops leaders",
      mode: "approval",
      status: "active",
      timezone: "UTC",
      send_window_start: "08:00",
      send_window_end: "17:00",
      daily_lead_cap: 10,
      daily_send_cap: 10,
      daily_spend_cap_usd: 5,
      bounce_pause_rate: 0.05,
      negative_reply_pause_rate: 0.15,
      agent_config_id: "agent-1",
      icp_profile_id: null,
      sequence_id: null,
    }],
    agent_mission_runs: [{ id: runId, user_id: userId, mission_id: missionId, status: "running", cursor: { phase: "work", lead_ids: [leadId], index: 0, leads: 1, drafts: 0, sends: 0, waiting: [], skipped: [] } }],
    feature_flags: [{ name: "agentMissions", is_enabled: true }],
    agent_mission_grants: [{ user_id: userId, enabled: true }],
    subscriptions: [{ user_id: userId, plan: "pro" }],
    sent_emails: [],
    reply_analysis: [],
    deliverability_alerts: [],
    ai_usage_events: [],
    leads: [{ id: leadId, user_id: userId, contact_name: "Ada", contact_email: "ada@acme.test", company_name: "Acme", research_brief: "Acme ships widgets from a warehouse in Ohio" }],
    agent_configs: [{ id: "agent-1", user_id: userId, tone: "professional", company_context: "We help warehouses", value_props: [] }],
    profiles: [{ id: userId, full_name: "Blair", company_name: "Outreign", email: "blair@outreign.io" }],
    sending_accounts: [{ email: "blair@outreign.io", integration_id: "int-1", user_id: userId }],
  });

  const job = { id: "job-1", user_id: userId, total: 10 };
  const item = { id: "item-1", payload: { mission_id: missionId, run_id: runId } };
  const draft = {
    lead_id: leadId,
    draft_id: "draft-1",
    company: "Acme",
    contact: "Ada",
    contact_email: "ada@acme.test",
    subject: "Acme warehouse",
    body: "Acme ships widgets from a warehouse in Ohio",
    email: "Subject: Acme warehouse\n\nAcme ships widgets from a warehouse in Ohio",
    skills_used: [],
    style_warnings: [],
    name_warnings: [],
    name_repairs: [],
    quality_status: "clear",
    quality_weak: false,
    rubric_availability: "scored",
  };

  it("stops when the flag is off and does not schedule", async () => {
    const admin = base();
    admin.tables.feature_flags[0].is_enabled = false;
    const scheduled: string[] = [];
    const result = await runMissionItem({
      admin,
      job,
      item,
      invokeFn: async () => ({ leads: [] }),
      scheduleDraft: async () => { scheduled.push("sent"); return { id: "row", scheduledAt: "" }; },
      draftLead: async () => draft,
    });
    expect(result.action).toBe("done");
    expect(scheduled).toEqual([]);
    expect(admin.tables.agent_mission_runs[0].status).toBe("skipped");
  });

  it("leaves an approval draft waiting", async () => {
    const admin = base();
    const scheduled: string[] = [];
    await runMissionItem({
      admin,
      job,
      item,
      invokeFn: async () => ({}),
      scheduleDraft: async () => { scheduled.push("sent"); return { id: "row", scheduledAt: "" }; },
      draftLead: async () => draft,
      now: new Date("2026-11-17T15:00:00.000Z"),
    });
    expect(scheduled).toEqual([]);
    const cursor = admin.tables.agent_mission_runs[0].cursor as { waiting: unknown[]; phase: string };
    expect(cursor.waiting).toHaveLength(1);
    expect(cursor.phase).toBe("report");
  });

  it("does not schedule an autopilot draft that invents a figure", async () => {
    const admin = base();
    admin.tables.agent_missions[0].mode = "autopilot";
    const scheduled: string[] = [];
    await runMissionItem({
      admin,
      job,
      item,
      invokeFn: async () => ({}),
      scheduleDraft: async () => { scheduled.push("sent"); return { id: "row", scheduledAt: "" }; },
      draftLead: async () => ({ ...draft, body: "Acme grew 3x last quarter", subject: "3x" }),
      now: new Date("2026-11-17T15:00:00.000Z"),
    });
    expect(scheduled).toEqual([]);
  });

  it("schedules a clear autopilot draft inside the window", async () => {
    const admin = base();
    admin.tables.agent_missions[0].mode = "autopilot";
    const times: string[] = [];
    await runMissionItem({
      admin,
      job,
      item,
      invokeFn: async () => ({}),
      scheduleDraft: async (_lead, _draft, when) => { times.push(when); return { id: "row", scheduledAt: when }; },
      draftLead: async () => draft,
      now: new Date("2026-11-17T15:00:00.000Z"),
    });
    expect(times).toHaveLength(1);
    expect(inSendWindow(new Date(times[0]), "UTC", "08:00", "17:00")).toBe(true);
    const cursor = admin.tables.agent_mission_runs[0].cursor as { sends: number };
    expect(cursor.sends).toBe(1);
  });
});

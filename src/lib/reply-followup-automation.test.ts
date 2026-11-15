import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  intentFromAgentClassification,
  intentScoreFromConfidence,
  isUuid,
  outboundFollowsReply,
  ownMessageAfterReply,
  replySupersedesQueuedMail,
  withoutUnclassifiedFlag,
} from "../../supabase/functions/_shared/reply-stop";

const code = (path: string) =>
  readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const MIGRATION = readFileSync("supabase/migrations/20261115120000_schedule_inbox_sync.sql", "utf8");
const CONFIG = readFileSync("supabase/config.toml", "utf8");
const SWEEP = code("supabase/functions/sync-inboxes/index.ts");
const INBOX = code("supabase/functions/inbox-sync/index.ts");
const STEP = code("supabase/functions/process-sequence-step/index.ts");
const SENDER = code("supabase/functions/process-scheduled-emails/index.ts");
const AGENT = code("supabase/functions/agent-run/index.ts");
const ANALYZE = code("supabase/functions/analyze-reply/index.ts");

/**
 * Follow-ups were queued by a dispatcher the gateway could reject, and replies
 * were only noticed when someone opened the inbox. A detected reply stopped
 * the sequence only when the classifier succeeded.
 */
describe("a reply newer than the queued mail blocks the send", () => {
  it("blocks when the reply landed after the row was queued", () => {
    expect(replySupersedesQueuedMail("2026-11-01T00:00:00.000Z", "2026-11-02T00:00:00.000Z")).toBe(true);
  });

  it("allows a message created after the reply, which is a resume or a written-back answer", () => {
    expect(replySupersedesQueuedMail("2026-11-03T00:00:00.000Z", "2026-11-02T00:00:00.000Z")).toBe(false);
  });

  it("allows a mailbox with no reply", () => {
    expect(replySupersedesQueuedMail("2026-11-01T00:00:00.000Z", null)).toBe(false);
  });

  it("blocks when a reply is present and the queue time cannot be read", () => {
    expect(replySupersedesQueuedMail(null, "2026-11-02T00:00:00.000Z")).toBe(true);
    expect(replySupersedesQueuedMail("not-a-date", "2026-11-02T00:00:00.000Z")).toBe(true);
  });

  it("does not treat an unreadable reply time as permission to send", () => {
    expect(replySupersedesQueuedMail("2026-11-01T00:00:00.000Z", "tomorrow")).toBe(true);
  });

  it("only interpolates uuids into the reply filter", () => {
    expect(isUuid("11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(isUuid("lead_id.eq.x,user_id.eq.y")).toBe(false);
  });
});

describe("the sender and the step runner both honour that", () => {
  it("does not send a queued step once a newer reply is on the lead", () => {
    expect(SENDER).toContain("replySupersedesQueuedMail(email.created_at");
    expect(SENDER).toContain("They replied before this step was due");
  });

  it("does not queue the next step once a newer reply is on the enrollment", () => {
    expect(STEP).toContain("replySupersedesQueuedMail(enrollment.last_activity_at");
    expect(STEP).toContain('rpc(\'apply_reply_to_sequence\'');
  });

  it("still stops when classification never runs", () => {
    expect(INBOX).toContain("stopSequenceForReply(");
    expect(INBOX).toContain('rpc("apply_reply_to_sequence"');
    expect(INBOX).toContain("rememberUnclassifiedReply(");
    const settle = INBOX.slice(INBOX.indexOf("for (const r of replies)"));
    expect(settle).toContain("if (!classified)");
    expect(settle).toContain("if (!r.isAutoReply) await stopSequenceForReply");
  });

  it("stops a human reply the model called ignored", () => {
    const settle = INBOX.slice(INBOX.indexOf("for (const r of replies)"));
    const gate = settle.slice(settle.indexOf("if (!r.isAutoReply"), settle.indexOf("await stopSequenceForReply", settle.indexOf("if (!r.isAutoReply")));
    expect(gate).not.toContain('"ignored"');
    expect(gate).toContain("action !== \"stopped\"");
    expect(gate).toContain("action !== \"held\"");
  });
});

describe("a reply the sweep stored still reaches the agent once", () => {
  it("the agent asks for replies already on file", () => {
    expect(AGENT).toContain("forAgent: true");
  });

  it("inbox-sync claims those rows and does not record them again", () => {
    expect(INBOX).toContain("payload.forAgent && !prior.processed");
    expect(INBOX).toContain('rpc("claim_reply_for_agent"');
    expect(INBOX).toContain("replies.concat(agentReplies)");
    expect(MIGRATION).not.toContain("claim_reply_for_agent");
    const claim = readFileSync("supabase/migrations/20261115143000_agent_reply_cutoff.sql", "utf8");
    expect(claim).toContain("coalesce(processed_by_agent, false) = false");
    expect(claim).toContain("interval '15 minutes'");
    expect(claim).toContain("auth.role() <> 'service_role'");
  });

  it("does not claim history, or anything older than 72 hours", () => {
    const cutoff = readFileSync("supabase/migrations/20261115143000_agent_reply_cutoff.sql", "utf8");
    expect(cutoff).toContain("SET processed_by_agent = true");
    expect(cutoff).toContain("WHERE coalesce(processed_by_agent, false) = false");
    expect(cutoff).toContain("agent_reply_cutoff");
    expect(cutoff).toContain("coalesce(analyzed_at, created_at) >= v_shipped");
    expect(cutoff).toContain("interval '72 hours'");
  });

  it("treats a later message from us as already answered", () => {
    expect(ownMessageAfterReply(1_000, [{ atMs: 1_500, fromUs: true }])).toBe(true);
    expect(ownMessageAfterReply(1_000, [{ atMs: 1_500, fromUs: false }])).toBe(false);
    expect(ownMessageAfterReply(1_000, [{ atMs: 500, fromUs: true }])).toBe(false);
    expect(outboundFollowsReply("2026-11-01T00:00:00.000Z", "2026-11-02T00:00:00.000Z")).toBe(true);
    expect(outboundFollowsReply("2026-11-02T00:00:00.000Z", "2026-11-01T00:00:00.000Z")).toBe(false);
    expect(INBOX).toContain("ownMessageAfterReply(");
    expect(INBOX).toContain("userRepliedAfter");
    expect(AGENT).toContain("outboundFollowsReply(reply.receivedAt");
    expect(AGENT).toContain('reason: "already_answered"');
    expect(AGENT).toContain("processed_by_agent: true");
    expect(AGENT).toContain('.eq("gmail_thread_id", threadId)');
    expect(AGENT).toContain('.eq("lead_id", replyLeadId)');
  });

  it("maps the agent's words onto the three labels the column allows", () => {
    expect(intentFromAgentClassification("interested")).toBe("high_intent");
    expect(intentFromAgentClassification("meeting_request")).toBe("high_intent");
    expect(intentFromAgentClassification("unsubscribe")).toBe("low_intent");
    expect(intentFromAgentClassification("out_of_office")).toBe("low_intent");
    expect(intentFromAgentClassification("objection")).toBe("neutral");
    expect(intentScoreFromConfidence(0.82)).toBe(82);
    expect(intentScoreFromConfidence(90)).toBe(90);
  });

  it("clears the placeholder flag", () => {
    expect(withoutUnclassifiedFlag({ unclassified: true, gmail_message_id: "m1" })).toEqual({
      gmail_message_id: "m1",
    });
  });

  it("the agent overwrites the placeholder row instead of leaving it", () => {
    expect(AGENT).toContain("intentFromAgentClassification(classification)");
    expect(AGENT).toContain("intentScoreFromConfidence(confidence)");
    expect(AGENT).toContain("requires_human_action: false");
    expect(AGENT).toContain("withoutUnclassifiedFlag(");
  });

  it("analyze-reply updates an existing row and drops the placeholder flag", () => {
    expect(ANALYZE).toContain("delete detectedSignals.unclassified");
    expect(ANALYZE).toContain(".update(analysisRow)");
    expect(ANALYZE).toContain("unclassified === true");
  });
});

describe("replies are swept without a person opening the inbox", () => {
  it("schedules sync-inboxes", () => {
    expect(MIGRATION).toContain("cron.schedule(");
    expect(MIGRATION).toContain("'sync-inboxes'");
    expect(MIGRATION).toContain("'2-57/5 * * * *'");
    expect(MIGRATION).toContain("functions/v1/sync-inboxes");
  });

  it("takes the mailboxes waiting longest, and only one sweep at a time", () => {
    expect(MIGRATION).toContain("ORDER BY c.last_attempt_at NULLS FIRST");
    expect(MIGRATION).toContain("FOR UPDATE");
    expect(MIGRATION).toContain("claim_inbox_sync_sweep");
    expect(SWEEP).toContain('rpc("claim_inbox_sync_sweep"');
    expect(SWEEP).toContain('rpc("next_inbox_sync_users"');
    expect(SWEEP).toContain('rpc("release_inbox_sync_sweep"');
    expect(SWEEP).not.toContain("sweepSlice");
  });

  it("considers up to forty mailboxes and lets the budget stop the pass", () => {
    expect(SWEEP).toContain("const MAX_USERS = 40");
    expect(SWEEP).toContain("const CONCURRENCY = 4");
    expect(MIGRATION).toContain("least(coalesce(p_limit, 40), 40)");
    const budget = SWEEP.match(/const BUDGET_MS = ([\d_]+);/);
    expect(budget).toBeTruthy();
    expect(Number(budget![1].replace(/_/g, ""))).toBeLessThan(5 * 60_000);
  });

  it("tells the mailbox owner when sync keeps failing", () => {
    expect(SWEEP).toContain("notifyInboxSyncStalled(");
  });

  it("keeps the sweep functions off customer roles", () => {
    for (const name of [
      "claim_inbox_sync_sweep(integer)",
      "next_inbox_sync_users(integer)",
      "trigger_inbox_sync()",
    ]) {
      expect(MIGRATION).toContain(`REVOKE ALL ON FUNCTION public.${name} FROM PUBLIC, anon, authenticated`);
    }
    expect(MIGRATION).toContain("auth.role() <> 'service_role'");
    expect(MIGRATION).toContain("auth.uid() = user_id");
  });
});

describe("the crons that advance follow-ups are not rejected as anonymous", () => {
  it("dispatch-sequence-steps accepts the vault secret at the gateway", () => {
    expect(CONFIG).toMatch(/\[functions\.dispatch-sequence-steps\]\s*\n(?:\s*#[^\n]*\n)*\s*verify_jwt = false/);
  });

  it("process-agent-jobs accepts the vault secret at the gateway", () => {
    expect(CONFIG).toMatch(/\[functions\.process-agent-jobs\]\s*\n(?:\s*#[^\n]*\n)*\s*verify_jwt = false/);
  });
});

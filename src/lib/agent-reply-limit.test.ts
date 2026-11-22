import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { remainingAgentReplies } from "../../supabase/functions/_shared/agent-reply-limit";
import { AGENT_TIERS } from "./plan-features";

describe("server-bound automatic reply allowance", () => {
  it.each(Object.values(AGENT_TIERS))("caps a forged preference to the $id tier", (tier) => {
    expect(remainingAgentReplies(999999, tier.dailyReplies, 1)).toBe(tier.dailyReplies - 1);
  });
  it("preserves a user's lower preference, including disabled replies", () => {
    expect(remainingAgentReplies(10, 500, 3)).toBe(7);
    expect(remainingAgentReplies(0, 500, 0)).toBe(0);
  });
  it("caps pre-existing higher settings after a downgrade", () => {
    expect(remainingAgentReplies(500, 15, 3)).toBe(12);
    expect(remainingAgentReplies(500, 15, 18)).toBe(0);
  });
  it.each([null, undefined, NaN, Infinity, -1, 1.5, "500"])("fails closed for an invalid server allowance %s", (bad) => {
    expect(remainingAgentReplies(500, bad, 0)).toBe(0);
    expect(remainingAgentReplies(500, 500, bad)).toBe(0);
    expect(remainingAgentReplies(bad, 500, 0)).toBe(0);
  });
  it("reads the current allowance server-side and fails closed on usage-read errors", () => {
    const run = readFileSync("supabase/functions/agent-run/index.ts", "utf8");
    expect(run).toContain('"agent_reply_plan_limit", { p_user_id: user.id }');
    expect(run).toContain("replyPlanLimitError ? null : replyPlanLimit");
    expect(run).toContain("dailyReplyCountError ? null : dailyReplyCount");
    expect(run).toContain("if (repliesSent >= remainingReplies) break;");
  });
  it("installs database write protection for both create and update paths", () => {
    const sql = readFileSync("drizzle/migrations/0080_enforce_agent_reply_plan_limits.sql", "utf8");
    expect(sql).toContain("BEFORE INSERT OR UPDATE OF max_daily_auto_replies,user_id");
    expect(sql).toContain("LEAST(public.agent_reply_plan_limit(NEW.user_id)");
    expect(sql).toContain("FROM PUBLIC, anon, authenticated");
    expect(sql).toContain("TO service_role");
    for (const tier of Object.values(AGENT_TIERS)) {
      const plan = tier.id === "elite" ? "agency" : tier.id;
      if (plan !== "free") expect(sql).toContain(`WHEN '${plan}' THEN ${tier.dailyReplies}`);
      else expect(sql).toContain(`ELSE ${tier.dailyReplies} END`);
    }
  });
});
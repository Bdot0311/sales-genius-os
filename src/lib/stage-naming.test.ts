import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { LEAD_STAGES } from "@/components/dashboard/LeadStageSelect";

const MIGRATION = readFileSync("supabase/migrations/20261015200000_deal_stage_naming.sql", "utf8");
const TRIGGER = readFileSync(
  "supabase/migrations/20260831202114_5490fcb3-7d74-4a3e-9a46-f9f9df241943.sql",
  "utf8",
);
const LEADS_CHECK = readFileSync(
  "supabase/migrations/20260818190658_6bda28e7-e5c7-4758-9f38-b075a4af5e45.sql",
  "utf8",
);

/**
 * deals.stage was spelled two ways, and the half nobody wrote is the half the
 * code checked.
 *
 * The CHECK allowed 'closed-won' with a hyphen and that is what the app wrote.
 * The webhook trigger tested 'closed_won', the revenue panel tested "won" or
 * "closed_won", and the webhook test dialog advertised "closed_won" to
 * integrators. No row could ever hold that value, so the deal.closed webhook
 * never fired for anybody and the won-deal count was always zero.
 */
describe("a deal stage is spelled one way", () => {
  it("moves the stored rows, not just the constraint", () => {
    // A CHECK swapped without an UPDATE rejects every existing closed deal on
    // its next write.
    expect(MIGRATION).toContain("SET stage = 'closed_won'");
    expect(MIGRATION).toContain("WHERE stage = 'closed-won'");
    expect(MIGRATION).toContain("SET stage = 'closed_lost'");
    expect(MIGRATION).toContain("WHERE stage = 'closed-lost'");
  });

  it("drops the old constraint before rewriting", () => {
    // The rows cannot hold the new values while the old CHECK is on the table.
    const drop = MIGRATION.indexOf("DROP CONSTRAINT IF EXISTS deals_stage_check");
    const update = MIGRATION.indexOf("UPDATE public.deals");
    const add = MIGRATION.indexOf("ADD CONSTRAINT deals_stage_check");
    expect(drop).toBeGreaterThan(-1);
    expect(drop).toBeLessThan(update);
    expect(update).toBeLessThan(add);
  });

  it("the new constraint is snake_case throughout", () => {
    const from = MIGRATION.indexOf("ADD CONSTRAINT deals_stage_check");
    // Stops before the COMMENT, which names the old spelling deliberately.
    const check = MIGRATION.slice(from, MIGRATION.indexOf("COMMENT ON", from));
    expect(check).toContain("'closed_won'");
    expect(check).toContain("'closed_lost'");
    expect(check).not.toContain("closed-won");
  });

  /*
   * The point of the change: this condition becomes reachable. It has been in
   * the trigger since the webhook work shipped and no row could satisfy it.
   */
  it("the deal.closed webhook can finally fire", () => {
    expect(TRIGGER).toContain("IF NEW.stage IN ('closed_won', 'closed_lost') THEN");
    const from = MIGRATION.indexOf("ADD CONSTRAINT");
    const check = MIGRATION.slice(from, MIGRATION.indexOf("COMMENT ON", from));
    for (const v of ["closed_won", "closed_lost"]) expect(check).toContain(`'${v}'`);
  });

  it("no live code writes or reads the hyphen form", () => {
    /*
     * This sweep is the point of the test. It caught three the eye missed:
     * agent-chat's DEAL_STAGES enum, which feeds list_deals, create_deal and
     * update_deal and would have had the agent writing a value the new CHECK
     * rejects; a lead staleness filter comparing pipeline_stage against deal
     * spellings it never holds; and ai-coach comparing lead_status, which is
     * 'discovered' | 'active' | 'archived', to a deal stage.
     *
     * The original CREATE TABLE is excluded: it is the history the migration
     * above corrects, and rewriting an applied migration would be worse.
     */
    const hits = execFileSync(
      "git",
      // --untracked, because without it this skipped the one file it most
      // needed to read: a migration is a new file until it is committed, so
      // the sweep passed while the rewrite itself was unstaged and only
      // failed once it was tracked.
      ["grep", "-n", "--untracked", "-E", "['\"]closed-(won|lost)['\"]", "--", "src", "supabase", ":(exclude)*.test.ts"],
      { cwd: process.cwd(), encoding: "utf8" },
    )
      .split("\n")
      .filter(Boolean)
      // The CREATE TABLE that introduced the hyphen, and the migration that
      // rewrites it: both have to name the old value to do their job.
      .filter((l) => !l.includes("20251021012546"))
      .filter((l) => !l.includes("20261015200000"))
      .filter((l) => !/:\s*(\/\/|\*|--)/.test(l));
    expect(hits).toEqual([]);
  });

  it("the test dialog advertises a payload production can produce", () => {
    const DIALOG = readFileSync("src/components/settings/WebhookTestDialog.tsx", "utf8");
    expect(DIALOG).toContain('stage: "closed_won"');
  });

  it("the revenue panel counts the value the column holds", () => {
    const STATS = readFileSync("src/components/outreach/EmailPerformanceStats.tsx", "utf8");
    expect(STATS).toContain('(d.stage || "").toLowerCase() === "closed_won"');
    // It used to guess at "won" as well, and that is not a deal stage either.
    expect(STATS).not.toContain('=== "won"');
  });
});

/**
 * The lead pipeline chart had its own hand-written list of stages.
 *
 * It carried "engaged", which leads.pipeline_stage cannot hold, so that bar
 * was always empty; and it was missing "replied", "bounced", "qualified" and
 * "not_interested", which it can hold, so those leads appeared nowhere.
 */
describe("the lead stages come from one list", () => {
  it("the chart derives them rather than restating them", () => {
    const ANALYTICS = readFileSync("src/pages/Analytics.tsx", "utf8");
    expect(ANALYTICS).toContain("const PIPELINE_STAGES = LEAD_STAGES.map((s) => s.value);");
    // Only the comment recording what it used to be may still say it.
    expect(ANALYTICS).not.toMatch(/PIPELINE_STAGES = \[[^\]]*engaged/);
  });

  it("that list is exactly what the column allows", () => {
    const check = LEADS_CHECK.slice(LEADS_CHECK.indexOf("CHECK (pipeline_stage IN ("));
    const allowed = [...check.slice(0, check.indexOf("))")).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect([...LEAD_STAGES.map((s) => s.value)].sort()).toEqual([...allowed].sort());
  });
});

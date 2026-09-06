import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { readdirSync } from "node:fs";

const DISPATCH = readFileSync("supabase/functions/dispatch-sequence-steps/index.ts", "utf8");
const STEP = readFileSync("supabase/functions/process-sequence-step/index.ts", "utf8");
const MIG = readFileSync("supabase/migrations/20260906180000_dispatch_sequence_enrollments.sql", "utf8");
const MCP = readFileSync("supabase/functions/mcp/index.ts", "utf8");

/**
 * A customer enrolled five verified leads into an active sequence over MCP.
 * Every call returned success with a real id, status active, current_step 0.
 * An hour and three quarters later: nothing sent, no agent activity, and the
 * sequence UI still reading zero enrolled.
 *
 * The enrollments were correct. process-sequence-step, which turns one
 * enrollment into a queued email, is correct and deployed. Nothing called it —
 * no cron, no edge function, no frontend. Nineteen cron jobs existed and not
 * one advanced a sequence, so every enrollment path was equally dead: the UI,
 * the AI SDR, the playbook, and MCP.
 */
describe("something advances a due enrollment", () => {
  it("the dispatcher exists", () => {
    expect(existsSync("supabase/functions/dispatch-sequence-steps/index.ts")).toBe(true);
  });

  it("is on a schedule, which is the link that was missing", () => {
    expect(MIG).toContain("'dispatch-sequence-steps'");
    expect(MIG).toContain("cron.schedule");
    expect(MIG).toContain("functions/v1/dispatch-sequence-steps");
  });

  it("survives being scheduled for the first time", () => {
    // Existing migrations call cron.unschedule unguarded, which throws when
    // the job does not exist yet — exactly the case for a new job.
    const block = MIG.slice(MIG.indexOf("cron.unschedule('dispatch-sequence-steps')"));
    expect(block.slice(0, 200)).toContain("EXCEPTION WHEN OTHERS");
  });

  it("selects enrollments that are actually due", () => {
    expect(DISPATCH).toContain('.eq("status", "active")');
    expect(DISPATCH).toMatch(/next_action_at\.lte\./);
  });

  it("treats a null next_action_at as due rather than invisible", () => {
    // Invisible-forever is the bug this function exists to fix; it must not
    // reintroduce a narrower version of it.
    expect(DISPATCH).toContain("next_action_at.is.null");
  });

  it("does not send for a paused or draft sequence", () => {
    expect(DISPATCH).toContain('seq?.status === "active"');
  });

  it("delegates the step rather than reimplementing it", () => {
    // One copy of "what does a step do" is what keeps a sequence behaving the
    // same however it was started.
    expect(DISPATCH).toContain("functions/v1/process-sequence-step");
    expect(DISPATCH).toContain("enrollmentId");
  });

  it("is service-role only, since it advances other people's sequences", () => {
    expect(DISPATCH).toContain("bearer !== serviceKey");
  });

  it("bounds a backlog instead of trying to drain it in one pass", () => {
    expect(DISPATCH).toContain("const BATCH = 200");
    expect(DISPATCH).toContain("CONCURRENCY");
  });

  it("counts a skipped trigger apart from a failure", () => {
    // A trigger condition not yet met is the sequence working, not an error.
    expect(DISPATCH).toContain('body?.action === "email_queued" ? "advanced" : "skipped"');
  });
});

/**
 * The other half of the report: "Sequence UI still shows 0 enrolled" and
 * "Sequence updated_at has not changed since activation". Both are one bug —
 * the UI reads email_sequences.total_enrollments and nothing ever wrote it, so
 * even a working dispatcher would still have displayed zero.
 */
describe("the number the UI shows is maintained", () => {
  it("has a trigger on the table every path writes to", () => {
    expect(MIG).toContain("ON public.sequence_enrollments");
    expect(MIG).toContain("sync_sequence_enrollment_counts");
  });

  it("fires on the transitions that change a count", () => {
    expect(MIG).toContain("AFTER INSERT OR UPDATE OF status OR DELETE");
  });

  it("recounts rather than nudging a delta", () => {
    // A counter adjusted up and down drifts the first time a write is missed
    // or replayed, and the drift is invisible.
    expect(MIG).toContain("SELECT count(*) FROM public.sequence_enrollments");
    expect(MIG).not.toMatch(/total_enrollments\s*=\s*total_enrollments\s*[+-]/);
  });

  it("moves updated_at, which the customer noticed never changed", () => {
    const fn = MIG.slice(MIG.indexOf("sync_sequence_enrollment_counts"), MIG.indexOf("DROP TRIGGER"));
    expect(fn).toContain("updated_at = now()");
  });

  it("backfills the sequences that predate it", () => {
    expect(MIG).toContain("UPDATE public.email_sequences s");
    expect(MIG).toContain("GROUP BY sequence_id");
  });
});

/**
 * Two questions were asked directly, and both have a definite answer in the
 * code rather than a maybe.
 */
describe("the answers to what was asked", () => {
  it("MCP writes to the same table the worker reads", () => {
    expect(MCP).toContain('from("sequence_enrollments").insert');
    expect(STEP).toContain("from('sequence_enrollments')");
  });

  it("can_send_outreach is never consulted on the sequence path", () => {
    // It gates the autonomous agent in agent-run and nothing else, so it
    // cannot be why a manually-activated sequence stayed silent.
    expect(STEP).not.toContain("can_send_outreach");
    expect(DISPATCH).not.toContain("can_send_outreach");
    const RUN = readFileSync("supabase/functions/agent-run/index.ts", "utf8");
    expect(RUN).toContain("can_send_outreach");
  });

  it("no other cron job was advancing sequences", () => {
    // The claim that the link was missing, asserted rather than remembered.
    const migs = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql"));
    const others = migs
      .filter((f) => !f.startsWith("20260906180000"))
      .map((f) => readFileSync(`supabase/migrations/${f}`, "utf8"))
      .join("\n");
    expect(others).not.toContain("functions/v1/process-sequence-step");
    expect(others).not.toContain("functions/v1/dispatch-sequence-steps");
  });
});

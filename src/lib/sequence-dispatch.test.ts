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

  it("is privileged-only, since it advances other people's sequences", () => {
    // This originally compared the bearer against SUPABASE_SERVICE_ROLE_KEY
    // and nothing else. The cron job authenticates with the vault copy of that
    // key, and this repo already documents the vault value going stale as a
    // failure mode that "silently 401s every background job" — so the strict
    // form could reject every scheduled run and leave enrollments exactly as
    // stuck as they were before the dispatcher existed. Notably, no other
    // cron-invoked function here gates on a bearer at all.
    //
    // So both privileged credentials are accepted. What must stay true is that
    // nothing else is: a user token reaching this would let one account
    // advance another's sequences.
    expect(DISPATCH).toMatch(/bearer === serviceKey/);
    expect(DISPATCH).toMatch(/bearer === internalSecret/);
    expect(DISPATCH).toContain("Service role required");
    expect(DISPATCH).toContain("status: 401");
  });

  it("does not fall open when a credential is unset", () => {
    // An empty INTERNAL_TRIGGER_SECRET must not authorize an empty bearer.
    expect(DISPATCH).toMatch(/!!bearer &&/);
    expect(DISPATCH).toMatch(/!!internalSecret && bearer === internalSecret/);
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

  it("nothing but the dispatcher's own schedule drives sequences", () => {
    // Originally this asserted that exactly one migration mentioned the
    // dispatch URL. That broke the moment the migration was applied: Lovable
    // re-commits each applied migration under its own generated filename, so
    // the fix legitimately appears twice and will again on any replay.
    //
    // A second copy is only safe because both name the SAME cron job and
    // unschedule it first. Two differently-named schedules would install two
    // dispatchers and every enrollment would send twice — so that, rather than
    // the file count, is what is worth pinning.
    const migs = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql"));
    const withDispatch = migs.filter((f) =>
      readFileSync(`supabase/migrations/${f}`, "utf8").includes("functions/v1/dispatch-sequence-steps"),
    );
    expect(withDispatch.length).toBeGreaterThan(0);
    for (const f of withDispatch) {
      const sql = readFileSync(`supabase/migrations/${f}`, "utf8");
      expect(sql).toContain("cron.unschedule('dispatch-sequence-steps')");
      expect(sql).toContain("'dispatch-sequence-steps',");
    }

    // process-sequence-step is driven only by the dispatcher, never by a cron
    // of its own. A schedule on it would double-drive every enrollment.
    const all = migs.map((f) => readFileSync(`supabase/migrations/${f}`, "utf8")).join("\n");
    expect(all).not.toContain("functions/v1/process-sequence-step");
  });

  it("cannot have two passes alive at once", () => {
    /*
     * The property every enrollment's step count rests on, and it rests on
     * arithmetic rather than on a lock.
     *
     * process-sequence-step reads `current_step`, inserts the outbox row, and
     * only then advances the step — with no compare-and-set, and no unique
     * index on (enrollment_id, sequence_step). Two passes overlapping on one
     * enrollment would schedule the same step twice and nothing downstream
     * would catch it.
     *
     * What makes that unreachable is that the dispatcher is the only caller
     * and one pass cannot outlive the gap to the next. So the budget and the
     * schedule are a pair, and they live in different files. Shorten the cron
     * past the budget and the duplicate becomes reachable — which is not
     * hypothetical: the rescore backfill in this same repo was moved to every
     * minute, for exactly the reason someone would do it here.
     */
    const DISPATCHER = readFileSync(
      "supabase/functions/dispatch-sequence-steps/index.ts",
      "utf8",
    );
    const budget = DISPATCHER.match(/const BUDGET_MS = ([\d_]+);/);
    expect(budget, "the dispatcher should stop of its own accord").toBeTruthy();
    const budgetMs = Number(budget![1].replace(/_/g, ""));
    expect(budgetMs).toBeGreaterThan(0);

    /*
     * The live schedule: the last line that sets one for *this* job wins.
     *
     * Scoped to the line, not the file. The first version of this scanned
     * whole migrations, and the migration that sets this schedule alters
     * nineteen other jobs in the same file — so it read a daily job's cadence
     * and the assertion below passed with a budget twice the real interval.
     * Found by raising the budget past the interval and watching it stay
     * green.
     */
    const migs = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort();
    let everyMinutes = 0;
    for (const f of migs) {
      for (const line of readFileSync(`supabase/migrations/${f}`, "utf8").split("\n")) {
        if (!line.includes("dispatch-sequence-steps")) continue;
        const m = line.match(/'(?:\*|\d+(?:-\d+)?)\/(\d+) \* \* \* \*'/);
        if (m) everyMinutes = Number(m[1]);
      }
    }
    expect(everyMinutes, "could not read the dispatcher's schedule").toBeGreaterThan(0);
    // A cadence read as hours or days is the signature of that misparse.
    expect(everyMinutes, "schedule read from the wrong job").toBeLessThan(60);

    // A pass must finish before the next one starts, with room to spare.
    expect(budgetMs).toBeLessThan(everyMinutes * 60_000);
  });
});
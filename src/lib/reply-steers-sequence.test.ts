import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

/**
 * A reply did not stop the sequence, and nothing read it.
 *
 * `process-sequence-step` has always carried the guard
 *
 *     if (enrollment.engagement_state === 'replied') { ...complete... }
 *
 * and that read was the ONLY reference to the value in the repository.
 * Nothing wrote it. `update-lead-engagement-state` holds the write and has no
 * caller — not inbox-sync, which stamps `sent_emails.replied_at` and moves on;
 * not analyze-reply, which classified the reply into `reply_analysis` and
 * stopped there. The guard was unreachable, so a prospect who answered kept
 * receiving the rest of the sequence, which is the behaviour that earns
 * complaints from the one person who engaged.
 *
 * Measured on Postgres 16, against the functions below: a reply stops an
 * active enrollment; "not now, March" holds it to that date instead; a
 * dateless "not now" stops it; an out-of-office moves nothing; a held
 * enrollment resumes when its date arrives; and one a person paused by hand
 * is never swept back on.
 */

const MIGRATIONS = "supabase/migrations";

function liveDefinition(name: string): { sql: string; whole: string } {
  const create = `CREATE OR REPLACE FUNCTION public.${name}(`;
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) => readFileSync(`${MIGRATIONS}/${f}`, "utf8").includes(create));
  expect(files.length, `nothing defines ${name}`).toBeGreaterThan(0);
  const whole = readFileSync(`${MIGRATIONS}/${files[files.length - 1]}`, "utf8");
  const from = whole.lastIndexOf(create);
  const end = whole.indexOf("\n$$;", from);
  expect(end).toBeGreaterThan(from);
  const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*--.*$/gm, "");
  return { sql: strip(whole.slice(from, end)), whole: strip(whole) };
}

const body = (p: string) =>
  readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const ANALYZE = body("supabase/functions/analyze-reply/index.ts");
const DISPATCH = body("supabase/functions/dispatch-sequence-steps/index.ts");

describe("the guard that never fired now has a writer", () => {
  it("process-sequence-step still reads the state", () => {
    // If this read ever goes away, everything below is guarding nothing.
    const STEP = body("supabase/functions/process-sequence-step/index.ts");
    expect(STEP).toContain("enrollment.engagement_state === 'replied'");
  });

  it("something finally writes it", () => {
    /*
     * Scoped to the stop branch. The function writes
     * `engagement_state = 'replied'` twice — once on the enrollment and once
     * on the lead — so a bare toContain passes with the enrollment's copy
     * deleted, which is the half the guard actually reads.
     */
    const { sql } = liveDefinition("apply_reply_to_sequence");
    const elseAt = sql.indexOf("ELSE");
    expect(elseAt).toBeGreaterThan(-1);
    const stop = sql.slice(elseAt, sql.indexOf("END IF;", elseAt));
    expect(stop).toContain("UPDATE public.sequence_enrollments");
    expect(stop).toContain("engagement_state = 'replied'");
    expect(stop).toContain("status = 'completed'");
    // And the lead is moved too, or the sequence stops with no visible reason.
    expect(sql).toContain("UPDATE public.leads");
  });

  it("analyze-reply applies the reply instead of only filing it", () => {
    const at = ANALYZE.indexOf("apply_reply_to_sequence");
    expect(at, "classifying a reply and doing nothing is the defect").toBeGreaterThan(-1);
    const call = ANALYZE.slice(at, ANALYZE.indexOf("}", ANALYZE.indexOf("p_check_back_at", at)));
    expect(call).toContain("p_lead_id: leadId");
    expect(call).toContain("p_triage: triage");
    // Logged, not thrown: the classification is already stored and losing it
    // as well would leave no record at all.
    const branch = ANALYZE.slice(ANALYZE.indexOf("if (applyError)"), ANALYZE.indexOf("} else {", ANALYZE.indexOf("if (applyError)")));
    expect(branch).toContain("console.error");
    expect(branch).not.toContain("throw");
  });
});

describe("what the reply actually says decides what happens", () => {
  it("an out-of-office moves nothing", () => {
    /*
     * inbox-sync identifies these from the mail headers, which a model
     * reading the body cannot improve on. Treating one as a reply would stop
     * a sequence because somebody is on holiday.
     */
    const { sql } = liveDefinition("apply_reply_to_sequence");
    const at = sql.indexOf("p_triage = 'ooo'");
    expect(at).toBeGreaterThan(-1);
    expect(sql.slice(at, at + 200)).toContain("'ignored'");
    expect(at).toBeLessThan(sql.indexOf("status = 'completed'"));
  });

  it("a named date holds the sequence rather than ending it", () => {
    const { sql } = liveDefinition("apply_reply_to_sequence");
    expect(sql).toMatch(/p_triage = 'soft_no' AND p_check_back_at IS NOT NULL AND p_check_back_at > now\(\)/);
    const at = sql.indexOf("status = 'paused'");
    expect(at).toBeGreaterThan(-1);
    const hold = sql.slice(at, sql.indexOf("ELSE", at));
    expect(hold).toContain("paused_until = p_check_back_at");
    // next_action_at too, or the resumed enrollment would fire immediately.
    expect(hold).toContain("next_action_at = p_check_back_at");
  });

  it("a dateless no stops rather than guessing a date", () => {
    /*
     * "Not now, try me in March" is a timeline. "Not right now" with nothing
     * after it is a decline, and inventing a date for it invents permission
     * to mail someone again.
     */
    const { sql } = liveDefinition("apply_reply_to_sequence");
    expect(sql).not.toMatch(/interval '\d+ (day|month)/);
    expect(sql).not.toMatch(/now\(\) \+/);
  });

  it("only the service role may apply a reply or resume a sequence", () => {
    for (const name of ["apply_reply_to_sequence", "resume_due_enrollments"]) {
      const { sql, whole } = liveDefinition(name);
      expect(sql, name).toMatch(/IF auth\.role\(\) <> 'service_role' THEN/);
      expect(whole, name).toMatch(
        new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^)]*\\) FROM PUBLIC, anon, authenticated;`),
      );
    }
  });
});

describe("a held sequence comes back, and a paused one does not", () => {
  it("the sweep only takes enrollments holding a date", () => {
    /*
     * A sequence someone paused by hand has `paused_until IS NULL`. Being
     * restarted by a sweep they did not ask for is worse than staying stopped.
     */
    const { sql } = liveDefinition("resume_due_enrollments");
    expect(sql).toContain("status = 'paused'");
    expect(sql).toContain("paused_until IS NOT NULL");
    expect(sql).toContain("paused_until <= now()");
    // And it clears the hold, or the same row resumes on every pass.
    expect(sql).toContain("paused_until = NULL");
  });

  it("the dispatcher runs the sweep before asking what is due", () => {
    // A held enrollment would otherwise wait a whole extra cycle past the day
    // the prospect named.
    const sweep = DISPATCH.indexOf('rpc("resume_due_enrollments")');
    const query = DISPATCH.indexOf('.from("sequence_enrollments")');
    expect(sweep, "nothing resumes a held enrollment").toBeGreaterThan(-1);
    expect(sweep).toBeLessThan(query);
    // A failed sweep does not stop the run: active enrollments still owe work.
    const branch = DISPATCH.slice(DISPATCH.indexOf("if (resumeError)"), sweep + 600);
    expect(branch).toContain("console.error");
    expect(branch).not.toContain("return");
  });

  it("there is no second schedule to go wrong", () => {
    const sql = readdirSync(MIGRATIONS)
      .filter((f) => f.includes("replies_steer"))
      .map((f) => readFileSync(`${MIGRATIONS}/${f}`, "utf8"))
      .join("");
    expect(sql).not.toContain("cron.schedule");
  });
});

describe("a question comes back with an answer drafted", () => {
  it("the draft is stored, not sent", () => {
    const at = ANALYZE.indexOf("from('email_drafts')");
    expect(at, "a question should leave a draft behind").toBeGreaterThan(-1);
    const block = ANALYZE.slice(at, at + 500);
    expect(block).toContain("body: suggestedReply");
    expect(block).toContain("lead_id: leadId");
    // Nothing here sends it or decides it is good enough to send.
    expect(block).not.toMatch(/send-email|gmailSend|messages\/send/);
  });

  it("an auto-reply never gets one", () => {
    const at = ANALYZE.indexOf("const suggestedReply");
    expect(at).toBeGreaterThan(-1);
    expect(ANALYZE.slice(at, ANALYZE.indexOf(";", at))).toContain("!isAutoReply");
  });

  it("a date the model invents cannot extend a hold", () => {
    /*
     * An unparseable string, a past date, or one more than a year out is
     * treated as no date at all — and a dateless no stops the sequence, so a
     * bad parse can only ever stop mail going out.
     */
    const at = ANALYZE.indexOf("let checkBackAt");
    expect(at).toBeGreaterThan(-1);
    const block = ANALYZE.slice(at, ANALYZE.indexOf("const suggestedReply", at));
    expect(block).toContain("Number.isFinite(parsed)");
    expect(block).toContain("parsed > Date.now()");
    expect(block).toContain("MAX_HOLD_MS");
  });

  it("the model is told what it may not invent", () => {
    const SRC = readFileSync("supabase/functions/analyze-reply/index.ts", "utf8");
    expect(SRC).toMatch(/Never invent a price, a customer name, a metric or a case study/);
    expect(SRC).toMatch(/check_back_at rules:/);
  });
});

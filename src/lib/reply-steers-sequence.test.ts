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

describe("stopping reaches the mail already queued", () => {
  /*
   * process-sequence-step writes a sent_emails row at 'scheduled' BEFORE the
   * enrollment moves on, and process-scheduled-emails sends whatever is
   * scheduled and due. That function contained no reference to
   * sequence_enrollments at all, so a reply that stopped a sequence did not
   * stop the follow-up already in the queue.
   *
   * Measured on Postgres 16: a reply stops the enrollment and cancels its one
   * scheduled row while leaving the sent one alone; a hold cancels tomorrow's
   * queued step; a later hard_no stops a held enrollment and clears the date;
   * and the sweep cannot then resurrect it.
   */
  it("cancels the queued rows when the sequence stops or holds", () => {
    const { sql } = liveDefinition("cancel_queued_sequence_mail");
    expect(sql).toContain("UPDATE public.sent_emails");
    expect(sql).toContain("status = 'cancelled'");
    // Only what has not gone out. Anything sent is history, not a plan.
    expect(sql).toContain("AND status = 'scheduled'");

    const apply = liveDefinition("apply_reply_to_sequence").sql;
    expect([...apply.matchAll(/cancel_queued_sequence_mail/g)].length,
      "both the stop and the hold have queued mail to cancel").toBe(2);
  });

  it("a later reply can stop an enrollment that is on hold", () => {
    /*
     * The stop matched `status = 'active'` only, so once a dated soft_no had
     * held an enrollment a later hard_no could not end it — and the sweep
     * restarted it on the old date with the enrollment never marked replied.
     */
    const { sql } = liveDefinition("apply_reply_to_sequence");
    const elseAt = sql.indexOf("ELSE");
    const stop = sql.slice(elseAt, sql.indexOf("END IF;", elseAt));
    expect(stop).toMatch(/status IN \('active', 'paused'\)/);
    // And the hold is cleared, or the sweep brings back what the reply ended.
    expect(stop).toContain("paused_until = NULL");
  });

  it("the sender asks the enrollment before it sends", () => {
    /*
     * Cancelling at the decision closes the common case; this closes the
     * window between a row being claimed and the decision landing, and covers
     * every other way an enrollment can stop.
     */
    const CRON = body("supabase/functions/process-scheduled-emails/index.ts");
    const at = CRON.indexOf("if (email.enrollment_id)");
    expect(at, "the sender never looked at the enrollment").toBeGreaterThan(-1);
    /*
     * Ended on real code, not on the comment that used to mark this spot:
     * `body()` strips comments, so indexOf returned -1, the slice ran to the
     * end of the file, and the assertion below was satisfied by an unrelated
     * `defer` three hundred lines away. The mutation that deleted this very
     * branch passed because of it.
     */
    const end = CRON.indexOf("const ul = userLimits[email.user_id];", at);
    expect(end, "anchor the slice on code, not on a comment").toBeGreaterThan(at);
    const block = CRON.slice(at, end);
    expect(block).toContain('.from("sequence_enrollments")');
    // An unreadable enrollment defers rather than sending blind.
    expect(block).toContain("defer(email,");
  });

  it("states what may send, rather than what may not", () => {
    /*
     * This check has now been wrong in both directions. First it rejected
     * anything not 'active', killing the final step of every sequence. Then
     * it listed the statuses that block and let the rest through — a
     * denylist, which missed 'exited', the status the Archive button writes:
     * a user archived a lead, was told it was removed from the sequence, and
     * the queued mail went out anyway.
     *
     * An allowlist is the only shape that is safe here, because the cost of
     * the wrong answer is a send to someone who should not get one. A status
     * nobody has invented yet must block, not send.
     */
    const CRON = body("supabase/functions/process-scheduled-emails/index.ts");
    const at = CRON.indexOf("const sendable =");
    expect(at, "a denylist lets every future status through").toBeGreaterThan(-1);
    const rule = CRON.slice(at, CRON.indexOf("if (!sendable)", at));
    expect(rule).toMatch(/enr !== null/);
    expect(rule).toMatch(/enr\.status === "active"/);
    expect(rule).toMatch(/enr\.status === "completed" && enr\.engagement_state !== "replied"/);
    // Nothing else may appear as a thing that permits a send.
    expect(rule).not.toMatch(/exited|stopped|paused/);
  });

  it("archived and orphaned mail does not send", () => {
    // 'exited' is what Archive writes, and it cancels no queued mail.
    const PANEL = readFileSync("src/components/sequences/HandoffActionPanel.tsx", "utf8");
    expect(PANEL, "if Archive stopped writing 'exited', this guard is stale")
      .toMatch(/status: 'exited'/);
    const CRON = body("supabase/functions/process-scheduled-emails/index.ts");
    const at = CRON.indexOf("if (!sendable)");
    const branch = CRON.slice(at, CRON.indexOf("continue;", at));
    expect(branch).toContain("no longer exists");
  });

  it("a reply reaches a sequence that finished with mail still queued", () => {
    /*
     * process-sequence-step marks an enrollment 'completed' on the pass after
     * the last email is queued. A cap deferring that email leaves a completed
     * enrollment with mail outstanding, and the stop matched only active and
     * paused — so a reply in that window neither marked it replied nor
     * cancelled the mail, and the final follow-up went out after the answer.
     *
     * Measured: the reply marks it, cancels the queued row, and leaves the
     * original completed_at alone; a sequence that finished and sent
     * everything is not touched at all.
     */
    const { sql } = liveDefinition("apply_reply_to_sequence");
    const elseAt = sql.indexOf("ELSE");
    const stop = sql.slice(elseAt, sql.indexOf("END IF;", elseAt));
    expect(stop).toMatch(/e\.status IN \('active', 'paused'\)/);
    expect(stop).toMatch(/OR \(e\.status = 'completed' AND EXISTS/);
    expect(stop).toContain("s.status = 'scheduled'");
    // Not every completed enrollment: one that sent everything is history.
    expect(stop).toContain("coalesce(e.completed_at, now())");
  });

  it("a sequence that merely ran out of steps still sends its last email", () => {
    /*
     * The first version of the guard rejected anything not 'active', which
     * kills a legitimate send: process-sequence-step marks an enrollment
     * 'completed' on the pass AFTER the final email is queued, so the last
     * step of every sequence sits against a completed enrollment. A cap or a
     * paused mailbox deferring it that long made the rejection permanent.
     *
     * What stops a send has to be a decision, not an ending.
     */
    const CRON = body("supabase/functions/process-scheduled-emails/index.ts");
    const at = CRON.indexOf("const sendable =");
    expect(at, "status alone cannot tell a finish from a stop").toBeGreaterThan(-1);
    const rule = CRON.slice(at, CRON.indexOf("if (!sendable)", at));
    // A finish is sendable; a reply-ended sequence is not.
    expect(rule).toMatch(/enr\.status === "completed" && enr\.engagement_state !== "replied"/);
    // A bare status check would send nothing after any sequence ended.
    expect(rule).not.toMatch(/enr\.status !== "active"/);
  });

  it("the signal it leans on is one apply_reply_to_sequence actually writes", () => {
    // Asserted against the function rather than assumed: if the stop stopped
    // setting engagement_state, the rule above would quietly let replied
    // sequences send their queued mail.
    const { sql } = liveDefinition("apply_reply_to_sequence");
    const elseAt = sql.indexOf("ELSE");
    const stop = sql.slice(elseAt, sql.indexOf("END IF;", elseAt));
    expect(stop).toContain("engagement_state = 'replied'");
  });

  it("the agent's own pause, resume and stop clear it too", () => {
    /*
     * runOutboundTool is the executor behind the update_enrollment tool. Its
     * pause set only status and paused_reason, so an agent pausing a
     * reply-held enrollment left the old date for the sweep to act on and the
     * pause undid itself.
     *
     * I told the review I could not find this executor. My grep for
     * update_enrollment excluded agent-outbound-tools.ts — the file that
     * declares the tool AND implements it — so I filtered out the answer.
     */
    const TOOLS = body("supabase/functions/_shared/agent-outbound-tools.ts");
    const at = TOOLS.indexOf('case "update_enrollment"');
    expect(at).toBeGreaterThan(-1);
    const block = TOOLS.slice(at, TOOLS.indexOf("return updateOwned", at));
    // All three branches, not just the pause that is reachable by the sweep.
    expect([...block.matchAll(/paused_until: null/g)].length).toBe(3);
  });

  it("a pause applied for another reason clears the check-back date", () => {
    // An enrollment held until March and then paused for a handoff was
    // resumed in March by the sweep, undoing a pause set for another reason.
    const HANDOFF = body("supabase/functions/check-handoff-triggers/index.ts");
    const at = HANDOFF.indexOf("status: 'paused'");
    expect(at).toBeGreaterThan(-1);
    expect(HANDOFF.slice(at, at + 200)).toContain("paused_until: null");
  });
});

describe("every path that reads a reply tells the sequence", () => {
  it("the agent path applies the decision too", () => {
    /*
     * agent-run calls inbox-sync with no body, so `analyzeReplies` is
     * undefined and analyze-reply never runs. It classifies the reply itself
     * and writes reply_analysis directly — and a later scheduled sync skips
     * the message because a row already exists. Without this call a reply the
     * agent read never stopped its sequence.
     */
    const AGENT = body("supabase/functions/agent-run/index.ts");
    expect(AGENT).toContain('rpc("apply_reply_to_sequence"');
    expect(AGENT).toMatch(/p_lead_id: reply\.leadId/);
  });

  it("maps the agent's own taxonomy rather than passing it through", () => {
    // Its vocabulary is interested | objection | meeting_request |
    // not_interested | unsubscribe | out_of_office | auto_reply | unknown.
    const AGENT = body("supabase/functions/agent-run/index.ts");
    const at = AGENT.indexOf("const triageForSequence");
    expect(at).toBeGreaterThan(-1);
    const map = AGENT.slice(at, AGENT.indexOf("if (reply.leadId)", at));
    // Only the automated ones are ignored; a person who wrote back stops it.
    expect(map).toContain('"out_of_office"');
    expect(map).toContain('"auto_reply"');
    expect(map).toContain('"ooo"');
    expect(map).toContain('"hard_no"');
    expect(map).toContain('"positive"');
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

  it("the draft survives an existing one for the same lead", () => {
    /*
     * `email_drafts_user_lead_key` allows one draft per user per lead, so a
     * plain insert raised a unique violation whenever an outreach draft
     * already existed — the common case, since the lead was being emailed —
     * and the branch below only logged it. The answer was lost in silence.
     */
    const at = ANALYZE.indexOf("from('email_drafts')");
    expect(at).toBeGreaterThan(-1);
    const block = ANALYZE.slice(at, at + 700);
    expect(block).toContain(".upsert(");
    expect(block).toMatch(/onConflict: 'user_id,lead_id'/);
    expect(block).not.toMatch(/\.insert\(\{/);
  });

  it("the model is given a date to count from", () => {
    // "next quarter" and "in a couple of months" mean nothing without one,
    // and the provider does not add it.
    const SRC = readFileSync("supabase/functions/analyze-reply/index.ts", "utf8");
    expect(SRC).toMatch(/TODAY IS \$\{new Date\(\)\.toISOString\(\)\.slice\(0, 10\)\}/);
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

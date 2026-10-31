import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = readFileSync("supabase/migrations/20261031030000_hiring_signal_refresh.sql", "utf8");
const WORKER = readFileSync("supabase/functions/refresh-hiring-signals/index.ts", "utf8");
const DETECTOR = readFileSync("supabase/functions/detect-hiring-signals/index.ts", "utf8");

/** Source with comments stripped, so an assertion cannot match its own explanation. */
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
/** SQL with `--` comments stripped, for the same reason. */
const sql = (s: string) => s.replace(/^\s*--.*$/gm, "");

const worker = code(WORKER);
const detector = code(DETECTOR);
const migration = sql(MIGRATION);

/**
 * `detect-hiring-signals` had exactly one caller, `enrich-lead`, so a lead's
 * job board was read once in its life and never again.
 *
 * Every role posted afterwards was invisible, and SIGNAL_FRESHNESS_DAYS (120)
 * meant the signal aged out of the email copy with nothing replacing it. The
 * entire value of "they posted this role three weeks ago" is that it is true
 * this week, so a signal sampled once at enrichment is a snapshot rather than
 * a signal.
 */
describe("the schedule exists and is reachable", () => {
  it("a cron job calls a trigger that calls the worker", () => {
    expect(migration).toContain("cron.schedule('refresh-hiring-signals'");
    expect(migration).toContain("public.trigger_hiring_refresh()");
    expect(migration).toContain("/functions/v1/refresh-hiring-signals");
  });

  it("it is unscheduled first, so re-running the migration does not double it", () => {
    const unschedule = migration.indexOf("cron.unschedule('refresh-hiring-signals')");
    const schedule = migration.indexOf("cron.schedule('refresh-hiring-signals'");
    expect(unschedule).toBeGreaterThan(-1);
    expect(unschedule).toBeLessThan(schedule);
  });

  it("the trigger signs with the internal job key, not the anon key", () => {
    /*
     * The worker rejects the anon key, so a trigger holding one would fail
     * every hour in a warning nobody reads — which is how the batch queue once
     * recorded a hundred per cent failure.
     */
    expect(migration).toContain("public.internal_job_key()");
    expect(migration).toContain("'Bearer ' || config_key");
    expect(migration).not.toMatch(/anon_key/);
  });

  it("the trigger makes no HTTP call when nothing is due", () => {
    const check = migration.indexOf("leads_due_for_hiring_refresh(1)");
    const post = migration.indexOf("net.http_post");
    expect(check).toBeGreaterThan(-1);
    expect(check, "the due-count check must precede the call").toBeLessThan(post);
    expect(migration).toContain("IF due_ct = 0 THEN RETURN; END IF;");
  });

  it("missing credentials warn and return rather than erroring the cron job", () => {
    expect(migration).toContain("RAISE WARNING 'trigger_hiring_refresh");
  });
});

describe("which leads get re-polled", () => {
  it("only leads with a live sequence enrollment", () => {
    /*
     * Re-polling a board for a lead nobody is emailing buys nothing, and
     * research-lead now backfills the signal the moment somebody picks one up.
     * So the schedule covers "being worked" and research covers "about to be".
     */
    expect(migration).toContain("public.sequence_enrollments");
    expect(migration).toContain("e.status = 'active'");
  });

  it("only leads whose signal is missing or stale", () => {
    expect(migration).toMatch(/t\.last_seen IS NULL OR t\.last_seen < now\(\) - interval '14 days'/);
  });

  it("the window is shorter than the freshness the copy requires", () => {
    /*
     * A signal refreshed after it has already aged out of the copy is no use,
     * so the refresh window has to sit inside SIGNAL_FRESHNESS_DAYS rather
     * than beyond it. Read from the constant rather than restated.
     */
    const facts = readFileSync("supabase/functions/_shared/signal-facts.ts", "utf8");
    const freshness = Number(facts.match(/SIGNAL_FRESHNESS_DAYS\s*=\s*(\d+)/)?.[1]);
    expect(freshness, "could not read SIGNAL_FRESHNESS_DAYS").toBeGreaterThan(0);
    const window = Number(migration.match(/interval '(\d+) days'/)?.[1]);
    expect(window, "could not read the refresh window").toBeGreaterThan(0);
    expect(window).toBeLessThan(freshness);
  });

  it("skips leads with nothing to look a board up by", () => {
    expect(migration).toMatch(/company_website.*<>\s*''\s*OR.*company_name.*<>\s*''/s);
  });

  it("round-robins across accounts so one big book cannot own the schedule", () => {
    /*
     * process-rescore-queue had exactly this problem: ordering globally by
     * enqueued_at meant one account's bulk import starved every other
     * account's scores behind it.
     */
    expect(migration).toContain("PARTITION BY l.user_id");
    expect(migration).toMatch(/ORDER BY\s+due\.rn ASC/);
  });

  it("the batch is bounded in the database as well as the worker", () => {
    // A caller passing p_limit = 100000 must not get it.
    expect(migration).toContain("least(coalesce(p_limit, 40), 200)");
    expect(migration).toContain("greatest(1,");
  });

  it("the selector is service-role only", () => {
    /*
     * It is SECURITY DEFINER and returns rows across every account, so leaving
     * it callable by `authenticated` would let any signed-in user enumerate
     * other people's lead ids through the REST API.
     */
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.leads_due_for_hiring_refresh\(integer\) FROM PUBLIC/);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.leads_due_for_hiring_refresh\(integer\) FROM authenticated/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.leads_due_for_hiring_refresh\(integer\) TO service_role/);
  });
});

describe("the worker", () => {
  it("is internal-only", () => {
    expect(worker).toContain("requireServiceRole(req)");
    const gate = worker.indexOf("requireServiceRole(req)");
    const work = worker.indexOf("leads_due_for_hiring_refresh");
    expect(gate, "the gate must come before any work").toBeLessThan(work);
  });

  it("bounds the batch whatever the caller asks for", () => {
    expect(worker).toContain("Math.min(Math.max(Number(body.batch) || DEFAULT_BATCH, 1), MAX_BATCH)");
  });

  it("limits how many job boards are hit at once", () => {
    /*
     * These are other people's careers endpoints. Forty parallel requests at
     * one ATS is how an IP gets rate-limited — which live probing already
     * showed happening on Workable, where every attempt returned 429.
     */
    expect(worker).toContain("CONCURRENCY");
    const c = Number(worker.match(/CONCURRENCY\s*=\s*(\d+)/)?.[1]);
    expect(c).toBeGreaterThan(0);
    expect(c).toBeLessThanOrEqual(10);
    expect(worker).toContain("queue.shift()");
  });

  it("a single lead failing does not abandon the batch", () => {
    // One unreachable board must not stop the other thirty-nine.
    expect(worker).toMatch(/catch \(e\) \{[\s\S]*?failed\+\+/);
    expect(worker).toContain("await Promise.all(workers)");
  });

  it("every call is time-bounded", () => {
    expect(worker).toContain("AbortController");
    expect(worker).toContain("CALL_TIMEOUT_MS");
    expect(worker).toContain("clearTimeout(timer)");
  });

  it("a deduped result is not counted as a new signal", () => {
    // Most polls find the same newest posting; reporting those as detections
    // would make the logs read as though it were working harder than it is.
    expect(worker).toContain("out?.detected && !out?.deduped");
  });

  it("it refreshes hiring only, and not the detectors that cost money", () => {
    /*
     * detect-tech-signals spends a Bloomberry credit on every uncached lookup
     * and detect-news-signals a PredictLeads one. Scheduling those would spend
     * third-party credits across a whole book of leads, which is an
     * account-level spending decision rather than a code one.
     */
    expect(worker).toContain("detect-hiring-signals");
    expect(worker).not.toContain("detect-tech-signals");
    expect(worker).not.toContain("detect-news-signals");
  });
});

describe("the detector can be called by a job, not only a person", () => {
  it("it resolves a caller instead of demanding a user token", () => {
    /*
     * It called auth.getUser() on whatever token arrived. A service key is not
     * a user, so a scheduled refresh would have taken 401 on every lead — the
     * exact failure resolveCaller was written for after it happened to the
     * generate-email queue, which recorded total failure for as long as it
     * existed.
     */
    expect(detector).toContain("resolveCaller(req)");
    expect(detector).not.toContain("auth.getUser(");
    expect(detector).not.toContain("Invalid user token");
  });

  it("the owner comes from the lead row, never from the request", () => {
    /*
     * An internal caller is trusted but does not get to say whose lead it is
     * acting on. ownerOf reads that off the row, so a forged user_id in the
     * body cannot work — no body is ever read for one.
     */
    expect(detector).toContain('ownerOf(supabase, "leads", leadId, caller)');
    expect(detector).not.toMatch(/body\.user_?[Ii]d/);
    // Every write and read is scoped to the resolved owner.
    expect(detector).toContain("user_id: ownerId");
    expect(detector).toContain('.eq("user_id", ownerId)');
  });

  it("an unknown lead and someone else's lead give the same answer", () => {
    // ownerOf returns null for both, so the reply cannot be used to discover
    // whose a record is.
    expect(detector).toContain('if (!ownerId) return json({ error: "lead not found"');
  });
});

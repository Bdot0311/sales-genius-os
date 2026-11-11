import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

/**
 * Three kinds of work were built, wired and never reached.
 *
 * `process-agent-jobs` maps enrich, score and research to their edge
 * functions, and the schema constrains `agent_jobs.kind` to those plus draft
 * and search. But every insert in the codebase wrote `kind: "draft"`, so the
 * other three existed end to end and were unreachable.
 *
 * Meanwhile `enrich_leads`, `score_leads` and `research_leads` walked their
 * ids with `mapLimit`, which stops when the turn's budget is gone and hands
 * back what it never started. That remainder was reported to the model as
 * "skipped — ran out of time" and then existed nowhere: if the model did not
 * retry it, and on the last pass it cannot, the work was simply not done and
 * nothing said so. Drafting has not behaved that way since the batch queue
 * was built. This is the call that was missing.
 */

const AGENT = readFileSync("supabase/functions/agent-chat/index.ts", "utf8");
const WORKER = readFileSync("supabase/functions/process-agent-jobs/index.ts", "utf8");
/** Body only: a comment quoting code must not satisfy an assertion about it. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const AGENT_CODE = code(AGENT);

describe("the work a turn cannot reach is queued, not dropped", () => {
  it.each(["enrich", "score", "research"])("%s queues its remainder", (kind) => {
    expect(AGENT_CODE).toContain(`queueSkipped("${kind}"`);
  });

  it("no longer tells the model the remainder was skipped", () => {
    // "skipped — ran out of time" was the whole defect: a report with no work
    // behind it.
    expect(AGENT_CODE).not.toContain("skipped — ran out of time");
  });

  it("tells the model not to re-run what is already queued", () => {
    // Without this the model burns the rest of the turn re-requesting ids a
    // worker already holds.
    expect(AGENT_CODE).toMatch(/already being worked/);
  });
});

describe("the kinds are independent work", () => {
  it("dedupes per kind, not per lead", () => {
    /*
     * The sharp edge of sharing one queue. A lead whose draft is already
     * queued can still need enriching, and the pending check used to look at
     * every live job the account had — correct while draft was the only kind,
     * and a silent bug the moment it was not: that lead would read as
     * "already queued" for enrichment and never be enriched.
     */
    const helper = AGENT_CODE.slice(AGENT_CODE.indexOf("const queueWork = async ("));
    expect(helper).toMatch(/\.eq\("kind", kind\)/);
    expect(helper).toContain("const handled = handledFor(kind);");
  });

  it("opens one job per kind rather than mixing them", () => {
    expect(AGENT_CODE).toContain("const batchJobIds = new Map<string, string>();");
    expect(AGENT_CODE).toMatch(/batchJobIds\.set\(kind, batchJobId\)/);
  });

  it("writes a goal only on the kind that reads one", () => {
    // The column is NOT NULL. Setting null on a research job fails the insert,
    // which the chat reported as "Could not queue the rest". Omit the field
    // and keep the default instead.
    const helper = AGENT_CODE.slice(AGENT_CODE.indexOf("const queueWork = async ("));
    expect(helper).toContain("...(kind === \"draft\" ? { goal, feedback: feedback || null } : {})");
    expect(helper).not.toContain("goal: kind === \"draft\" ? goal : null");
    expect(readFileSync("supabase/migrations/20260922190000_agent_job_queue.sql", "utf8")).toContain(
      "goal               text NOT NULL",
    );
  });

  it("still counts only drafts on the drafting card", () => {
    const helper = AGENT_CODE.slice(AGENT_CODE.indexOf("const queueWork = async ("));
    expect(helper).toMatch(/if \(kind === "draft"\) draftTally\.queued/);
  });
});

describe("every kind the agent can enqueue is one the worker can run", () => {
  /*
   * The cross-file invariant, and the reason it is asserted rather than
   * trusted: an item of a kind nothing handles is claimed, not recognised,
   * and sits there. The agent would report it queued and the worker would
   * never do it — the same silent non-completion this change exists to
   * remove, moved one layer down.
   */
  const enqueueable = () => {
    /*
     * The whole union, not a prefix of it.
     *
     * The first version of this spelled the four kinds out literally, so
     * appending a fifth to the signature left the pattern matching the first
     * four and the new one invisible — the assertion below passed on exactly
     * the drift it exists to catch. Found by adding a kind the worker cannot
     * run and watching it stay green.
     */
    const sig = AGENT_CODE.slice(AGENT_CODE.indexOf("const queueWork = async ("));
    /*
     * To the comma that ends the parameter, not to the end of the line.
     *
     * A union of string literals contains no commas, so the first one closes
     * it however many lines it spans. Reading one line meant a kind added on
     * a continuation line was invisible to both checks below — the third
     * version of this parse, after one that matched a fixed list of four and
     * one that stopped at the newline.
     */
    const from = sig.indexOf("kind:");
    const union = sig.slice(from, sig.indexOf(",", from));
    const kinds = [...union.matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
    expect(kinds.length, "queueWork should name the kinds it accepts").toBeGreaterThan(0);
    return kinds;
  };

  const runnable = () => {
    const map = WORKER.slice(WORKER.indexOf("const LEAD_FUNCTION"));
    const body = map.slice(0, map.indexOf("}"));
    const kinds = [...body.matchAll(/^\s*([a-z]+):\s*"/gm)].map((m) => m[1]);
    // Plus the kinds the worker branches on by name rather than through the map.
    const branched = [...WORKER.matchAll(/job\.kind === "([a-z]+)"/g)].map((m) => m[1]);
    return new Set([...kinds, ...branched]);
  };

  it("maps each one to something that runs", () => {
    const runs = runnable();
    expect(runs.size, "the worker should handle at least one kind").toBeGreaterThan(0);
    const orphans = enqueueable().filter((k) => !runs.has(k));
    expect(orphans, `the worker has no handler for: ${orphans.join(", ")}`).toEqual([]);
  });

  it("names only kinds the database will accept", () => {
    // The CHECK is the last line; an insert of an unknown kind fails the whole
    // enqueue rather than queueing work nothing will do.
    const MIGRATIONS = "supabase/migrations";
    const file = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .filter((f) => readFileSync(`${MIGRATIONS}/${f}`, "utf8").includes("agent_jobs_kind_check"))
      .pop();
    expect(file, "something should constrain agent_jobs.kind").toBeTruthy();
    const sql = readFileSync(`${MIGRATIONS}/${file}`, "utf8");
    const allowed = sql.slice(sql.indexOf("CHECK (kind IN ("));
    for (const k of enqueueable()) {
      expect(allowed.slice(0, allowed.indexOf(")"))).toContain(`'${k}'`);
    }
  });
});

describe("the handover tells the truth about what it queued", () => {
  /*
   * The first version answered with a string and let the caller assume every
   * skipped id was covered by it. Two ways that lied, both in the error path:
   * a failed job or item insert returned no note, so the ids appeared in
   * neither the queued list nor anywhere else; and when some ids were already
   * pending while the insert for the rest failed, the note was non-empty, so
   * the caller reported the whole set as queued and told the model not to
   * retry any of it. The same silent non-completion this change removes,
   * reintroduced one layer in.
   */
  it("reports the ids it actually wrote, not the ids it was given", () => {
    const helper = AGENT_CODE.slice(AGENT_CODE.indexOf("const queueSkipped = async ("));
    expect(helper).toContain("const settled = new Set([...queuedIds, ...coveredIds]);");
    expect(helper).toMatch(/stillOutstanding = skipped\.filter\(\(id\) => !settled\.has\(id\)\)/);
  });

  it("counts a lead already on the queue as in hand, not outstanding", () => {
    /*
     * The mirror of the bug above, and the one I introduced fixing it. A lead
     * already sitting on a live job of this kind is not written again —
     * correctly, since writing it twice is what the dedupe exists to stop.
     * Counting that as outstanding told the model to retry work a worker
     * already held, and a retry runs it inline: the same work paid for twice
     * and written twice.
     */
    const helper = AGENT_CODE.slice(AGENT_CODE.indexOf("const queueWork = async ("));
    expect(helper).toMatch(/const coveredIds = leadIds\.filter\(\(id\) => !toQueue\.includes\(id\)\)/);
    /*
     * Every return hands back the real set, including the failure paths,
     * where "covered" and "written" differ. Matched as the shorthand rather
     * than as the word: `coveredIds: []` contains "coveredIds" and satisfied
     * the first version of this, which is how a failure path that stopped
     * reporting what it covered passed the check.
     */
    for (const m of helper.matchAll(/return \{ queued: [^}]*\}/g)) {
      // Present, and never the empty literal. One branch legitimately returns
      // `coveredIds: leadIds` — there, every id is covered.
      expect(m[0], `a return drops the covered set: ${m[0]}`).toContain("coveredIds");
      expect(m[0], `a return reports nothing covered: ${m[0]}`).not.toMatch(/coveredIds:\s*\[\]/);
    }
    const skipper = AGENT_CODE.slice(AGENT_CODE.indexOf("const queueSkipped = async ("));
    expect(skipper).toMatch(/const inHand = skipped\.filter\(\(id\) => settled\.has\(id\)\)/);
    expect(skipper).toMatch(/queued: inHand/);
  });

  it("never claims a failed write as queued", () => {
    const helper = AGENT_CODE.slice(AGENT_CODE.indexOf("const queueWork = async ("));
    // Every failure return carries an empty id list.
    for (const m of helper.matchAll(/return \{ queued: 0, [^}]*\}/g)) {
      expect(m[0]).toContain("queuedIds: []");
    }
    expect(helper).toMatch(/return \{ queued: toQueue\.length, alreadyPending, queuedIds, coveredIds \}/);
  });

  it.each(["enrich_leads", "score_leads", "research_leads"])(
    "%s keeps unqueued leads visible",
    (tool) => {
      const body = AGENT_CODE.slice(AGENT_CODE.indexOf(`case "${tool}"`));
      const ret = body.slice(0, body.indexOf("\n        case "));
      expect(ret).toContain("queued_lead_ids: handover.queued");
      expect(ret).toContain("not_done_lead_ids: handover.stillOutstanding");
    },
  );
});

describe("a forced refresh stays forced once it is queued", () => {
  /*
   * research_leads takes a `force` meaning "ignore the cached brief and
   * scrape again". The inline path forwarded it and the queued path did not,
   * so an overflowing forced refresh came back as the very brief the user
   * asked to replace — returned without an error, and settled as done. A
   * wrong answer that looked like a right one.
   */
  it("sends the option with the work", () => {
    expect(AGENT_CODE).toMatch(/queueSkipped\("research", skipped, name, force \? \{ force: true \} : null\)/);
  });

  it("writes it onto the item", () => {
    const helper = AGENT_CODE.slice(AGENT_CODE.indexOf("const queueWork = async ("));
    expect(helper).toMatch(/\.\.\.\(itemPayload \? \{ payload: itemPayload \} : \{\}\)/);
  });

  it("and the worker forwards it", () => {
    // Carrying it without forwarding it would be theatre.
    const worker = code(WORKER);
    expect(worker).toContain("const itemOptions = (item.payload ?? {}) as Record<string, unknown>;");
    expect(worker).toMatch(/\.\.\.\(itemOptions\.force === true \? \{ force: true \} : \{\}\)/);
  });
});

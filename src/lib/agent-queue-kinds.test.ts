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
    // The other kinds take the lead row as it stands; a goal on an enrich job
    // is a value nothing reads, which later reads as intent.
    const helper = AGENT_CODE.slice(AGENT_CODE.indexOf("const queueWork = async ("));
    expect(helper).toMatch(/goal: kind === "draft" \? goal : null/);
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
    const line = sig.slice(sig.indexOf("kind:"), sig.indexOf("\n", sig.indexOf("kind:")));
    const kinds = [...line.matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
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

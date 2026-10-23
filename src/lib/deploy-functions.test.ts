import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolveFunctionsToDeploy } from "../../scripts/functions-to-deploy.mjs";

/**
 * A merged function that never ran.
 *
 * `smtp-capability-probe` was written, reviewed over six rounds, merged, and
 * then answered 404 half an hour later. All ten checks on its pull request
 * were green, because not one of them deploys anything: the frontend ships
 * through Netlify, the database through migrations, and the edge functions
 * through somebody remembering. Nothing in the repo ran
 * `supabase functions deploy`, and no Supabase check ever appeared on a PR.
 *
 * The part that is worse than the missing function is the half-applied
 * release. A function bundles its imports when it is deployed, so each one
 * carries its own copy of `_shared`. Deploying only the directories a diff
 * names leaves every other importer of a changed shared module running the
 * old code, with nothing anywhere saying so.
 *
 * Measured on this repo: the commit that merged #295 touched two function
 * directories and needed eight functions deployed.
 */

const ROOT = process.cwd();
const BASE = "supabase/functions";

const run = (...paths: string[]) => resolveFunctionsToDeploy({ changedPaths: paths, root: ROOT });

/**
 * Functions whose entrypoint imports a shared module, found without the script.
 *
 * Matched on the import statement, not on the module's name appearing in the
 * file: `smtp-capability-probe` mentions `_shared/email-verify.ts` in a
 * comment and imports nothing from it, and a looser grep made this oracle
 * cruder than the thing it was checking.
 */
function importersByGrep(sharedModule: string): string[] {
  const out = execFileSync("grep", [
    "-rl",
    `from "../_shared/${sharedModule}.ts"`,
    "--include=index.ts",
    BASE,
  ], { encoding: "utf8" });
  return out.split("\n").filter(Boolean).map((p) => p.split("/")[2]).sort();
}

describe("a merge deploys the functions it actually changed", () => {
  it("a touched function is the only one deployed", () => {
    expect(run(`${BASE}/sync-bounces/index.ts`)).toEqual(["sync-bounces"]);
  });

  it("a changed shared module deploys every function that imports it", () => {
    /*
     * The failure this exists for: `_shared/email-verify.ts` changed in #295
     * and the diff named no function but `sync-bounces`. Two others import it
     * and were left on the old bundle.
     *
     * Checked against an independent grep rather than a list written here, so
     * the assertion cannot drift as functions are added or removed.
     */
    const expected = importersByGrep("email-verify");
    expect(expected.length, "email-verify should have importers").toBeGreaterThan(1);
    const got = run(`${BASE}/_shared/email-verify.ts`);
    for (const name of expected) expect(got, name).toContain(name);
  });

  it("a shared module reached only through another shared module still counts", () => {
    /*
     * `agent-run` imports `_shared/agent-tier-scope.ts`, which imports
     * `_shared/agent-tool-scope.ts`. `agent-run` never names the second one,
     * so a one-step walk misses it and ships a stale tool scope — and tool
     * scope is what decides which tools a custom agent is allowed.
     */
    const direct = readFileSync(`${BASE}/agent-run/index.ts`, "utf8");
    expect(direct, "the chain must stay indirect for this to prove anything")
      .not.toContain("_shared/agent-tool-scope");
    expect(readFileSync(`${BASE}/_shared/agent-tier-scope.ts`, "utf8"))
      .toContain("agent-tool-scope");
    expect(run(`${BASE}/_shared/agent-tool-scope.ts`)).toContain("agent-run");
  });

  it("nothing undeployable is ever named", () => {
    // `_shared` is not a function, and `supabase functions deploy _shared`
    // fails the whole job rather than skipping that one name.
    const all = run(`${BASE}/_shared/email-verify.ts`, `${BASE}/_shared/agent-tool-scope.ts`);
    expect(all.length).toBeGreaterThan(0);
    for (const name of all) {
      expect(name.startsWith("_"), name).toBe(false);
      expect(existsSync(`${BASE}/${name}/index.ts`), `${name} needs an entrypoint`).toBe(true);
    }
  });

  it("the two guards against an undeployable name both stay", () => {
    /*
     * Asserted as source, deliberately, because neither can be made to fail
     * on this tree: `_shared` and `_tests` are the only directories without an
     * entrypoint, so each guard alone already excludes both, and a mutation
     * removing either changes no output. They are kept because they cover
     * different futures, and the shared failure mode is bad — a name that is
     * not a function fails the deploy job for every function in the batch.
     *
     *   - the `_` check: someone adds a barrel `_shared/index.ts`.
     *   - the entrypoint check: a helpers directory without a leading `_`.
     *
     * Claiming behavioural coverage for these would be claiming more than is
     * true, so this says plainly what it is.
     */
    const script = readFileSync("scripts/functions-to-deploy.mjs", "utf8");
    expect(script).toContain('if (!name || name.startsWith("_")) continue;');
    /*
     * Twice: the import walk needs it and so does the config-block pass, and
     * the two are independent sources of names. Counted rather than merely
     * present, because the first version of this assertion was satisfied by
     * the config pass's copy while the walk's had been deleted.
     */
    const entrypointGuard = /if \(!known\.has\(join\(base, name, "index\.ts"\)\)\) continue;/g;
    expect([...script.matchAll(entrypointGuard)].length).toBe(2);
    /*
     * Same for dynamic imports: the tree has none today, so following them
     * cannot be shown to matter here. A function that lazily imports a shared
     * module would otherwise be missed by the walk and quietly left stale.
     */
    expect(script).toMatch(/\\bimport\\s\*\\\(\\s\*\["'\]/);
  });

  it("a path that is not there deploys nothing", () => {
    // A deleted function, and a changed file that is not a function at all.
    expect(run(`${BASE}/removed-function/index.ts`)).toEqual([]);
    expect(run("src/App.tsx", "README.md", "supabase/migrations/20260101000000_x.sql")).toEqual([]);
  });

  it("every function in the tree is reachable by its own path", () => {
    /*
     * A whole-tree sweep, because the cost of this resolver being wrong is a
     * function silently staying on old code. If any directory with an
     * entrypoint cannot be named by changing its own entrypoint, the walk has
     * a hole in it.
     */
    const fns = readdirSync(BASE)
      .filter((d) => !d.startsWith("_") && existsSync(`${BASE}/${d}/index.ts`));
    expect(fns.length).toBeGreaterThan(100);
    const missed = fns.filter((d) => !run(`${BASE}/${d}/index.ts`).includes(d));
    expect(missed, "every function should resolve to itself").toEqual([]);
  });
});

describe("a config change takes effect", () => {
  const CONFIG = "supabase/config.toml";
  const after = readFileSync(CONFIG, "utf8");

  it("a changed verify_jwt redeploys that function on its own", () => {
    /*
     * verify_jwt decides whether a function answers without a session, and it
     * only changes on a redeploy. A commit that flips it touches config.toml
     * and no code at all, so the import walk sees nothing.
     */
    const flipped = after.replace(
      "  [functions.smtp-capability-probe]\n    verify_jwt = false",
      "  [functions.smtp-capability-probe]\n    verify_jwt = true",
    );
    expect(flipped, "the probe's block should be in config.toml").not.toBe(after);
    expect(resolveFunctionsToDeploy({ changedPaths: [CONFIG], root: ROOT, configBefore: flipped }))
      .toEqual(["smtp-capability-probe"]);
  });

  it("a config edit that changes no function redeploys nothing", () => {
    // Comments and formatting move; that is not a reason to redeploy 148
    // functions, and a job that deploys everything gets switched off.
    expect(resolveFunctionsToDeploy({ changedPaths: [CONFIG], root: ROOT, configBefore: after }))
      .toEqual([]);
  });

  it("a newly registered function is deployed", () => {
    // The probe's own case: a block that did not exist before.
    const without = after.replace(
      "  [functions.smtp-capability-probe]\n    verify_jwt = false\n",
      "",
    );
    expect(without).not.toBe(after);
    expect(resolveFunctionsToDeploy({ changedPaths: [CONFIG], root: ROOT, configBefore: without }))
      .toContain("smtp-capability-probe");
  });
});

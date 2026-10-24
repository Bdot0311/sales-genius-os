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
    expect(script).toContain('if (!name || name.startsWith("_")) return;');
    /*
     * Third of the same kind: a path that climbs out of the functions tree
     * gets a `..` first segment, which is not a function name. The entrypoint
     * check below already refuses it, since `supabase/index.ts` does not
     * exist, so removing this changes no output today. It stays because it
     * says what the function means, and because the entrypoint check is not
     * guaranteed to keep covering for it.
     */
    expect(script).toContain('if (rel.startsWith("..") || rel.startsWith("/")) return;');
    /*
     * Twice: once in the shared owner check that both the import walk and the
     * changed-path pass go through, and once in the config-block pass, which
     * is an independent source of names. Counted rather than merely present,
     * because the first version of this assertion was satisfied by the config
     * pass's copy while the walk's had been deleted.
     */
    const entrypointGuard = /if \(!known\.has\(join\(base, name, "index\.ts"\)\)\) (return|continue);/g;
    expect([...script.matchAll(entrypointGuard)].length).toBe(2);
    /*
     * Same for dynamic imports: the tree has none today, so following them
     * cannot be shown to matter here. A function that lazily imports a shared
     * module would otherwise be missed by the walk and quietly left stale.
     */
    expect(script).toMatch(/\\bimport\\s\*\\\(\\s\*\["'\]/);
  });

  it("a function's build settings deploy it", () => {
    /*
     * The import walk starts from files it can parse, so it never sees the
     * thirteen deno.json files. `auth-email-hook/deno.json` is what compiles
     * that function's JSX; changing it and nothing else resolved to an empty
     * set, so the job reported nothing to deploy and the old bundle kept
     * running — the same silent staleness this script exists to stop, one
     * file type over.
     */
    const configs = execFileSync("find", [
      BASE, "-mindepth", "2", "-maxdepth", "2", "-name", "deno.json",
    ], { encoding: "utf8" }).split("\n").filter(Boolean);
    expect(configs.length, "there should be deno.json files to cover").toBeGreaterThan(5);
    for (const path of configs) {
      const owner = path.split("/")[2];
      expect(run(path), path).toEqual([owner]);
    }
  });

  it("a file removed from a function still deploys it", () => {
    /*
     * Taken from the changed paths rather than from disk, so a commit that
     * only deletes a helper still redeploys the function it was deleted from.
     * Resolving against disk would find nothing there and skip it.
     */
    expect(run(`${BASE}/sync-bounces/removed-helper.ts`)).toEqual(["sync-bounces"]);
  });

  it("a path that is not there deploys nothing", () => {
    // A deleted function, and a changed file that is not a function at all.
    expect(run(`${BASE}/removed-function/index.ts`)).toEqual([]);
    expect(run("src/App.tsx", "README.md", "supabase/migrations/20260101000000_x.sql")).toEqual([]);
    // And paths that climb out of the functions tree, whichever guard
    // happens to refuse them.
    expect(run("../elsewhere/index.ts", `${BASE}/../../src/main.tsx`)).toEqual([]);
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
    expect(resolveFunctionsToDeploy({ changedPaths: [CONFIG], root: ROOT, configVersions: flipped }))
      .toEqual(["smtp-capability-probe"]);
  });

  it("a config edit that changes no function redeploys nothing", () => {
    // Comments and formatting move; that is not a reason to redeploy 148
    // functions, and a job that deploys everything gets switched off.
    expect(resolveFunctionsToDeploy({ changedPaths: [CONFIG], root: ROOT, configVersions: after }))
      .toEqual([]);
  });

  it("a removed config block redeploys the function too", () => {
    /*
     * Removal is a change. The function falls back to the defaults, and a
     * redeploy is what applies them — so iterating only the new config, which
     * never visits a block that is gone, leaves the old settings live. For a
     * function that had `verify_jwt = false`, that means it keeps answering
     * without a session after the line granting that is deleted.
     *
     * Tested with a real function that config.toml does NOT register
     * (`admin-create-user`; 69 of the 148 are unregistered). Giving the
     * previous config a block for it makes the on-disk config the version
     * where that block is gone, which is exactly the removal case — rather
     * than a modified block, which an earlier version of this test actually
     * covered while claiming otherwise.
     */
    expect(after, "the fixture function must stay unregistered")
      .not.toContain("[functions.admin-create-user]");
    expect(existsSync(`${BASE}/admin-create-user/index.ts`)).toBe(true);
    const before = `${after}\n  [functions.admin-create-user]\n    verify_jwt = false\n`;
    expect(resolveFunctionsToDeploy({ changedPaths: [CONFIG], root: ROOT, configVersions: before }))
      .toEqual(["admin-create-user"]);
  });

  it("a setting that went out and came back still redeploys", () => {
    /*
     * The endpoints lie. Marker at P where the probe has
     * `verify_jwt = false`, commit A sets it true and also changes another
     * function's code, the probe deploys and that function fails so the
     * marker stays at P, then commit B reverts the setting. P and B are
     * byte-identical, so comparing base to HEAD sees nothing — while the live
     * probe is the one deployed from A, answering without a session.
     *
     * Same shape as the path union, one layer down, and the reason the
     * comparison takes every revision in the range rather than just the base.
     */
    const flippedMidRange = after.replace(
      "  [functions.smtp-capability-probe]\n    verify_jwt = false",
      "  [functions.smtp-capability-probe]\n    verify_jwt = true",
    );
    expect(flippedMidRange).not.toBe(after);
    // [base, intermediate] — the base matches HEAD exactly, as in the bug.
    expect(resolveFunctionsToDeploy({
      changedPaths: [CONFIG],
      root: ROOT,
      configVersions: [after, flippedMidRange],
    })).toEqual(["smtp-capability-probe"]);
    // And the base alone is precisely what missed it.
    expect(resolveFunctionsToDeploy({
      changedPaths: [CONFIG],
      root: ROOT,
      configVersions: [after],
    })).toEqual([]);
    /*
     * The mirror image, which is the ORDINARY case: the setting changed once
     * in the range and stayed, so the base differs from HEAD and the newest
     * revision already matches it. Asserted because the pair above alone was
     * satisfied by comparing only the newest revision, which would then miss
     * every plain config change — every revision has to be compared, not one
     * end or the other.
     */
    expect(resolveFunctionsToDeploy({
      changedPaths: [CONFIG],
      root: ROOT,
      configVersions: [flippedMidRange, after],
    })).toEqual(["smtp-capability-probe"]);
  });

  it("the workflow passes every config revision in the range", () => {
    /*
     * Source-asserted: this is workflow shell that only runs on `main`.
     * Verified end-to-end in a scratch repo instead — three revisions
     * collected, and the resolver named the function the base-only comparison
     * missed.
     */
    const wf = readFileSync(".github/workflows/deploy-functions.yml", "utf8");
    expect(wf).toContain("cfg_args+=(--config-before");
    // The base itself is the first revision compared.
    expect(wf).toContain('for rev in "$base" $(git rev-list');
    /*
     * `--full-history` is load-bearing, not tidiness. A pathspec turns on
     * history simplification: at a merge whose config.toml matches one
     * parent, git follows only that parent and prunes the other side, so the
     * commit that changed the setting can disappear from the list.
     *
     * Measured on a scratch repo with that shape — setting flipped on main,
     * then a merge taking config.toml from the side branch — the plain query
     * returned NOTHING at all, so only the base was compared and it equals
     * HEAD. With the flag it returned three revisions and the resolver named
     * the function. The path collection needs no such flag, having no
     * pathspec to simplify on.
     */
    expect(wf).toContain(
      'git rev-list --full-history "$base..${{ github.sha }}" -- supabase/config.toml',
    );
  });

  it("the deploy runs only when someone asks it to", () => {
    /*
     * Dispatch-only, on purpose, and this is the second time that decision
     * has been made.
     *
     * An earlier version of this file triggered on push to main and was
     * removed two minutes after its first run, for two reasons that still
     * hold: Lovable deploys the backend when the owner publishes from it, so
     * an automatic job raced it — two systems pushing the same functions,
     * last writer wins, neither authoritative — and it turned every merge red,
     * since it demands a token.
     *
     * The gap it was built for is real: `smtp-capability-probe` sat on main
     * for six days, registered in config.toml, still answering 404. A merge
     * genuinely deploys nothing. So the resolver earns its place; the
     * automatic trigger does not.
     *
     * Asserted so the trigger cannot come back without someone reading this.
     */
    const wf = readFileSync(".github/workflows/deploy-functions.yml", "utf8");
    /*
     * Every event under `on:`, asserted as exactly one. An earlier version of
     * this test required `workflow_dispatch` and forbade `push`, which
     * `schedule` or `workflow_run` would have sailed straight through — it
     * named one mechanism instead of the property it existed to protect.
     *
     * Read as text rather than through a YAML parser: `yaml` is only a
     * transitive dependency here, and the four other tests that read workflow
     * files read them as text too.
     */
    const block = wf.slice(wf.indexOf("\non:") + 1);
    const nextTopLevel = block.search(/\n(?=\S)/);
    const onBlock = nextTopLevel > -1 ? block.slice(0, nextTopLevel) : block;
    const events = [...onBlock.matchAll(/^ {2}([A-Za-z_][\w-]*):/gm)].map((m) => m[1]);
    expect(events, "nothing may deploy without someone asking")
      .toEqual(["workflow_dispatch"]);

    /*
     * And a markerless run says what it did not cover. "Everything owed" can
     * only mean the last commit when no marker exists yet, and that commit may
     * touch no function at all — measured on main's tip, which resolves to
     * nothing. Reporting success there is how a catch-up run gets believed.
     */
    expect(wf).toContain("::warning::No deploy marker existed");
    expect(wf).toContain("Name them explicitly to catch up anything older.");
  });

  it("the deploy range is every path touched, not the net diff", () => {
    /*
     * Asserted as source: this is workflow shell that only runs on `main`,
     * so vitest cannot execute it. Verified by hand in scratch repos instead,
     * and both halves of the union turned out to be load-bearing.
     *
     * Net diff alone: marker at P, commit A changes f1 and f2, f1 deploys and
     * f2 fails so the marker stays at P, then B reverts f1. P..B names f2
     * only, so f1 keeps running A's code for good while the repo says P's.
     *
     * `--no-merges` alone: a merge commit shows no diff of its own, so a
     * change that exists only in a conflict resolution is invisible.
     */
    const wf = readFileSync(".github/workflows/deploy-functions.yml", "utf8");
    expect(wf).toContain('git diff --name-only "$base" "${{ github.sha }}"');
    expect(wf).toContain('git log --format= --name-only --no-merges "$base..${{ github.sha }}"');
    expect(wf).toContain("sort -u");
    // And the marker only advances when the whole range deployed.
    expect(wf).toContain("if: success() && steps.resolve.outputs.ranged == 'true'");
  });

  it("a newly registered function is deployed", () => {
    // The probe's own case: a block that did not exist before.
    const without = after.replace(
      "  [functions.smtp-capability-probe]\n    verify_jwt = false\n",
      "",
    );
    expect(without).not.toBe(after);
    expect(resolveFunctionsToDeploy({ changedPaths: [CONFIG], root: ROOT, configVersions: without }))
      .toContain("smtp-capability-probe");
  });
});

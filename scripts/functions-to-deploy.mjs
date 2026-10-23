#!/usr/bin/env node
/**
 * Which edge functions a commit actually requires a deploy of.
 *
 * Nothing in this repo deployed edge functions. `smtp-capability-probe` was
 * added, reviewed, merged, and then answered 404 half an hour later, while the
 * ten checks on its pull request all went green — because none of them deploys
 * anything. The frontend ships through Netlify, the database through
 * migrations, and the functions through somebody remembering.
 *
 * The naive fix is `supabase functions deploy` with no arguments on every
 * merge. There are 148 functions here; that is minutes of deploy for a
 * one-line change and a much larger blast radius than the change had.
 *
 * The other naive fix is to deploy the directories the diff touched. That is
 * the one that would have quietly left the last release half-applied: a
 * function bundles its imports at deploy time, so each one carries its own
 * copy of `_shared`. Editing `_shared/email-verify.ts` changes the behaviour
 * of every function that imports it, and the diff names none of them.
 *
 * So: resolve the import graph and walk it backwards from the changed files.
 * Specifiers are resolved against the importing file's own directory rather
 * than matched by pattern, because `_shared` modules import each other as
 * `./sibling.ts` while functions import them as `../_shared/sibling.ts`, and
 * a pattern that understands one does not see the other.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const FUNCTIONS_DIR = "supabase/functions";
const CONFIG = "supabase/config.toml";

/** Every .ts/.tsx/.js file under the functions tree, as absolute paths. */
function sourceFiles(root) {
  const base = resolve(root, FUNCTIONS_DIR);
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(full);
      else if (/\.(ts|tsx|js|mjs)$/.test(entry)) out.push(full);
    }
  };
  walk(base);
  return out;
}

/**
 * The relative specifiers one file imports.
 *
 * Covers `import … from`, bare `import "…"`, `export … from` and dynamic
 * `import("…")`. Remote specifiers are left out: an https:// import is pinned
 * to a version, so it cannot change without the importing file changing too.
 */
function relativeSpecifiers(text) {
  const found = new Set();
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']/g,
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      if (m[1].startsWith(".")) found.add(m[1]);
    }
  }
  return [...found];
}

/** Resolve a specifier the way Deno would, to an absolute path we can match. */
function resolveSpecifier(fromFile, spec, known) {
  const base = resolve(dirname(fromFile), spec);
  for (const candidate of [base, `${base}.ts`, join(base, "index.ts")]) {
    if (known.has(candidate)) return candidate;
  }
  return null;
}

/** `[functions.<name>]` blocks and their settings, from config.toml text. */
function parseFunctionConfig(text) {
  const entries = new Map();
  let current = null;
  for (const raw of (text ?? "").split("\n")) {
    const line = raw.trim();
    const header = line.match(/^\[functions\.([^\]]+)\]$/);
    if (header) {
      current = header[1];
      entries.set(current, []);
      continue;
    }
    if (/^\[/.test(line)) {
      current = null;
      continue;
    }
    if (current && line && !line.startsWith("#")) entries.get(current).push(line);
  }
  // Settings compared as a string, so any change to a block redeploys it.
  return new Map([...entries].map(([name, lines]) => [name, lines.join(";")]));
}

/**
 * The function names that need deploying for `changedPaths`.
 *
 * `changedPaths` are repo-relative, as `git diff --name-only` prints them.
 * `configBefore` is the previous contents of config.toml, when the diff
 * touched it; a changed `verify_jwt` only takes effect on a redeploy, and that
 * one is worth getting right because it decides whether a function is
 * callable without a session.
 */
export function resolveFunctionsToDeploy({ changedPaths, root = process.cwd(), configVersions = null }) {
  const files = sourceFiles(root);
  const known = new Set(files);

  // file -> the files it imports, then inverted to importers.
  const importers = new Map();
  for (const file of files) {
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const spec of relativeSpecifiers(text)) {
      const target = resolveSpecifier(file, spec, known);
      if (!target) continue;
      if (!importers.has(target)) importers.set(target, new Set());
      importers.get(target).add(file);
    }
  }

  // Walk backwards from each changed file through everything that imports it.
  const reached = new Set();
  const queue = [];
  for (const p of changedPaths) {
    const abs = resolve(root, p);
    if (known.has(abs)) queue.push(abs);
  }
  while (queue.length > 0) {
    const file = queue.pop();
    if (reached.has(file)) continue;
    reached.add(file);
    for (const importer of importers.get(file) ?? []) {
      if (!reached.has(importer)) queue.push(importer);
    }
  }

  const base = resolve(root, FUNCTIONS_DIR);
  const names = new Set();
  const own = (file) => {
    const rel = relative(base, file);
    // Outside the functions tree entirely.
    if (rel.startsWith("..") || rel.startsWith("/")) return;
    const [name] = rel.split("/");
    // `_shared` is not deployable, and a function needs an entrypoint to be.
    if (!name || name.startsWith("_")) return;
    if (!known.has(join(base, name, "index.ts"))) return;
    names.add(name);
  };

  for (const file of reached) own(file);

  /*
   * Anything else that lives in a function's own directory counts too.
   *
   * The import walk starts from files it can parse, so it never sees the
   * thirteen `deno.json` files. `auth-email-hook/deno.json` is what compiles
   * its JSX; changing it and nothing else resolved to an empty set, the job
   * reported nothing to deploy, and the old bundle kept running — the same
   * silent staleness this script exists to stop, one file type over.
   *
   * Taken from the changed paths rather than from disk so a file deleted in
   * the same commit still redeploys the function it was removed from.
   */
  for (const p of changedPaths) own(resolve(root, p));

  // A changed config block redeploys that function even with no code change.
  if (configVersions !== null && changedPaths.includes(CONFIG)) {
    let after;
    try {
      after = readFileSync(resolve(root, CONFIG), "utf8");
    } catch {
      after = "";
    }
    const afterBlocks = parseFunctionConfig(after);
    /*
     * Compared against EVERY earlier revision of config.toml in the range,
     * not just the one at the base.
     *
     * The same shape as the path union above, one layer down, and reachable
     * with the wrong settings live: marker at P where f1 has
     * `verify_jwt = false`, commit A sets it true and also changes f2's code,
     * f1 deploys and f2 fails so the marker stays at P, then commit B reverts
     * the setting. P and B are byte-identical, so a base-to-HEAD comparison
     * sees nothing — while the live f1 is the one deployed from A, answering
     * without a session. Checked in a scratch repo: false, true, false across
     * the three revisions, and the endpoints compare equal.
     *
     * Each version also contributes its block NAMES, so a block that was
     * removed is still visited. Iterating only the new config would never see
     * a deletion, and a function whose block is gone keeps its old settings
     * live — again including a `verify_jwt = false` the config no longer
     * grants.
     */
    const versions = Array.isArray(configVersions) ? configVersions : [configVersions];
    for (const version of versions) {
      const before = parseFunctionConfig(version);
      for (const name of new Set([...before.keys(), ...afterBlocks.keys()])) {
        if (before.get(name) === afterBlocks.get(name)) continue;
        if (!known.has(join(base, name, "index.ts"))) continue;
        names.add(name);
      }
    }
  }

  return [...names].sort();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  /*
   * Repeatable: one per earlier revision of config.toml in the range. A
   * revision that cannot be read is skipped rather than read as empty, which
   * would make every registered block look newly added and turn a one-line
   * change into a deploy of all 148.
   */
  let configVersions = null;
  for (;;) {
    const at = args.indexOf("--config-before");
    if (at === -1) break;
    const path = args[at + 1];
    args.splice(at, 2);
    try {
      const text = readFileSync(path, "utf8");
      configVersions = [...(configVersions ?? []), text];
    } catch {
      // Unreadable revision: contributes nothing.
    }
  }
  const changedPaths = args.length > 0
    ? args
    : readFileSync(0, "utf8").split("\n").map((l) => l.trim()).filter(Boolean);
  for (const name of resolveFunctionsToDeploy({ changedPaths, configVersions })) {
    console.log(name);
  }
}

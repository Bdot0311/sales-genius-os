#!/usr/bin/env node
/**
 * What a real Deno type-check says about the edge functions. Reports only.
 *
 * check-edge-functions.mjs runs tsc with --noResolve, because this environment
 * has no Deno and cannot fetch the https:// imports. That catches the classes
 * that are fatal whatever the imports resolve to — a use-before-declaration
 * deploys green and throws, and one did — but it cannot check anything that
 * depends on a remote module's actual types, which is most of the code.
 *
 * Deno can fetch them. The question this answers is how big the gap is: how
 * many real errors are in 231 edge functions that nothing has ever checked,
 * and of what kind. That number decides whether a proper check goes into CI
 * this week or after a cleanup, so it is worth measuring before choosing.
 *
 * It ran report-only first, because the size of the cleanup should decide
 * whether it blocks rather than the other way round. The answer was three
 * errors with one cause — @types/web-push declares no default export and three
 * files imported it as one — so there was no cleanup to weigh, and it blocks.
 *
 * The one cost: this needs esm.sh and deno.land reachable, so an outage there
 * turns CI red on a change that is fine. The fast offline check next to it
 * (check-edge-functions.mjs) still catches the runtime-fatal classes when that
 * happens, and removing `deno-check` from the workflow is a one-line revert.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const denoConfig = (() => {
  try {
    return JSON.parse(readFileSync("deno.json", "utf8"));
  } catch {
    return {};
  }
})();
const excluded = new Set(denoConfig.exclude ?? []);

const ROOT = "supabase/functions";
const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    if (entry === "_tests") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path);
    else if ((entry.endsWith(".ts") || entry.endsWith(".tsx")) && !excluded.has(path)) files.push(path);
  }
};
walk(ROOT);

let out = "";
let exitStatus = 0;
try {
  // --node-modules-dir=none is the difference between measuring and hanging.
  //
  // deno.json sets nodeModulesDir "auto" for the app, so `deno check` read
  // package.json and began installing the entire React tree — Radix, Sentry,
  // Stripe, TanStack — none of which any edge function imports. The first run
  // spent its whole step downloading and checked nothing.
  //
  // The seven files that use npm: specifiers pin their own versions and
  // resolve without a node_modules directory at all.
  execFileSync("deno", ["check", "--no-lock", "--node-modules-dir=none", ...files], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  });
} catch (err) {
  if (err.code === "ENOENT") {
    console.log("· deno is not installed here, so there is nothing to report.");
    console.log("  This runs in CI, where setup-deno provides it.");
    process.exit(0);
  }
  exitStatus = err.status ?? null;
  out = `${err.stdout ?? ""}${err.stderr ?? ""}`;
}

// Deno prints "TS1192 [ERROR]: ..." followed by a file:// location, wrapped in
// ANSI colour codes. Those codes are why the first parse found nothing: the
// escape sequence ends in a word character, so \bTS\d+\b had no boundary to
// match against and a run that found three real errors reported none.
const stripAnsi = (s) => s.replace(/\u001b\[[0-9;]*m/g, "");
const byCode = new Map();
const byFile = new Map();
let currentCode = null;
for (const line of stripAnsi(out).split("\n")) {
  const code = line.match(/\bTS(\d+)\b/)?.[0];
  if (code && /error/i.test(line)) {
    currentCode = code;
    byCode.set(code, (byCode.get(code) ?? 0) + 1);
    continue;
  }
  const file = line.match(/file:\/\/(\/[^\s:]+\.tsx?)/)?.[1];
  if (file && currentCode) {
    const rel = file.replace(`${process.cwd()}/`, "");
    byFile.set(rel, (byFile.get(rel) ?? 0) + 1);
    currentCode = null;
  }
}

const total = [...byCode.values()].reduce((a, b) => a + b, 0);

console.log(`Deno check over ${files.length} edge-function file(s).\n`);

if (total === 0) {
  // Either genuinely clean, or Deno failed before checking anything. Both are
  // worth seeing rather than reporting a reassuring zero.
  const trimmed = out.trim();
  if (trimmed) {
    const lines = trimmed.split("\n");
    // Not the first forty. Deno prints a download per dependency before it
    // reports anything, so the head of the output is always a wall of URLs and
    // the reason it stopped is at the very end — which is how the first two
    // runs of this job told me nothing twice.
    const errors = lines.filter((l) => /^\s*error/i.test(l) || /\bTS\d+\b/.test(l));
    console.log(`Deno exited ${exitStatus ?? "abnormally"} without reporting type errors.\n`);
    if (errors.length) {
      console.log("Error lines:\n");
      console.log(errors.slice(0, 30).join("\n"));
      console.log("");
    }
    console.log("Last 30 lines:\n");
    console.log(lines.slice(-30).join("\n"));
    console.error(
      "\nA wall of registry downloads means it was still resolving, not checking. " +
      "A module error names the import it could not fetch. Either way this " +
      "checked nothing, which is a failure rather than a pass.",
    );
    process.exit(1);
  }
  console.log("✓ No type errors.");
  process.exit(0);
}

console.log(`${total} error(s), by kind — biggest first:\n`);
for (const [code, count] of [...byCode].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(5)}  ${code}`);
}

console.log(`\nAcross ${byFile.size} file(s). The ten carrying most:\n`);
for (const [file, count] of [...byFile].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  console.log(`  ${String(count).padStart(5)}  ${file}`);
}

console.error(
  "\nThese are real: Deno resolved every import and type-checked against them. " +
  "This is the check that would have caught the use-before-declaration that " +
  "shipped and stopped the batch queue ever running.",
);
process.exit(1);

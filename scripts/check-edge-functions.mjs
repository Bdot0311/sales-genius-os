#!/usr/bin/env node
/**
 * Catch the edge-function mistakes that compile, deploy green, and then throw.
 *
 * The edge functions are Deno and are not in the app's tsconfig program, so
 * `tsc -b` never sees them. They were checked by hand with a grep for TS1xxx —
 * syntax errors only — and everything else was discarded as "resolution noise".
 *
 * It was not all noise. `draft_outreach` shipped an enqueue block that read
 * `feedback` two thousand characters before its `const` was declared, and tsc
 * reported it every time:
 *
 *     error TS2448: Block-scoped variable 'feedback' used before its declaration
 *
 * The grep threw it away. Deployed, that threw "Cannot access 'feedback' before
 * initialization" on exactly the batches the queue exists for — every draft of
 * more than twelve leads — so the feature could not work at all, and the failure
 * looked like the agent misbehaving rather than a bug with a line number.
 *
 * This does NOT type-check the edge functions properly: that needs Deno, which
 * can fetch the https:// imports. Without them most of what tsc says really is
 * noise — untyped modules become `{}`, every caught error is `unknown`. Claiming
 * more than it does would make it the kind of check people learn to ignore.
 *
 * What it does check is the class that needs no module resolution to be certain
 * about, and that is fatal at runtime on the one path it guards.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Fatal regardless of what the imports resolve to.
 *
 *   TS1xxx  the file does not parse
 *   TS2448  a block-scoped variable read before its declaration
 *   TS2454  a variable read before it is assigned
 *   TS2551  a misspelled property on a type tsc does know
 *   TS2564  a class field never assigned
 *
 * Add a code here only with a reason beside it, and only when it cannot be
 * caused by an import tsc could not fetch.
 */
const FATAL = [/^TS1\d{3}$/, /^TS2448$/, /^TS2454$/, /^TS2551$/, /^TS2564$/];
const isFatal = (code) => FATAL.some((rx) => rx.test(code));

const ROOT = "supabase/functions";
const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    if (entry === "_tests") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path);
    else if (entry.endsWith(".ts")) files.push(path);
  }
};
walk(ROOT);

let out = "";
try {
  execFileSync(
    "npx",
    [
      "tsc", "--ignoreConfig", "--noEmit", "--noResolve", "--skipLibCheck",
      "--allowImportingTsExtensions", "--target", "es2022", "--module", "es2022",
      ...files,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
} catch (err) {
  out = `${err.stdout ?? ""}${err.stderr ?? ""}`;
}

const fatal = out
  .split("\n")
  .filter((line) => isFatal(line.match(/error (TS\d+):/)?.[1] ?? ""));

if (fatal.length > 0) {
  console.error(`✗ edge functions: ${fatal.length} error(s) that will throw at runtime:\n`);
  for (const line of fatal) console.error(`  ${line}`);
  console.error(
    "\nThese are not import noise. A use-before-declaration deploys green and " +
    "throws on the exact path it guards.",
  );
  process.exit(1);
}

console.log(`✓ edge functions: ${files.length} file(s) checked for runtime-fatal errors.`);

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
 * It never fails the build. Turning it red before anyone has seen the number
 * would be deciding the answer by accident.
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
try {
  execFileSync("deno", ["check", "--no-lock", ...files], {
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
  out = `${err.stdout ?? ""}${err.stderr ?? ""}`;
}

// Deno prints "error: TS2448 [ERROR]: ..." followed by a file:// location.
const byCode = new Map();
const byFile = new Map();
let currentCode = null;
for (const line of out.split("\n")) {
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
    console.log("No TS error codes parsed. Raw output, in case it failed before checking:\n");
    console.log(trimmed.split("\n").slice(0, 40).join("\n"));
  } else {
    console.log("✓ No type errors.");
  }
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

console.log(
  "\nReport only — this job does not fail. The counts above are the size of the " +
  "cleanup a blocking Deno check would require.",
);

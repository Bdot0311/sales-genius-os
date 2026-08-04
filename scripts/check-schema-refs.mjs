#!/usr/bin/env node
/**
 * Schema reference guard.
 *
 * Cross-references every Supabase column reference in the codebase against the
 * generated schema in src/integrations/supabase/types.ts. Its whole reason to
 * exist: an auto-generated edit that selects or filters on a column the live
 * database does not have (e.g. leads.country) compiles fine but returns a 500
 * to real users at runtime. This turns that class of bug into a failed check
 * instead of a production incident.
 *
 * Scope is deliberately the high-signal, zero-false-positive surface:
 *   .from("table").select("a, b, c")   and
 *   .from("table").eq/neq/gt/gte/lt/lte/order/is/in/like/ilike("col", ...)
 * Insert/update object keys are intentionally NOT checked here — parsing object
 * literals reliably enough to avoid false positives is not worth the risk of a
 * noisy guard that gets ignored. Run `node scripts/check-schema-refs.mjs`.
 *
 * Exit code 1 on any mismatch, 0 when clean.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** Recursively list files under `dir` whose name ends with one of `exts`. */
function walk(dir, exts, acc = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); }
  catch { return acc; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      walk(p, exts, acc);
    } else if (exts.some((x) => e.name.endsWith(x))) {
      acc.push(p);
    }
  }
  return acc;
}

const TYPES = "src/integrations/supabase/types.ts";

// --- Build { table: Set(columns) } from the generated Row definitions --------
const types = readFileSync(TYPES, "utf8");
const schema = {};
const tableRe = /\n {6}(\w+): \{\n {8}Row: \{\n([\s\S]*?)\n {8}\}\n/g;
for (const m of types.matchAll(tableRe)) {
  const cols = new Set();
  for (const c of m[2].matchAll(/^ {10}(\w+)\??:/gm)) cols.add(c[1]);
  if (cols.size) schema[m[1]] = cols;
}

const IGNORE = new Set(["count"]); // aggregate tokens, not columns

/** Parse the columns out of a PostgREST .select("...") string. */
function columnsFromSelect(sel) {
  const out = [];
  let depth = 0, buf = "";
  const parts = [];
  for (const ch of sel) {
    if (ch === "(") { depth++; buf += ch; continue; }
    if (ch === ")") { depth--; buf += ch; continue; }
    if (ch === "," && depth === 0) { parts.push(buf); buf = ""; continue; }
    buf += ch;
  }
  parts.push(buf);
  for (let p of parts) {
    p = p.trim();
    if (!p || p === "*") continue;
    if (p.includes("(")) continue;       // embedded relation → its own table
    if (p.includes(":")) p = p.split(":", 2)[1].trim(); // alias:realColumn
    p = p.split(".")[0].trim();          // foreignTable.col edge case
    if (/^[a-zA-Z_]\w*$/.test(p) && !IGNORE.has(p)) out.push(p);
  }
  return out;
}

const files = [
  ...walk("supabase/functions", [".ts"]),
  ...walk("src", [".ts", ".tsx"]),
].filter((f) => !f.endsWith("types.ts"));

const FILTERS = "eq|neq|gt|gte|lt|lte|order|is|in|like|ilike";
const hits = [];
const seen = new Set();

for (const file of files) {
  const src = readFileSync(file, "utf8");
  const fromRe = /\.from\(\s*['"`](\w+)['"`]\s*\)/g;
  let fm;
  while ((fm = fromRe.exec(src)) !== null) {
    const table = fm[1];
    if (!schema[table]) continue; // view / rpc / unknown → skip
    const start = fm.index + fm[0].length;
    const nextFrom = src.indexOf(".from(", start);
    const window = src.slice(start, nextFrom === -1 ? start + 1500 : nextFrom);

    for (const sm of window.matchAll(/\.select\(\s*['"`]([^'"`]*)['"`]/g)) {
      for (const col of columnsFromSelect(sm[1])) {
        if (!schema[table].has(col)) record(file, table, col, "select", src, start + sm.index);
      }
    }
    const filterRe = new RegExp(`\\.(${FILTERS})\\(\\s*['"\`](\\w+)['"\`]`, "g");
    for (const em of window.matchAll(filterRe)) {
      if (!schema[table].has(em[2])) record(file, table, em[2], em[1], src, start + em.index);
    }
  }
}

function record(file, table, col, kind, src, absIndex) {
  const key = `${file}|${table}|${col}|${kind}`;
  if (seen.has(key)) return;
  seen.add(key);
  const line = src.slice(0, absIndex).split("\n").length;
  hits.push({ file, line, table, col, kind });
}

if (hits.length === 0) {
  console.log(`✓ schema-refs: ${Object.keys(schema).length} tables checked, no column mismatches.`);
  process.exit(0);
}

console.error(`✗ schema-refs: ${hits.length} reference(s) to columns not in the generated schema:\n`);
for (const h of hits.sort((a, b) => a.file.localeCompare(b.file))) {
  console.error(`  ${h.file}:${h.line}  ${h.table}.${h.col}  (${h.kind})`);
}
console.error(
  "\nThese compile but 500 at runtime. Fix the column name, or if the column is new," +
  " add its migration and regenerate src/integrations/supabase/types.ts.",
);
process.exit(1);

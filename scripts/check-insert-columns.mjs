#!/usr/bin/env node
/**
 * Every required column is supplied on every insert.
 *
 * The failure this exists for: `icp_profiles.name` is NOT NULL with no
 * default, an insert passed only the fields it had computed, and the call
 * failed — on the one path that mattered, the account with no ICP yet. It
 * typechecked, every test passed, and nothing could have caught it, because
 * the shape of a Postgres NOT NULL is not in any TypeScript the call site
 * touches.
 *
 * It IS in the generated types. `Insert` marks a column optional with `?`
 * when it is nullable or has a default, and required when it is neither. So
 * "did this insert supply every required column" is answerable without a
 * database, and this answers it.
 *
 * Deliberately narrow. It reads inserts written as object literals and skips
 * anything it cannot see into — a spread, a variable, a builder. A check that
 * guesses at the half it cannot read produces failures nobody trusts, and an
 * untrusted check gets switched off.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const TYPES = "src/integrations/supabase/types.ts";

/** Required Insert columns per table, from the generated types. */
function requiredColumns() {
  const src = readFileSync(TYPES, "utf8");
  const lines = src.split("\n");
  const byTable = new Map();
  let table = null;
  let depth = 0;
  let inInsert = false;
  let insertDepth = 0;

  for (const line of lines) {
    const t = line.match(/^      ([a-z_][a-z0-9_]*): \{$/);
    if (t) { table = t[1]; depth = 0; inInsert = false; }
    if (!table) continue;

    if (/^        Insert: \{$/.test(line)) { inInsert = true; insertDepth = 0; byTable.set(table, new Set()); continue; }
    if (inInsert) {
      // Only top-level keys of the Insert block count; nested shapes do not.
      const opens = (line.match(/\{/g) ?? []).length;
      const closes = (line.match(/\}/g) ?? []).length;
      if (insertDepth === 0) {
        const f = line.match(/^          ([a-z_][a-z0-9_]*)(\??):/);
        if (f && f[2] !== "?") byTable.get(table).add(f[1]);
      }
      insertDepth += opens - closes;
      if (insertDepth < 0) { inInsert = false; }
    }
  }
  return byTable;
}

/** Walk a brace-balanced literal starting at `open`, return its text. */
function literalAt(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) return src.slice(open, i + 1); }
  }
  return null;
}

const required = requiredColumns();
const files = execFileSync("git", ["ls-files", "src", "supabase"], { encoding: "utf8" })
  .split("\n")
  .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) && f !== TYPES);

const problems = [];
let checked = 0;
let skipped = 0;

for (const file of files) {
  const src = readFileSync(file, "utf8");

  /*
   * Every insert, then the from() that owns it — backwards, not forwards.
   *
   * Scanning forward from each from() was wrong in a way that made this
   * check useless: a ternary with .update() on one branch and .insert() on
   * the other puts two from() calls on the same table next to each other,
   * the forward scan matched the first, saw a second from() in the gap and
   * skipped — and the regex had already consumed past the insert, so it was
   * never offered again. The check reported a clean run against the exact
   * defect it was written for.
   *
   * An insert has one owning from(), and it is the nearest one before it.
   */
  for (const m of src.matchAll(/\.(insert|upsert)\(\s*\{/g)) {
    const before = src.slice(0, m.index);
    const owner = [...before.matchAll(/\.from\(\s*["'`]([a-z_][a-z0-9_]*)["'`]\s*\)/g)].pop();
    if (!owner) continue;
    // Too far back to be the same statement.
    if (before.length - owner.index > 400) continue;

    const table = owner[1];
    const need = required.get(table);
    if (!need || need.size === 0) continue;

    const open = m.index + m[0].length - 1;
    const literal = literalAt(src, open);
    if (!literal) continue;

    // Anything dynamic and the keys present are not the keys sent.
    if (literal.includes("...")) { skipped++; continue; }

    checked++;
    /*
     * Comments come out first. Anchoring keys to a preceding `{` or `,`
     * seemed reasonable and was wrong: a field with an explanatory comment
     * above it is preceded by a newline, so every documented column read as
     * absent — send-email's to_email among them, which is about as present
     * as a column gets.
     *
     * Keys nested inside a sub-object are counted too. That can only hide a
     * genuinely missing column, never invent one, and a check that reports a
     * column you are looking at is a check that gets switched off.
     */
    const bare = literal
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    /*
     * Both spellings of a property. `title,` is shorthand for `title: title`
     * and is how half these inserts are written.
     */
    const keys = new Set([
      ...[...bare.matchAll(/(?:^|[{,])\s*["'`]?([a-z_][a-z0-9_]*)["'`]?\s*:/gm)].map((k) => k[1]),
      ...[...bare.matchAll(/(?:^|[{,])\s*([a-z_][a-z0-9_]*)\s*(?=[,}])/gm)].map((k) => k[1]),
    ]);
    const missing = [...need].filter((c) => !keys.has(c));
    if (missing.length) {
      const line = before.split("\n").length;
      problems.push(`  ${file}:${line}  ${table}.${m[1]} is missing ${missing.join(", ")}`);
    }
  }
}

if (problems.length) {
  console.error(`✗ insert-columns: ${problems.length} insert(s) missing a required column:\n`);
  console.error(problems.join("\n"));
  console.error(
    "\nThese typecheck and fail at runtime: the column is NOT NULL with no default.\n" +
    "Supply it, or if the column should have a default, add one in a migration.",
  );
  process.exit(1);
}
console.log(`✓ insert-columns: ${checked} literal insert(s) checked, ${skipped} dynamic one(s) skipped.`);

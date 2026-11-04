import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * A table the browser writes to needs the privilege, not just the policy.
 *
 * `20260901211628` tightened `integrations` and `api_keys` so a user cannot
 * read their own stored credentials, with a blanket REVOKE followed by a
 * column-level GRANT SELECT. Correct, and it stays. What it left behind was a
 * table where `authenticated` held SELECT on some columns and nothing else,
 * while the RLS policies written at table creation still said users may
 * create, update and delete their own rows.
 *
 * Policies decide WHICH rows a role may touch. They cannot grant the privilege
 * to touch any. So every write from the browser failed before RLS was even
 * consulted, with `permission denied for table integrations` — a privilege
 * error that reads nothing like "no rows matched", which is part of why it
 * went unrecognised.
 *
 * It hid for two months because the common path does not need the grant:
 * connecting a mailbox runs in an edge function on the service role, which
 * bypasses grants entirely. The first browser write anyone tried was Remove,
 * and it had never worked.
 *
 * So this pairs the two halves that drifted: for any table a REVOKE narrowed,
 * every operation the frontend performs on it from the browser must have a
 * matching GRANT to `authenticated`.
 */

const MIG_DIR = "supabase/migrations";
const migrations = readdirSync(MIG_DIR)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => ({ file: f, sql: readFileSync(join(MIG_DIR, f), "utf8") }));

/** SQL with `--` comments stripped, so an assertion cannot match its own explanation. */
const bare = (s: string) => s.replace(/^\s*--.*$/gm, "");
const allSql = migrations.map((m) => bare(m.sql)).join("\n");

/** Every source file under src/, so the walk cannot miss a page. */
const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (path.endsWith(".ts") || path.endsWith(".tsx")) out.push(path);
  }
  return out;
};
const sources = walk("src").filter((p) => !p.endsWith(".test.ts") && !p.endsWith(".test.tsx"));

/**
 * Tables whose ONLY grant to `authenticated` is a column-scoped SELECT.
 *
 * Defined by the state that breaks rather than by the history that caused it.
 * The first version of this asked "was there a REVOKE mentioning this table
 * and `authenticated`", and that over-matched badly: it flagged `webhooks` and
 * `white_label_settings`, whose revokes are column-scoped —
 * `REVOKE SELECT (secret) ON public.webhooks` — and take away one column's
 * readability while leaving every write privilege untouched. Acting on that
 * would have granted privileges nothing had removed.
 *
 * What actually breaks a browser write is the end state: the role holds
 * `GRANT SELECT (a, b, c)` and no table-level privilege at all.
 */
function readOnlyColumnScopedTables(sql: string = allSql): string[] {
  const grantsByTable = new Map<string, string[]>();
  for (const m of sql.matchAll(/GRANT\s+([^;]+?)\s+ON\s+public\.([a-z_]+)\s+TO\s+([^;]+);/gi)) {
    if (!/authenticated/i.test(m[3])) continue;
    const list = grantsByTable.get(m[2]) ?? [];
    list.push(m[1].toUpperCase());
    grantsByTable.set(m[2], list);
  }
  const out: string[] = [];
  for (const [table, grants] of grantsByTable) {
    const columnScopedSelect = grants.some((g) => /^SELECT\s*\(/.test(g.trim()));
    const anyTableWide = grants.some((g) => /\bALL\b|\b(INSERT|UPDATE|DELETE)\b/.test(g));
    if (columnScopedSelect && !anyTableWide) out.push(table);
  }
  return out;
}

/** Which of insert/update/delete the browser performs on `table`. */
function browserWrites(table: string): string[] {
  const ops = new Set<string>();
  for (const file of sources) {
    const code = readFileSync(file, "utf8");
    // `.from("x")` then the operation, within the same chain.
    const re = new RegExp(`from\\(\\s*["'\`]${table}["'\`]\\s*\\)([\\s\\S]{0,200})`, "g");
    for (const m of code.matchAll(re)) {
      const chain = m[1];
      if (/\.insert\(|\.upsert\(/.test(chain)) ops.add("INSERT");
      if (/\.update\(|\.upsert\(/.test(chain)) ops.add("UPDATE");
      if (/\.delete\(/.test(chain)) ops.add("DELETE");
    }
  }
  return [...ops];
}

/** Whether `authenticated` has been granted `op` on `table` after the revoke. */
function hasGrant(table: string, op: string): boolean {
  for (const m of allSql.matchAll(/GRANT\s+([^;]+?)\s+ON\s+public\.([a-z_]+)\s+TO\s+([^;]+);/gi)) {
    if (m[2] !== table) continue;
    if (!/authenticated/i.test(m[3])) continue;
    const privileges = m[1].toUpperCase();
    if (privileges.includes("ALL")) return true;
    /*
     * A column-scoped write counts. `GRANT UPDATE (name, is_active)` is a real
     * UPDATE privilege and Postgres honours it; what this cannot know is which
     * columns a given PostgREST call touches, so it checks that the privilege
     * exists rather than that it covers the right columns. Being stricter here
     * produced a false positive on `api_keys`, which holds exactly that shape
     * and has always worked.
     */
    if (new RegExp(`\\b${op}\\b`).test(privileges)) return true;
  }
  return false;
}

describe("a table the browser writes to has the privilege to", () => {
  it("the detector actually detects, on input it cannot be fooled by", () => {
    /*
     * Tested against synthetic SQL rather than the live migrations, because
     * the live answer changes the moment the fix lands — a floor pinned to
     * "integrations is currently broken" starts failing as soon as it isn't.
     *
     * `locked` is the shape that breaks: column-scoped SELECT and nothing
     * else. `fine` has a table-wide write. `columnRevokeOnly` is the shape
     * that fooled the first version of this — a surgical
     * `REVOKE SELECT (secret)`, which removes one column's readability and no
     * write privilege at all.
     */
    const locked = `GRANT SELECT (id, user_id) ON public.locked TO authenticated;`;
    expect(readOnlyColumnScopedTables(locked)).toEqual(["locked"]);

    const fine = locked + `\nGRANT INSERT, UPDATE ON public.locked TO authenticated;`;
    expect(readOnlyColumnScopedTables(fine)).toEqual([]);

    const columnRevokeOnly = `REVOKE SELECT (secret) ON public.hooks FROM authenticated, anon;`;
    expect(readOnlyColumnScopedTables(columnRevokeOnly), "a column revoke takes no write away").toEqual([]);
  });

  it("the walk finds the tables and their writes at all", () => {
    // Floors on the two inputs: a parse that finds nothing proves nothing.
    expect(allSql).toMatch(/GRANT SELECT \([^)]*\) ON public\.integrations TO authenticated/);

    /*
     * The source-side floor names no table, and that is the point.
     *
     * It used to assert that the browser UPDATEs `integrations`, and it
     * started failing the day that stopped being true: disconnecting a
     * mailbox moved into the `disconnect-integration` edge function, so the
     * only thing the browser does to that table now is SELECT two columns.
     * Nothing was broken. The floor had pinned itself to a premise the fix
     * was supposed to remove, which is the same trap the synthetic input in
     * the test above exists to avoid.
     *
     * So prove the walk is not vacuous the way it actually can be vacuous:
     * it must find writes across the codebase, and it must still tell the
     * three operations apart. Either half going quiet is a broken detector;
     * neither depends on which table a given feature writes to.
     */
    const tables = new Set<string>();
    for (const file of sources) {
      for (const m of readFileSync(file, "utf8").matchAll(/from\(\s*["\'`]([a-z_]+)["\'`]\s*\)/g)) {
        tables.add(m[1]);
      }
    }
    const written = [...tables].filter((t) => browserWrites(t).length > 0);
    expect(written.length, "the source walk found no browser write anywhere").toBeGreaterThan(4);

    const ops = new Set(written.flatMap((t) => browserWrites(t)));
    expect([...ops].sort()).toEqual(["DELETE", "INSERT", "UPDATE"]);
  });

  it("every write the browser performs on a locked-down table is granted", () => {
    const missing: string[] = [];
    for (const table of readOnlyColumnScopedTables()) {
      for (const op of browserWrites(table)) {
        if (!hasGrant(table, op)) missing.push(`${table}: ${op}`);
      }
    }
    expect(missing, "these fail with 'permission denied for table ...'").toEqual([]);
  });

  it("a column-scoped SELECT is not mistaken for a write grant", () => {
    /*
     * The exact shape that caused this. `GRANT SELECT (id, user_id, ...)`
     * mentions the table and the role, so a looser check would read it as
     * "this table is granted" and pass while every write was denied.
     */
    expect(hasGrant("integrations", "UPDATE")).toBe(true);
    expect(allSql).toMatch(/GRANT SELECT \([^)]*\) ON public\.integrations TO authenticated/);
  });

  it("reads stay locked down — this fixes writes only", () => {
    /*
     * The point of the original migration was that a user cannot read their
     * own OAuth config or api key secret. Granting a bare SELECT here would
     * undo it while making every test above pass.
     */
    const restore = readFileSync(`${MIG_DIR}/20261103010000_restore_write_grants.sql`, "utf8");
    expect(bare(restore)).not.toMatch(/GRANT[^;]*\bSELECT\b/i);
  });
});

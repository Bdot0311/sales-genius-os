import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * An embed needs a relationship the database actually has.
 *
 * `subscriptions.select("user_id, profiles!inner(email, full_name)")` looks
 * like a join and compiles like anything else, but PostgREST answers 400:
 * `subscriptions.user_id` references `auth.users(id)` and `profiles.id`
 * references `auth.users(id)`, so both point at the same place and neither
 * points at the other. There is no relationship to resolve.
 *
 * Two functions did exactly that, and failed in the two different ways a
 * discarded error and a thrown one give you:
 *
 *   - `detect-suspicious-activity` dropped the error. `users` came back null,
 *     the per-user loop ran zero times, and every check inside it — API error
 *     rate, unusual access hours, mass deletion, rapid API-key creation —
 *     found nothing while the scan reported success. A security monitor that
 *     silently monitored nobody.
 *   - `audit-free-tier-emails` threw on it, so the whole audit died on its
 *     first query every run.
 *
 * Found as a live 400 in the API gateway logs, not by any test here:
 * `check-schema-refs` validates column names and knows nothing about embed
 * relationships.
 */

const FUNCTIONS = "supabase/functions";
const MIGRATIONS = "supabase/migrations";

const stripComments = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** Every `CREATE TABLE … <name> ( … )` body in the migrations, concatenated. */
function tableBodies(): Map<string, string> {
  const bodies = new Map<string, string>();
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(MIGRATIONS, file), "utf8");
    const re = /CREATE TABLE (?:IF NOT EXISTS )?(?:public\.)?([a-z_]+)\s*\(/gi;
    for (let m = re.exec(sql); m; m = re.exec(sql)) {
      // Walk to the matching close paren so column lists with their own
      // parens (numeric(10,2), CHECK (...)) do not end the body early.
      let depth = 1;
      let i = m.index + m[0].length;
      for (; i < sql.length && depth > 0; i++) {
        if (sql[i] === "(") depth++;
        else if (sql[i] === ")") depth--;
      }
      const name = m[1].toLowerCase();
      bodies.set(name, (bodies.get(name) ?? "") + sql.slice(m.index, i));
    }
  }
  return bodies;
}

/** Whether the migrations declare a foreign key either way between two tables. */
function related(a: string, b: string, bodies: Map<string, string>, allSql: string): boolean {
  const refs = (from: string, to: string) => {
    const body = bodies.get(from);
    if (!body) return false;
    return new RegExp(`REFERENCES\\s+(?:public\\.)?${to}\\s*\\(`, "i").test(body);
  };
  if (refs(a, b) || refs(b, a)) return true;
  /*
   * An FK added after the fact, by ALTER TABLE — checked in one direction at
   * a time and kept inside one statement.
   *
   * The first version of this used `(?:a|b)` on both sides with a `[\\s\\S]`
   * span, and reported `subscriptions` related to `api_keys`: the span ran
   * past a `;` and a comment into the next CREATE TABLE, whose
   * `api_key_id REFERENCES public.api_keys(id)` it then credited to the
   * `ALTER TABLE public.api_keys` above it. An alternation on both sides also
   * lets a table satisfy the check against itself, which proves nothing.
   */
  const altered = (from: string, to: string) =>
    new RegExp(
      `ALTER TABLE\\s+(?:public\\.)?${from}\\b[^;]{0,400}?REFERENCES\\s+(?:public\\.)?${to}\\s*\\(`,
      "i",
    ).test(allSql);
  return altered(a, b) || altered(b, a);
}

describe("a PostgREST embed needs a relationship the database actually has", () => {
  const bodies = tableBodies();
  const allSql = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql")).sort()
    .map((f) => readFileSync(join(MIGRATIONS, f), "utf8")).join("\n");

  /** Every explicit-join embed in the edge functions, with the table it reads. */
  const embeds: Array<{ file: string; from: string; embedded: string }> = [];
  for (const file of sourceFiles(FUNCTIONS)) {
    const code = stripComments(readFileSync(file, "utf8"));
    const re = /([a-z_]+)!(?:inner|left)\s*\(/g;
    for (let m = re.exec(code); m; m = re.exec(code)) {
      // The nearest `.from("table")` above the embed is the table being read.
      const before = code.slice(0, m.index);
      const froms = [...before.matchAll(/\.from\(\s*['"]([a-z_]+)['"]\s*\)/g)];
      if (froms.length === 0) continue;
      embeds.push({
        file,
        from: froms[froms.length - 1][1],
        embedded: m[1].toLowerCase(),
      });
    }
  }

  it("the migrations parse into table definitions", () => {
    // If this ever reads 0 the checks below pass by knowing nothing.
    expect(bodies.size).toBeGreaterThan(50);
    expect(bodies.has("subscriptions")).toBe(true);
    expect(bodies.has("profiles")).toBe(true);
  });

  it("every embed resolves to a declared foreign key", () => {
    const broken = embeds
      .filter((e) => !related(e.from, e.embedded, bodies, allSql))
      .map((e) => `${e.file}: ${e.from} embeds ${e.embedded}`);
    expect(broken, "these answer 400 at runtime, not at build time").toEqual([]);
  });

  it("the live embed that does work is seen, so this is not vacuous", () => {
    /*
     * `webhook_deliveries.webhook_id REFERENCES webhooks(id)` is real, and the
     * API logs show that read returning 200. If the scan stopped finding it,
     * the check above would be passing on an empty list.
     */
    const found = embeds.find((e) => e.from === "webhook_deliveries" && e.embedded === "webhooks");
    expect(found, "replay-webhook's embed should be detected").toBeTruthy();
    expect(related("webhook_deliveries", "webhooks", bodies, allSql)).toBe(true);
  });

  it("subscriptions and profiles are still not joinable", () => {
    /*
     * The specific pair that was wrong twice. Both tables reference
     * `auth.users(id)` and neither references the other, so an embed between
     * them cannot work — read profiles by id instead, which is what the admin
     * lookup in detect-suspicious-activity already did.
     *
     * If an FK is ever added, this fails and the embed becomes allowed.
     */
    expect(related("subscriptions", "profiles", bodies, allSql)).toBe(false);
    for (const file of [
      `${FUNCTIONS}/detect-suspicious-activity/index.ts`,
      `${FUNCTIONS}/audit-free-tier-emails/index.ts`,
    ]) {
      const code = stripComments(readFileSync(file, "utf8"));
      expect(code, file).not.toContain("profiles!inner");
      expect(code, `${file} should read profiles by id`)
        .toMatch(/from\("profiles"\)[\s\S]{0,120}\.in\("id",/);
    }
  });

  it("a monitor that cannot list its subjects does not report a clean scan", () => {
    /*
     * The discarded error is why this went unnoticed: no alerts and no error
     * reads exactly like a quiet hour. The count and the failure flag are in
     * the response so the difference is visible without reading the logs.
     */
    const code = readFileSync(`${FUNCTIONS}/detect-suspicious-activity/index.ts`, "utf8");
    expect(code).toContain("error: proSubsErr");
    expect(code).toContain("pro_scan_failed: !!proSubsErr");
    expect(code).toContain("pro_users_scanned: users.length");
  });
});

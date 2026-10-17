import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

/**
 * A send allowance you can delete your way out of is not an allowance.
 *
 * Moving the daily cap onto a live count of `sent_emails` closed one hole and
 * opened another: `delete-sent-emails` lets a signed-in user permanently
 * delete their own rows by id, and `agent-chat` exposes the same delete as a
 * tool. An account could send its full allowance, delete the records, and
 * send it again, as often as it liked. The monthly cap has read `sent_emails`
 * the same way since it was written, so it had this already.
 *
 * Deleting your own sent history stays a real capability. What stops is
 * deletion moving the allowance, so usage gets its own append-only record
 * that nothing in the app can remove.
 *
 * Measured on Postgres 16: ten recorded sends, every `sent_emails` row then
 * deleted, and both caps still read 10. With twenty-five pre-ledger rows and
 * no ledger entries, both read 25 — so no backfill was needed and no window
 * exists where today's cap reads zero.
 */

const MIGRATIONS = "supabase/migrations";
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*--.*$/gm, "");

/** The migration that defines `name` last, which is the one that runs. */
function liveDefinition(name: string): { file: string; sql: string; whole: string } {
  const create = `CREATE OR REPLACE FUNCTION public.${name}(`;
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) => readFileSync(`${MIGRATIONS}/${f}`, "utf8").includes(create));
  expect(files.length, `nothing defines ${name}`).toBeGreaterThan(0);
  const file = files[files.length - 1];
  const whole = readFileSync(`${MIGRATIONS}/${file}`, "utf8");
  const from = whole.lastIndexOf(create);
  const end = whole.indexOf("\n$$;", from);
  expect(end, `${name} in ${file} has no closing $$;`).toBeGreaterThan(from);
  return { file, sql: strip(whole.slice(from, end)), whole: strip(whole) };
}

const LEDGER = strip(
  readFileSync(`${MIGRATIONS}/20261017030000_send_allowance_ledger.sql`, "utf8"),
);

describe("usage is recorded where deleting history cannot reach it", () => {
  it("the ledger is append-only from the app's side", () => {
    expect(LEDGER).toContain("CREATE TABLE IF NOT EXISTS public.send_allowance_usage");
    expect(LEDGER).toContain("ALTER TABLE public.send_allowance_usage ENABLE ROW LEVEL SECURITY");
    /*
     * No policies and no grants below service_role. A row nobody in the app
     * can delete is the whole reason the table exists, so it is not reachable
     * from a session at all — not even to read.
     */
    expect(LEDGER).toMatch(
      /REVOKE ALL ON public\.send_allowance_usage FROM PUBLIC, anon, authenticated;/,
    );
    expect(LEDGER).not.toMatch(/CREATE POLICY[^;]*send_allowance_usage/);
    expect(LEDGER).not.toMatch(/GRANT [A-Z, ]*ON public\.send_allowance_usage TO authenticated/);
    // The sequence is a grant of its own; missing it leaves inserts failing.
    expect(LEDGER).toMatch(/GRANT USAGE, SELECT ON SEQUENCE public\.send_allowance_usage_id_seq TO service_role;/);
  });

  it("every send writes one row, through the call the senders already make", () => {
    const { sql } = liveDefinition("increment_daily_emails_sent");
    expect(sql).toContain("INSERT INTO public.send_allowance_usage (user_id) VALUES (_user_id)");
    // The display counter is still maintained, for the Outreach panel.
    expect(sql).toContain("UPDATE public.subscriptions");
  });

  it("cannot be used by one account against another", () => {
    /*
     * It takes a user id and runs as definer, and it was executable by every
     * signed-in user — so one account could inflate another's usage and stop
     * their sends.
     */
    const { sql, whole } = liveDefinition("increment_daily_emails_sent");
    expect(sql).toMatch(/IF auth\.role\(\) <> 'service_role' THEN/);
    expect(sql).toMatch(/RAISE EXCEPTION/);
    expect(whole).toMatch(
      /REVOKE ALL ON FUNCTION public\.increment_daily_emails_sent\(uuid\) FROM PUBLIC, anon, authenticated;/,
    );
  });

  it("both caps take the larger of the ledger and the surviving history", () => {
    for (const [name, boundary] of [
      ["get_daily_email_count", "date_trunc('day', now())"],
      ["get_monthly_email_count", "date_trunc('month', now())"],
    ] as const) {
      const { sql } = liveDefinition(name);
      expect(sql, name).toContain("greatest(");
      expect(sql, name).toContain("FROM public.send_allowance_usage u");
      // Dropping the live side would make every pre-ledger send free.
      expect(sql, name).toContain("FROM public.sent_emails s");
      expect(sql, name).toContain(boundary);
      // Both sides must share the boundary, or one of them counts the wrong day.
      expect([...sql.matchAll(new RegExp(boundary.replace(/[()']/g, "\\$&"), "g"))].length, name)
        .toBe(2);
    }
  });

  it("a send that could not be recorded is raised, not papered over", () => {
    /*
     * The old fallback wrote the counter column directly when the RPC failed.
     * That column is no longer what any cap reads, so the fallback looked like
     * a recovery while leaving the send uncounted.
     */
    const SEND = readFileSync("supabase/functions/send-email/index.ts", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const at = SEND.indexOf("if (rpcError) {");
    expect(at).toBeGreaterThan(-1);
    const branch = SEND.slice(at, at + 600);
    expect(branch).toContain("logSystemAlert");
    expect(branch).toContain("outreach_send_error");
    expect(branch).not.toContain("daily_emails_sent:");
  });
});

describe("the delete this guards against is real", () => {
  it("a signed-in user can delete their own sent_emails rows", () => {
    /*
     * Asserted against the endpoint rather than assumed: if deleting stopped
     * being possible, the ledger would be guarding a situation that no longer
     * happens — and the guard would be the only thing left saying why it
     * exists.
     */
    const DEL = readFileSync("supabase/functions/delete-sent-emails/index.ts", "utf8");
    expect(DEL).toContain('.from("sent_emails")');
    expect(DEL).toContain(".delete()");
    expect(DEL).toContain('.eq("user_id", user.id)');
  });
});

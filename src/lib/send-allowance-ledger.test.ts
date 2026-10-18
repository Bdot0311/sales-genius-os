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
const LEDGER_CREDITS = strip(
  readFileSync(`${MIGRATIONS}/20261017040000_send_allowance_credits_bounces.sql`, "utf8"),
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
    expect(sql).toContain("INSERT INTO public.send_allowance_usage (user_id, sent_email_id)");
    // The display counter is still maintained, for the Outreach panel.
    expect(sql).toContain("UPDATE public.subscriptions");
  });

  it("one row per send, however many times the sender retries", () => {
    // The Gmail send succeeded, the row was written, the call came again.
    // Charging twice for one send is the same wrong as charging for a bounce.
    const { sql } = liveDefinition("increment_daily_emails_sent");
    expect(sql).toMatch(/ON CONFLICT \(sent_email_id\) WHERE sent_email_id IS NOT NULL DO NOTHING/);
    expect(LEDGER_CREDITS).toContain("CREATE UNIQUE INDEX IF NOT EXISTS idx_send_allowance_usage_sent_email");
  });

  it("both senders name the send they are recording", () => {
    /*
     * Without the id a ledger row is anonymous and a bounce has nothing to
     * find. Null is allowed and stays charged, which is the safe direction
     * for a number that gates sending.
     */
    const SEND = strip(readFileSync("supabase/functions/send-email/index.ts", "utf8"));
    expect(SEND).toMatch(/_sent_email_id: sentRow\?\.id \?\? null/);
    expect(SEND).toContain(".select('id').maybeSingle()");
    const CRON = strip(readFileSync("supabase/functions/process-scheduled-emails/index.ts", "utf8"));
    expect(CRON).toMatch(/_sent_email_id: email\.id/);
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
      /REVOKE ALL ON FUNCTION public\.increment_daily_emails_sent\(uuid, uuid\) FROM PUBLIC, anon, authenticated;/,
    );
    /*
     * The one-argument form is dropped rather than left beside the new one:
     * with a defaulted second parameter both would match a one-argument call
     * and Postgres would refuse it as ambiguous.
     */
    expect(whole).toContain("DROP FUNCTION IF EXISTS public.increment_daily_emails_sent(uuid);");
  });

  it("a bounce gives the allowance back", () => {
    /*
     * Both caps leave 'bounced' out of the statuses they count, and have since
     * get_monthly_email_count was written: a bounce left the building, but the
     * product does not spend a paid allowance on a message nobody received.
     * The ledger broke that rule by outliving the bounce — greatest() kept the
     * higher number, so the account least able to fix a bad list burned its
     * day's sends on mail that never arrived.
     *
     * Measured on Postgres 16: five recorded sends read 5; two bounced and
     * credited read 3; the same two DSNs redelivered still read 3.
     */
    const { sql, whole } = liveDefinition("credit_bounced_send");
    expect(sql).toContain("UPDATE public.send_allowance_usage");
    expect(sql).toContain("SET credited_at = now()");
    expect(sql).toContain("WHERE sent_email_id = _sent_email_id");
    // Idempotent, so a DSN delivered twice credits once.
    expect(sql).toContain("AND credited_at IS NULL");
    expect(sql).toMatch(/IF auth\.role\(\) <> 'service_role' THEN/);
    expect(whole).toMatch(
      /REVOKE ALL ON FUNCTION public\.credit_bounced_send\(uuid\) FROM PUBLIC, anon, authenticated;/,
    );

    // And the bounce path actually calls it, or the rule is only documented.
    const SYNC = strip(readFileSync("supabase/functions/sync-bounces/index.ts", "utf8"));
    expect(SYNC).toMatch(/\.rpc\("credit_bounced_send", \{\s*_sent_email_id: send\.id,\s*\}\)/);
    /*
     * Credited before the bounce_events row is written, so a failure there
     * cannot leave the allowance spent with nothing recording why.
     *
     * Anchored on the INSERT specifically. This compared against the first
     * `from("bounce_events")` in the file, and once a helper above the loop
     * started updating that table the comparison silently became one between
     * two unrelated references.
     */
    const insertAt = SYNC.indexOf('from("bounce_events")\n            .insert(');
    const insertFallback = insertAt > -1 ? insertAt : SYNC.indexOf('.from("bounce_events").insert(');
    expect(insertFallback, "the bounce_events insert should still exist").toBeGreaterThan(-1);
    expect(SYNC.indexOf("credit_bounced_send")).toBeLessThan(insertFallback);
  });

  it("a credited row stops counting against either cap", () => {
    for (const name of ["get_daily_email_count", "get_monthly_email_count"]) {
      const { sql } = liveDefinition(name);
      expect(sql, name).toContain("u.credited_at IS NULL");
    }
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

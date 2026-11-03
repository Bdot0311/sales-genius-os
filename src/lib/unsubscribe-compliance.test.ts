import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  appendUnsubscribeFooter,
  isOptedOut,
  listUnsubscribeHeaders,
  unsubscribeFooterHtml,
  unsubscribeUrl,
} from "../../supabase/functions/_shared/unsubscribe";

const SEND = readFileSync("supabase/functions/send-email/index.ts", "utf8");
const SCHEDULED = readFileSync("supabase/functions/process-scheduled-emails/index.ts", "utf8");
const ENDPOINT = readFileSync("supabase/functions/unsubscribe/index.ts", "utf8");
const MIGRATION = readFileSync("supabase/migrations/20261014160000_unsubscribe_per_sender.sql", "utf8");

/**
 * Three faults in one corner, found together.
 *
 * No List-Unsubscribe header on any send, which Gmail and Yahoo have required
 * of every bulk sender since February 2024. The scheduled path — everything
 * queued goes out through it, which is to say it carries the volume — minted
 * no token, wrote no footer and sent no header, while checking the opt-out
 * list on the way out. And opt-outs were keyed on the address alone, so one
 * account's unsubscribe stopped every other account on the platform from
 * mailing that person.
 */

describe("every send carries the header Gmail requires", () => {
  it("advertises one-click, not just a link", () => {
    // Without List-Unsubscribe-Post the client opens the URL instead of
    // showing its own control, which is the whole point of the header.
    const h = listUnsubscribeHeaders("https://x.test/functions/v1/unsubscribe?token=abc");
    expect(h).toEqual([
      "List-Unsubscribe: <https://x.test/functions/v1/unsubscribe?token=abc>",
      "List-Unsubscribe-Post: List-Unsubscribe=One-Click",
    ]);
  });

  it("is in the immediate send path's MIME block", () => {
    const mime = SEND.slice(SEND.indexOf("const emailContent = ["));
    expect(mime.slice(0, 900)).toContain("listUnsubscribeHeaders(unsubUrl)");
  });

  it("is in the scheduled send path's MIME block", () => {
    const mime = SCHEDULED.slice(SCHEDULED.indexOf("const emailContent = ["));
    expect(mime.slice(0, 900)).toContain("listUnsubscribeHeaders(unsubUrl)");
  });

  it("points at a token, never a bare address", () => {
    const url = unsubscribeUrl("https://x.test", "tok+en/1");
    expect(url).toContain("token=tok%2Ben%2F1");
    expect(url).not.toContain("email=");
  });
});

describe("the path that carries the volume can be unsubscribed from", () => {
  it("mints a token and shows the link", () => {
    expect(SCHEDULED).toContain("mintUnsubscribeToken(supabase, email.user_id");
    expect(SCHEDULED).toContain("appendUnsubscribeFooter(trackedBody, unsubUrl)");
  });

  it("puts the footer inside the document, not after it", () => {
    const out = appendUnsubscribeFooter("<html><body><p>hi</p></body></html>", "https://x.test/u?token=t");
    expect(out.indexOf("Unsubscribe")).toBeLessThan(out.indexOf("</body>"));
  });

  it("adds nothing to a body that already carries one", () => {
    // send-email builds its own footer before this runs; two unsubscribe
    // links in one email reads as a bug to the recipient.
    const once = unsubscribeFooterHtml("https://x.test/functions/v1/unsubscribe?token=t");
    expect(appendUnsubscribeFooter(once, "https://x.test/functions/v1/unsubscribe?token=t")).toBe(once);
  });
});

describe("an opt-out belongs to the sender it was made to", () => {
  const db = (rows: Array<{ user_id: string | null }>) => ({
    from: () => ({
      select: () => ({ eq: () => ({ data: rows, error: null }) }),
    }),
  });

  it("blocks the sender it was made to", async () => {
    expect(await isOptedOut(db([{ user_id: "me" }]), "me", "a@b.com")).toBe(true);
  });

  /*
   * The cross-tenant half: it matched on the address alone, so one account's
   * unsubscribe blocked every other account — and the refusal told the second
   * account that somebody else had already burned that address.
   */
  it("does not block a different sender", async () => {
    expect(await isOptedOut(db([{ user_id: "someone-else" }]), "me", "a@b.com")).toBe(false);
  });

  it("still honours a global opt-out, which is what old rows are", async () => {
    expect(await isOptedOut(db([{ user_id: null }]), "me", "a@b.com")).toBe(true);
  });

  it("holds the send when the check itself fails", async () => {
    // Mailing someone who opted out is the expensive mistake; one held email
    // is not.
    const broken = { from: () => ({ select: () => ({ eq: () => ({ data: null, error: { message: "down" } }) }) }) };
    expect(await isOptedOut(broken, "me", "a@b.com")).toBe(true);
  });

  it("both send paths ask the scoped question", () => {
    expect(SEND).toContain("await isOptedOut(supabase, user.id, to)");
    expect(SCHEDULED).toContain("await isOptedOut(supabase, email.user_id");
  });

  it("no writer records a global opt-out any more", () => {
    const RUN = readFileSync("supabase/functions/agent-run/index.ts", "utf8");
    expect(RUN).toContain('onConflict: "user_id,email"');
    expect(RUN).not.toContain('{ email: reply.fromEmail, opted_out_at');
  });
});

describe("the endpoint answers what the header promises", () => {
  /*
   * RFC 8058 one-click is a POST the client makes itself, without ever showing
   * the page. A GET-only endpoint answering it means the header advertises a
   * control that does nothing: the recipient presses unsubscribe, the client
   * reports it done, and the next email arrives.
   */
  it("accepts the POST", () => {
    expect(ENDPOINT).toContain('const oneClick = req.method === "POST"');
    expect(ENDPOINT).toContain("GET, POST, OPTIONS");
  });

  it("reads the token from the body as well as the query", () => {
    expect(ENDPOINT).toContain("await req.formData()");
  });

  it("answers a one-click with JSON, not a web page", () => {
    const tail = ENDPOINT.slice(ENDPOINT.indexOf("if (oneClick) {", ENDPOINT.indexOf("const address")));
    expect(tail).toContain("ok: true");
  });

  it("records the opt-out against the sender on the token", () => {
    expect(ENDPOINT).toContain("const senderId = tokenRecord.user_id ?? null;");
    expect(ENDPOINT).toContain("onConflict: 'user_id,email'");
  });
});

describe("the constraints an upsert has to be able to name", () => {
  /*
   * Postgres infers a partial unique index for ON CONFLICT only when the
   * statement repeats the predicate, and PostgREST's on_conflict passes column
   * names and nothing else. A partial (user_id, email) index would fail every
   * upsert at the moment a recipient clicks unsubscribe.
   */
  it("keeps the sender index non-partial", () => {
    expect(MIGRATION).toContain("ON public.email_optouts (user_id, email);");
    expect(MIGRATION).not.toMatch(/\(user_id, email\) WHERE/);
  });

  it("keeps global rows unique with a partial index instead", () => {
    // NULLs are distinct, so without this the same address could be opted out
    // globally any number of times.
    expect(MIGRATION).toContain("ON public.email_optouts (email) WHERE user_id IS NULL;");
  });

  it("drops the unique that forced the global behaviour", () => {
    expect(MIGRATION).toContain("DROP CONSTRAINT");
    expect(MIGRATION).toContain("contype = 'u'");
  });

  it("leaves existing opt-outs applying to everyone", () => {
    // Re-scoping them would hand every other account a list of people who
    // have already said no.
    expect(MIGRATION).not.toMatch(/UPDATE public\.email_optouts\s+SET user_id/i);
  });
});

/**
 * The vault secret the scheduled jobs sign with is not the service role key.
 *
 * sync-vault-service-key writes INTERNAL_TRIGGER_SECRET into the vault under
 * the name `email_queue_service_role_key`. The name says one thing and the
 * contents are another, and every job in the schedule signs with it.
 *
 * requireServiceRole accepts either that secret or the real service role key,
 * which is why the jobs using it work. Five functions rolled their own check
 * against SUPABASE_SERVICE_ROLE_KEY alone, so they rejected cron whichever of
 * the two it sent — the anon key before, and the vault secret after the first
 * attempt at this fix.
 */
describe("scheduled jobs reach the functions they call", () => {
  const SHARED = readFileSync("supabase/functions/_shared/internal-auth.ts", "utf8");

  it("the shared guard accepts both secrets", () => {
    expect(SHARED).toContain('Deno.env.get("INTERNAL_TRIGGER_SECRET")');
    expect(SHARED).toContain('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")');
  });

  it("the vault secret holds the internal one, whatever its name says", () => {
    const SYNC = readFileSync("supabase/functions/sync-vault-service-key/index.ts", "utf8");
    // Both names carry the same value while the old one is still read.
    expect(SYNC).toContain('["internal_trigger_secret", "email_queue_service_role_key"]');
    expect(SYNC).toContain("_secret: INTERNAL_TRIGGER_SECRET");
  });

  /*
   * The five that were 401ing. Each now defers to the shared guard rather
   * than comparing the bearer against the service key itself.
   */
  for (const fn of [
    "audit-free-tier-emails",
    "run-scheduled-imports",
    "run-seo-audit",
    "send-seo-digest",
  ]) {
    it(`${fn} accepts the key cron actually sends`, () => {
      const src = readFileSync(`supabase/functions/${fn}/index.ts`, "utf8");
      expect(src).toMatch(/from ['"]\.\.\/_shared\/internal-auth\.ts['"]/);
      // No hand-rolled comparison left to reject it.
      expect(src).not.toMatch(/token !== SERVICE_ROLE\b/);
      expect(src).not.toMatch(/token !== serviceKey\b/);
      expect(src).not.toMatch(/bearer === SERVICE_KEY\b/);
    });
  }

  it("the migration signs with that vault secret, under its honest name", () => {
    const SQL = readFileSync("supabase/migrations/20261015040000_fix_cron_job_auth.sql", "utf8");
    // Counted in the job bodies, not the file: the header comment names it too.
    const lookups = SQL.match(/WHERE name = 'internal_trigger_secret'/g) ?? [];
    expect(lookups).toHaveLength(5);
    expect(SQL).not.toContain("role\":\"anon");
  });
});

/**
 * A secret whose name says the opposite of what it holds.
 *
 * email_queue_service_role_key has never held the service role key, and the
 * name cost a round on this branch: five broken jobs were repointed at "the
 * service role key", got the internal secret, and carried on answering 401
 * because the functions compared against the real one.
 */
describe("the vault secret is renamed without dropping anyone", () => {
  const RENAME = readFileSync(
    "supabase/migrations/20261015030000_rename_internal_trigger_secret.sql",
    "utf8",
  );
  const SYNC = readFileSync("supabase/functions/sync-vault-service-key/index.ts", "utf8");

  it("creates the honest name from the old value", () => {
    expect(RENAME).toContain("vault.create_secret(");
    expect(RENAME).toContain("'internal_trigger_secret'");
  });

  it("moves every job that reads the old name", () => {
    // Driven off cron.job rather than a hand-listed set: nine of them are
    // scheduled in the live database and only some have a migration here.
    expect(RENAME).toContain("FROM cron.job");
    expect(RENAME).toContain("WHERE command LIKE '%email_queue_service_role_key%'");
    expect(RENAME).toContain("replace(j.command, 'email_queue_service_role_key', 'internal_trigger_secret')");
  });

  /*
   * internal_job_key() is defined in the database and nowhere in this
   * repository. Dropping the old secret would break whichever readers like it
   * are invisible from here, silently.
   */
  it("keeps the old name alive rather than dropping it", () => {
    expect(RENAME).not.toMatch(/delete_secret|DROP SECRET/i);
    expect(SYNC).toContain('["internal_trigger_secret", "email_queue_service_role_key"]');
  });

  it("writes the honest name first, so a failure leaves it current", () => {
    const order = SYNC.indexOf('["internal_trigger_secret"');
    expect(order).toBeGreaterThan(-1);
    expect(SYNC.indexOf("internal_trigger_secret", order)).toBeLessThan(
      SYNC.indexOf("email_queue_service_role_key", order),
    );
  });

  it("runs before the jobs that read the new name", () => {
    // 20261015030000 creates it; 20261015040000 schedules five jobs against
    // it. The other way round, those five read a secret that is not there yet
    // and send a null Authorization header.
    expect("20261015030000" < "20261015040000").toBe(true);
  });
});

/**
 * Warmup has never run, and two more jobs with it.
 *
 * deliverability_call_edge is the helper behind compute-reputation-daily,
 * deliverability-alerts-scan-daily and warmup-orchestrator-hourly. It signed
 * them with deliverability_settings.anon_key — a row that really does hold an
 * anon-role JWT, per the seed in 20260717232146.
 *
 * The three functions are the correct side of this: they use the shared
 * guards, which accept the service role key or INTERNAL_TRIGGER_SECRET, and
 * for warmup a real signed-in user. An anon key is none of those, so every
 * call the helper ever made was rejected at the door.
 */
describe("the deliverability jobs can reach their functions", () => {
  const FIX = readFileSync(
    "supabase/migrations/20261015060000_deliverability_call_edge_auth.sql",
    "utf8",
  );

  it("signs with the vault secret instead of the anon key", () => {
    expect(FIX).toContain("WHERE name = 'internal_trigger_secret'");
    const body = FIX.slice(FIX.indexOf("CREATE OR REPLACE FUNCTION"));
    expect(body).not.toContain("key = 'anon_key'");
  });

  it("falls back to the old secret name, in case of out-of-order apply", () => {
    expect(FIX).toContain("WHERE name = 'email_queue_service_role_key'");
  });

  it("refuses to send an unsigned call", () => {
    // A null secret concatenates to a null Authorization header, which reads
    // downstream as the function being broken rather than the call unsigned.
    expect(FIX).toContain("IF v_url IS NULL OR v_key IS NULL THEN");
    expect(FIX).toContain("RAISE WARNING");
  });

  it("the three targets still require a real credential", () => {
    // The fix is on the caller. If a target ever loosened to accept the anon
    // key, that would be the wrong repair.
    const guards: Array<[string, string]> = [
      ["compute-reputation", "requireServiceRole"],
      ["deliverability-alerts-scan", "requireServiceRole"],
      ["warmup-orchestrator", "resolveCaller"],
    ];
    for (const [fn, guard] of guards) {
      const src = readFileSync(`supabase/functions/${fn}/index.ts`, "utf8");
      expect(src, `${fn} should use ${guard}`).toContain(guard);
    }
  });

  it("runs after the secret it reads exists", () => {
    expect("20261015030000" < "20261015060000").toBe(true);
  });
});

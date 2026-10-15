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
    expect(SYNC).toContain('_name: "email_queue_service_role_key"');
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

  it("the migration signs with that vault secret", () => {
    const SQL = readFileSync("supabase/migrations/20261015040000_fix_cron_job_auth.sql", "utf8");
    expect(SQL.match(/email_queue_service_role_key/g)?.length).toBe(5);
    expect(SQL).not.toContain("role\":\"anon");
  });
});

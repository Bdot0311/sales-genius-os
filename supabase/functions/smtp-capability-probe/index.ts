// smtp-capability-probe — can this runtime open an SMTP connection at all?
//
// Custom SMTP sending needs one thing the rest of this product has never
// needed: a raw outbound TCP socket. Everything else sends over HTTP — Gmail's
// API for outreach, Lovable's API for platform mail, a rented handshake for
// verification. There is no precedent in the repository for Deno.connect, and
// _shared/email-verify.ts records the finding that an edge function cannot do
// an SMTP handshake itself because port 25 is blocked.
//
// Port 25 is the DELIVERY port and is blocked nearly everywhere. Submission —
// 587 with STARTTLS, 465 with implicit TLS — is a different thing and is
// usually open. Whether Supabase's edge runtime permits it is not documented
// either way, and building a mailbox-credentials feature on the assumption
// would be guessing at the one fact the whole design rests on.
//
// So this asks. It opens a socket, reads the greeting, and says what happened.
// It sends nothing and needs no credentials.
//
// Delete this function once the answer is known and recorded.

import { corsHeaders, requireInternalOrUser } from "../_shared/internal-auth.ts";

interface ProbeResult {
  target: string;
  reachable: boolean;
  /** The server's opening line, which proves it is really an SMTP server. */
  greeting?: string;
  error?: string;
  /**
   * Whether the failure says anything about THIS RUNTIME's permission to open
   * a socket, as opposed to the network or the far end having a bad day.
   */
  indicatesPlatformBlock?: boolean;
  ms: number;
}

/**
 * Does this error mean the runtime refused, or that the internet did?
 *
 * The distinction is the whole point of the probe. A DNS failure, a TLS
 * handshake error, a timeout or Gmail having an outage all produce a failed
 * connect, and none of them says anything about whether Supabase permits
 * submission sockets. Only a refusal from the sandbox does — which Deno
 * raises as PermissionDenied or NotCapable, and older runtimes as a plain
 * message about the API being unavailable.
 *
 * Treating the other failures as a platform restriction would send us down
 * the relay path for a reason that was never true, which is a worse outcome
 * than not knowing.
 */
function looksLikePlatformBlock(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === "PermissionDenied" || err.name === "NotCapable") return true;
  return /not (supported|implemented|available|capable)|requires .*--allow-net|permission denied/i
    .test(err.message);
}

async function probe(hostname: string, port: number, tls: boolean): Promise<ProbeResult> {
  const target = `${hostname}:${port}${tls ? " (implicit TLS)" : " (plain, STARTTLS)"}`;
  const startedAt = Date.now();
  let conn: Deno.Conn | null = null;
  try {
    /*
     * The connect promise is kept rather than discarded, because a race only
     * decides which result is reported — it does not cancel the loser. A
     * connection that arrives after the timer wins was never assigned to
     * `conn`, so the finally block below could not close it and the socket
     * stayed open for the rest of the invocation.
     */
    const connecting = tls
      ? Deno.connectTls({ hostname, port })
      : Deno.connect({ hostname, port, transport: "tcp" });

    let timedOut = false;
    conn = await Promise.race([
      connecting,
      new Promise<never>((_, reject) =>
        setTimeout(() => {
          timedOut = true;
          reject(new Error("timed out after 5s"));
        }, 5_000)
      ),
    ]).catch((err) => {
      if (timedOut) {
        // Clean up whatever the loser eventually produces.
        connecting.then((late) => { try { late.close(); } catch { /* already gone */ } })
          .catch(() => { /* it failed too; nothing to close */ });
      }
      throw err;
    });

    const buf = new Uint8Array(512);
    const read = await Promise.race([
      conn.read(buf),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("connected, but no greeting within 5s")), 5_000)
      ),
    ]);
    const greeting = read ? new TextDecoder().decode(buf.subarray(0, read)).trim() : "";

    return { target, reachable: true, greeting, ms: Date.now() - startedAt };
  } catch (err) {
    return {
      target,
      reachable: false,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      indicatesPlatformBlock: looksLikePlatformBlock(err),
      ms: Date.now() - startedAt,
    };
  } finally {
    try { conn?.close(); } catch { /* already closed */ }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  /*
   * A signed-in user may run this, not only the service role.
   *
   * It is a one-shot diagnostic whose whole purpose is to be run and read,
   * and requiring the service role meant the only way to get an answer was to
   * handle the key that bypasses every RLS policy in the project — for a
   * function that returns a yes/no about a socket. The probe was deployed for
   * twelve days and never once invoked, because the cost of asking it was
   * higher than the answer.
   *
   * Nothing here is worth more than that trade: the targets are hardcoded
   * Gmail submission endpoints, it reads no table, writes nothing, and
   * returns no secret. Anonymous callers are still refused.
   */
  const unauth = await requireInternalOrUser(req);
  if (unauth) return unauth;

  /*
   * Gmail's submission endpoints, because they are reliably up and speak
   * standard SMTP. The question is about the runtime, not about any one mail
   * server, so a well-known target keeps the answer about the thing being
   * asked.
   */
  const results = [
    await probe("smtp.gmail.com", 587, false),
    await probe("smtp.gmail.com", 465, true),
  ];

  /*
   * Three answers, not two. "Both attempts failed" is not the same as "the
   * runtime forbids this": a DNS hiccup or a Gmail outage fails identically,
   * and reporting that as a platform restriction would retire a buildable
   * design for a reason that was never true.
   */
  const verdict = results.some((r) => r.reachable)
    ? "YES — SMTP sending is buildable here: the runtime opened a submission socket."
    : results.some((r) => r.indicatesPlatformBlock)
      ? "NO — the runtime refused to open a socket. SMTP sending cannot live in an edge function."
      : "INCONCLUSIVE — every attempt failed, but none of the errors came from the sandbox. "
        + "That is a network or far-end problem, not proof either way. Run it again.";

  console.log(`[smtp-capability-probe] ${verdict}`, JSON.stringify(results));

  return new Response(
    JSON.stringify({
      verdict,
      // Deno.connect existing is not the same as being permitted to use it.
      connect_api_present: typeof Deno.connect === "function",
      connect_tls_api_present: typeof Deno.connectTls === "function",
      results,
    }, null, 2),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

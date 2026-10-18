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

import { corsHeaders, requireServiceRole } from "../_shared/internal-auth.ts";

interface ProbeResult {
  target: string;
  reachable: boolean;
  /** The server's opening line, which proves it is really an SMTP server. */
  greeting?: string;
  error?: string;
  ms: number;
}

async function probe(hostname: string, port: number, tls: boolean): Promise<ProbeResult> {
  const target = `${hostname}:${port}${tls ? " (implicit TLS)" : " (plain, STARTTLS)"}`;
  const startedAt = Date.now();
  let conn: Deno.Conn | null = null;
  try {
    // A short deadline: a runtime that forbids this usually fails fast, and a
    // network that silently drops the SYN should not hold the function open.
    conn = await Promise.race([
      tls
        ? Deno.connectTls({ hostname, port })
        : Deno.connect({ hostname, port, transport: "tcp" }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timed out after 5s")), 5_000)
      ),
    ]);

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
      ms: Date.now() - startedAt,
    };
  } finally {
    try { conn?.close(); } catch { /* already closed */ }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const unauth = requireServiceRole(req);
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

  const verdict = results.some((r) => r.reachable)
    ? "SMTP sending is buildable here: the runtime opened a submission socket."
    : "SMTP sending is NOT buildable in an edge function: every submission socket was refused.";

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

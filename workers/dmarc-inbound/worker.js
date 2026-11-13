/**
 * Cloudflare Email Worker — DMARC report intake.
 *
 * Catches mail sent to dmarc.outreign.io and hands the raw message to the
 * ingest-dmarc-report Supabase function. It deliberately does nothing else:
 * no parsing, no database access, no credentials beyond one scoped secret, so
 * a compromise of this Worker exposes an ingestion endpoint and nothing more.
 *
 * Deploy: Cloudflare dashboard → Workers → create from this file, then
 * Email Routing → Routing Rules → catch-all → Send to a Worker.
 *
 * Secrets (Worker → Settings → Variables):
 *   INGEST_URL     https://<project-ref>.supabase.co/functions/v1/ingest-dmarc-report
 *   INGEST_SECRET  the same value as the DMARC_INGEST_SECRET function secret
 */

/** Cloudflare caps a Worker's memory; a report far above this is not one. */
const MAX_BYTES = 20 * 1024 * 1024;

export default {
  async email(message, env) {
    if (!env.INGEST_URL || !env.INGEST_SECRET) {
      console.error("dmarc-inbound: INGEST_URL or INGEST_SECRET is not set");
      // Reject rather than drop: a bounce tells the reporter (and us) that
      // something is wrong, where silence would look like everything is fine.
      message.setReject("Report intake is not configured");
      return;
    }

    if (message.rawSize > MAX_BYTES) {
      console.error(`dmarc-inbound: message too large (${message.rawSize} bytes) `);
      message.setReject("Message too large");
      return;
    }

    const raw = await new Response(message.raw).text();

    let response;
    try {
      response = await fetch(env.INGEST_URL, {
        method: "POST",
        headers: {
          "Content-Type": "message/rfc822",
          "x-dmarc-ingest-secret": env.INGEST_SECRET,
          // The envelope recipient carries the tenant token. Reading it here
          // is more reliable than parsing To: downstream, which reporters
          // format inconsistently.
          "x-dmarc-recipient": message.to,
        },
        body: raw,
      });
    } catch (e) {
      console.error("dmarc-inbound: ingestion unreachable:", e);
      // A temporary failure. Rejecting makes the receiver retry later, which is
      // exactly what we want — reports are worth having a day late.
      message.setReject("Temporary failure, please retry");
      return;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(`dmarc-inbound: ingestion returned ${response.status}: ${body.slice(0, 500)}`);
      if (response.status >= 500) {
        message.setReject("Temporary failure, please retry");
      }
      // A 4xx means this message will never be accepted, however many times it
      // is sent. Accept it silently so the reporter stops retrying.
      return;
    }

    console.log("dmarc-inbound: accepted report");
  },
};

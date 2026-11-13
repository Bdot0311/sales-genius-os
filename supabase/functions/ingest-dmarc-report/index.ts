// ingest-dmarc-report — receives a DMARC aggregate report as inbound mail.
//
// A Cloudflare Email Worker catches mail sent to <token>@dmarc.outreign.io and
// POSTs the raw RFC822 message here. This pulls the compressed XML out of the
// attachment, parses it, and stores it against the domain that owns the token.
//
// The token is the only ownership proof there is. It is published in the
// customer's own DNS, it is unguessable, and it is what stops anyone posting
// fabricated reports for a domain they do not own — which is also why the
// dmarc_reports table takes no user writes.
//
// Called by a Worker with no Supabase session, so verify_jwt is off and the
// shared secret below is the gate. That secret is scoped to this endpoint on
// purpose: putting the service-role key in a third-party edge runtime would
// hand out the whole database if the Worker leaked.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";
import { unzipSync } from "https://esm.sh/fflate@0.8.2";
import { parseDmarcReport, tokenFromRecipient } from "../_shared/dmarc-parse.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-dmarc-ingest-secret, x-dmarc-recipient",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Constant-time compare, so a wrong secret leaks nothing through timing. */
function secretMatches(given: string, expected: string): boolean {
  if (!given || !expected || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/\s+/g, "");
  const binary = atob(clean);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function gunzip(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes as unknown as BlobPart]).stream().pipeThrough(
    new DecompressionStream("gzip"),
  );
  return await new Response(stream).text();
}

/**
 * The XML inside a report mail.
 *
 * Google sends `.xml.gz`, Microsoft and Yahoo send `.zip`, and a few reporters
 * send the XML inline uncompressed. All three shapes have to work or the feed
 * is silently missing whichever provider we skipped.
 */
async function extractXml(raw: string): Promise<{ xml: string | null; how: string }> {
  // Uncompressed and inline: no attachment to unpack.
  const inline = raw.match(/<\?xml[\s\S]*?<feedback[\s\S]*?<\/feedback>/i);
  if (inline) return { xml: inline[0], how: "inline" };

  // Otherwise the report is a base64 attachment. Walk the MIME parts rather
  // than reaching for one big regex: reports routinely carry a text/plain part
  // before the attachment, and grabbing the first base64 blob finds the wrong
  // one when a reporter base64-encodes its cover text too.
  const parts = raw.split(/\r?\n--[^\r\n-][^\r\n]*\r?\n/);
  for (const part of parts) {
    const headerEnd = part.search(/\r?\n\r?\n/);
    if (headerEnd < 0) continue;
    const headers = part.slice(0, headerEnd).toLowerCase();
    if (!headers.includes("base64")) continue;

    const isGzip = /\.gz\b|application\/gzip|application\/x-gzip/.test(headers);
    const isZip = /\.zip\b|application\/zip|application\/x-zip/.test(headers);
    if (!isGzip && !isZip) continue;

    const body = part.slice(headerEnd).trim();
    let bytes: Uint8Array;
    try {
      bytes = base64ToBytes(body);
    } catch {
      continue;
    }

    try {
      if (isGzip) return { xml: await gunzip(bytes), how: "gzip" };
      const files = unzipSync(bytes);
      const name = Object.keys(files).find((f) => f.toLowerCase().endsWith(".xml"));
      if (!name) continue;
      return { xml: new TextDecoder().decode(files[name]), how: "zip" };
    } catch (e) {
      console.error("[ingest-dmarc-report] could not decompress attachment:", e);
      continue;
    }
  }

  return { xml: null, how: "none" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const expected = Deno.env.get("DMARC_INGEST_SECRET") ?? "";
  if (!expected) {
    console.error("[ingest-dmarc-report] DMARC_INGEST_SECRET is not set");
    return json({ error: "Server configuration error" }, 500);
  }
  if (!secretMatches(req.headers.get("x-dmarc-ingest-secret") ?? "", expected)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "Server configuration error" }, 500);
  const admin = createClient(supabaseUrl, serviceKey);

  const raw = await req.text();
  if (!raw) return json({ error: "Empty message" }, 400);

  // The Worker passes the envelope recipient; fall back to the To: header when
  // it doesn't, since that is where the token lives either way.
  const recipient = req.headers.get("x-dmarc-recipient")
    ?? raw.match(/^to:\s*.*?([^\s<>,;]+@[^\s<>,;]+)/im)?.[1]
    ?? "";
  const token = tokenFromRecipient(recipient);
  if (!token) {
    console.warn("[ingest-dmarc-report] no usable token in recipient");
    return json({ error: "Unrecognised recipient", accepted: false }, 202);
  }

  const { data: domainRow } = await admin
    .from("sending_domains")
    .select("id, user_id, domain")
    .eq("dmarc_rua_token", token)
    .maybeSingle();

  if (!domainRow) {
    // 202, not 404: the mail was validly delivered to us and there is nothing
    // the sender can do about a token we no longer recognise. Answering with an
    // error would make the receiver retry a report we will never want.
    console.warn(`[ingest-dmarc-report] unknown token ${token.slice(0, 8)}…`);
    return json({ error: "Unknown recipient", accepted: false }, 202);
  }

  const { xml, how } = await extractXml(raw);
  if (!xml) {
    console.error(`[ingest-dmarc-report] no report found in mail for ${domainRow.domain}`);
    return json({ error: "No report found in message", accepted: false }, 202);
  }

  const parsed = parseDmarcReport(xml);
  if (!parsed) {
    console.error(`[ingest-dmarc-report] unparseable report (${how}) for ${domainRow.domain}`);
    return json({ error: "Report could not be parsed", accepted: false }, 202);
  }

  // The report names the domain it is about. If that isn't the domain whose
  // token received it, something is wrong — a mis-published rua, or somebody
  // pointing their DMARC record at another tenant's address. Store it against
  // the token's owner regardless (they are who we can prove), but say so.
  if (parsed.domain !== domainRow.domain.toLowerCase()) {
    console.warn(
      `[ingest-dmarc-report] report is for ${parsed.domain} but arrived on ${domainRow.domain}'s token`,
    );
  }

  const { data: report, error: reportError } = await admin
    .from("dmarc_reports")
    .upsert({
      user_id: domainRow.user_id,
      sending_domain_id: domainRow.id,
      domain: parsed.domain,
      org_name: parsed.orgName,
      org_email: parsed.orgEmail,
      external_report_id: parsed.externalReportId,
      date_range_begin: parsed.dateRangeBegin,
      date_range_end: parsed.dateRangeEnd,
      policy_p: parsed.policyP,
      policy_sp: parsed.policySp,
      policy_pct: parsed.policyPct,
      policy_adkim: parsed.policyAdkim,
      policy_aspf: parsed.policyAspf,
      total_messages: parsed.totalMessages,
      passing_messages: parsed.passingMessages,
    }, { onConflict: "user_id,domain,external_report_id" })
    .select("id")
    .single();

  if (reportError || !report) {
    console.error("[ingest-dmarc-report] could not store report:", reportError?.message);
    return json({ error: "Could not store report" }, 500);
  }

  // Receivers re-deliver reports. Replacing the rows rather than appending is
  // what keeps a re-delivery from doubling every count on the page.
  await admin.from("dmarc_report_records").delete().eq("report_id", report.id);

  if (parsed.records.length > 0) {
    const { error: recordsError } = await admin.from("dmarc_report_records").insert(
      parsed.records.map((r) => ({
        report_id: report.id,
        source_ip: r.sourceIp,
        message_count: r.messageCount,
        disposition: r.disposition,
        dkim_result: r.dkimResult,
        spf_result: r.spfResult,
        header_from: r.headerFrom,
        envelope_from: r.envelopeFrom,
        dkim_domain: r.dkimDomain,
        dkim_selector: r.dkimSelector,
        spf_domain: r.spfDomain,
      })),
    );
    if (recordsError) {
      console.error("[ingest-dmarc-report] could not store records:", recordsError.message);
      return json({ error: "Could not store report records" }, 500);
    }
  }

  if (parsed.skipped.length > 0) {
    console.warn(`[ingest-dmarc-report] dropped ${parsed.skipped.length} row(s): ${parsed.skipped.join("; ")}`);
  }

  console.log(
    `[ingest-dmarc-report] ${parsed.domain} from ${parsed.orgName ?? "unknown"} (${how}): ` +
    `${parsed.records.length} sources, ${parsed.passingMessages}/${parsed.totalMessages} passing`,
  );

  return json({
    accepted: true,
    domain: parsed.domain,
    sources: parsed.records.length,
    totalMessages: parsed.totalMessages,
    passingMessages: parsed.passingMessages,
    skipped: parsed.skipped.length,
  });
});

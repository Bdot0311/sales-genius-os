/**
 * DMARC aggregate (RUA) report parsing.
 *
 * Receivers send one XML document per domain per day describing every source
 * that sent mail claiming to be you, and whether it authenticated. It is the
 * only feed that shows a forwarder breaking SPF, or somebody else sending as
 * you, and it is the thing almost nothing in cold email reads.
 *
 * The format is narrow and well specified (RFC 7489 appendix C), so this parses
 * it directly rather than pulling a general XML library into an edge function.
 * Everything here is pure and total: a malformed document returns what it could
 * read plus the reasons it dropped the rest, and never throws into the
 * ingestion path. A report we half-understood is worth more than a 500.
 */

// ---------------------------------------------------------------------------
// A minimal XML reader. Elements and text only — DMARC uses no attributes that
// carry meaning, so they are skipped rather than modelled.
// ---------------------------------------------------------------------------

export interface XmlNode {
  name: string;
  text: string;
  children: XmlNode[];
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
};

function decodeEntities(raw: string): string {
  return raw.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X"
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

export function parseXml(source: string): XmlNode | null {
  // Strip anything that isn't element content: declaration, doctype, comments,
  // processing instructions. CDATA is unwrapped so its text survives.
  const xml = source
    .replace(/<\?[\s\S]*?\?>/g, "")
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, inner: string) => inner);

  const root: XmlNode = { name: "#root", text: "", children: [] };
  const stack: XmlNode[] = [root];
  const tag = /<\s*(\/?)\s*([A-Za-z_][\w.:-]*)([^>]*?)(\/?)\s*>/g;

  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = tag.exec(xml)) !== null) {
    const [whole, closing, name, , selfClosing] = match;

    const between = xml.slice(cursor, match.index);
    if (between.trim()) {
      stack[stack.length - 1].text += decodeEntities(between).trim();
    }
    cursor = match.index + whole.length;

    if (closing) {
      // Ignore a stray close tag rather than unwinding past the root.
      if (stack.length > 1 && stack[stack.length - 1].name === name) stack.pop();
      continue;
    }

    const node: XmlNode = { name, text: "", children: [] };
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) stack.push(node);
  }

  return root.children[0] ?? null;
}

/** First direct child with this name, case-insensitively. */
export function child(node: XmlNode | null | undefined, name: string): XmlNode | null {
  if (!node) return null;
  const wanted = name.toLowerCase();
  return node.children.find((c) => c.name.toLowerCase() === wanted) ?? null;
}

/** All direct children with this name. */
export function children(node: XmlNode | null | undefined, name: string): XmlNode[] {
  if (!node) return [];
  const wanted = name.toLowerCase();
  return node.children.filter((c) => c.name.toLowerCase() === wanted);
}

/** Text of a descendant reached by path, or "" when any step is missing. */
export function textAt(node: XmlNode | null | undefined, ...path: string[]): string {
  let current: XmlNode | null | undefined = node;
  for (const step of path) current = child(current, step);
  return current?.text.trim() ?? "";
}

// ---------------------------------------------------------------------------
// The report itself.
// ---------------------------------------------------------------------------

export type Disposition = "none" | "quarantine" | "reject";
export type AuthResult = "pass" | "fail";

export interface ParsedDmarcRecord {
  sourceIp: string;
  messageCount: number;
  disposition: Disposition | null;
  dkimResult: AuthResult | null;
  spfResult: AuthResult | null;
  headerFrom: string | null;
  envelopeFrom: string | null;
  dkimDomain: string | null;
  dkimSelector: string | null;
  spfDomain: string | null;
}

export interface ParsedDmarcReport {
  orgName: string | null;
  orgEmail: string | null;
  externalReportId: string;
  domain: string;
  dateRangeBegin: string;
  dateRangeEnd: string;
  policyP: string | null;
  policySp: string | null;
  policyPct: number | null;
  policyAdkim: string | null;
  policyAspf: string | null;
  totalMessages: number;
  passingMessages: number;
  records: ParsedDmarcRecord[];
  /** Rows dropped, and why. Surfaced so silence is never mistaken for clean. */
  skipped: string[];
}

/** IPv4 or IPv6, well enough that Postgres `inet` will accept what passes. */
export function isIpAddress(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v)) {
    return v.split(".").every((part) => Number(part) <= 255);
  }
  // Compressed and full IPv6, optionally with an embedded IPv4 tail.
  return /^[0-9a-f]{0,4}(:[0-9a-f]{0,4}){2,7}(:\d{1,3}(\.\d{1,3}){3})?$/i.test(v) && v.includes(":");
}

function disposition(value: string): Disposition | null {
  const v = value.trim().toLowerCase();
  return v === "none" || v === "quarantine" || v === "reject" ? v : null;
}

/**
 * Aligned DKIM/SPF as evaluated by the receiver.
 *
 * Only `pass` is a pass. Everything else — fail, softfail, temperror, an empty
 * element — is recorded as a failure rather than as unknown, because the
 * receiver already made its decision and that decision is what the disposition
 * acted on.
 */
function authResult(value: string): AuthResult | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  return v === "pass" ? "pass" : "fail";
}

/** Epoch seconds to ISO, tolerating the milliseconds some reporters send. */
function epochToIso(value: string): string | null {
  const n = Number(value.trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = n > 1e11 ? n : n * 1000;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function nullIfEmpty(value: string): string | null {
  const v = value.trim();
  return v ? v : null;
}

export function parseDmarcReport(xml: string): ParsedDmarcReport | null {
  const feedback = parseXml(xml);
  if (!feedback) return null;

  const metadata = child(feedback, "report_metadata");
  const policy = child(feedback, "policy_published");

  // The domain and the report id are what make a report identifiable and
  // de-duplicable. Without both, storing it would create a row that can never
  // be matched to a later re-delivery of the same report.
  const domain = textAt(policy, "domain").toLowerCase();
  const externalReportId = textAt(metadata, "report_id");
  if (!domain || !externalReportId) return null;

  const dateRangeBegin = epochToIso(textAt(metadata, "date_range", "begin"));
  const dateRangeEnd = epochToIso(textAt(metadata, "date_range", "end"));
  if (!dateRangeBegin || !dateRangeEnd) return null;

  const skipped: string[] = [];
  const records: ParsedDmarcRecord[] = [];

  for (const record of children(feedback, "record")) {
    const row = child(record, "row");
    const sourceIp = textAt(row, "source_ip");

    // A row whose source address we cannot validate is dropped rather than
    // stored as a guess: `source_ip` is what every diagnosis groups by.
    if (!isIpAddress(sourceIp)) {
      skipped.push(`unparseable source_ip: ${sourceIp || "(empty)"}`);
      continue;
    }

    const count = Number(textAt(row, "count"));
    const evaluated = child(row, "policy_evaluated");
    const identifiers = child(record, "identifiers");
    const auth = child(record, "auth_results");
    // Reporters may include several DKIM signatures. The first is the one the
    // evaluated result refers to in every report shape seen in the wild.
    const dkim = children(auth, "dkim")[0] ?? null;
    const spf = children(auth, "spf")[0] ?? null;

    records.push({
      sourceIp: sourceIp.trim(),
      messageCount: Number.isFinite(count) && count > 0 ? Math.floor(count) : 0,
      disposition: disposition(textAt(evaluated, "disposition")),
      dkimResult: authResult(textAt(evaluated, "dkim")),
      spfResult: authResult(textAt(evaluated, "spf")),
      headerFrom: nullIfEmpty(textAt(identifiers, "header_from")),
      envelopeFrom: nullIfEmpty(textAt(identifiers, "envelope_from")),
      dkimDomain: nullIfEmpty(textAt(dkim, "domain")),
      dkimSelector: nullIfEmpty(textAt(dkim, "selector")),
      spfDomain: nullIfEmpty(textAt(spf, "domain")),
    });
  }

  const totalMessages = records.reduce((sum, r) => sum + r.messageCount, 0);
  // "Passing" means DMARC passed: aligned DKIM *or* aligned SPF, which is the
  // rule the receiver applied. Requiring both would report a false failure on
  // every correctly configured domain that only signs with one.
  const passingMessages = records
    .filter((r) => r.dkimResult === "pass" || r.spfResult === "pass")
    .reduce((sum, r) => sum + r.messageCount, 0);

  const pct = Number(textAt(policy, "pct"));

  return {
    orgName: nullIfEmpty(textAt(metadata, "org_name")),
    orgEmail: nullIfEmpty(textAt(metadata, "email")),
    externalReportId,
    domain,
    dateRangeBegin,
    dateRangeEnd,
    policyP: nullIfEmpty(textAt(policy, "p")),
    policySp: nullIfEmpty(textAt(policy, "sp")),
    policyPct: Number.isFinite(pct) ? pct : null,
    policyAdkim: nullIfEmpty(textAt(policy, "adkim")),
    policyAspf: nullIfEmpty(textAt(policy, "aspf")),
    totalMessages,
    passingMessages,
    records,
    skipped,
  };
}

// ---------------------------------------------------------------------------
// Intake addressing.
// ---------------------------------------------------------------------------

/**
 * The tenant token from the address a report was delivered to.
 *
 * Each sending domain publishes `rua=mailto:<token>@dmarc.<our domain>`, so the
 * local part is what says whose report this is. Anything that is not a token
 * shape is rejected here rather than reaching the lookup — the address is
 * public, so junk and probing arrive alongside the real thing.
 */
export function tokenFromRecipient(recipient: string): string | null {
  const raw = (recipient ?? "").trim();
  // Tolerate a display-name form: Reports <abc@dmarc.example>
  const angled = raw.match(/<([^<>]+)>/);
  const address = (angled ? angled[1] : raw).trim().toLowerCase();
  const at = address.indexOf("@");
  const local = at > 0 ? address.slice(0, at) : address;
  // Dash-stripped UUIDs, as the migration generates them.
  return /^[0-9a-f]{32}$/.test(local) ? local : null;
}

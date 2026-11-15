// Company-level visitor identity from public DNS and registry data.
//
// There is no third-party reveal vendor behind this. A result is either a
// company the signals actually name, or Unknown with the reason. A consumer
// ISP, mobile carrier, cloud host, or VPN is never promoted to a company.

export const VISITOR_FLAG = "visitorIntelligence";

/** Raw addresses live on the resolve job only, and only this long. */
export const RAW_IP_TTL_MS = 24 * 60 * 60 * 1000;

/** Default event retention. Sites can set 7–365 days. */
export const DEFAULT_RETENTION_DAYS = 90;

export type NetworkClass = "company" | "isp" | "mobile" | "cloud" | "hosting" | "vpn" | "residential" | "unknown";

export interface EvidenceItem {
  source: "rdns" | "rdap" | "asn" | "company_record" | "company_search";
  detail: string;
}

export interface IdentityDecision {
  status: "matched" | "unknown";
  classification: NetworkClass;
  /** Null unless status is matched. Never a placeholder score. */
  confidence: number | null;
  companyName: string | null;
  companyDomain: string | null;
  companyId: string | null;
  unknownReason: string | null;
  networkPrefix: string | null;
  evidence: EvidenceItem[];
}

export interface RegistrySignals {
  ptrHost: string | null;
  rdapOrg: string | null;
  rdapNetwork: string | null;
  cidr: string | null;
  asn: string | null;
  asnName: string | null;
  /** Set when every lookup failed, so the reason is the failure and not a guess. */
  lookupError: string | null;
}

export interface KnownCompany {
  id: string;
  name: string;
  domain: string;
}

const CLOUD_ASNS = new Set([
  "16509", "14618", "15169", "396982", "19527", "8075", "8068", "14061", "16276",
  "24940", "13335", "54113", "20473", "63949", "398101", "36352", "394256", "132203", "45102", "37963",
]);

const VPN_ASNS = new Set([
  "9009", "60068", "212238", "203020", "136787", "62240",
]);

const HOSTING_PTR_SUFFIXES = [
  "amazonaws.com", "compute.amazonaws.com", "googleusercontent.com", "cloudfront.net",
  "azurewebsites.net", "cloudapp.net", "herokuapp.com", "github.io", "pages.dev",
  "vercel.app", "netlify.app", "cloudflare.net", "akamaitechnologies.com", "fastly.net",
  "digitalocean.com", "linode.com", "ovh.net", "hetzner.com", "hetzner.de",
];

const MULTI_PART_SUFFIXES = ["co.uk", "org.uk", "ac.uk", "com.au", "net.au", "co.nz", "com.br", "co.jp", "co.za", "com.sg", "co.in"];

const ISP_PATTERN = /\b(comcast|xfinity|charter communications|\bspectrum\b|cox communications|verizon|centurylink|frontier communications|british telecom|\bbt group\b|vodafone|telstra|optus|sky broadband|virgin media|deutsche telekom|china telecom|china unicom|china mobile|softbank|kddi|swisscom|telenor|telia|rogers communications|bell canada|videotron|at&t|att\.net|broadband|dsl|residential|pppoe)\b/i;

const MOBILE_PATTERN = /\b(t-mobile|wireless|cellular|vodafone|airtel|jio|ee limited|o2 uk)\b/i;

const CLOUD_PATTERN = /\b(amazon|amazonaws|google cloud|google llc|microsoft azure|microsoft corporation|digitalocean|ovh|hetzner|cloudflare|linode|akamai|fastly|vultr|godaddy|datacenter|data center|hosting|colocation|\bvps\b|dedicated server)\b/i;

const VPN_PATTERN = /\b(vpn|mullvad|nordvpn|expressvpn|protonvpn|proton ag|surfshark|private internet|cyberghost|tunnelbear|windscribe|hide\.me)\b/i;

const DYNAMIC_PTR = /(^|\.)((dyn|dynamic|pool|dsl|cable|ppp|dial|broadband|customer|residential|host)[.-]|ip-\d+|unassigned)/i;

export function isIp(value: string): boolean {
  return isIpv4(value) || isIpv6(value);
}

export function isIpv4(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255);
}

export function isIpv6(value: string): boolean {
  if (!value.includes(":") || value.includes(".")) return false;
  const halves = value.split("::");
  if (halves.length > 2) return false;
  const groups = value.split(":").filter((group) => group.length > 0);
  if (groups.length > 8) return false;
  return groups.every((group) => /^[0-9a-fA-F]{1,4}$/.test(group));
}

/**
 * The visitor address the stack gateway stamps, not the one the caller wrote.
 *
 * `upstreamHeadersFor` in supabase/cli `packages/stack/src/HttpProxy.ts`
 * (commit c00bffbdc15646b91cba9e54b2afe41b2bfef95d) copies the request
 * headers and then replaces them:
 *
 * - `x-real-ip` is set to `request.socket.remoteAddress`
 * - that same peer is appended to any incoming `x-forwarded-for`
 * - when the peer is missing, a caller-sent `x-real-ip` is deleted
 *
 * The comment on that function is "Like Kong: append the client to any
 * incoming X-Forwarded-For chain; X-Real-IP is the client." The integration
 * test "tells upstreams the client address" sends `x-real-ip: 203.0.113.7`
 * and `x-forwarded-for: 203.0.113.7` and the upstream observes
 * `x-real-ip: 127.0.0.1` and `x-forwarded-for: 203.0.113.7, 127.0.0.1`.
 * https://github.com/supabase/cli/blob/c00bffbdc15646b91cba9e54b2afe41b2bfef95d/packages/stack/src/HttpProxy.ts
 *
 * edge-runtime does not rewrite either header. The gateway in front of the
 * function does, so a caller who can set `Origin` still cannot choose the
 * address this function returns. The Turnstile sample's `clientIps[0]` is
 * the left-hand side of that chain, which is the part the caller supplied.
 *
 * Prefer `X-Real-IP` when it is an IP. Otherwise use the rightmost public
 * `X-Forwarded-For` entry. Never the first, and never an address in the body.
 */
export function trustedClientIp(headers: {
  forwardedFor?: string | null;
  realIp?: string | null;
}): string | null {
  const real = normalizeIp(headers.realIp);
  if (real) return real;
  return rightmostPublicIp(headers.forwardedFor);
}

function normalizeIp(value: string | null | undefined): string | null {
  if (!value) return null;
  let trimmed = value.trim();
  if (trimmed.startsWith("[") && trimmed.includes("]")) {
    trimmed = trimmed.slice(1, trimmed.indexOf("]"));
  }
  trimmed = trimmed.replace(/^::ffff:/i, "");
  if (!trimmed || !isIp(trimmed)) return null;
  return trimmed.toLowerCase();
}

function rightmostPublicIp(xff: string | null | undefined): string | null {
  if (!xff) return null;
  const parts = xff.split(",");
  for (let i = parts.length - 1; i >= 0; i--) {
    const ip = normalizeIp(parts[i]);
    if (ip && !isPrivateOrLocal(ip)) return ip;
  }
  return null;
}

export function isPrivateOrLocal(ip: string): boolean {
  if (!isIp(ip)) return true;
  if (isIpv6(ip)) {
    const lower = ip.toLowerCase();
    return lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80");
  }
  const [a, b] = ip.split(".").map(Number);
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

/** IPv4 /24 or IPv6 /48, used as the cache key. Not the raw address. */
export function networkPrefix(ip: string): string | null {
  if (isPrivateOrLocal(ip) || !isIp(ip)) return null;
  if (isIpv4(ip)) {
    const parts = ip.split(".");
    return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  }
  const expanded = expandIpv6(ip);
  if (!expanded) return null;
  return `${expanded.slice(0, 3).join(":")}::/48`;
}

function expandIpv6(ip: string): string[] | null {
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":").filter(Boolean) : [];
  const right = halves[1] ? halves[1].split(":").filter(Boolean) : [];
  if (halves.length === 1) {
    if (left.length !== 8) return null;
    return left.map((group) => group.padStart(4, "0").toLowerCase());
  }
  const missing = 8 - left.length - right.length;
  if (missing < 0) return null;
  const groups = [...left, ...Array(missing).fill("0"), ...right];
  return groups.map((group) => group.padStart(4, "0").toLowerCase());
}

export function ipInList(ip: string, entries: string[]): boolean {
  const prefix = networkPrefix(ip);
  return entries.some((entry) => {
    const rule = entry.trim().toLowerCase();
    if (!rule) return false;
    if (rule === ip.toLowerCase()) return true;
    if (prefix && (rule === prefix || rule === prefix.replace(".0/24", ".0/24"))) return true;
    if (isIpv4(ip) && rule.includes("/")) {
      const [base, bitsRaw] = rule.split("/");
      const bits = Number(bitsRaw);
      if (!isIpv4(base) || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
      return ipv4InCidr(ip, base, bits);
    }
    return false;
  });
}

function ipv4InCidr(ip: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

export function registrableDomain(host: string | null | undefined): string | null {
  if (!host) return null;
  const cleaned = host.trim().toLowerCase().replace(/\.$/, "").replace(/^https?:\/\//, "").split("/")[0].split(":")[0];
  if (!cleaned || cleaned.includes(" ") || isIp(cleaned)) return null;
  if (HOSTING_PTR_SUFFIXES.some((suffix) => cleaned === suffix || cleaned.endsWith(`.${suffix}`))) return null;
  const labels = cleaned.split(".").filter(Boolean);
  if (labels.length < 2) return null;
  const lastTwo = labels.slice(-2).join(".");
  const lastThree = labels.slice(-3).join(".");
  if (MULTI_PART_SUFFIXES.includes(lastTwo) && labels.length >= 3) return lastThree;
  return lastTwo;
}

export function orgAgreesWithDomain(org: string | null | undefined, domain: string | null | undefined): boolean {
  if (!org || !domain) return false;
  const label = domain.split(".")[0].replace(/[^a-z0-9]/g, "");
  if (label.length < 3) return false;
  const normalized = org.toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalized.includes(label);
}

export function classifyNetwork(signals: RegistrySignals): { classification: NetworkClass; reason: string } {
  const blob = [signals.asnName, signals.rdapOrg, signals.rdapNetwork, signals.ptrHost].filter(Boolean).join(" ");
  const asn = (signals.asn ?? "").replace(/^AS/i, "");
  const ptr = signals.ptrHost ?? "";
  if (VPN_ASNS.has(asn) || VPN_PATTERN.test(blob)) {
    return { classification: "vpn", reason: "The network name or ASN matches a VPN or privacy relay." };
  }
  if (CLOUD_ASNS.has(asn) || CLOUD_PATTERN.test(blob) || HOSTING_PTR_SUFFIXES.some((suffix) => ptr.endsWith(suffix))) {
    const hosting = /\b(hosting|colocation|datacenter|data center|vps|dedicated server)\b/i.test(blob) && !CLOUD_ASNS.has(asn);
    return {
      classification: hosting ? "hosting" : "cloud",
      reason: hosting
        ? "The network is a hosting or colocation range."
        : "The network is a cloud provider range.",
    };
  }
  if (MOBILE_PATTERN.test(blob)) {
    return { classification: "mobile", reason: "The network is a mobile carrier." };
  }
  if (ISP_PATTERN.test(blob) || DYNAMIC_PTR.test(ptr)) {
    const residential = DYNAMIC_PTR.test(ptr) || /\b(residential|dsl|broadband|pppoe)\b/i.test(blob);
    return {
      classification: residential ? "residential" : "isp",
      reason: residential
        ? "Reverse DNS or the registry name looks like a residential connection."
        : "The network is a consumer or access ISP.",
    };
  }
  const domain = registrableDomain(ptr);
  if (domain && !DYNAMIC_PTR.test(ptr)) {
    return { classification: "company", reason: "Reverse DNS names a registrable domain that is not a hosting suffix." };
  }
  if (signals.rdapOrg && !ISP_PATTERN.test(signals.rdapOrg) && !CLOUD_PATTERN.test(signals.rdapOrg)) {
    return { classification: "unknown", reason: "The registry named an organisation, but not a company domain." };
  }
  return { classification: "unknown", reason: "The public signals do not name a company network." };
}

function cleanName(value: string | null | undefined): string | null {
  const name = value?.replace(/\s+/g, " ").trim() ?? "";
  if (!name || name.length > 160) return null;
  return name;
}

/**
 * Turn registry signals into a match or an explicit Unknown.
 * Local company rows and company-search hits supply names. The registry org
 * is used only when it agrees with the domain. Nothing here invents a name.
 */
export function decideIdentity(
  signals: RegistrySignals,
  options: { localCompany?: KnownCompany | null; searchCompany?: KnownCompany | null; prefix?: string | null } = {},
): IdentityDecision {
  const evidence: EvidenceItem[] = [];
  if (signals.ptrHost) evidence.push({ source: "rdns", detail: signals.ptrHost });
  if (signals.rdapOrg || signals.rdapNetwork) {
    evidence.push({ source: "rdap", detail: [signals.rdapOrg, signals.rdapNetwork, signals.cidr].filter(Boolean).join(" · ") });
  }
  if (signals.asn || signals.asnName) {
    evidence.push({ source: "asn", detail: [signals.asn ? `AS${signals.asn.replace(/^AS/i, "")}` : null, signals.asnName].filter(Boolean).join(" ") });
  }

  const nothing = !signals.ptrHost && !signals.rdapOrg && !signals.rdapNetwork && !signals.asn && !signals.asnName;
  if (nothing) {
    return {
      status: "unknown",
      classification: "unknown",
      confidence: null,
      companyName: null,
      companyDomain: null,
      companyId: null,
      unknownReason: signals.lookupError ?? "No registry or DNS signal for this address.",
      networkPrefix: options.prefix ?? null,
      evidence: [],
    };
  }

  const classified = classifyNetwork(signals);
  if (classified.classification !== "company") {
    return {
      status: "unknown",
      classification: classified.classification,
      confidence: null,
      companyName: null,
      companyDomain: null,
      companyId: null,
      unknownReason: classified.reason,
      networkPrefix: options.prefix ?? null,
      evidence,
    };
  }

  const domain = registrableDomain(signals.ptrHost);
  if (!domain) {
    return {
      status: "unknown",
      classification: "unknown",
      confidence: null,
      companyName: null,
      companyDomain: null,
      companyId: null,
      unknownReason: "The network is not a consumer ISP, but it did not yield a company domain.",
      networkPrefix: options.prefix ?? null,
      evidence,
    };
  }

  if (signals.rdapOrg && !orgAgreesWithDomain(signals.rdapOrg, domain)) {
    return {
      status: "unknown",
      classification: "unknown",
      confidence: null,
      companyName: null,
      companyDomain: null,
      companyId: null,
      unknownReason: `Reverse DNS and the registry disagree (${domain} vs ${cleanName(signals.rdapOrg) ?? "an unnamed organisation"}).`,
      networkPrefix: options.prefix ?? null,
      evidence,
    };
  }

  const local = options.localCompany && sameDomain(options.localCompany.domain, domain) ? options.localCompany : null;
  const searched = options.searchCompany && sameDomain(options.searchCompany.domain, domain) ? options.searchCompany : null;
  if (local) {
    evidence.push({ source: "company_record", detail: `${local.name} · ${local.domain}` });
    return matched(local.name, domain, local.id, 0.86, evidence, options.prefix ?? null);
  }
  if (searched && searched.name) {
    evidence.push({ source: "company_search", detail: `${searched.name} · ${searched.domain}` });
    return matched(searched.name, domain, null, 0.78, evidence, options.prefix ?? null);
  }
  const org = cleanName(signals.rdapOrg);
  if (org && orgAgreesWithDomain(org, domain)) {
    return matched(org, domain, null, 0.64, evidence, options.prefix ?? null);
  }
  return {
    status: "unknown",
    classification: "unknown",
    confidence: null,
    companyName: null,
    companyDomain: null,
    companyId: null,
    unknownReason: `Reverse DNS named ${domain}, and the registry did not confirm an organisation.`,
    networkPrefix: options.prefix ?? null,
    evidence,
  };
}

function matched(
  name: string,
  domain: string,
  companyId: string | null,
  confidence: number,
  evidence: EvidenceItem[],
  prefix: string | null,
): IdentityDecision {
  return {
    status: "matched",
    classification: "company",
    confidence,
    companyName: name,
    companyDomain: domain,
    companyId,
    unknownReason: null,
    networkPrefix: prefix,
    evidence,
  };
}

function sameDomain(left: string | null | undefined, right: string): boolean {
  const a = registrableDomain(left) ?? left?.trim().toLowerCase();
  return !!a && a === right;
}

export function isBotUserAgent(ua: string | null | undefined): boolean {
  if (!ua || !ua.trim()) return true;
  return /bot(?:\/|\b)|spider|crawl|slurp|headless|wget|curl\/|python-requests|go-http-client|petalbot|ahrefs|semrush|bytespider|gptbot|claudebot|facebookexternalhit|pingdom|uptimerobot|preview/i.test(ua);
}

export const SENSITIVE_QUERY_KEYS = [
  "token", "access_token", "refresh_token", "id_token", "auth", "authorization",
  "key", "api_key", "apikey", "password", "passwd", "secret", "signature", "sig",
  "jwt", "session", "code", "email", "ssn", "card", "cvv",
];

const SENSITIVE_KEYS = new Set(SENSITIVE_QUERY_KEYS);

export function sanitizeTrackingUrl(raw: string | null | undefined): { path: string; utm: Record<string, string>; dropped: string[] } {
  const empty = { path: "/", utm: {}, dropped: [] as string[] };
  if (!raw || typeof raw !== "string") return empty;
  let url: URL;
  try {
    url = new URL(raw, "https://visitor.invalid");
  } catch {
    return empty;
  }
  const dropped: string[] = [];
  const utm: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lower) || /token|password|secret|email/i.test(lower)) {
      dropped.push(lower);
      return;
    }
    if (lower.startsWith("utm_") && value) {
      const name = lower.slice(4);
      if (["source", "medium", "campaign", "term", "content"].includes(name)) utm[name] = value.slice(0, 120);
    }
  });
  const path = (url.pathname || "/").replace(/\/{2,}/g, "/").slice(0, 300) || "/";
  return { path, utm, dropped };
}

export function pageTypeFromPath(path: string | null | undefined): string {
  const value = (path || "/").toLowerCase();
  if (value === "/" || value === "") return "home";
  if (/\/(pricing|plans|prices?)(\/|$)/.test(value)) return "pricing";
  if (/\/(demo|contact|book|get-started|talk-to-sales)(\/|$)/.test(value)) return "demo";
  if (/\/(integrations?|apps|connect)(\/|$)/.test(value)) return "integrations";
  if (/\/(product|products|features|platform|solutions)(\/|$)/.test(value)) return "product";
  return "other";
}

export function hostFromUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.hostname.toLowerCase().replace(/\.$/, "") || null;
  } catch {
    return null;
  }
}

export function hostAllowed(host: string | null, allowed: string[]): boolean {
  if (!host) return false;
  const normalized = host.toLowerCase().replace(/\.$/, "");
  return allowed.some((entry) => {
    const domain = entry.trim().toLowerCase().replace(/^\*\./, "").replace(/\.$/, "");
    if (!domain || domain.includes("/") || domain.includes(" ")) return false;
    return normalized === domain || normalized.endsWith(`.${domain}`);
  });
}

export function featureEnabled(flagOn: boolean, grantOn: boolean): boolean {
  return flagOn === true && grantOn === true;
}

/** Facts a later Jev evaluation can read. Counts come from the events passed in. */
export function visitFacts(events: { path: string; page_type: string; event_name: string }[]): string[] {
  const counts = new Map<string, { path: string; pageType: string; count: number }>();
  for (const event of events) {
    if (event.event_name !== "page_view") continue;
    const path = event.path || "/";
    const key = `${path}|${event.page_type}`;
    const current = counts.get(key) ?? { path, pageType: event.page_type || "other", count: 0 };
    current.count += 1;
    counts.set(key, current);
  }
  return [...counts.values()].slice(0, 12).map((row) =>
    `Visited ${row.path} ${row.count} ${row.count === 1 ? "time" : "times"} (${row.pageType}).`,
  );
}

export function ptrName(ip: string): string | null {
  if (isIpv4(ip)) return `${ip.split(".").reverse().join(".")}.in-addr.arpa`;
  const groups = expandIpv6(ip);
  if (!groups) return null;
  const nibbles = groups.join("").split("").reverse().join(".");
  return `${nibbles}.ip6.arpa`;
}

export function asnQueryName(ip: string): string | null {
  if (!isIpv4(ip)) return null;
  return `${ip.split(".").reverse().join(".")}.origin.asn.cymru.com`;
}

/** Team Cymru TXT: "16509 | 1.2.3.0/24 | US | arin | 1999-01-01" */
export function parseAsnTxt(data: string | null | undefined): { asn: string; prefix: string | null } | null {
  if (!data) return null;
  const text = data.replace(/^"|"$/g, "").trim();
  const asn = text.split("|")[0]?.trim().replace(/^AS/i, "");
  if (!asn || !/^\d+$/.test(asn)) return null;
  const prefix = text.split("|")[1]?.trim() || null;
  return { asn, prefix };
}

export function parseRdap(payload: unknown): { org: string | null; network: string | null; cidr: string | null } {
  if (!payload || typeof payload !== "object") return { org: null, network: null, cidr: null };
  const record = payload as Record<string, unknown>;
  const network = typeof record.name === "string" ? record.name : null;
  const cidrs = Array.isArray(record.cidr0_cidrs) ? record.cidr0_cidrs : [];
  const first = cidrs.find((item) => item && typeof item === "object") as Record<string, unknown> | undefined;
  let cidr: string | null = null;
  if (first && typeof first.v4prefix === "string" && typeof first.length === "number") cidr = `${first.v4prefix}/${first.length}`;
  if (first && typeof first.v6prefix === "string" && typeof first.length === "number") cidr = `${first.v6prefix}/${first.length}`;
  let org: string | null = null;
  const entities = Array.isArray(record.entities) ? record.entities : [];
  for (const entity of entities) {
    if (!entity || typeof entity !== "object") continue;
    const roles = Array.isArray((entity as { roles?: unknown }).roles) ? (entity as { roles: unknown[] }).roles : [];
    const interesting = roles.some((role) => role === "registrant" || role === "administrative");
    if (!interesting && entities.length > 1) continue;
    const vcard = (entity as { vcardArray?: unknown }).vcardArray;
    if (!Array.isArray(vcard) || !Array.isArray(vcard[1])) continue;
    for (const row of vcard[1] as unknown[]) {
      if (Array.isArray(row) && row[0] === "fn" && typeof row[3] === "string" && row[3].trim()) {
        org = row[3].trim();
        break;
      }
    }
    if (org) break;
  }
  return { org, network, cidr };
}

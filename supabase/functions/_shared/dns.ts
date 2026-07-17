// Shared DNS-over-HTTPS helpers for the deliverability functions.
// Uses Cloudflare DoH (application/dns-json). Includes an SSRF-safe domain guard.

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export interface DohResult {
  status: number; // DNS RCODE: 0 = NOERROR, 3 = NXDOMAIN
  answers: string[]; // record data strings, quotes stripped
}

/** Reject internal/reserved names and IPs to prevent SSRF via DNS lookups. */
export function validateDomain(domain: string): boolean {
  if (!domain || typeof domain !== "string") return false;
  if (domain.length > 253) return false;

  const domainPattern =
    /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
  if (!domainPattern.test(domain)) return false;

  const lower = domain.toLowerCase();
  const blockedTlds = [".local", ".internal", ".test", ".localhost", ".lan", ".localdomain", ".home", ".corp", ".private"];
  if (blockedTlds.some((tld) => lower.endsWith(tld))) return false;

  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(domain)) return false;
  if (lower.includes("localhost") || lower.includes("127.0.0.1") || lower.includes("0.0.0.0")) return false;

  return true;
}

/** Query a single record type over DoH. Returns RCODE + answer data strings. */
export async function dohQuery(name: string, type: string): Promise<DohResult> {
  try {
    const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`;
    const res = await fetch(url, { headers: { Accept: "application/dns-json" } });
    if (!res.ok) {
      console.error(`DoH lookup failed for ${name} (${type}): ${res.status}`);
      return { status: -1, answers: [] };
    }
    const data = await res.json();
    const answers: string[] = (data.Answer || [])
      .map((r: { data?: string }) => (r.data ?? "").replace(/^"|"$/g, "").replace(/"\s+"/g, ""))
      .filter(Boolean);
    return { status: typeof data.Status === "number" ? data.Status : -1, answers };
  } catch (err) {
    console.error(`DoH error for ${name} (${type}):`, err);
    return { status: -1, answers: [] };
  }
}

/** Merge multi-string TXT records (DoH splits >255-char TXT into quoted chunks). */
export async function txt(name: string): Promise<string[]> {
  const { answers } = await dohQuery(name, "TXT");
  return answers;
}

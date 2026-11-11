/**
 * A cited URL is not fetched until the host is a public http(s) name.
 * Localhost, link-local, and cloud metadata addresses are refused before
 * any request. Redirects are checked one hop at a time by the caller.
 */

/** fe80::/10, the whole link-local range, not only addresses that start with fe80. */
function ipv6LinkLocal(host: string): boolean {
  const first = host.split(":")[0] ?? "";
  return /^fe[89ab][0-9a-f]$/i.test(first);
}

/** ::ffff:127.0.0.1 and ::ffff:7f00:1 are IPv4, not a different family. */
export function unwrapIp(hostname: string): string {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const dotted = host.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (dotted) return dotted[1];
  const hex = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (!hex) return host;
  const hi = parseInt(hex[1], 16);
  const lo = parseInt(hex[2], 16);
  return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
}

export function sameSiteHost(a: string, b: string): boolean {
  const norm = (host: string) => unwrapIp(host).toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  return norm(a) === norm(b);
}

export function blockedHost(hostname: string): string | null {
  const host = unwrapIp(hostname);
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host === "metadata.google.internal" || host === "0.0.0.0" || host === "::") {
    return "local";
  }
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) {
      return "private";
    }
  }
  if (host.includes(":") && (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || ipv6LinkLocal(host))) return "private";
  return null;
}

export function publicHttpUrl(raw: string): { ok: true; href: string } | { ok: false; reason: string } {
  let url: URL;
  try { url = new URL(raw); } catch { return { ok: false, reason: "bad_url" }; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, reason: "scheme" };
  if (url.username || url.password) return { ok: false, reason: "credentials" };
  const blocked = blockedHost(url.hostname);
  if (blocked) return { ok: false, reason: blocked };
  return { ok: true, href: url.href };
}

/**
 * A public name can still resolve to a private address. The caller supplies
 * the lookup so a test can answer for a name like 127.0.0.1.nip.io without
 * a live query. A hostname regex is not this check.
 */
/**
 * One public address for this name.
 * The caller dials `address`. Looking the name up again is a different
 * connection and is not this check.
 */
export async function resolvePublicHost(
  hostname: string,
  lookup: (host: string) => Promise<string[]>,
): Promise<{ ok: true; address: string } | { ok: false; reason: string }> {
  const host = unwrapIp(hostname);
  if (blockedHost(host)) return { ok: false, reason: blockedHost(host) ?? "private" };
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(":")) return { ok: true, address: host };
  let addresses: string[] = [];
  try {
    addresses = await lookup(host);
  } catch {
    return { ok: false, reason: "dns" };
  }
  if (!addresses.length) return { ok: false, reason: "dns" };
  for (const address of addresses) {
    if (blockedHost(address)) return { ok: false, reason: "private_dns" };
  }
  return { ok: true, address: addresses[0] };
}

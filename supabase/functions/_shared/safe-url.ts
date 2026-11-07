/**
 * A cited URL is not fetched until the host is a public http(s) name.
 * Localhost, link-local, and cloud metadata addresses are refused before
 * any request. Redirects are checked one hop at a time by the caller.
 */

export function blockedHost(hostname: string): string | null {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host === "metadata.google.internal" || host === "0.0.0.0") {
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
  if (host.includes(":") && (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80"))) return "private";
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

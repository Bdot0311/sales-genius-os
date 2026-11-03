/**
 * Click tracking: rewrites outbound links so every click is recorded against
 * the sent_emails row (matched by tracking_pixel_id) before redirecting the
 * recipient to the original destination.
 *
 * Only real recipient clicks are recorded — unsubscribe links, mailto/tel
 * links, anchors and our own tracking endpoints are never rewritten.
 */
const SKIP_PATTERNS = [
  "track-email-open",
  "track-email-click",
  "/functions/v1/unsubscribe",
];

/**
 * HMAC over (pixelId, target) so the redirect endpoint only follows links we
 * wrote ourselves — otherwise it is an open redirect anyone can abuse.
 */
export async function signClick(pixelId: string, target: string): Promise<string> {
  const secret = (globalThis as any).Deno?.env.get("INTERNAL_TRIGGER_SECRET") ?? "";
  if (!secret) return "";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${pixelId}\n${target}`));
  return Array.from(new Uint8Array(mac).slice(0, 16)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function buildClickUrl(supabaseUrl: string, pixelId: string, target: string): Promise<string> {
  const sig = await signClick(pixelId, target);
  return `${supabaseUrl}/functions/v1/track-email-click?id=${encodeURIComponent(pixelId)}&u=${encodeURIComponent(target)}&s=${sig}`;
}

export async function injectClickTracking(html: string, pixelId: string, supabaseUrl: string): Promise<string> {
  if (!html || !pixelId) return html;
  const re = /href\s*=\s*(["'])(.*?)\1/gi;
  const parts: string[] = [];
  let last = 0;
  for (const m of html.matchAll(re)) {
    const [match, quote, rawUrl] = m;
    const url = String(rawUrl).trim();
    parts.push(html.slice(last, m.index!));
    last = m.index! + match.length;
    if (!/^https?:\/\//i.test(url) || SKIP_PATTERNS.some((p) => url.includes(p))) { parts.push(match); continue; }
    parts.push(`href=${quote}${await buildClickUrl(supabaseUrl, pixelId, url)}${quote}`);
  }
  parts.push(html.slice(last));
  return parts.join("");
}

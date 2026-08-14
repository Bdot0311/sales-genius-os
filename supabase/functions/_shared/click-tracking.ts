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
  "handle-email-unsubscribe",
];

export function buildClickUrl(supabaseUrl: string, pixelId: string, target: string): string {
  return `${supabaseUrl}/functions/v1/track-email-click?id=${encodeURIComponent(pixelId)}&u=${encodeURIComponent(target)}`;
}

export function injectClickTracking(html: string, pixelId: string, supabaseUrl: string): string {
  if (!html || !pixelId) return html;

  return html.replace(/href\s*=\s*(["'])(.*?)\1/gi, (match, quote, rawUrl) => {
    const url = String(rawUrl).trim();
    if (!/^https?:\/\//i.test(url)) return match; // mailto:, tel:, #anchor, relative
    if (SKIP_PATTERNS.some((p) => url.includes(p))) return match;
    return `href=${quote}${buildClickUrl(supabaseUrl, pixelId, url)}${quote}`;
  });
}

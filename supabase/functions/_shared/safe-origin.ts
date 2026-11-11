// Trusted app origins for redirect/return URLs. Anything else falls back to
// the primary domain so a forged Origin header or body value can't send users
// (or OAuth codes) to a third-party site.
export const PRIMARY_ORIGIN = "https://outreign.io";
const EXACT = new Set([
  "https://outreign.io",
  "https://www.outreign.io",
  "https://outreign.lovable.app",
  "http://localhost:8080",
  "http://localhost:5173",
]);

export function isTrustedOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;
  let u: URL;
  try { u = new URL(origin); } catch { return false; }
  const o = u.origin;
  if (EXACT.has(o)) return true;
  // Lovable preview hosts for this project.
  return u.protocol === "https:" && /^[a-z0-9-]+--d46b94fb-98cd-43e3-be33-08aef09ece94\.lovable\.app$/.test(u.hostname);
}

export function safeOrigin(origin: string | null | undefined): string {
  return isTrustedOrigin(origin) ? new URL(origin!).origin : PRIMARY_ORIGIN;
}

/**
 * A redirect URI for a provider that registers exactly ONE value and demands an
 * exact match (Calendly). It must not vary with the host the browser happens to
 * be on, or every origin but the registered one is rejected by the provider, and
 * it must be identical in the authorize request and the token exchange or the
 * exchange fails. `configured` is server-side config, not browser input; a value
 * that is not a trusted origin falls back to the primary domain so a typo cannot
 * silently point the OAuth code at somebody else's site.
 */
export function pinnedRedirectUri(configured: string | null | undefined, path: string): string {
  const fromConfig = safeRedirectUri(configured);
  if (fromConfig) return fromConfig;
  return new URL(path, PRIMARY_ORIGIN).href;
}

/** Accepts a full redirect URI only when its origin is trusted. */
export function safeRedirectUri(uri: unknown): string | null {
  if (typeof uri !== "string") return null;
  try {
    const u = new URL(uri);
    return isTrustedOrigin(u.origin) ? u.href : null;
  } catch { return null; }
}

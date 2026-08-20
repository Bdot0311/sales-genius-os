// ColdIQ — one API key in front of 40+ GTM data providers.
//
// SCOPE: this repo uses ColdIQ for email verification only (see
// _shared/email-verify.ts). Lead sourcing happens in the separate `salesos`
// service that RAILWAY_LEADS_API_URL points at, so ColdIQ-as-a-lead-provider
// belongs there, alongside the providers it already fans out to. Nothing here
// searches for leads — that would be a second, competing code path for
// something this repo does not do.
//
// Verification still covers every provider regardless of where leads come
// from: fetch-external-leads verifies the merged result set after the sourcing
// service has answered, so anything salesos returns — from any provider it
// adds, ColdIQ included — passes through the same gate.
//
// IMPORTANT — the endpoint path and auth style below are DEFAULTS, not
// verified facts. coldiq.com is unreachable from this build environment, so
// the exact contract was never read. Everything that could differ is
// overridable by secret, so correcting a wrong guess is a config change rather
// than a deploy:
//
//   COLDIQ_API_KEY      required — the marketplace key. Absent = ColdIQ off.
//   COLDIQ_BASE_URL     default https://api.coldiq.com
//   COLDIQ_VERIFY_PATH  default /v1/email/verify
//   COLDIQ_AUTH_STYLE   "bearer" (default) | "x-api-key" | "both"

const DEFAULT_BASE_URL = "https://api.coldiq.com";
const DEFAULT_VERIFY_PATH = "/v1/email/verify";

export function coldiqApiKey(): string | null {
  return Deno.env.get("COLDIQ_API_KEY") || null;
}

export function coldiqConfigured(): boolean {
  return coldiqApiKey() !== null;
}

export function coldiqBaseUrl(): string {
  return (Deno.env.get("COLDIQ_BASE_URL") || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

/**
 * Auth header(s).
 *
 * Marketplaces differ on Bearer vs a custom key header, and "both" sends each.
 * That is harmless where one is ignored and removes a whole category of
 * first-run 401 that reads like a bad key rather than a wrong header name.
 */
export function coldiqAuthHeaders(): Record<string, string> {
  const key = coldiqApiKey();
  if (!key) return {};
  const style = (Deno.env.get("COLDIQ_AUTH_STYLE") || "bearer").toLowerCase();
  if (style === "x-api-key") return { "X-API-Key": key };
  if (style === "both") return { Authorization: `Bearer ${key}`, "X-API-Key": key };
  return { Authorization: `Bearer ${key}` };
}

export function coldiqVerifyUrl(): string {
  const path = Deno.env.get("COLDIQ_VERIFY_PATH") || DEFAULT_VERIFY_PATH;
  return `${coldiqBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Where model traffic is actually sent.
 *
 * Every AI call this product makes leaves through one of two endpoints —
 * Bedrock, or the fallback chat-completions gateway — and until now neither
 * could be pointed anywhere else. Putting a gateway in front of them is what
 * buys spend analytics, response caching and rate limiting across the whole
 * product: the twenty-one modules that import ai-provider inherit it without
 * one of them changing.
 *
 * ── Why this is its own file ────────────────────────────────────────────
 *
 * bedrock.ts imports from https:// URLs, which is fine in Deno and
 * unresolvable in vitest, so nothing in it can be unit tested. The same was
 * true of managed-email.ts and its npm: specifier earlier, and the fix is the
 * same: the rule lives in a module that imports nothing, and the Deno-only
 * file calls into it.
 *
 * Both functions are off unless configured, and fall back to the endpoint
 * that has always worked rather than into the dark. A typo in a settings
 * field must not take every model call in the product with it.
 */

/** The endpoint that served every fallback call before a gateway existed. */
export const DEFAULT_FALLBACK_ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";

/** A configured base, or "" when it is absent or unusable. */
function base(raw: string | undefined | null, name: string): string {
  const v = String(raw ?? "").trim().replace(/\/+$/, "");
  if (!v) return "";
  if (!/^https:\/\//i.test(v)) {
    console.warn(`[ai-gateway] ${name} is not an https URL; using the direct endpoint`);
    return "";
  }
  return v;
}

/**
 * Where to POST an already-signed Bedrock request.
 *
 * Signing and sending are not the same address. SigV4 covers the `host`
 * header, so the signature is computed against
 * bedrock-runtime.<region>.amazonaws.com whatever happens next, and a proxy
 * forwarding it has to receive those headers untouched. That is why this
 * takes the AWS URL the signer already saw and returns somewhere else to post
 * it, rather than changing the URL before signing.
 *
 * ── Confirm the path shape before switching this on ─────────────────────
 *
 * Cloudflare's aws-bedrock route is documented as
 * `/v1/<account>/<gateway>/aws-bedrock/bedrock-runtime/<region>/<aws path>`
 * and that is what this builds, but I have not run it against a live gateway
 * — there is no Cloudflare account wired to this project. The whole prefix is
 * one environment variable for that reason: if the shape differs it is a
 * settings change, or one line here, and never a hunt through call sites.
 */
export function bedrockSendUrl(
  awsUrl: { pathname: string; search: string; toString(): string },
  region: string,
  gatewayBase?: string | null,
): string {
  const b = base(gatewayBase, "CF_AI_GATEWAY_BEDROCK");
  if (!b) return awsUrl.toString();
  return `${b}/bedrock-runtime/${region}${awsUrl.pathname}${awsUrl.search}`;
}

/**
 * The fallback provider's endpoint, optionally proxied.
 *
 * A plain POST with a bearer token, so unlike Bedrock the whole endpoint
 * moves and there is no signature to preserve.
 */
export function fallbackEndpoint(gatewayBase?: string | null): string {
  const b = base(gatewayBase, "CF_AI_GATEWAY_OPENAI");
  return b ? `${b}/chat/completions` : DEFAULT_FALLBACK_ENDPOINT;
}

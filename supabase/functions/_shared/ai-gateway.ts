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

/**
 * The fallback provider's endpoint.
 *
 * Not configurable, and that is the point. This is Lovable's gateway: it
 * takes LOVABLE_API_KEY and gateway-style model ids like
 * "google/gemini-2.5-flash". An earlier version of this file let it be
 * repointed at Cloudflare's /openai route, which would have sent OpenAI
 * Lovable's key and Lovable's model names and broken every fallback call the
 * moment the setting was filled in.
 *
 * Bedrock is the primary provider and the one worth observing; this path only
 * runs when Bedrock is unconfigured. Routing it somewhere would need a
 * credential and a model map for whatever is on the other end, which is a
 * different piece of work from putting a proxy in front of an endpoint.
 */
export const DEFAULT_FALLBACK_ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";

/** A configured base, or "" when it is absent or unusable. */
function base(raw: string | undefined | null, name: string): string {
  const v = String(raw ?? "").trim().replace(/\/+$/, "");
  if (!v) return "";
  /*
   * Parsed, not prefix-matched. `https://host:bad/path` starts with https and
   * is not a URL, and the whole promise of this function is that a malformed
   * setting falls back to the direct endpoint rather than sending model
   * traffic at something that cannot answer.
   */
  let parsed: URL;
  try {
    parsed = new URL(v);
  } catch {
    console.warn(`[ai-gateway] ${name} is not a URL; using the direct endpoint`);
    return "";
  }
  if (parsed.protocol !== "https:") {
    console.warn(`[ai-gateway] ${name} is not https; using the direct endpoint`);
    return "";
  }
  return v;
}

/**
 * Where to POST an already-signed Bedrock request, and what to add to it.
 *
 * Signing and sending are not the same address. SigV4 covers the `host`
 * header, so the signature is computed against
 * bedrock-runtime.<region>.amazonaws.com whatever happens next, and AWS
 * recomputes the canonical request from the headers it actually receives —
 * which is why a proxy that forwards to the real Bedrock host can relay a
 * signature it never saw the signing key for. That is why this takes the AWS
 * URL the signer already saw and returns somewhere else to post it, rather
 * than changing the URL before signing.
 *
 * ── The path shape, confirmed against the provider docs ─────────────────
 *
 * `/v1/<account>/<gateway>/aws-bedrock/bedrock-runtime/<region>/<aws path>`.
 * `CF_AI_GATEWAY_BEDROCK` holds everything up to and including `aws-bedrock`;
 * this appends the rest from the URL the signer saw. The whole prefix is one
 * environment variable so that a different shape is a settings change, or one
 * line here, and never a hunt through call sites.
 *
 * ── Why the header travels with the URL ─────────────────────────────────
 *
 * A gateway with authentication turned on rejects anything without
 * `cf-aig-authorization`, so a URL without a token is a 401 on every model
 * call in the product — the failure the rest of this file exists to avoid.
 * Returning both together is what makes it impossible to move the traffic and
 * forget the credential, and a base with no token does not move it at all.
 *
 * The token is attached only when the base is present and usable. It is a
 * Cloudflare credential; going direct to AWS it would be a secret sent to
 * someone with no use for it, and secrets do not belong anywhere they are not
 * needed.
 */
export function bedrockRoute(
  awsUrl: { pathname: string; search: string; toString(): string },
  region: string,
  gatewayBase?: string | null,
  gatewayToken?: string | null,
): { url: string; headers: Record<string, string> } {
  const b = base(gatewayBase, "CF_AI_GATEWAY_BEDROCK");
  if (!b) return { url: awsUrl.toString(), headers: {} };
  const token = String(gatewayToken ?? "").trim();
  /*
   * Half-configured is the same as unconfigured, and goes direct.
   *
   * An earlier version routed without the token and only warned, which is the
   * one outcome this file exists to prevent: Cloudflare's Authenticated
   * Gateway rejects anything without `cf-aig-authorization`, so a base set
   * without a token is a 401 on every model call in the product — drafting,
   * scoring, research, the agent — reported to the user as a total outage.
   *
   * Going direct costs the analytics and nothing else, and the warning says
   * what to do. The reverse is not true, which is the whole argument: the
   * failure modes here are not symmetric, and the one that still serves
   * customers wins.
   *
   * It also means the setting is never worth turning on without a token,
   * which is the right default anyway — an unauthenticated AI Gateway is a
   * URL that spends your credits for anyone who finds it.
   */
  if (!token) {
    console.warn(
      "[ai-gateway] CF_AI_GATEWAY_BEDROCK is set without CF_AI_GATEWAY_TOKEN, " +
        "so Bedrock calls are going direct to AWS. An authenticated gateway " +
        "would reject them. Set the token to route through the gateway.",
    );
    return { url: awsUrl.toString(), headers: {} };
  }
  return {
    url: `${b}/bedrock-runtime/${region}${awsUrl.pathname}${awsUrl.search}`,
    headers: { "cf-aig-authorization": `Bearer ${token}` },
  };
}

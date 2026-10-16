import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Every model call this product makes goes through one of two endpoints, and
 * until now neither could be pointed anywhere.
 *
 * An AI Gateway in front of them is what buys spend analytics, response
 * caching and rate limiting across the whole product — the 21 modules that
 * import ai-provider inherit it without one of them changing.
 *
 * The constraint that shapes the design: SigV4 signs the `host` header, so a
 * Bedrock request cannot have its URL swapped after signing. The signature is
 * computed against AWS whatever happens next, and the proxy receives those
 * headers untouched. Hence two functions — one that moves a whole endpoint,
 * one that moves only where an already-signed request is posted.
 */

import {
  DEFAULT_FALLBACK_ENDPOINT,
  bedrockRoute,
} from "../../supabase/functions/_shared/ai-gateway";

/*
 * The configured base is a parameter, not a global read, which is what makes
 * this testable at all: bedrock.ts and ai-provider.ts fetch it from Deno.env
 * and hand it in. A rule that reads its own environment can only be tested in
 * that environment.
 */
const BEDROCK_GW = "https://gateway.ai.cloudflare.com/v1/acct/outreign/aws-bedrock";
const TOKEN = "cf-aig-test-token";

/** The URL half, for the cases that are only about the path. */
const sendUrl = (region: string, base?: string | null) =>
  bedrockRoute(awsUrl(), region, base, TOKEN).url;

const awsUrl = () =>
  new URL("https://bedrock-runtime.us-east-1.amazonaws.com/model/us.anthropic.claude-haiku-4-5-20251001-v1%3A0/converse");

describe("off by default, and identical when off", () => {
  /*
   * This is the property that makes the change safe to merge before any
   * Cloudflare account exists: with nothing configured, every request goes
   * exactly where it went yesterday.
   */
  it("sends Bedrock straight to AWS", () => {
    expect(sendUrl("us-east-1", undefined)).toBe(awsUrl().toString());
    expect(sendUrl("us-east-1", null)).toBe(awsUrl().toString());
  });

  /*
   * The fallback is deliberately not configurable. It is Lovable's gateway,
   * with Lovable's key and Lovable's model ids; an earlier version of this
   * let it be repointed at Cloudflare's /openai route, which would have sent
   * OpenAI the wrong credential and the wrong model names and broken every
   * fallback call the moment the setting was filled in.
   */
  it("keeps the fallback endpoint fixed", () => {
    expect(DEFAULT_FALLBACK_ENDPOINT).toBe("https://ai.gateway.lovable.dev/v1/chat/completions");
    const PROVIDER = readFileSync("supabase/functions/_shared/ai-provider.ts", "utf8");
    expect(PROVIDER).toContain("url: GATEWAY_URL,");
    expect(PROVIDER).not.toContain("CF_AI_GATEWAY_OPENAI");
  });
});

describe("when a gateway is configured", () => {
  it("posts the signed Bedrock request at the proxy, keeping the AWS path", () => {
    expect(sendUrl("us-east-1", BEDROCK_GW)).toBe(
      "https://gateway.ai.cloudflare.com/v1/acct/outreign/aws-bedrock/bedrock-runtime/us-east-1" +
        "/model/us.anthropic.claude-haiku-4-5-20251001-v1%3A0/converse",
    );
  });

  it("keeps the model id encoded exactly as signed", () => {
    // The colon in a Bedrock model id is percent-encoded, and SigV4 signs the
    // canonical path. Re-encoding or decoding it breaks the signature.
    expect(sendUrl("us-east-1", "https://gw.test/v1/a/b/aws-bedrock"))
      .toContain("v1%3A0/converse");
  });

  it("tolerates a trailing slash", () => {
    expect(sendUrl("eu-west-1", "https://gw.test/v1/a/b/aws-bedrock/"))
      .toContain("/aws-bedrock/bedrock-runtime/eu-west-1/model/");
  });


});

describe("the credential travels with the URL", () => {
  /*
   * A gateway with authentication turned on answers 401 to anything without
   * `cf-aig-authorization`. Moving the traffic and forgetting the credential
   * is therefore not a degraded mode, it is every model call in the product
   * failing at once — which is the failure this whole file exists to avoid.
   * Returning both from one function is what makes that combination
   * unreachable.
   */
  it("sends the gateway token when the gateway is in use", () => {
    expect(bedrockRoute(awsUrl(), "us-east-1", BEDROCK_GW, TOKEN).headers)
      .toEqual({ "cf-aig-authorization": `Bearer ${TOKEN}` });
  });

  /*
   * It is a Cloudflare credential. Going direct to AWS it would be a secret
   * handed to someone with no use for it, and a secret sent where it is not
   * needed is a secret in one more log.
   */
  it("never sends it to AWS", () => {
    expect(bedrockRoute(awsUrl(), "us-east-1", undefined, TOKEN).headers).toEqual({});
    expect(bedrockRoute(awsUrl(), "us-east-1", "", TOKEN).headers).toEqual({});
    // Including when the base was meant to be a gateway and is unusable: the
    // request goes direct, so the credential must not go with it.
    expect(bedrockRoute(awsUrl(), "us-east-1", "https://gw.test:bad/v1", TOKEN).headers)
      .toEqual({});
  });

  /*
   * An unauthenticated gateway is a real configuration, so a missing token is
   * not an error — but it is the shape of a half-finished setup, and the
   * symptom (401 on every call) does not name its own cause.
   */
  /*
   * Cloudflare's Authenticated Gateway is on for this account, so a base
   * without a token is not a degraded mode — it is every model call in the
   * product answering 401 at once, which reads as a total outage.
   *
   * The two ways of being wrong are not symmetric. Going direct loses the
   * analytics the gateway was for. Routing without the credential loses the
   * product. So half-configured goes direct and says why.
   */
  it("goes direct when the base is set without a token, rather than 401ing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const route = bedrockRoute(awsUrl(), "us-east-1", BEDROCK_GW, undefined);
      expect(route.url).toBe(awsUrl().toString());
      expect(route.headers).toEqual({});
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("CF_AI_GATEWAY_TOKEN"));
      // And says what to do about it, not just that something is wrong.
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("direct to AWS"));
    } finally {
      warn.mockRestore();
    }
  });

  it("treats a whitespace-only token as no token", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(bedrockRoute(awsUrl(), "us-east-1", BEDROCK_GW, "   ").url)
        .toBe(awsUrl().toString());
    } finally {
      warn.mockRestore();
    }
  });
});

describe("it fails back rather than into the dark", () => {
  /*
   * A typo in a settings field must not take every model call in the product
   * with it. Both fall back to the endpoint that has always worked.
   */
  it("ignores a value that is not https", () => {
    expect(sendUrl("us-east-1", "gateway.ai.cloudflare.com/v1/a/b"))
      .toBe(awsUrl().toString());
    expect(sendUrl("us-east-1", "http://insecure.test/v1"))
      .toBe(awsUrl().toString());
  });

  it("rejects a value that starts with https and is not a URL", () => {
    // A prefix test passes this and a URL parse does not; the request would
    // then fail instead of quietly going direct, which is the opposite of
    // what this function promises.
    expect(sendUrl("us-east-1", "https://gateway.ai.cloudflare.com:bad/v1/a/b"))
      .toBe(awsUrl().toString());
  });

  it("ignores whitespace", () => {
    expect(sendUrl("us-east-1", "   ")).toBe(awsUrl().toString());
  });
});

describe("the seam is where it has to be", () => {
  const BEDROCK = readFileSync("supabase/functions/_shared/bedrock.ts", "utf8");
  const PROVIDER = readFileSync("supabase/functions/_shared/ai-provider.ts", "utf8");

  it("signs against AWS, sends wherever the gateway says", () => {
    // If the signer ever saw the gateway URL, the signature would cover the
    // wrong host and AWS would reject every request.
    expect(BEDROCK).toContain("host: url.host");
    expect(BEDROCK).not.toMatch(/signRequest\(\s*new URL\(route/);
    // The signer is handed the AWS URL; the route is derived from it after.
    expect(BEDROCK).not.toMatch(/signRequest\(\s*routeFor/);
  });

  it("every Bedrock send goes through it", () => {
    const sends = BEDROCK.match(/await fetch\(route\.url, \{/g) ?? [];
    expect(sends).toHaveLength(2);
    expect(BEDROCK).not.toMatch(/await fetch\(url\.toString\(\)/);

    /*
     * And each one merges the route's headers in. A send that takes the URL
     * and drops the credential is the 401-on-everything case, and it is one
     * forgetful edit away, so it is asserted rather than trusted.
     */
    const withCredential = BEDROCK.match(/\.\.\.headers, \.\.\.route\.headers/g) ?? [];
    expect(withCredential).toHaveLength(2);
  });

  it("only the Bedrock half is configurable", () => {
    expect(PROVIDER).not.toContain("fallbackEndpoint");
    expect(BEDROCK).toContain('Deno.env.get("CF_AI_GATEWAY_BEDROCK")');
    expect(BEDROCK).toContain('Deno.env.get("CF_AI_GATEWAY_TOKEN")');
  });
});

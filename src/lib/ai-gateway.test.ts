import { describe, expect, it } from "vitest";
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
  bedrockSendUrl,
} from "../../supabase/functions/_shared/ai-gateway";

/*
 * The configured base is a parameter, not a global read, which is what makes
 * this testable at all: bedrock.ts and ai-provider.ts fetch it from Deno.env
 * and hand it in. A rule that reads its own environment can only be tested in
 * that environment.
 */
const BEDROCK_GW = "https://gateway.ai.cloudflare.com/v1/acct/outreign/aws-bedrock";

const awsUrl = () =>
  new URL("https://bedrock-runtime.us-east-1.amazonaws.com/model/us.anthropic.claude-haiku-4-5-20251001-v1%3A0/converse");

describe("off by default, and identical when off", () => {
  /*
   * This is the property that makes the change safe to merge before any
   * Cloudflare account exists: with nothing configured, every request goes
   * exactly where it went yesterday.
   */
  it("sends Bedrock straight to AWS", () => {
    expect(bedrockSendUrl(awsUrl(), "us-east-1", undefined)).toBe(awsUrl().toString());
    expect(bedrockSendUrl(awsUrl(), "us-east-1", null)).toBe(awsUrl().toString());
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
    expect(bedrockSendUrl(awsUrl(), "us-east-1", BEDROCK_GW)).toBe(
      "https://gateway.ai.cloudflare.com/v1/acct/outreign/aws-bedrock/bedrock-runtime/us-east-1" +
        "/model/us.anthropic.claude-haiku-4-5-20251001-v1%3A0/converse",
    );
  });

  it("keeps the model id encoded exactly as signed", () => {
    // The colon in a Bedrock model id is percent-encoded, and SigV4 signs the
    // canonical path. Re-encoding or decoding it breaks the signature.
    expect(bedrockSendUrl(awsUrl(), "us-east-1", "https://gw.test/v1/a/b/aws-bedrock"))
      .toContain("v1%3A0/converse");
  });

  it("tolerates a trailing slash", () => {
    expect(bedrockSendUrl(awsUrl(), "eu-west-1", "https://gw.test/v1/a/b/aws-bedrock/"))
      .toContain("/aws-bedrock/bedrock-runtime/eu-west-1/model/");
  });


});

describe("it fails back rather than into the dark", () => {
  /*
   * A typo in a settings field must not take every model call in the product
   * with it. Both fall back to the endpoint that has always worked.
   */
  it("ignores a value that is not https", () => {
    expect(bedrockSendUrl(awsUrl(), "us-east-1", "gateway.ai.cloudflare.com/v1/a/b"))
      .toBe(awsUrl().toString());
    expect(bedrockSendUrl(awsUrl(), "us-east-1", "http://insecure.test/v1"))
      .toBe(awsUrl().toString());
  });

  it("rejects a value that starts with https and is not a URL", () => {
    // A prefix test passes this and a URL parse does not; the request would
    // then fail instead of quietly going direct, which is the opposite of
    // what this function promises.
    expect(bedrockSendUrl(awsUrl(), "us-east-1", "https://gateway.ai.cloudflare.com:bad/v1/a/b"))
      .toBe(awsUrl().toString());
  });

  it("ignores whitespace", () => {
    expect(bedrockSendUrl(awsUrl(), "us-east-1", "   ")).toBe(awsUrl().toString());
  });
});

describe("the seam is where it has to be", () => {
  const BEDROCK = readFileSync("supabase/functions/_shared/bedrock.ts", "utf8");
  const PROVIDER = readFileSync("supabase/functions/_shared/ai-provider.ts", "utf8");

  it("signs against AWS, sends wherever the gateway says", () => {
    // If the signer ever saw the gateway URL, the signature would cover the
    // wrong host and AWS would reject every request.
    expect(BEDROCK).toContain("host: url.host");
    expect(BEDROCK).not.toMatch(/signRequest\(\s*new URL\(resolveSendUrl/);
  });

  it("every Bedrock send goes through it", () => {
    const sends = BEDROCK.match(/await fetch\(resolveSendUrl\(url, bedrockRegion\(\)/g) ?? [];
    expect(sends).toHaveLength(2);
    expect(BEDROCK).not.toMatch(/await fetch\(url\.toString\(\)/);
  });

  it("only the Bedrock half is configurable", () => {
    expect(PROVIDER).not.toContain("fallbackEndpoint");
    expect(BEDROCK).toContain('Deno.env.get("CF_AI_GATEWAY_BEDROCK")');
  });
});

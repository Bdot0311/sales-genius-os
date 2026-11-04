import { describe, it, expect } from "vitest";
import {
  classifyGoogleTokenResponse,
  verifyGoogleCredential,
  GOOGLE_TOKEN_ENDPOINT,
} from "../../supabase/functions/_shared/google-credential-check.ts";

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("classifyGoogleTokenResponse", () => {
  it("calls the pair invalid when Google says invalid_client", () => {
    const result = classifyGoogleTokenResponse(401, { error: "invalid_client" });
    expect(result.verdict).toBe("invalid");
    expect(result.googleError).toBe("invalid_client");
  });

  it("calls the pair invalid on a 401 even with no error field", () => {
    expect(classifyGoogleTokenResponse(401, {}).verdict).toBe("invalid");
  });

  /*
   * The load-bearing case. invalid_grant means Google authenticated the
   * client and then refused the throwaway code, which is the only outcome a
   * correct secret can produce here. Reading it as a failure would report
   * every healthy deployment as broken.
   */
  it("calls the pair valid when Google refuses only the code", () => {
    const result = classifyGoogleTokenResponse(400, { error: "invalid_grant" });
    expect(result.verdict).toBe("valid");
  });

  it("refuses to guess at an error it does not know", () => {
    const result = classifyGoogleTokenResponse(400, { error: "slow_down" });
    expect(result.verdict).toBe("unknown");
    expect(result.googleError).toBe("slow_down");
  });

  it("refuses to guess when there is no error field at all", () => {
    expect(classifyGoogleTokenResponse(500, null).verdict).toBe("unknown");
  });
});

describe("verifyGoogleCredential", () => {
  it("asks Google with an authorization_code grant and both halves of the pair", async () => {
    let seenUrl = "";
    let seenBody = "";
    await verifyGoogleCredential("client-abc", "secret-xyz", (async (url: any, init: any) => {
      seenUrl = String(url);
      seenBody = String(init?.body ?? "");
      return jsonResponse(400, { error: "invalid_grant" });
    }) as unknown as typeof fetch);

    expect(seenUrl).toBe(GOOGLE_TOKEN_ENDPOINT);
    const sent = new URLSearchParams(seenBody);
    expect(sent.get("grant_type")).toBe("authorization_code");
    expect(sent.get("client_id")).toBe("client-abc");
    expect(sent.get("client_secret")).toBe("secret-xyz");
    expect(sent.get("code")).toBeTruthy();
  });

  /*
   * This runs in an admin panel and its output is read on a screen. The
   * secret goes to Google and must not come back out of this function.
   */
  it("never puts the secret in what it returns", async () => {
    const result = await verifyGoogleCredential("client-abc", "secret-xyz", (async () =>
      jsonResponse(401, { error: "invalid_client" })) as unknown as typeof fetch);

    expect(JSON.stringify(result)).not.toContain("secret-xyz");
    expect(result.verdict).toBe("invalid");
  });

  it("does not call Google when either half is missing", async () => {
    let calls = 0;
    const counting = (async () => {
      calls += 1;
      return jsonResponse(400, { error: "invalid_grant" });
    }) as unknown as typeof fetch;

    expect((await verifyGoogleCredential("", "secret", counting)).verdict).toBe("unknown");
    expect((await verifyGoogleCredential("client", "", counting)).verdict).toBe("unknown");
    expect(calls).toBe(0);
  });

  it("reports unknown rather than throwing when Google cannot be reached", async () => {
    const result = await verifyGoogleCredential("client", "secret", (async () => {
      throw new Error("getaddrinfo ENOTFOUND");
    }) as unknown as typeof fetch);

    expect(result.verdict).toBe("unknown");
    expect(result.detail).toContain("ENOTFOUND");
  });

  it("reports unknown rather than throwing when the body is not JSON", async () => {
    const result = await verifyGoogleCredential("client", "secret", (async () =>
      new Response("<html>502</html>", { status: 502 })) as unknown as typeof fetch);

    expect(result.verdict).toBe("unknown");
  });
});

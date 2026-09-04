import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { readFunctionError } from "./handle-send-error";

/** What supabase-js hands back on a non-2xx: a status, and a body to read. */
const fnError = (status: number, body: unknown) => ({
  message: "Edge Function returned a non-2xx status code",
  context: { status, json: async () => body },
});

/**
 * Reported from the app: pressing Send Now produced "Edge Function returned a
 * non-2xx status code" and nothing else, while the body underneath said which
 * limit had been hit. Only 429 was ever unpacked; every other status fell
 * through to the generic string — which is exactly the case where the user has
 * no idea what to do next.
 */
describe("the reason comes out of the body", () => {
  it("surfaces a plain error message", async () => {
    const { payload } = await readFunctionError(
      fnError(400, { error: "This mailbox is not connected." }),
    );
    expect(payload.error).toBe("This mailbox is not connected.");
  });

  it("keeps the structured fields a cap response carries", async () => {
    const { status, payload } = await readFunctionError(
      fnError(429, { error: "Daily email limit reached (10/day).", dailyLimit: 10, dailySent: 10 }),
    );
    expect(status).toBe(429);
    expect(payload.dailyLimit).toBe(10);
  });

  it("says something useful on a 5xx with no body", async () => {
    const { payload } = await readFunctionError(fnError(500, null));
    expect(payload.error).toMatch(/send service returned an error \(500\)/);
    expect(payload.error).toMatch(/Nothing was sent/);
  });

  it("survives a body that is not JSON at all", async () => {
    const broken = {
      message: "Edge Function returned a non-2xx status code",
      context: { status: 502, json: async () => { throw new Error("Unexpected token <"); } },
    };
    const { payload } = await readFunctionError(broken);
    expect(payload.error).toMatch(/502/);
  });

  it("falls back to the error's own message when there is no response", async () => {
    const { payload } = await readFunctionError(new Error("Failed to fetch"));
    expect(payload.error).toBe("Failed to fetch");
  });

  it("never returns the generic supabase string as the reason", async () => {
    // That sentence is what the user was already seeing, and it is the thing
    // this exists to replace.
    for (const e of [fnError(400, {}), fnError(500, null), fnError(0, {})]) {
      const { payload } = await readFunctionError(e);
      expect(payload.error).not.toMatch(/non-2xx status code/);
    }
  });
});

describe("every send path unpacks it", () => {
  it.each([
    ["manual send", "src/pages/Outreach.tsx"],
    ["inbox reply", "src/pages/Inbox.tsx"],
    ["bulk send", "src/components/outreach/BulkSendDialog.tsx"],
  ])("%s", (_name, file) => {
    const src = readFileSync(file, "utf8");
    expect(src).toMatch(/readFunctionError|reportSendFailure/);
  });

  it("no longer unpacks only the 429 case", () => {
    const src = readFileSync("src/pages/Outreach.tsx", "utf8");
    const generic = src.indexOf("reportSendFailure(error)");
    const capOnly = src.indexOf("errCtx?.status === 429");
    expect(generic).toBeGreaterThan(-1);
    // The general handler runs first, so no status can reach the old branch
    // and fall through to the generic message.
    expect(generic).toBeLessThan(capOnly);
  });
});

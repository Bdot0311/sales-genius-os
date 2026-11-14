import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const TREG = readFileSync("supabase/functions/_shared/treg.ts", "utf8");
const SEARCH = readFileSync("supabase/functions/fetch-external-leads/index.ts", "utf8");

describe("Treg usage is charged to the right customer", () => {
  it("tags every call with the customer from the server, never a prompt", () => {
    expect(TREG).toContain("customer=${tregTag(ctx.userId)}");
  });
  it("caps every call's cost", () => {
    expect(TREG).toContain('"X-Treg-Route-Max-Cost": String(TREG_MAX_COST_USD)');
  });
  it("records Treg's call id and settled cost", () => {
    expect(TREG).toContain("treg_call_id: callId");
    expect(TREG).toContain("cost_micro: costMicro");
  });
  it("bills Treg like Railway: no extra search charge, 1 credit per contact saved and enriched", () => {
    const block = SEARCH.slice(SEARCH.indexOf("// Treg fallback"), SEARCH.indexOf("// If all retries exhausted"));
    expect(block).not.toContain("applySearchMeter");
    expect(block).not.toContain("creditDelta");
  });
  it("only runs Treg when Railway returned nothing", () => {
    expect(SEARCH).toContain("if (rawLeads.length === 0 && tregConfigured()");
  });
});

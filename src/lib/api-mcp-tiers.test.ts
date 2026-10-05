import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { API_TIER_LIMITS } from "./api-limits";

const PRICING = readFileSync("src/components/Pricing.tsx", "utf8");
const MIG = readdirSync("drizzle/migrations").filter((f) => f.includes("api_mcp_paid_tiers"))
  .map((f) => readFileSync(`drizzle/migrations/${f}`, "utf8")).join("\n");

describe("API & MCP tiers", () => {
  it("free has no API/MCP access", () => {
    expect(API_TIER_LIMITS.free).toBeNull();
    expect(PRICING).toContain('{ name: "REST API access", free: false, starter: true, growth: true, pro: true, agency: true }');
    expect(PRICING).toContain('{ name: "MCP server access (AI assistants)", free: false, starter: true, growth: true, pro: true, agency: true }');
  });
  it("integrations are on every plan, including free", () => {
    expect(PRICING).toContain('free: true, starter: true, growth: true, pro: true, agency: true },\n      { name: "REST API access"');
  });
  it("rate limits rise with each tier and match the database", () => {
    const order = ["starter", "growth", "pro", "agency"] as const;
    for (let i = 1; i < order.length; i++) {
      expect(API_TIER_LIMITS[order[i]].perMinute).toBeGreaterThan(API_TIER_LIMITS[order[i - 1]].perMinute);
    }
    expect(MIG).toContain("WHEN 'starter' THEN 30 WHEN 'growth' THEN 60 WHEN 'pro' THEN 120");
    expect(MIG).toContain("WHEN 'agency' THEN 300");
    expect(MIG).toContain("WHEN 'starter' THEN 2000 WHEN 'growth' THEN 10000 WHEN 'pro' THEN 50000");
    expect(MIG).toContain("WHEN 'agency' THEN 200000");
  });
  it("cards and comparison table show the same per-minute limits", () => {
    for (const [p, n] of [["starter", 30], ["growth", 60], ["pro", 120], ["agency", 300]] as const) {
      expect(PRICING).toContain(`API & MCP access — ${n} req/min`);
      expect(PRICING).toContain(`${p}: "${n}"`);
    }
  });

  it("the AI-assistant plan data (WebMCP) matches the rate limits of every paid tier", () => {
    const WEBMCP = readFileSync("src/lib/webmcp.ts", "utf8");
    for (const [plan, n] of [["Starter", 30], ["Growth", 60], ["Pro", 120], ["Agency", 300]] as const) {
      expect(WEBMCP, `${plan} plan entry`).toContain(`API & MCP access at ${n} req/min`);
    }
  });
});

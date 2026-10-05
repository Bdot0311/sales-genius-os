import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { API_TIER_LIMITS } from "./api-limits";

const PRICING = readFileSync("src/components/Pricing.tsx", "utf8");
const LLMS = readFileSync("public/llms.txt", "utf8");
const LLMS_FULL = readFileSync("public/llms-full.txt", "utf8");
const LLMS_EDGE = readFileSync("supabase/functions/llms-txt/index.ts", "utf8");
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

  it("AI-readable pricing docs do not describe API access as Pro-only", () => {
    const combined = [LLMS, LLMS_FULL, LLMS_EDGE].join("\n");
    expect(combined).toContain("API & MCP access at 30");
    expect(combined).toContain("Starter 30 requests/minute and 2,000/day");
    expect(combined).not.toContain("RESTful API available on Pro plan");
    expect(combined).not.toContain("RESTful API available on the Pro plan");
    expect(combined).not.toContain("Pro plan users");
  });

  it("AI-readable pricing docs include the Starter AI SDR agent and current Elite limit", () => {
    const combined = [LLMS, LLMS_FULL, LLMS_EDGE].join("\n");
    expect(combined).toContain("Starter AI SDR agent");
    expect(combined).toContain("500 autonomous replies per day");
    expect(combined).not.toContain("No AI SDR agent");
    expect(combined).not.toContain("Elite AI SDR agent: 200");
  });

  it("AI-readable pricing docs do not describe integrations as paid-only or Pro-only", () => {
    const combined = [LLMS, LLMS_FULL, LLMS_EDGE].join("\n");
    expect(combined).toContain("integrations on every plan, including Explore");
    expect(combined).not.toContain("CRM integrations (HubSpot and Salesforce) are available on Pro and above");
    expect(combined).not.toContain("Gmail (email delivery and reply tracking, all paid plans)");
    expect(combined).not.toContain("HubSpot (CRM sync, Pro and above)");
    expect(combined).not.toContain("Salesforce (CRM sync, Pro and above)");
  });
});

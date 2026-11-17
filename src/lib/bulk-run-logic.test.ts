import { describe, expect, it } from "vitest";
import {
  classifyFailure, estimateRun, feedSize, itemBackoffSeconds, keysetOr, normalizeFilters, runCooloffSeconds,
} from "../../supabase/functions/_shared/bulk-run-logic";

describe("bulk run rules", () => {
  it("never feeds past the approved lead cap", () => {
    expect(feedSize(999_800, 1_000_000, 0)).toBe(200);
    expect(feedSize(1_000_000, 1_000_000, 0)).toBe(0);
  });
  it("only feeds when the queue runs low", () => {
    expect(feedSize(0, 1_000_000, 250)).toBe(0);
    expect(feedSize(0, 1_000_000, 10)).toBe(500);
  });
  it("estimates a million-lead run", () => {
    const e = estimateRun(1_000_000, true, true);
    expect(e.research_calls).toBe(1_000_000);
    expect(e.draft_calls).toBe(1_000_000);
    expect(e.est_provider_usd).toBe(50_000);
  });
  it("pauses on credits, cools off on rate limits, retries timeouts, fails the rest", () => {
    expect(classifyFailure("ai_credits")).toBe("credits");
    expect(classifyFailure("Firecrawl failed (http_429)")).toBe("rate_limit");
    expect(classifyFailure("request timed out")).toBe("transient");
    expect(classifyFailure("The reply rubric did not return a score, so this draft was not saved.")).toBe("transient");
    expect(classifyFailure("did not produce an approved sentence")).toBe("permanent");
  });
  it("backs off with caps", () => {
    expect(itemBackoffSeconds(1)).toBe(30);
    expect(itemBackoffSeconds(10)).toBe(1800);
    expect(runCooloffSeconds(1)).toBe(60);
    expect(runCooloffSeconds(20)).toBe(1800);
  });
  it("pages by keyset, not offset", () => {
    expect(keysetOr({ created_at: null, id: null })).toBeNull();
    expect(keysetOr({ created_at: "2026-01-01T00:00:00Z", id: "abc" })).toContain("id.lt.abc");
  });
  it("requires an email address by default and strips filter injection", () => {
    expect(normalizeFilters({}).has_email).toBe(true);
    expect(normalizeFilters({ query: "a,b%(c)" }).query).toBe("abc");
  });
});

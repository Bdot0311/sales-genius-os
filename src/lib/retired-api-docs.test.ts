import { describe, expect, it } from "vitest";
import { helpCategories, helpArticles, searchArticles } from "@/components/help/helpArticles";

describe("dedicated developer documentation", () => {
  it("excludes the retired developer category from help discovery", () => {
    expect(helpCategories.map(category => category.id)).not.toContain("api");
  });

  it("excludes the four retired developer guides from help results", () => {
    for (const slug of ["api-documentation", "api-status-monitoring", "webhook-signature-verification", "rate-limits-best-practices"]) {
      expect(helpArticles.find(article => article.slug === slug)).toBeUndefined();
      expect(searchArticles("api").find(article => article.slug === slug)).toBeUndefined();
    }
  });
});
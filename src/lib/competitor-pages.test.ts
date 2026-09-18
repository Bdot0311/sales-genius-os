import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { COMPETITORS, competitorBySlug } from "@/data/competitors";

const DATA = readFileSync("src/data/competitors.ts", "utf8");
const PAGE = readFileSync("src/pages/AlternativeTo.tsx", "utf8");
const PLUGIN = readFileSync("vite-plugin-seo-routes.ts", "utf8");
const APP = readFileSync("src/App.tsx", "utf8");

/** Every sentence these pages put in front of a reader. */
const allProse = COMPETITORS.flatMap((tool) => [
  tool.category,
  tool.intent,
  ...tool.reasons.flatMap((r) => [r.looking, r.outreign]),
  ...tool.faqs.flatMap((f) => [f.question, f.answer]),
]);

/**
 * "{tool} alternative" is the highest-intent query in this category: the person
 * typing it has already decided to leave and is choosing where to go. It is
 * also the easiest traffic to lose by being wrong about somebody else's
 * product, and being wrong about a rival in public is a legal problem as well
 * as an SEO one.
 *
 * So these pages are held to one rule: everything asserted about OutReign is
 * verifiable from this repository, and nothing is asserted about a competitor
 * beyond its product category.
 */
describe("the alternative pages", () => {
  it("makes no claim about a competitor's price", () => {
    // Rival pricing changes without notice and is the single most common thing
    // a comparison page is wrong about. OutReign's own prices are fine — they
    // are in src/components/Pricing.tsx.
    for (const tool of COMPETITORS) {
      const aboutThem = [tool.category, tool.intent].join(" ");
      expect(aboutThem, tool.slug).not.toMatch(/\$\d|\bper seat\b|\bcredits?\b|\bfree tier\b/i);
    }
  });

  it("describes a competitor only by what kind of product it is", () => {
    for (const tool of COMPETITORS) {
      // One sentence, no verdicts.
      expect(tool.category, tool.slug).not.toMatch(
        /\b(expensive|overpriced|slow|clunky|outdated|worse|inferior|bloated|unreliable)\b/i,
      );
      expect(tool.category.split(". ").length, `${tool.slug} category is one sentence`).toBe(1);
    }
  });

  it("never opens by attacking the tool someone already pays for", () => {
    // A page that starts with an accusation reads as insecure, and it is the
    // half most likely to be wrong. Every reason is framed as what the switcher
    // is looking for.
    for (const tool of COMPETITORS) {
      for (const reason of tool.reasons) {
        expect(reason.looking, `${tool.slug}: ${reason.looking}`).not.toMatch(
          new RegExp(`\\b${tool.name.replace(/\./g, "\\.")}\\b`, "i"),
        );
      }
    }
  });

  it("states OutReign's own prices, which are checkable", () => {
    const prices = allProse.join(" ");
    expect(prices).toContain("$39");
    // The numbers in src/components/Pricing.tsx.
    const pricing = readFileSync("src/components/Pricing.tsx", "utf8");
    for (const price of ["39", "89", "179", "249"]) {
      expect(pricing, `$${price} must exist in the pricing component`).toContain(
        `monthlyPrice: ${price}`,
      );
    }
  });

  it("does not duplicate a tool that already has a /vs- page", () => {
    // Two of our pages in front of the same searcher splits the authority
    // rather than ranking either.
    const existing = ["apollo", "instantly", "lusha", "zoominfo", "rocketreach"];
    for (const tool of COMPETITORS) {
      expect(existing, `${tool.slug} already has a /vs- page`).not.toContain(tool.slug);
    }
  });

  it("gives every page a unique slug and somewhere to go next", () => {
    const slugs = COMPETITORS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const tool of COMPETITORS) {
      expect(tool.related.length, tool.slug).toBeGreaterThan(0);
      expect(tool.faqs.length, tool.slug).toBeGreaterThan(0);
      expect(tool.reasons.length, tool.slug).toBeGreaterThan(0);
    }
  });

  it("resolves a real slug and refuses an unknown one", () => {
    expect(competitorBySlug("lemlist")?.name).toBe("lemlist");
    expect(competitorBySlug("not-a-tool")).toBeUndefined();
    expect(competitorBySlug("")).toBeUndefined();
  });

  it("is one template over the data, not eight copied pages", () => {
    expect(PAGE).toContain("competitorBySlug(slug ?? \"\")");
    expect(APP).toContain('<Route path="/alternatives/:slug"');
  });

  it("is reachable: head, sitemap, and links pointing at it", () => {
    expect(PLUGIN).toContain("path: `/alternatives/${tool.slug}`");
    expect(PLUGIN).toContain('path.startsWith("/alternatives/")');
    // Neither blog nor help, so without its own group these would have had no
    // internal links at all — the one thing that would stop them ranking.
    expect(PLUGIN).toContain('group("Alternatives"');
  });

  it("carries the rule it lives by, where the next person will read it", () => {
    expect(DATA).toContain("verifiable from this repository");
    expect(DATA).toContain("Nothing is asserted about a competitor beyond its product category");
  });

  it("sends an unknown slug somewhere real instead of serving a thin page", () => {
    expect(PAGE).toContain('<Navigate to="/cold-email-software" replace />');
  });
});

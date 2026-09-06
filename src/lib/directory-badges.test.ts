import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ALL_BADGES, FEATURED_BADGES } from "./directory-badges";

const HERO = readFileSync("src/components/landing/HeroSection.tsx", "utf8");
const FOOTER = readFileSync("src/components/landing/FooterSection.tsx", "utf8");
const FEATURED = readFileSync("src/components/landing/FeaturedBadges.tsx", "utf8");

/**
 * There are nineteen directory badges in the footer. Moving them up beside
 * the CTA would have made the problem worse: trust converts on the authority
 * of the source, not the count, and nineteen badges of mixed provenance
 * reads as marketing effort rather than credibility.
 *
 * So three are promoted and the rest stay where they were, doing the job they
 * are actually good at — reciprocal backlinks.
 */
describe("only a few badges are promoted", () => {
  it("promotes three, not nineteen", () => {
    expect(FEATURED_BADGES).toHaveLength(3);
    expect(ALL_BADGES.length).toBeGreaterThan(15);
  });

  it("leads with the one this audience actually recognises", () => {
    expect(FEATURED_BADGES[0].href).toContain("producthunt.com");
  });

  it("keeps every promoted badge in the footer too", () => {
    // The reciprocal backlink is the measurable benefit these have. Removing
    // one from the footer to avoid a duplicate would trade that for tidiness.
    for (const b of FEATURED_BADGES) {
      expect(ALL_BADGES.map((x) => x.href)).toContain(b.href);
    }
  });

  it("has no duplicate links in the footer list", () => {
    const hrefs = ALL_BADGES.map((b) => b.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("gives every badge an intrinsic size, so nothing shifts on load", () => {
    for (const b of ALL_BADGES) {
      expect(b.w, b.alt).toBeGreaterThan(0);
      expect(b.h, b.alt).toBeGreaterThan(0);
      expect(b.alt.length, b.href).toBeGreaterThan(3);
    }
  });
});

describe("one list, so the hero and footer cannot disagree", () => {
  it("the footer renders the shared list rather than its own copy", () => {
    expect(FOOTER).toContain("ALL_BADGES");
    // The inline array that used to live here.
    expect(FOOTER).not.toContain('{ href: "https://sellwithboost.com", src:');
  });

  it("the hero renders the promoted few", () => {
    expect(HERO).toContain("<FeaturedBadges");
    expect(FEATURED).toContain("FEATURED_BADGES");
  });

  it("puts them after the CTA, not above it", () => {
    // A badge row above the primary action competes with it.
    const cta = HERO.indexOf("Get your free campaign setup");
    const badges = HERO.indexOf("<FeaturedBadges");
    expect(cta).toBeGreaterThan(-1);
    expect(badges).toBeGreaterThan(cta);
  });
});

/**
 * Several of these are served from hosts with no uptime guarantee — one is a
 * WordPress upload, another a workers.dev subdomain. In the footer a broken
 * badge is invisible. Beside the primary CTA it is a broken-image icon next to
 * "Get your free campaign setup", which costs more trust than the badge earned.
 */
describe("a badge that fails does not damage the hero", () => {
  it("hides itself on error", () => {
    expect(FEATURED).toContain("onError");
    expect(FEATURED).toContain("setBroken");
  });

  it("hides the whole row when none of them load", () => {
    expect(FEATURED).toContain("if (shown.length === 0) return null;");
  });

  it("does not compete with the hero for bandwidth", () => {
    expect(FEATURED).toContain('fetchPriority="low"');
  });

  it("reserves its height so a slow badge leaves a gap rather than a jump", () => {
    expect(FEATURED).toMatch(/className={`flex h-8/);
  });
});

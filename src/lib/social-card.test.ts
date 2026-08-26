import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_OG_IMAGE, SOCIAL_CARD_VERSION, withSocialVersion } from "./seo-utils";

/**
 * The social card URL was written out by hand in ten page components, inside
 * getOGImageUrl, and as SEOHead's default. Changing the default alone did
 * nothing, because every page that matters passed its own copy of the old
 * value: a new card shipped and appeared nowhere.
 */
describe("one social card URL, not twelve", () => {
  const pageFiles = readdirSync("src/pages", { recursive: true, encoding: "utf8" })
    .filter((f) => typeof f === "string" && f.endsWith(".tsx"))
    .map((f) => join("src/pages", f as string));

  it("no page hardcodes an og image", () => {
    const offenders = pageFiles.filter((p) => readFileSync(p, "utf8").includes("ogImage=\"http"));
    expect(offenders).toEqual([]);
  });

  it("the builder's old CDN card is gone from the codebase", () => {
    for (const p of [...pageFiles, "src/lib/seo-utils.ts", "src/components/seo/SEOHead.tsx"]) {
      expect(readFileSync(p, "utf8"), p).not.toContain("outreign-social-card.jpg");
    }
  });

  it("points at a file that ships in the build", () => {
    // public/ is copied verbatim, so a name mismatch here is a 404 that only
    // shows up as a blank card on someone else's timeline.
    expect(DEFAULT_OG_IMAGE).toContain("/outreign-social-card.png");
    readFileSync("public/outreign-social-card.png");
  });

  it("declares the type it actually is", () => {
    const head = readFileSync("src/components/seo/SEOHead.tsx", "utf8");
    expect(head).toContain('content="image/png"');
    expect(head).not.toContain('content="image/jpeg"');
  });

  it("busts the cache, because LinkedIn and X hold the old one", () => {
    expect(withSocialVersion(DEFAULT_OG_IMAGE)).toContain(`v=${SOCIAL_CARD_VERSION}`);
  });
});

/**
 * Search and social want different things from a title. Search wants the words
 * people type; social wants the line that stops a scroll. One string used to
 * drive <title>, og:title and twitter:title together, so fixing the share
 * preview meant gambling the ranking.
 */
describe("search title and social title are separate", () => {
  const HEAD = readFileSync("src/components/seo/SEOHead.tsx", "utf8");
  const INDEX = readFileSync("src/pages/Index.tsx", "utf8");

  it("social tags read a title of their own", () => {
    expect(HEAD).toContain("socialTitle");
    expect(HEAD).toContain('content={fullSocialTitle}');
  });

  it("falls back to the page title when a page does not care", () => {
    expect(HEAD).toContain("socialTitle ? formatPageTitle(socialTitle) : fullTitle");
  });

  it("the homepage search title carries the keywords", () => {
    expect(INDEX).toContain('title="B2B Cold Email Outbound With an AI SDR"');
  });

  it("the homepage social title carries the positioning", () => {
    expect(INDEX).toContain('socialTitle="The output of a sales team. Headcount of one."');
  });

  it("no page still advertises the old hero", () => {
    expect(INDEX).not.toContain("Your Next 100 B2B Prospects");
    expect(HEAD).not.toContain("Your Next 100 B2B Prospects");
  });
});

/**
 * Every fabricated figure the marketing pages show sits inside a panel that
 * says so. The builder regenerates these components, and a mockup that loses
 * its label becomes a claim.
 */
describe("simulated product previews stay labelled", () => {
  const labelled = [
    "src/components/landing/DashboardMockup.tsx",
    "src/components/landing/AISdrSection.tsx",
    "src/components/landing/ModulesSection.tsx",
  ];

  for (const file of labelled) {
    it(`${file.split("/").pop()} still says its numbers are simulated`, () => {
      expect(readFileSync(file, "utf8").toLowerCase()).toContain("simulated preview");
    });
  }
});

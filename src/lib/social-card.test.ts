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

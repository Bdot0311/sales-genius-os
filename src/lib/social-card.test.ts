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

/**
 * Crawlers do not run JavaScript, so SEOHead is invisible to them. What
 * LinkedIn and X actually read is index.html, rewritten per route by
 * vite-plugin-seo-routes. That plugin carries its own copy of every title and
 * description under a comment asking whoever edits a page to keep them in
 * sync by hand — and nobody did.
 *
 * Three separate changes to SEOHead therefore reached no crawler at all: the
 * Post Inspector kept showing the old card and the old title after a fresh
 * scrape, because the served HTML never had the new ones.
 */
describe("what crawlers actually read", () => {
  const HTML = readFileSync("index.html", "utf8");
  const PLUGIN = readFileSync("vite-plugin-seo-routes.ts", "utf8");

  it("index.html points at the new card, not the builder's CDN", () => {
    expect(HTML).toContain("/outreign-social-card.png?v=8");
    expect(HTML).not.toContain("outreign-social-card.jpg");
  });

  it("declares png, since that is what the file is", () => {
    expect(HTML).toContain('content="image/png"');
    expect(HTML).not.toContain('content="image/jpeg"');
  });

  it("describes the card that is actually there", () => {
    // The alt text described the previous card's headline.
    expect(HTML).not.toContain("Find who to sell to");
  });

  it("carries no duration claim the page dropped", () => {
    expect(HTML).not.toContain("under 2 minutes");
  });

  it("gives search and social different titles", () => {
    expect(HTML).toContain("<title>B2B Cold Email Outbound With an AI SDR | OutReign</title>");
    expect(HTML).toContain('og:title" content="The output of a sales team. Headcount of one."');
  });

  it("keeps the social description short enough to survive truncation", () => {
    // Previews cut around 125 characters.
    const m = HTML.match(/<meta property="og:description" content="([^"]*)"/);
    expect(m).not.toBeNull();
    expect(m![1].length).toBeLessThanOrEqual(125);
  });

  it("the per-route plugin agrees with the HTML it rewrites", () => {
    // The plugin overwrites these at build time, so a stale entry here silently
    // undoes index.html.
    //
    // This used to pin the homepage title as a literal, which meant the test
    // failed the next time the title was edited even though the plugin and the
    // HTML still agreed with each other — the thing it is actually here to
    // check. It now compares the two, so renaming the page keeps it passing and
    // changing only one of them is what fails.
    const unescape = (v: string) =>
      v.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');

    const htmlTitle = unescape(HTML.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim() ?? "");
    // The homepage entry is the first route in the plugin's list.
    const pluginTitle = PLUGIN.match(/path: "\/",\s*\n\s*title: "([^"]+)"/)?.[1] ?? "";
    expect(htmlTitle).not.toBe("");
    expect(pluginTitle).toBe(htmlTitle);

    const htmlOgTitle = unescape(
      HTML.match(/<meta property="og:title" content="([^"]*)"/)?.[1] ?? "",
    );
    const pluginSocialTitle = PLUGIN.match(/socialTitle: "([^"]+)"/)?.[1] ?? "";
    expect(htmlOgTitle).not.toBe("");
    expect(pluginSocialTitle).toBe(htmlOgTitle);
  });

  it("the plugin writes social values into social tags", () => {
    expect(PLUGIN).toContain('content="${socialTitle}"');
    expect(PLUGIN).toContain('content="${socialDescription}"');
  });
});

/**
 * Three different X handles lived in the codebase at once: index.html's
 * twitter:site said @buildwitbrandon, BRAND.twitterHandle said @outreign, and
 * BRAND.founderX linked x.com/bdot0311 — which ProofBar renders as a live
 * "Follow the journey" link on the landing page, pointing readers at the wrong
 * profile. twitter:site naming a handle that does not exist can also make X
 * drop the card entirely.
 */
describe("one X handle", () => {
  const BRANDF = readFileSync("src/lib/brand.ts", "utf8");
  const HTML = readFileSync("index.html", "utf8");
  const HANDLE = "buildwitbrandon";

  it("the meta tags name the real account", () => {
    expect(HTML).toContain(`twitter:site" content="@${HANDLE}"`);
    expect(HTML).toContain(`twitter:creator" content="@${HANDLE}"`);
  });

  it("the link the landing page renders goes to the same account", () => {
    expect(BRANDF).toContain(`founderX: "https://x.com/${HANDLE}"`);
  });

  it("no stale handle survives in the X fields", () => {
    // Matched on the assignments rather than the substring, because
    // "@outreign" is also the tail of support@outreign.io, and LinkedIn is a
    // separate account this says nothing about.
    expect(BRANDF).not.toContain('twitterHandle: "@outreign"');
    expect(BRANDF).not.toContain('founderX: "https://x.com/bdot0311"');
    expect(BRANDF).toContain('twitterHandle: "@buildwitbrandon"');
  });
});

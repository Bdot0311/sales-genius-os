import { describe, expect, it } from "vitest";
import {
  FALLBACK_PATHS,
  isSitemapIndex,
  lastmodNote,
  parseSitemap,
  rankPages,
  recencyBonus,
  sitemapsFromRobots,
} from "../../supabase/functions/_shared/site-discovery.ts";

const NOW = new Date("2026-09-04T00:00:00Z");

describe("finding the sitemap", () => {
  it("reads the Sitemap: lines out of robots.txt", () => {
    const robots = [
      "User-agent: *",
      "Disallow: /admin",
      "Sitemap: https://acme.io/sitemap_index.xml",
      "sitemap: /sitemap-posts.xml",
    ].join("\n");
    expect(sitemapsFromRobots(robots, "https://acme.io")).toEqual([
      "https://acme.io/sitemap_index.xml",
      "https://acme.io/sitemap-posts.xml",
    ]);
  });

  it("skips a malformed line rather than giving up on the file", () => {
    const robots = "Sitemap: ht!tp://[[[\nSitemap: https://acme.io/sitemap.xml";
    expect(sitemapsFromRobots(robots, "https://acme.io")).toEqual(["https://acme.io/sitemap.xml"]);
  });

  it("returns nothing for a robots.txt that names none", () => {
    expect(sitemapsFromRobots("User-agent: *\nDisallow:", "https://acme.io")).toEqual([]);
  });
});

describe("reading a sitemap", () => {
  const xml = `<?xml version="1.0"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://acme.io/careers</loc><lastmod>2026-08-28</lastmod></url>
      <url><loc>https://acme.io/about</loc></url>
      <url><loc>https://acme.io/blog/a?x=1&amp;y=2</loc><lastmod>2026-09-01T10:00:00Z</lastmod></url>
    </urlset>`;

  it("pairs each URL with its lastmod", () => {
    expect(parseSitemap(xml)).toEqual([
      { url: "https://acme.io/careers", lastmod: "2026-08-28" },
      { url: "https://acme.io/about", lastmod: "" },
      { url: "https://acme.io/blog/a?x=1&y=2", lastmod: "2026-09-01T10:00:00Z" },
    ]);
  });

  it("recognises an index that points at further sitemaps", () => {
    const index = `<sitemapindex><sitemap><loc>https://acme.io/s1.xml</loc></sitemap></sitemapindex>`;
    expect(isSitemapIndex(index)).toBe(true);
    expect(isSitemapIndex(xml)).toBe(false);
    expect(parseSitemap(index)).toEqual([{ url: "https://acme.io/s1.xml", lastmod: "" }]);
  });

  it("survives a file with no entries at all", () => {
    expect(parseSitemap("<urlset></urlset>")).toEqual([]);
    expect(parseSitemap("")).toEqual([]);
  });
});

describe("what a recent change is worth", () => {
  it("pays most for a page changed this month", () => {
    expect(recencyBonus("2026-09-01", NOW)).toBe(60);
    expect(recencyBonus("2026-07-01", NOW)).toBe(40);
    expect(recencyBonus("2026-05-01", NOW)).toBe(20);
  });

  it("pays nothing for an old page or an unreadable date", () => {
    expect(recencyBonus("2021-01-01", NOW)).toBe(0);
    expect(recencyBonus("last tuesday", NOW)).toBe(0);
    expect(recencyBonus("", NOW)).toBe(0);
  });
});

describe("choosing which pages to read", () => {
  const entries = [
    { url: "https://acme.io/", lastmod: "2026-09-01" },
    { url: "https://acme.io/privacy", lastmod: "2026-09-02" },
    { url: "https://acme.io/brochure.pdf", lastmod: "2026-09-02" },
    { url: "https://blog.other.com/x", lastmod: "2026-09-02" },
    { url: "https://acme.io/careers", lastmod: "2026-08-20" },
    { url: "https://acme.io/about", lastmod: "2019-01-01" },
    { url: "https://acme.io/blog/one", lastmod: "2026-09-01" },
    { url: "https://acme.io/blog/two", lastmod: "2026-08-31" },
    { url: "https://acme.io/blog/three", lastmod: "2026-08-30" },
    { url: "https://acme.io/pricing", lastmod: "" },
  ];

  it("drops the homepage, boilerplate, non-pages and other domains", () => {
    const urls = rankPages(entries, "https://acme.io", 10, NOW).map((p) => p.url);
    expect(urls).not.toContain("https://acme.io/");
    expect(urls).not.toContain("https://acme.io/privacy");
    expect(urls).not.toContain("https://acme.io/brochure.pdf");
    expect(urls).not.toContain("https://blog.other.com/x");
  });

  it("puts hiring first — it is the most specific thing on a company's own site", () => {
    expect(rankPages(entries, "https://acme.io", 5, NOW)[0].url).toBe("https://acme.io/careers");
  });

  it("does not let one prolific blog crowd out every other kind of page", () => {
    // Three fresh blog posts outscore a stale about page on recency alone.
    // Sorting on score would return all three and no pricing, and the brief
    // would describe the site's publishing habit instead of the company.
    const picked = rankPages(entries, "https://acme.io", 4, NOW);
    const blogs = picked.filter((p) => p.url.includes("/blog/"));
    expect(blogs).toHaveLength(1);
    expect(picked.map((p) => p.reason)).toContain("pricing");
  });

  it("keeps a page under an unguessable path when the site says it just changed", () => {
    const picked = rankPages(
      [{ url: "https://acme.io/introducing-atlas", lastmod: "2026-09-02" }],
      "https://acme.io",
      5,
      NOW,
    );
    expect(picked.map((p) => p.url)).toEqual(["https://acme.io/introducing-atlas"]);
    expect(picked[0].reason).toBe("recently changed");
  });

  it("ignores an unguessable path that has not changed in years", () => {
    expect(
      rankPages([{ url: "https://acme.io/whatever", lastmod: "2019-01-01" }], "https://acme.io", 5, NOW),
    ).toEqual([]);
  });

  it("collapses the same URL listed twice", () => {
    const dupes = [
      { url: "https://acme.io/careers", lastmod: "2026-08-20" },
      { url: "https://acme.io/careers/", lastmod: "2026-08-20" },
    ];
    expect(rankPages(dupes, "https://acme.io", 5, NOW)).toHaveLength(1);
  });

  it("respects the limit", () => {
    expect(rankPages(entries, "https://acme.io", 2, NOW)).toHaveLength(2);
  });

  it("returns nothing rather than throwing on a bad origin", () => {
    expect(rankPages(entries, "not a url", 5, NOW)).toEqual([]);
  });
});

describe("telling the model when each page changed", () => {
  const pages = rankPages(
    [
      { url: "https://acme.io/careers", lastmod: "2026-09-03" },
      { url: "https://acme.io/pricing", lastmod: "" },
    ],
    "https://acme.io",
    5,
    NOW,
  );

  it("lists only the pages that carry a date", () => {
    const note = lastmodNote(pages, NOW);
    expect(note).toContain("https://acme.io/careers");
    expect(note).not.toContain("https://acme.io/pricing");
  });

  it("forbids attaching one page's date to another page's fact", () => {
    expect(lastmodNote(pages, NOW)).toMatch(/never use it to date a fact you read on a different page/i);
  });

  it("says nothing at all when no page is dated", () => {
    expect(lastmodNote([], NOW)).toBe("");
  });
});

describe("the floor for a site with no sitemap", () => {
  it("still leads with hiring", () => {
    expect(FALLBACK_PATHS[0]).toBe("/careers");
  });
});

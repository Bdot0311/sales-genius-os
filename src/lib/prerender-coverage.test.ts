import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const ENTRY = readFileSync("src/entry-server.tsx", "utf8");
const PLUGIN = readFileSync("vite-plugin-seo-routes.ts", "utf8");
const SCRIPT = readFileSync("scripts/prerender.mjs", "utf8");
const ROBOTS = readFileSync("public/robots.txt", "utf8");

/** The paths in entry-server's PAGES map. */
const prerendered = (() => {
  const block = ENTRY.slice(
    ENTRY.indexOf("const PAGES"),
    ENTRY.indexOf("export const prerenderablePaths"),
  );
  return [...block.matchAll(/"([^"]+)":/g)].map((m) => m[1]);
})();

/** Every path the SEO plugin emits a per-route HTML file and a sitemap entry for. */
const routed = new Set([...PLUGIN.matchAll(/path: "([^"]+)"/g)].map((m) => m[1]));

/**
 * Only the homepage was rendered to static HTML. Every other public page
 * shipped a head, a hidden link index and an empty div.
 *
 * Googlebot executes JavaScript, so it comes back and reads the page. The nine
 * AI crawlers robots.txt invites by name — GPTBot, ClaudeBot, PerplexityBot,
 * Google-Extended, CCBot and the rest — mostly do not. They were being welcomed
 * to pages with no prose on them, so there was nothing to quote or ground an
 * answer in.
 */
describe("the pages a crawler can read without running JavaScript", () => {
  it("covers the commercial pages, not just the homepage", () => {
    expect(prerendered).toContain("/");
    for (const path of [
      "/cold-email-software",
      "/ai-sdr-agent",
      "/sales-operations-software",
      "/apollo-alternative",
      "/vs-apollo",
      "/vs-instantly",
      "/vs-lusha",
      "/vs-zoominfo",
      "/vs-rocketreach",
      "/pricing",
    ]) {
      expect(prerendered, path).toContain(path);
    }
  });

  it("only prerenders a path the plugin actually emits a file for", () => {
    // The script injects into dist/<path>/index.html. A path with no emitted
    // file has nothing to inject into, and the build would report it as a
    // failure rather than shipping it.
    for (const path of prerendered) {
      expect(routed, `${path} is prerendered but has no route in the SEO plugin`).toContain(path);
    }
  });

  it("never prerenders a path robots.txt tells crawlers to skip", () => {
    const disallowed = [...ROBOTS.matchAll(/^Disallow: (\S+)$/gm)].map((m) => m[1]);
    for (const path of prerendered) {
      for (const rule of disallowed) {
        const blocked = rule.endsWith("*") ? path.startsWith(rule.slice(0, -1)) : path === rule;
        expect(blocked, `${path} is prerendered but disallowed by "${rule}"`).toBe(false);
      }
    }
  });

  it("walks the list rather than hardcoding one page", () => {
    expect(SCRIPT).toContain("for (const route of prerenderablePaths)");
    expect(SCRIPT).not.toContain('render("/")');
  });

  it("leaves a page alone rather than replacing it with a stub", () => {
    // A page that renders almost nothing did not mount the way it does in the
    // browser. Overwriting real markup with that is worse than not trying.
    expect(SCRIPT).toContain("appHtml.length < 500");
    expect(SCRIPT).toContain("failures.push");
  });

  it("cannot break a deploy over a page that fails to prerender", () => {
    // A page that fails here ships exactly as `vite build` produced it, which
    // is what it shipped as before any of this. Losing a deploy is a worse
    // outcome than losing a prerender, so only the homepage — whose prerender
    // was already a build requirement — is allowed to fail the build.
    expect(SCRIPT).toContain('failures.some((f) => f.startsWith("/:"))');
  });

  it("does fail the build when nothing prerendered at all", () => {
    // "Fails soft" and "silently does nothing" are one bad refactor apart. If
    // the SSR bundle stops exporting a working render, every page fails the
    // same way at once and a green build would go on shipping empty shells,
    // with the evidence buried in a deploy log nobody reads.
    expect(SCRIPT).toContain("if (done === 0) {");
    const afterLoop = SCRIPT.slice(SCRIPT.indexOf("console.log(`[prerender] Prerendered"));
    expect(afterLoop.match(/process\.exit\(1\)/g) ?? []).toHaveLength(2);
  });

  it("keeps the crawler link index outside the hydration root", () => {
    // React clears #root on mount, so the internal links have to sit beside it
    // to survive for crawlers that do run the bundle.
    expect(SCRIPT).toContain('data-prerendered="true"');
    expect(SCRIPT).toContain('aria-label="Site index"');
  });

  it("prerenders nothing that depends on who is signed in", () => {
    // A prerendered page is one file served to everyone, so a page that reads a
    // session would bake one visitor's state into it.
    const imports = ENTRY.slice(0, ENTRY.indexOf("const PageLoader"));
    expect(imports).not.toMatch(/supabase/i);
    expect(imports).not.toMatch(/from "\.\/hooks\//);
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { COMPETITORS } from "@/data/competitors";

const ENTRY = readFileSync("src/entry-server.tsx", "utf8");
const PLUGIN = readFileSync("vite-plugin-seo-routes.ts", "utf8");
const SCRIPT = readFileSync("scripts/prerender.mjs", "utf8");
const ROBOTS = readFileSync("public/robots.txt", "utf8");

/**
 * The paths in entry-server's PAGES map.
 *
 * The alternative pages are added to it in a loop rather than written out, so
 * reading the literal block alone would leave eight pages unchecked by
 * everything below.
 */
const prerendered = (() => {
  const block = ENTRY.slice(
    ENTRY.indexOf("const PAGES"),
    ENTRY.indexOf("export const prerenderablePaths"),
  );
  const literal = [...block.matchAll(/"([^"]+)":/g)].map((m) => m[1]);
  const generated = ENTRY.includes("PAGES[`/alternatives/${tool.slug}`]")
    ? COMPETITORS.map((tool) => `/alternatives/${tool.slug}`)
    : [];
  return [...literal, ...generated];
})();

/**
 * Every path the SEO plugin emits a per-route HTML file and a sitemap entry
 * for. The alternative pages are built from a template literal over the same
 * competitor table, so they are reconstructed here rather than scraped.
 */
const routed = new Set([
  ...[...PLUGIN.matchAll(/path: "([^"]+)"/g)].map((m) => m[1]),
  ...(PLUGIN.includes("path: `/alternatives/${tool.slug}`")
    ? COMPETITORS.map((tool) => `/alternatives/${tool.slug}`)
    : []),
]);

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

  it("covers every alternative page, which are the highest-intent of the lot", () => {
    // "{tool} alternative" is searched by someone who has already decided to
    // leave. Shipping those as an empty shell to the crawlers that answer that
    // question would waste the whole point of having them.
    for (const tool of COMPETITORS) {
      expect(prerendered, tool.slug).toContain(`/alternatives/${tool.slug}`);
    }
  });

  it("gives a page that reads a route param something to read it from", () => {
    // A component rendered directly under StaticRouter has no matched route, so
    // useParams() returns nothing. AlternativeTo would have seen an empty slug,
    // fallen through to its redirect, and prerendered to nothing at all.
    expect(ENTRY).toContain('pattern: "/alternatives/:slug"');
    expect(ENTRY).toContain("<Route path={pattern ?? url}");
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

  it("does fail the build when every page but the homepage failed", () => {
    // Counted without the homepage on purpose: the homepage is guarded
    // separately, so a bare "nothing rendered" check could never fire. The
    // systemic case is a broken route map or output path, where the homepage
    // still renders and all thirteen others stop — which is exactly the state
    // this set out to fix, and a green build would hide it.
    expect(SCRIPT).toContain("const othersDone = done - 1;");
    expect(SCRIPT).toContain("others.length > 0 && othersDone === 0");
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

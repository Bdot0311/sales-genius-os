import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const TOML = readFileSync(new URL("../../netlify.toml", import.meta.url), "utf8");

/** Redirect rules in file order, so ordering can be asserted. */
const rules = [...TOML.matchAll(/\[\[redirects\]\]\s*\n\s*from\s*=\s*"([^"]+)"\s*\n\s*to\s*=\s*"([^"]+)"\s*\n\s*status\s*=\s*(\d+)/g)]
  .map((m) => ({ from: m[1], to: m[2], status: Number(m[3]) }));

const find = (from: string) => rules.find((r) => r.from === from);

/**
 * 316 of 416 visits arrived with no UTM and no referrer. Mobile apps strip the
 * referrer, so the tag has to be IN the link — nothing running on the site can
 * add one after the fact. These make tagging automatic without composing a UTM
 * by hand.
 */
describe("short links tag the source server-side", () => {
  it("maps the named channels", () => {
    for (const [slug, source] of [["/l/li", "linkedin"], ["/l/x", "x"], ["/l/rd", "reddit"], ["/l/nl", "newsletter"]]) {
      expect(find(slug)?.to, slug).toContain(`utm_source=${source}`);
    }
  });

  it("accepts any slug, so a new channel needs no setup", () => {
    // Going on a podcast tomorrow: post /l/acmepodcast and it arrives tagged.
    const catchAll = find("/l/:source");
    expect(catchAll?.to).toContain("utm_source=:source");
  });

  it("supports deep links, not just the homepage", () => {
    expect(find("/l/li/*")?.to).toContain("/:splat?");
    expect(find("/l/:source/*")?.to).toContain("/:splat?");
  });

  it("puts the deep-link catch-all before the bare one", () => {
    // Netlify matches in file order; the bare rule would otherwise swallow it.
    const deep = rules.findIndex((r) => r.from === "/l/:source/*");
    const bare = rules.findIndex((r) => r.from === "/l/:source");
    expect(deep).toBeGreaterThan(-1);
    expect(deep).toBeLessThan(bare);
  });

  it("puts every named channel before the catch-all", () => {
    // Otherwise /l/li would tag utm_source=li instead of linkedin.
    const catchAll = rules.findIndex((r) => r.from === "/l/:source/*");
    for (const slug of ["/l/li", "/l/x", "/l/rd", "/l/nl", "/l/em", "/l/dm"]) {
      expect(rules.findIndex((r) => r.from === slug), slug).toBeLessThan(catchAll);
    }
  });

  it("redirects temporarily, never permanently", () => {
    // A 301 gets cached by browsers and CDNs, freezing a campaign value we may
    // want to change later.
    for (const r of rules.filter((x) => x.from.startsWith("/l/"))) {
      expect(r.status, r.from).toBe(302);
    }
  });

  it("runs before the SPA fallback", () => {
    // A catch-all serving index.html first would make every short link a 200
    // with no redirect at all.
    const firstShortlink = TOML.indexOf('from = "/l/li"');
    const spaFallback = TOML.lastIndexOf('from = "/*"');
    expect(firstShortlink).toBeGreaterThan(-1);
    if (spaFallback > -1) expect(firstShortlink).toBeLessThan(spaFallback);
  });
});

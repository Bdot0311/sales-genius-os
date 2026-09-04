/**
 * Deciding which pages of a prospect's site are worth reading.
 *
 * The scrape used to guess: homepage plus nine hard-coded paths, first six that
 * returned HTML, four thousand characters each. That reads whatever a company
 * happened to name conventionally and misses everything else — and, more
 * importantly, it has no idea which of those pages is NEW.
 *
 * That last part is why so many briefs came back undated. The whole dating
 * apparatus in lead-research.ts exists because an undated fact cannot be opened
 * on ("saw the WeAre acquisition" nine months late), and it was starved: a
 * marketing site states a date inside the copy maybe one page in five, so most
 * observations carried "" and the writer was told not to imply recency. The
 * research was accurate and unusable at the same time.
 *
 * A sitemap carries <lastmod> for every URL on the site. That is the site
 * telling us, in a machine-readable field, what it changed and when — the exact
 * thing the copy needs and the exact thing guessing at paths can never supply.
 *
 * So discovery works in three passes:
 *   1. robots.txt for wherever the sitemap actually lives,
 *   2. the sitemap (or sitemap index) for URLs and their lastmod dates,
 *   3. the guessed paths, as a floor for sites with no sitemap at all.
 *
 * Everything here is pure. The fetching lives in research-lead; this decides
 * what to fetch and in what order, which is the part worth testing.
 */

export interface DiscoveredPage {
  url: string;
  /** ISO date from <lastmod>, or "" when the sitemap gave none. */
  lastmod: string;
  /** Why this page was picked, for the brief's own audit trail. */
  reason: string;
  /** Higher wins. */
  score: number;
}

/**
 * Path shapes worth reading, and what each is worth.
 *
 * Careers is first on purpose. What a company is hiring for right now is the
 * strongest thing on its own website: it is dated, it is specific, it says what
 * they are building before the marketing pages do, and — unlike a homepage —
 * two companies in the same category never have the same one. It sat in the
 * old candidate list below /pricing and /product and was routinely crowded out
 * by the six-page cap.
 */
const PATH_WEIGHTS: { pattern: RegExp; score: number; reason: string }[] = [
  { pattern: /\/(careers?|jobs?|join-us|work-with-us|hiring)(\/|$)/i, score: 100, reason: "hiring" },
  { pattern: /\/(changelog|releases?|whats-new|release-notes)(\/|$)/i, score: 95, reason: "changelog" },
  { pattern: /\/(news|press|newsroom|announcements?)(\/|$)/i, score: 90, reason: "news" },
  { pattern: /\/(blog|posts?|articles?|insights)(\/|$)/i, score: 75, reason: "blog" },
  { pattern: /\/(customers?|case-stud(y|ies)|success-stories)(\/|$)/i, score: 70, reason: "customers" },
  { pattern: /\/(pricing|plans)(\/|$)/i, score: 65, reason: "pricing" },
  { pattern: /\/(product|platform|solutions?|features?)(\/|$)/i, score: 55, reason: "product" },
  { pattern: /\/(about|company|team|who-we-are)(\/|$)/i, score: 50, reason: "about" },
  { pattern: /\/(integrations?|partners?)(\/|$)/i, score: 40, reason: "integrations" },
  { pattern: /\/(docs?|documentation|api)(\/|$)/i, score: 25, reason: "docs" },
];

/** Never worth a fetch: legal boilerplate identical at every company. */
const SKIP = /\/(privacy|terms|legal|cookie|gdpr|dpa|sitemap|login|signin|signup|register|cart|checkout|search|tag|category|author)(\/|$|\.)/i;

/** File extensions that are not pages. */
const NON_PAGE = /\.(pdf|jpe?g|png|gif|svg|webp|ico|css|js|json|xml|zip|mp4|webm|woff2?)$/i;

/** How much a recent lastmod is worth, on top of the path's own score. */
export function recencyBonus(lastmod: string, now: Date = new Date()): number {
  if (!lastmod) return 0;
  const t = Date.parse(lastmod);
  if (!Number.isFinite(t)) return 0;
  const days = (now.getTime() - t) / 86_400_000;
  if (days < 0) return 0;
  // A page changed this month is the reason to write today. One changed two
  // years ago is no more interesting than an undated one.
  if (days <= 30) return 60;
  if (days <= 90) return 40;
  if (days <= 180) return 20;
  if (days <= 365) return 8;
  return 0;
}

/** Sitemap URLs found in robots.txt, in the order it lists them. */
export function sitemapsFromRobots(robotsTxt: string, origin: string): string[] {
  const out: string[] = [];
  for (const line of String(robotsTxt ?? "").split(/\r?\n/)) {
    const m = line.match(/^\s*sitemap\s*:\s*(\S+)/i);
    if (!m) continue;
    const raw = m[1];
    // Only an absolute http(s) URL or a rooted path. `new URL` happily
    // resolves anything else against the origin — "ht!tp://[[[" comes back as
    // https://host/ht!tp://[[[ , a same-origin URL that looks legitimate and
    // is not. Refused here rather than fetched and discarded.
    if (!/^https?:\/\//i.test(raw) && !raw.startsWith("/")) continue;
    try {
      const u = new URL(raw, origin);
      if (u.protocol !== "https:" && u.protocol !== "http:") continue;
      if (!out.includes(u.href)) out.push(u.href);
    } catch {
      // A malformed Sitemap: line is the site's problem, not a reason to stop.
    }
  }
  return out.slice(0, 5);
}

export interface SitemapEntry {
  url: string;
  lastmod: string;
}

/**
 * <loc> and <lastmod> pairs out of a sitemap or a sitemap index.
 *
 * Deliberately regex rather than an XML parser: sitemaps in the wild carry
 * stray namespaces, BOMs and unescaped ampersands that a strict parser refuses,
 * and refusing the whole file over one bad entry loses every good one.
 */
export function parseSitemap(xml: string): SitemapEntry[] {
  const out: SitemapEntry[] = [];
  const blocks = String(xml ?? "").match(/<(?:url|sitemap)\b[\s\S]*?<\/(?:url|sitemap)>/gi) ?? [];
  for (const block of blocks) {
    const loc = block.match(/<loc>\s*([\s\S]*?)\s*<\/loc>/i)?.[1];
    if (!loc) continue;
    const lastmod = block.match(/<lastmod>\s*([\s\S]*?)\s*<\/lastmod>/i)?.[1] ?? "";
    out.push({
      url: loc.replace(/&amp;/g, "&").trim(),
      lastmod: lastmod.trim(),
    });
  }
  return out;
}

/** True when the document is an index pointing at further sitemaps. */
export function isSitemapIndex(xml: string): boolean {
  return /<sitemapindex\b/i.test(String(xml ?? ""));
}

/**
 * Rank discovered URLs, keeping only pages on the prospect's own domain.
 *
 * The homepage is always first and is not scored — it is the one page that is
 * read for orientation rather than for a fact.
 */
export function rankPages(
  entries: SitemapEntry[],
  origin: string,
  limit: number,
  now: Date = new Date(),
): DiscoveredPage[] {
  let host: string;
  try {
    host = new URL(origin).hostname.replace(/^www\./, "");
  } catch {
    return [];
  }

  const seen = new Set<string>();
  const scored: DiscoveredPage[] = [];

  for (const entry of entries) {
    let u: URL;
    try {
      u = new URL(entry.url, origin);
    } catch {
      continue;
    }
    if (u.protocol !== "https:" && u.protocol !== "http:") continue;
    if (u.hostname.replace(/^www\./, "") !== host) continue;

    const path = u.pathname;
    if (path === "/" || path === "") continue; // the homepage is added by the caller
    if (SKIP.test(path) || NON_PAGE.test(path)) continue;

    const key = u.href.replace(/\/$/, "");
    if (seen.has(key)) continue;
    seen.add(key);

    const weight = PATH_WEIGHTS.find((w) => w.pattern.test(path));
    const bonus = recencyBonus(entry.lastmod, now);
    // A page matching no known shape is still worth reading when the site says
    // it changed this month — that is usually a launch post under a path
    // nobody would guess.
    const base = weight?.score ?? (bonus >= 40 ? 30 : 0);
    if (base === 0) continue;

    // Depth penalty: /blog is the index, /blog/a/b/c/d is an archive leaf.
    const depth = path.split("/").filter(Boolean).length;
    const score = base + bonus - Math.max(0, depth - 2) * 6;

    scored.push({
      url: u.href,
      lastmod: entry.lastmod,
      reason: weight?.reason ?? "recently changed",
      score,
    });
  }

  scored.sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));

  // One page per reason before a second of anything.
  //
  // Sorting on score alone hands back five blog posts from a company that
  // blogs weekly, and no careers page — the shape of the site decides the
  // brief instead of what a rep can use. A first pass takes the best of each
  // kind; a second fills what is left.
  const picked: DiscoveredPage[] = [];
  const usedReasons = new Set<string>();
  for (const page of scored) {
    if (picked.length >= limit) break;
    if (usedReasons.has(page.reason)) continue;
    usedReasons.add(page.reason);
    picked.push(page);
  }
  for (const page of scored) {
    if (picked.length >= limit) break;
    if (picked.includes(page)) continue;
    picked.push(page);
  }
  return picked;
}

/** The guessed paths, used when a site publishes no sitemap at all. */
export const FALLBACK_PATHS = [
  "/careers",
  "/jobs",
  "/changelog",
  "/about",
  "/blog",
  "/news",
  "/customers",
  "/pricing",
  "/product",
  "/case-studies",
];

/**
 * What the model is told about when each page last changed.
 *
 * Handed over as a labelled line per page rather than folded into the text,
 * because the date belongs to the page and the model must not attach it to a
 * fact that came from a different one.
 */
export function lastmodNote(pages: DiscoveredPage[], now: Date = new Date()): string {
  const dated = pages.filter((p) => p.lastmod && Number.isFinite(Date.parse(p.lastmod)));
  if (!dated.length) return "";
  const lines = dated.map((p) => {
    const days = Math.floor((now.getTime() - Date.parse(p.lastmod)) / 86_400_000);
    const when = days <= 0 ? "today" : days === 1 ? "yesterday" : days < 60 ? `${days} days ago` : `${Math.round(days / 30)} months ago`;
    return `- ${p.url} — last changed ${p.lastmod.slice(0, 10)} (${when})`;
  });
  return (
    "PAGE CHANGE DATES, from the site's own sitemap. This is when the PAGE was edited, " +
    "which dates anything that page announces. Use it for the `occurred` field when the copy " +
    "itself states no date, and never use it to date a fact you read on a different page:\n" +
    lines.join("\n")
  );
}

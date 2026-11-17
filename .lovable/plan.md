# Apply the SEO foundations guide to OutReign

Much of the guide is already done (articles readable without JavaScript, sitemap, Google Search Console, blog structured data, AI discovery files). This plan covers the remaining gaps, as the guide recommends: audit first, then small evidenced fixes. No new articles are written.

## 1. Crawl and index audit (report + fixes)
- Check homepage, pricing, /connect, /vs-* pages and 3 blog posts: status code, canonical, noindex, title, H1, description, rendered text.
- Confirm www vs non-www and http vs https all redirect to one version, and canonicals agree.
- Save findings with URLs and evidence to `docs/seo-foundations-audit.md`.

## 2. Search and AI crawler access
- Add an explicit `OAI-SearchBot` (ChatGPT search) allow rule in robots.txt; keep training opt-out (`ai-train=no`) as is.
- Confirm Googlebot, Bingbot and OAI-SearchBot are not blocked by the Cloudflare bot settings for public pages (report only; no firewall changes without your approval).

## 3. Sitemap clean-up
- Compare sitemap against indexable pages: remove redirected URLs (e.g. /apollo-alternative), sign-in/dashboard routes and duplicates; add any missing public guides.
- Make `lastmod` reflect real content update dates, not build time.

## 4. Structured data
- Verify Organization (homepage), BlogPosting + BreadcrumbList (articles), only with real visible facts. No ratings or reviews (no real users yet).
- Add author and honest published/updated dates where the article template lacks them.

## 5. Internal links
- Find guides with no links pointing to them and add links from related guides/pages with descriptive text.

## 6. Mobile speed check
- Run Lighthouse on homepage, pricing and one article (mobile). Fix only the largest real causes found (image sizes, layout shift, unnecessary scripts), then retest. Record before/after.

## 7. Bing Webmaster Tools
- Connect Bing Webmaster Tools (you'll see a connect card), import or verify the site, submit the sitemap, and check crawl issues.
- After publishing, submit the sitemap to Google Search Console too.

## Not included
- Writing new articles, buying tools, or changing firewall rules without approval.
- The public `/integrations` path is the signed-in dashboard page, so its robots block stays.

## Technical notes
- robots: `public/robots.txt`; sitemap generator and article snapshots per AGENTS.md (curated revisions take priority).
- JSON-LD in `src/components/seo/StructuredData.tsx` and prerender output.
- Lighthouse via Playwright/Chromium against localhost; production checks via curl.
- Changes need publishing to reach Google/Bing.

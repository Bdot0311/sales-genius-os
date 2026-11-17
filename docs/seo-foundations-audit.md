# SEO foundations audit (2026-11-17)

Checked against the live site with curl.

- HTTPS and one preferred host: `http://` 301 and `www` 302 to `https://outreign.io/`. (www uses 302; a 301 in Cloudflare would be cleaner.)
- Key pages return 200: `/`, `/pricing`, `/connect`, articles.
- Articles: one H1, self canonical, no noindex, Article + BreadcrumbList + Organization JSON-LD with author and dateModified.
- Crawlers: Bingbot and OAI-SearchBot user agents receive 200 on public pages. Explicit OAI-SearchBot rule added to robots.txt; AI training opt-out unchanged.
- Sitemap: 128 URLs, legacy `/apollo-alternative` redirect excluded. Fixed: pages without a real content date no longer get the build date as `lastmod`.
- Not checked: Cloudflare firewall logs for real crawler traffic, Core Web Vitals field data (needs Search Console data), real-phone test.

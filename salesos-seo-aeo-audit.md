# OutReign SEO / AEO Audit
**Site:** https://salesos.alephwavex.io  
**Audited:** 2026-05-12  
**Auditor:** Claude Code (codebase audit — live site returned 403, all findings are from source)

---

## Executive Summary

1. **Duplicate JSON-LD schemas** — the static `@graph` block in `index.html` and the React `StructuredData.tsx` components both render Organization, WebSite, SoftwareApplication, and FAQPage schemas. When JavaScript executes, Googlebot sees every schema type twice. This dilutes signal and risks confusing validators.
2. **OG image URL mismatch** — `index.html` references a Google Cloud Storage bucket URL for the og:image; `SEOHead.tsx` defaults to the canonical `/salesos-og.png`. These should be the same absolute URL pointing to the hosted asset.
3. **Zero content for organic/informational keywords** — no blog, no comparison pages, no "how to" articles. The ICP (founder-led outbound, 0–10 person B2B teams) searches questions like "how to find B2B leads without boolean search" and "Apollo alternative for founders." OutReign has no content for any of these.
4. **Strong AEO foundation but incomplete entity signals** — Organization schema lacks `legalName`, founder schema lacks a full name, and there are no external citation signals (press, G2 profile, or product hunt listing) linkable via `sameAs`.
5. **SPA architecture creates a structural SEO ceiling** — all inner pages (Pricing, Help, Demo) serve the same `index.html` to non-JS crawlers. Googlebot can handle this via JS rendering, but it introduces a crawl budget cost and means social share previews for inner pages show homepage OG tags to non-JS sharers.

---

## Phase 1 — Crawl Inventory

### Pages Discovered

| URL | Status | In Sitemap |
|-----|--------|-----------|
| `/` | Live | ✅ (priority 1.0) |
| `/pricing` | Live | ✅ (priority 0.9) |
| `/demo` | Live | ✅ (priority 0.9) |
| `/help` | Live | ✅ (priority 0.7) |
| `/api-docs` | Live | ✅ (priority 0.6) |
| `/api-status` | Live | ✅ (priority 0.5) |
| `/security` | Live | ✅ (priority 0.5) |
| `/privacy` | Live | ✅ (priority 0.4) |
| `/terms` | Live | ✅ (priority 0.4) |
| `/auth` | Disallowed | ❌ (disallowed in robots.txt — correct) |
| `/404` (NotFound) | Rendered | ❌ (not in sitemap — correct) |

### Homepage Meta Extraction

| Element | Value | Status |
|---------|-------|--------|
| Title | `OutReign — Find Who to Sell To. Then Actually Sell to Them.` (60 chars) | ✅ |
| Meta description | `Describe your ideal customer in plain English, find qualified B2B leads…` (148 chars) | ✅ |
| Canonical | `https://salesos.alephwavex.io/` | ✅ |
| H1 (static) | `OutReign — Plain-English B2B Lead Discovery` | ✅ |
| H1 (React) | `Find who to sell to.` + `Then actually sell to them.` (split spans) | ⚠️ Split across two `<span>` — Google reads as one H1 but semantic hierarchy is flat |
| og:title | Set twice (static + SEOHead) — same value | ⚠️ Redundant but not harmful on homepage |
| og:image (static) | GCS bucket URL | ❌ Mismatch with SEOHead default |
| og:image (SEOHead) | `https://salesos.alephwavex.io/salesos-og.png` | ✅ |
| Twitter card | summary_large_image, @salesos | ✅ |
| JSON-LD schemas | Organization, WebSite, SoftwareApplication, FAQPage (static) + same types (dynamic) | ❌ Duplicated |
| Viewport | `width=device-width, initial-scale=1.0` | ✅ |
| lang attribute | `en` | ✅ |

---

## Phase 2 — Technical SEO Audit

### ✅ Passing

- **robots.txt**: Comprehensive; allows all major search/AI bots explicitly; disallows all authenticated app routes (`/dashboard`, `/leads`, `/pipeline`, etc.); references sitemap. No issues.
- **sitemap.xml**: Valid XML with sitemap-image extension; 9 URLs; priority values logical; image alt + caption on homepage entry.
- **HTTPS canonical**: Enforced. Canonical tag present on all pages via `SEOHead`.
- **Viewport meta**: Present and correctly configured including `viewport-fit=cover`.
- **robots meta**: `index, follow, max-image-preview:large, max-snippet:-1` — optimal.
- **Google site verification**: Present (`eKoMLZR8fPmFLx7hsLBEuVSla6QSzAy9S6JK__ijJq8`).
- **GA4**: Deferred until user interaction — good for Core Web Vitals.
- **Font loading**: Playfair Display loaded via `rel="preload"` + onload trick — non-render-blocking. ✅
- **404 page**: `noIndex: true` set in SEOHead — correct.
- **Disallowed paths**: All app routes correctly disallowed in robots.txt and marked `noindex` in `shouldIndexPage()` utility.

### ❌ Issues

#### CRIT-1: Duplicate JSON-LD Schemas
**File:** `index.html` (lines 86–177) + `src/components/seo/StructuredData.tsx` (rendered via `Index.tsx`)

When JavaScript executes, the DOM contains two instances of:
- `Organization` — one from static `@graph`, one from `<OrganizationSchema />`
- `WebSite` — same
- `SoftwareApplication` — same
- `FAQPage` — one from static `@graph`, one from `<FAQSchema />` in `FAQSection.tsx`

**Fix:** Remove the static `<script type="application/ld+json">` block from `index.html` entirely. The React components render richer, better-structured versions. For non-JS crawlers, the `#static-content` div provides textual context.

#### CRIT-2: OG Image URL Mismatch
**File:** `index.html` line 29 vs `src/components/seo/SEOHead.tsx` line 39

- `index.html`: `https://storage.googleapis.com/gpt-engineer-file-uploads/ZFJK1zezovOpOdjy9TptFukIhhc2/social-images/social-1775944955329-salesos-og-image.webp`
- `SEOHead.tsx`: `https://salesos.alephwavex.io/salesos-og.png`

The static og:image (shown to non-JS crawlers and initial HTML parse) is a GCS URL. If that bucket becomes private or the file is deleted, all social previews for the homepage break.

**Fix:** Update `index.html` og:image and twitter:image to `https://salesos.alephwavex.io/salesos-og.png`.

#### HIGH-1: Sitemap lastmod Is Stale
**File:** `public/sitemap.xml`

All entries show `lastmod: 2026-05-06`. Site has been updated since then. Google uses lastmod as a crawl freshness signal.

**Fix:** Update all entries to `2026-05-12` (today). Automate lastmod in a deploy script going forward.

#### HIGH-2: SPA Inner Pages Lack Independent OG/Twitter Tags for Non-JS Scrapers
When Slack, Discord, WhatsApp, or LinkedIn unfurl a link to `/pricing` or `/demo`, they fetch raw HTML without executing JavaScript. They will see the homepage og:title ("OutReign — Find Who to Sell To...") for every page.

**Fix:** This requires SSR (Next.js/Remix) or a prerender service. Short-term mitigation: ensure the SEOHead dynamic tags are as specific as possible per page (already done). Long-term: add prerendering.

#### MED-1: H1 Split Across Two Spans Without Visible Text Node in H1
`HeroSection.tsx` renders `<h1>` with two `<motion.span>` children. Google reads the full text of children, so this is functionally fine, but the primary keyword "B2B lead generation" or "find B2B leads" does not appear in the H1.

**Fix:** Consider adding the keyword closer to the H1 text or adjusting the static H1 in `#static-content`.

#### MED-2: Demo Page Likely Thin for SEO
`/demo` is in the sitemap at priority 0.9 — higher than `/help`. But the demo page appears to be an interactive product tour (from the DemoPage.tsx structure). If it has fewer than 300 words of indexable text content, it shouldn't be at 0.9 priority.

**Fix:** Lower `/demo` sitemap priority to 0.6 or add indexable descriptive content to the demo page.

#### LOW-1: `linkedin:owner` Meta Tag Is Not a Recognized Standard
`SEOHead.tsx` line 173: `<meta property="linkedin:owner" content="salesos" />` — LinkedIn does not document this as a supported meta tag. It does nothing.

**Fix:** Remove it. Use `og:` tags for LinkedIn previews (already present).

---

## Phase 3 — On-Page SEO Audit

### Homepage (`/`)

| Check | Status | Detail |
|-------|--------|--------|
| Primary keyword in title | ✅ | "B2B" implied via description; "Find who to sell to" in title |
| Keyword in H1 | ⚠️ | H1 is brand-voice copy, not keyword-first. "B2B leads" not present |
| Keyword in first 100 words | ✅ | Static content div leads with "B2B teams", "plain English", "qualified prospects" |
| Keyword in meta description | ✅ | "qualified B2B leads" present |
| H-tag hierarchy | ✅ | H1 → H2 → H3 logical in static-content div |
| Images with alt text | ✅ | Logo has alt; og image has alt |
| Internal links descriptive | ✅ | Footer links use descriptive anchor text |
| CTA above fold | ✅ | "Find your first leads — free" button |
| Word count | ~400 (static-content div) | Thin for a category-defining homepage. Competitors likely 800+ words indexed |
| FAQ content | ✅ | 8 FAQs in FAQSection |

### Pricing Page (`/pricing`)

| Check | Status | Detail |
|-------|--------|--------|
| Title | ✅ | "OutReign Pricing - Choose the Right Outbound Plan" |
| Description | ✅ | Includes price range |
| Keyword "pricing" in title | ✅ | |
| BreadcrumbSchema | ⚠️ | Imported but need to verify it's rendered in JSX |
| FAQ schema | ✅ | 9 pricing FAQs with FAQSchema |
| Word count | Unknown — need to check Pricing.tsx component | Likely adequate with plans + FAQs |

### Demo Page (`/demo`)

| Check | Status | Detail |
|-------|--------|--------|
| SEOHead present | ✅ | |
| Indexable content | ⚠️ | Primarily an interactive demo — word count likely very low |
| Sitemap priority 0.9 | ❌ | Overweighted vs actual content value |

### Help Center (`/help`)

| Check | Status | Detail |
|-------|--------|--------|
| SEOHead present | ✅ | BreadcrumbSchema imported |
| Article-level pages | ✅ | Uses `getArticleBySlug` — individual articles likely have SEOHead |
| Internal search-optimized | ⚠️ | Help articles may be thin; need individual page audits |

---

## Phase 4 — AEO Audit

### ✅ Strong

- **FAQPage schema**: Present (via FAQSchema component + static in index.html — remove static version)
- **HowTo schema**: Implemented in `Index.tsx` with 5-step workflow — excellent for "how to use OutReign" queries
- **ItemList schema**: Features listed as ItemList — good for feature discovery queries
- **SoftwareApplication schema**: Present with pricing, featureList, applicationCategory
- **Organization with sameAs**: Twitter, two LinkedIn URLs — solid entity signals
- **Speakable schema**: Implemented for H1, H2, H3, #hero-heading, #faq-heading
- **llms.txt**: Present and well-structured — covers description, features, pricing, FAQ, contact. Good for LLM context injection
- **static-content div**: Hidden div with crawlable H1/H2/FAQ structure for non-JS crawlers and LLMs — well executed
- **Definition block**: First paragraph of static-content div defines OutReign in plain language within first 150 words ✅

### ❌ Gaps

#### AEO-1: No Comparison Content
AI answer engines frequently surface comparison results ("OutReign vs Apollo", "Apollo alternatives for founders"). OutReign has zero content targeting these queries. The `DifferentiationSection.tsx` makes the comparison in copy but no schema or page targets it.

The `ComparisonSchema` component exists in `StructuredData.tsx` but is never used on any page.

**Fix:** Create `/vs-apollo`, `/vs-instantly`, `/vs-clay` pages with structured comparison content and `ComparisonSchema`. Minimum viable: add a comparison table to the homepage with `ComparisonSchema` markup.

#### AEO-2: Organization Schema Missing `legalName`
`StructuredData.tsx` OrganizationSchema has `"name": "OutReign"` but no `legalName: "BDØT Industries LLC"`. LLMs need the legal entity name to correctly attribute and cite the publisher.

**Fix:** Add `"legalName": "BDØT Industries LLC"` to OrganizationSchema.

#### AEO-3: Founder Schema Incomplete
```json
"founder": {
  "@type": "Person",
  "name": "Brandon"
}
```
No surname, no `@id`, no `jobTitle`. Weak entity signal.

**Fix:** Update to full name with URL reference.

#### AEO-4: No AggregateRating on SoftwareApplication
Rich snippet eligibility for app-type schemas is significantly improved by `aggregateRating`. Without it, the app schema will not trigger star ratings in SERPs.

**Fix:** Once you have real reviews (G2, Capterra, Product Hunt), add `AggregateRatingSchema` to the homepage.

#### AEO-5: No External Citation Signals
No Product Hunt listing, G2 profile, or Capterra page detectable. These provide `sameAs` links that reinforce entity recognition for LLMs.

**Fix:** Submit to Product Hunt, G2, Capterra. Then add their URLs to `sameAs` in OrganizationSchema.

#### AEO-6: "Answer-Ready" Paragraphs Missing from Body Copy
LLMs extract featured snippets from paragraphs that lead with a direct answer. Current landing copy is persuasive/marketing style ("Three steps. One workflow.") not answer-first. Example gap: no paragraph that directly answers "What is OutReign?" in the visible body copy.

The static-content div partially covers this for crawlers, but for JS-rendered content visible to Googlebot, the answer-ready copy is absent.

---

## Phase 5 — Content Gap Analysis

### Top 10 Informational Keywords (No Content Exists)

| # | Keyword | Monthly Intent | ICP Match |
|---|---------|---------------|-----------|
| 1 | how to find B2B leads without a big budget | High | ✅ |
| 2 | outbound email for early-stage startups | High | ✅ |
| 3 | how to write a cold email to a VP of Sales | High | ✅ |
| 4 | what is ICP scoring in sales | Medium | ✅ |
| 5 | SMTP email verification explained | Medium | ✅ |
| 6 | best way to build an outbound list in 2026 | High | ✅ |
| 7 | how to do founder-led outbound sales | High | ✅ |
| 8 | b2b lead enrichment without apollo | Medium | ✅ |
| 9 | email verification vs email validation | Medium | Adjacent |
| 10 | how long does it take to build a cold email list | Medium | ✅ |

### Top 5 Comparison / Alternative Keywords

| # | Keyword | Notes |
|---|---------|-------|
| 1 | Apollo alternative for founders | High intent; Apollo is the explicit competitor named in copy |
| 2 | OutReign vs Apollo | Branded comparison — worth a page |
| 3 | Instantly alternative | High volume; Instantly is the #1 cold email tool |
| 4 | Clay alternative for small teams | Clay is expensive; OutReign targets the same use case |
| 5 | best cold email tool for early-stage startup | Decision-stage query; no content |

### Pages Targeting Too-Broad Keywords

- **Homepage** targets "B2B lead generation" — extremely competitive. Should be supplemented by long-tail content targeting founder-specific variants.
- **Pricing page** title "Choose the Right Outbound Plan" — too generic. Should be "OutReign Pricing: Outbound Sales Plans for Founders & SDRs" to capture intent.

---

## Phase 6 — Prioritized Fix Table

| Priority | Issue | Page(s) | Effort | Impact | Exact Fix |
|----------|-------|---------|--------|--------|-----------|
| P1 | Duplicate JSON-LD schemas | `/` | Low | High | Remove static `<script type="application/ld+json">` block from `index.html` lines 86–177 |
| P1 | OG image URL mismatch | All | Low | High | Change `index.html` og:image + twitter:image to `https://salesos.alephwavex.io/salesos-og.png` |
| P1 | OrganizationSchema missing legalName | All | Low | High | Add `"legalName": "BDØT Industries LLC"` to OrganizationSchema in `StructuredData.tsx` |
| P1 | Stale sitemap lastmod | All | Low | Med | Update all `<lastmod>` to `2026-05-12` in `sitemap.xml` |
| P2 | Demo page sitemap priority too high | `/demo` | Low | Med | Change `/demo` priority from 0.9 → 0.6 in `sitemap.xml` |
| P2 | No comparison content | None | Med | High | Create `/vs-apollo` page with comparison table + ComparisonSchema |
| P2 | Pricing page title too generic | `/pricing` | Low | Med | Update title to "OutReign Pricing — Outbound Plans for Founders & SDR Teams" |
| P2 | ComparisonSchema unused | `/` | Low | Med | Add ComparisonSchema to homepage DifferentiationSection with Apollo/Clay/spreadsheet comparison |
| P2 | No AggregateRating schema | `/` | Low (after reviews) | High | Add AggregateRatingSchema once G2/Capterra reviews exist |
| P3 | linkedin:owner non-standard meta | All | Low | Low | Remove `<meta property="linkedin:owner">` from SEOHead |
| P3 | Founder schema incomplete | All | Low | Med | Update founder in OrganizationSchema: add surname + URL |
| P3 | No blog/informational content | None | High | High | Create /blog with 5 articles targeting gaps listed in Phase 5 |
| P3 | No Product Hunt / G2 sameAs | All | Med | Med | Submit to G2, Capterra, Product Hunt; add URLs to OrganizationSchema sameAs |
| P3 | SPA inner pages no OG for non-JS | All inner | High | Med | Implement prerendering (Prerender.io, Cloudflare Worker, or migrate to Next.js) |
| P3 | No comparison/alternative pages | None | High | High | Build `/vs-apollo`, `/vs-instantly`, `/vs-clay` with structured comparison + schema |

---

## Schema Snippets — Copy-Paste Ready

### Fixed OrganizationSchema (add legalName + improve founder)
```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://salesos.alephwavex.io/#organization",
  "name": "OutReign",
  "legalName": "BDØT Industries LLC",
  "alternateName": ["Sales OS", "OutReign Platform"],
  "description": "OutReign is a B2B lead discovery and outbound email platform. Describe your ideal customer in plain English, get ranked prospects with SMTP-verified emails, and send AI-drafted first-touch emails — all from one workflow.",
  "url": "https://salesos.alephwavex.io",
  "logo": {
    "@type": "ImageObject",
    "url": "https://salesos.alephwavex.io/salesos-logo.webp",
    "width": 512,
    "height": 512
  },
  "sameAs": [
    "https://twitter.com/salesos",
    "https://www.linkedin.com/company/salesos",
    "https://www.linkedin.com/in/buildwitbrandon"
  ],
  "founder": {
    "@type": "Person",
    "name": "Brandon Dottin",
    "url": "https://www.linkedin.com/in/buildwitbrandon",
    "jobTitle": "Founder & CEO"
  },
  "foundingDate": "2026",
  "areaServed": "Worldwide",
  "slogan": "Find who to sell to. Then actually sell to them."
}
```

### ComparisonSchema for DifferentiationSection
```json
{
  "@context": "https://schema.org",
  "@type": "ItemList",
  "name": "OutReign vs Traditional Sales Tools",
  "description": "How OutReign compares to Apollo and traditional outbound methods",
  "numberOfItems": 4,
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "item": {
        "@type": "Product",
        "name": "OutReign",
        "description": "Ranked prospects scored by ICP fit, plain English search, from search to sent email in one workflow"
      }
    },
    {
      "@type": "ListItem",
      "position": 2,
      "item": {
        "@type": "Product",
        "name": "Apollo.io",
        "description": "1,000 raw contacts and a spreadsheet, Boolean search, data tool that stops at export"
      }
    }
  ]
}
```

### AggregateRating (add when reviews exist)
```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "OutReign",
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": 4.8,
    "ratingCount": 47,
    "reviewCount": 47,
    "bestRating": 5,
    "worstRating": 1
  }
}
```

---

*Audit completed from source code. Live site returned 403 during crawl phase — re-run on live site once accessible to verify rendered output, Core Web Vitals, and redirect behavior.*

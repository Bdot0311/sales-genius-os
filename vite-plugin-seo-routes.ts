import type { Plugin } from "vite";
import { blogPosts } from "./src/data/blog-posts";
import { helpArticles, helpCategories } from "./src/components/help/helpArticles";

/**
 * Build-time per-route head injection.
 *
 * OutReign is a client-rendered SPA, so without this plugin every route ships
 * the same homepage <head> in the initial HTML. React 19 head hoisting (via
 * src/components/seo/SEOHead.tsx) fixes titles/canonicals for JS-executing
 * clients, but non-JS crawlers and social preview scrapers only ever see the
 * static markup. This plugin emits one static HTML file per public route with
 * the route's real title, description, canonical, and og:/twitter: tags baked
 * in, so those crawlers get correct per-route metadata.
 *
 * It is a progressive enhancement: hosts that serve /<route>/index.html for a
 * given path get the tailored head; hosts that always fall back to the root
 * index.html are no worse off than before (runtime SEOHead still corrects the
 * head for real users). Values here mirror each page's SEOHead props so the
 * build-time and runtime <head> agree.
 *
 * Content routes (blog posts, help articles and categories) are generated from
 * the same data the app renders, so prerender coverage cannot drift from the
 * content or the sitemap. Before that, only the 13 marketing routes below had
 * a head of their own and every article served the homepage's — including its
 * canonical, which is why Search Console reported a crawled blog post as
 * "Duplicate without user-selected canonical".
 *
 * Each emitted page also carries a static index of internal links. The only
 * links in the shipped HTML used to sit inside <noscript>, which Googlebot
 * ignores because it executes JavaScript, so every article was reachable from
 * the sitemap alone and sat at "Discovered - currently not indexed" with no
 * crawl. The index renders inside #root, which createRoot() replaces on mount,
 * so it costs real users nothing and mirrors the links the app itself renders.
 */

const DOMAIN = "https://outreign.io";

interface RouteMeta {
  /** Route path, e.g. "/pricing". "/" is the homepage (rewrites root index.html). */
  path: string;
  title: string;
  description: string;
}

// Titles/descriptions mirror the SEOHead props in each page component.
// Keep them in sync when a page's SEOHead title/description changes.
const ROUTES: RouteMeta[] = [
  {
    path: "/",
    title: "Your Next 100 B2B Prospects, Already Qualified",
    description:
      "Describe your customer in plain English. Get 100 ranked B2B prospects with verified emails and a first draft for each, free, with campaign setup included.",
  },
  {
    path: "/pricing",
    title: "OutReign Pricing — Outbound Plans for Founders & SDR Teams",
    description:
      "OutReign plans from $0 to $249/month. Find B2B leads, verify emails, and draft outreach without the tool sprawl. 14-day free trial on paid plans.",
  },
  {
    path: "/security",
    title: "Security & Data Protection | OutReign",
    description:
      "Learn about OutReign security practices. Enterprise-grade data protection with encryption, SOC 2 compliance, GDPR/CCPA compliance, and 24/7 monitoring.",
  },
  {
    path: "/partners",
    title: "Partners — Tools That Work Alongside OutReign",
    description:
      "Independent tools and vendors OutReign partners with. Cold email infrastructure, deliverability, and more, picked to complement your outbound workflow.",
  },
  {
    path: "/demo",
    title: "See OutReign in Action | Product Demo",
    description:
      "Watch how OutReign takes you from ICP to ranked prospects with verified emails and AI-drafted outreach in under 2 minutes.",
  },
  {
    path: "/help",
    title: "Help Center - OutReign Support & Documentation",
    description:
      "Get instant answers to your OutReign questions. Browse guides, troubleshooting tips, API documentation, and contact our support team.",
  },
  {
    path: "/sales-operations-software",
    title: "Sales Operations Software for B2B Outbound Teams | OutReign",
    description:
      "OutReign is sales operations software built for outbound B2B teams. Plain-English lead search, SMTP-verified emails, AI drafting, and reply management in one platform.",
  },
  {
    path: "/apollo-alternative",
    title: "Why Switch from Apollo | OutReign",
    description:
      "Switching from Apollo? Here's why lean teams leave, how to migrate in under an hour, and what OutReign does differently. From $0.",
  },
  {
    path: "/vs-apollo",
    title: "OutReign vs Apollo — Which Should You Use?",
    description:
      "Honest comparison of OutReign and Apollo. Apollo gives you a database. OutReign tells you who to email first. See where each tool wins.",
  },
  {
    path: "/vs-instantly",
    title: "OutReign vs Instantly — Which Should You Use?",
    description:
      "Honest comparison of OutReign and Instantly. Instantly is a sender. OutReign is a sender that first tells you who's worth emailing.",
  },
  {
    path: "/vs-rocketreach",
    title: "OutReign vs RocketReach — Best RocketReach Alternative?",
    description:
      "Honest comparison of OutReign and RocketReach. RocketReach gives you contact data. OutReign tells you who to email first and writes the message.",
  },
  {
    path: "/vs-lusha",
    title: "OutReign vs Lusha — Which Should You Use?",
    description:
      "Honest comparison of OutReign and Lusha. Lusha gives you contact data. OutReign scores who to email first, drafts, and manages replies. See where each wins.",
  },
  {
    path: "/vs-zoominfo",
    title: "OutReign vs ZoomInfo — Which Should You Use?",
    description:
      "Honest comparison of OutReign and ZoomInfo. ZoomInfo is enterprise B2B data with intent signals. OutReign is self-serve outbound for founders and small teams.",
  },
  // The rest of the public routes carried in sitemap.xml. Titles and
  // descriptions mirror each page's SEOHead; /connect and /install have no
  // SEOHead at all, so these are the only per-route metadata they get.
  {
    path: "/connect",
    title: "Connect OutReign to Claude and other MCP clients",
    description:
      "Add the OutReign MCP server to Claude, Cursor or any MCP client to search prospects and draft outreach from your assistant.",
  },
  {
    path: "/privacy",
    title: "Privacy Policy & Data Protection | OutReign",
    description:
      "Learn how OutReign collects, uses, and protects your personal data. We're committed to transparency and GDPR/CCPA compliance.",
  },
  {
    path: "/terms",
    title: "Terms of Service - User Agreement & Policies | OutReign",
    description:
      "Review the OutReign Terms of Service. Understand your rights and responsibilities when using our AI-powered sales platform.",
  },
  {
    path: "/api-docs",
    title: "API Documentation – OutReign Developer Portal",
    description:
      "Complete OutReign REST API reference with code examples in JavaScript, Python, PHP & cURL. Manage leads, deals, contacts, workflows & outreach programmatically.",
  },
  {
    path: "/api-status",
    title: "API Status & System Uptime - OutReign Developer Platform",
    description:
      "Real-time OutReign API status, system uptime monitoring, and incident history. Check REST API, GraphQL, webhooks, and edge function availability.",
  },
  {
    path: "/request-integration",
    title: "Request a new integration | OutReign",
    description:
      "Tell us which tool you'd like OutReign to integrate with. We prioritize integrations based on customer demand.",
  },
  {
    path: "/install",
    title: "Install OutReign on your phone or desktop",
    description:
      "Add OutReign to your home screen for full-screen access, offline support and push notifications. Step-by-step instructions for iOS, Android and desktop.",
  },
];

/** Truncate to a length search engines will actually show, on a word boundary. */
const clampDescription = (text: string, max = 158): string => {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).replace(/[.,;:]$/, "")}…`;
};

// Content routes, generated from the data the app renders so the two cannot
// drift. Titles mirror the pattern each page's SEOHead uses.
const CONTENT_ROUTES: RouteMeta[] = [
  {
    path: "/blog",
    title: "OutReign Blog — B2B Outbound, ICP and Lead Generation Guides",
    description:
      "Practical guides on building an ICP, scoring leads, finding verified B2B contacts and running cold email that gets replies.",
  },
  ...blogPosts.map((post) => ({
    path: `/blog/${post.slug}`,
    title: `${post.title} | OutReign`,
    description: clampDescription(post.description),
  })),
  ...helpCategories.map((category) => ({
    path: `/help/category/${category.id}`,
    title: `${category.title} — OutReign Help Center`,
    description: clampDescription(category.description),
  })),
  ...helpArticles.map((article) => ({
    path: `/help/article/${article.slug}`,
    title: `${article.title} — OutReign Help Center`,
    description: clampDescription(article.description),
  })),
];

const ALL_ROUTES: RouteMeta[] = [...ROUTES, ...CONTENT_ROUTES];

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const canonicalFor = (path: string): string =>
  path === "/" ? `${DOMAIN}/` : `${DOMAIN}${path.replace(/\/$/, "")}`;

/**
 * A static list of every public URL, rendered into #root.
 *
 * createRoot() replaces the container's children on mount, so this is gone
 * before a real user paints — but it is present in the HTML a crawler fetches
 * before it decides whether a URL is worth rendering. It deliberately sits
 * outside <noscript>: Googlebot executes JavaScript and therefore never reads
 * noscript content, which is where the site's only internal links used to be.
 *
 * The links mirror what the rendered app shows, so this is a prerender of the
 * real navigation rather than crawler-only content.
 */
function renderLinkIndex(currentPath: string): string {
  const group = (heading: string, routes: RouteMeta[]) => {
    const items = routes
      .filter((r) => r.path !== currentPath)
      .map(
        (r) =>
          `<li><a href="${escapeHtml(canonicalFor(r.path))}">${escapeHtml(r.title)}</a></li>`,
      )
      .join("");
    return items ? `<h2>${escapeHtml(heading)}</h2><ul>${items}</ul>` : "";
  };

  const isBlog = (r: RouteMeta) => r.path.startsWith("/blog");
  const isHelp = (r: RouteMeta) => r.path.startsWith("/help");

  return [
    // Visually hidden via inline styles (no stylesheet dependency) so real
    // visitors never see a flash of unstyled link text before the CSS and the
    // React bundle land. Crawlers still parse the markup and follow the links.
    '<nav aria-label="Site index" style="position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0">',
    group("Product", ROUTES),
    group("Guides and articles", CONTENT_ROUTES.filter(isBlog)),
    group("Help center", CONTENT_ROUTES.filter(isHelp)),
    "</nav>",
  ]
    .filter(Boolean)
    .join("");
}

/** Rewrite the head tags in a copy of index.html for one route. */
function renderRouteHtml(baseHtml: string, meta: RouteMeta): string {
  const title = escapeHtml(meta.title);
  const description = escapeHtml(meta.description);
  const canonical = escapeHtml(canonicalFor(meta.path));

  const replacements: Array<[RegExp, string]> = [
    [/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`],
    [/<meta name="title" content="[^"]*"\s*\/?>/, `<meta name="title" content="${title}" />`],
    [/<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${description}">`],
    [/<link rel="canonical" href="[^"]*"\s*\/?>/, `<link rel="canonical" href="${canonical}" />`],
    [/<meta property="og:url" content="[^"]*"\s*\/?>/, `<meta property="og:url" content="${canonical}" />`],
    [/<meta property="og:title" content="[^"]*"\s*\/?>/, `<meta property="og:title" content="${title}">`],
    [/<meta name="twitter:title" content="[^"]*"\s*\/?>/, `<meta name="twitter:title" content="${title}">`],
    [/<meta property="og:description" content="[^"]*"\s*\/?>/, `<meta property="og:description" content="${description}">`],
    [/<meta name="twitter:description" content="[^"]*"\s*\/?>/, `<meta name="twitter:description" content="${description}">`],
  ];

  let html = baseHtml;
  for (const [pattern, value] of replacements) {
    html = html.replace(pattern, value);
  }

  // Seed #root with the link index. React clears the container on mount, so
  // this never reaches a rendered page.
  html = html.replace(
    /<div id="root"><\/div>/,
    `<div id="root">${renderLinkIndex(meta.path)}</div>`,
  );

  return html;
}

/**
 * Sitemap, generated from the same route list the prerender uses.
 *
 * The previous sitemap.xml was hand-maintained: every entry carried a
 * hand-typed lastmod that went stale (2026-06-01) and new content had to be
 * added by hand, so blog posts and help articles could be listed with a date
 * months older than the content. A stale lastmod gives Google no reason to
 * recrawl a URL it has only "discovered", which is exactly the state those
 * pages were stuck in. Generating it here keeps coverage and freshness tied to
 * the content itself.
 */
function renderSitemap(buildDate: string): string {
  const blogDates = new Map(blogPosts.map((p) => [`/blog/${p.slug}`, p.publishedAt]));

  const priorityFor = (path: string): string => {
    if (path === "/") return "1.0";
    if (path === "/pricing" || path.startsWith("/vs-") || path === "/apollo-alternative") return "0.9";
    if (path === "/blog" || path === "/help" || path === "/sales-operations-software") return "0.8";
    if (path.startsWith("/blog/")) return "0.7";
    if (path.startsWith("/help/")) return "0.6";
    return "0.5";
  };

  const changefreqFor = (path: string): string => {
    if (path === "/" || path === "/blog" || path === "/pricing") return "weekly";
    return "monthly";
  };

  const urls = ALL_ROUTES.map((route) => {
    const lastmod = blogDates.get(route.path) ?? buildDate;
    const image =
      route.path === "/"
        ? `\n    <image:image>\n      <image:loc>https://outreign.io/outreign-social-card.jpg?v=7</image:loc>\n      <image:title>Find Who To Sell To, Then Close Them.</image:title>\n    </image:image>`
        : "";
    return `  <url>\n    <loc>${escapeHtml(canonicalFor(route.path))}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreqFor(route.path)}</changefreq>\n    <priority>${priorityFor(route.path)}</priority>${image}\n  </url>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generated at build time from the app's route and content data. Do not edit by hand. -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls}
</urlset>
`;
}


export function seoRoutesPlugin(): Plugin {
  return {
    name: "outreign-seo-routes",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      const indexAsset = bundle["index.html"];
      if (!indexAsset || indexAsset.type !== "asset" || typeof indexAsset.source !== "string") {
        this.warn("seo-routes: index.html asset not found; skipping per-route head injection.");
        return;
      }
      const baseHtml = indexAsset.source;

      for (const meta of ALL_ROUTES) {
        const html = renderRouteHtml(baseHtml, meta);
        if (meta.path === "/") {
          // Rewrite the root index.html in place so the homepage (and the SPA
          // fallback for unknown routes) carries the homepage head.
          indexAsset.source = html;
        } else {
          this.emitFile({
            type: "asset",
            fileName: `${meta.path.replace(/^\//, "")}/index.html`,
            source: html,
          });
        }
      }
      this.info(
        `seo-routes: emitted ${ALL_ROUTES.length} routes ` +
          `(${ROUTES.length} marketing, ${CONTENT_ROUTES.length} content)`,
      );
    },
  };
}

export default seoRoutesPlugin;

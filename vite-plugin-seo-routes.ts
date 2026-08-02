import type { Plugin } from "vite";

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
    title: "OutReign — Find Who to Sell To, Then Sell",
    description:
      "Describe your ideal customer in plain English. OutReign returns ranked B2B prospects with verified emails and AI-drafted outreach in under 2 minutes.",
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
];

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const canonicalFor = (path: string): string =>
  path === "/" ? `${DOMAIN}/` : `${DOMAIN}${path.replace(/\/$/, "")}`;

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
  return html;
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

      for (const meta of ROUTES) {
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
    },
  };
}

export default seoRoutesPlugin;

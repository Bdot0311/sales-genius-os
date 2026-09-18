// Build-time prerender for every public marketing page.
//
// Runs after `vite build` (client) and `vite build --ssr` (server bundle).
// Renders each page in src/entry-server's PAGES map to static HTML and injects
// it into #root in that page's dist HTML, so the content paints from HTML on
// first byte instead of waiting for the JS bundle to mount. src/main.tsx
// hydrateRoot()s over any container marked data-prerendered.
//
// This used to do the homepage alone. Every other page shipped a head, a
// hidden link index and an empty div — fine for Googlebot, which executes
// JavaScript and comes back, and useless to the nine AI crawlers robots.txt
// invites by name, which mostly do not. They were being welcomed to pages with
// no prose on them.
//
// Failure is non-fatal to the artifact: a page that will not render is left
// exactly as `vite build` produced it (the SPA still serves it) and the run
// exits non-zero so CI surfaces the regression rather than silently shipping
// an empty page.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const DIST_INDEX = path.join(DIST, "index.html");
const SSR_ENTRY = path.join(ROOT, ".ssr-dist", "entry-server.js");

// vite-plugin-seo-routes emits "/foo" as dist/foo/index.html and the homepage
// as dist/index.html.
const distFileFor = (route) =>
  route === "/" ? DIST_INDEX : path.join(DIST, route.replace(/^\//, ""), "index.html");

// The Supabase client sets `storage: localStorage` at module load, and other
// browser globals may be touched by transitive imports. Stub them BEFORE the
// SSR bundle is dynamically imported (ESM import execution happens on the
// await below, after these assignments).
const noopStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  key: () => null,
  length: 0,
};
const defineGlobal = (name, value) => {
  if (globalThis[name]) return;
  try {
    globalThis[name] = value;
  } catch {
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  }
};
defineGlobal("localStorage", noopStorage);
defineGlobal("sessionStorage", noopStorage);
// Supabase's createClient() constructs a RealtimeClient at module load, which
// throws on Node < 22 ("detected without native WebSocket support"). Netlify
// builds on Node 20. The prerender never opens a realtime connection (no
// effects run during renderToString), so a never-instantiated stub is enough
// to satisfy the WebSocket constructor check.
defineGlobal("WebSocket", class {});

if (!existsSync(SSR_ENTRY)) {
  console.error(`[prerender] SSR bundle missing at ${SSR_ENTRY}. Run "vite build --ssr src/entry-server.tsx --outDir .ssr-dist" first.`);
  process.exit(1);
}
if (!existsSync(DIST_INDEX)) {
  console.error(`[prerender] ${DIST_INDEX} missing. Run "vite build" first.`);
  process.exit(1);
}

const { render, prerenderablePaths } = await import(pathToFileURL(SSR_ENTRY).href);

if (!Array.isArray(prerenderablePaths) || prerenderablePaths.length === 0) {
  console.error("[prerender] entry-server exported no prerenderablePaths. Aborting without changes.");
  process.exit(1);
}

/**
 * React 19 hoists <link>/<title>/<meta> to <head> on the client (e.g. the
 * <link rel="preload"> it auto-generates for the Navbar logo's
 * fetchPriority="high" <img>), so those never stay in the client's #root.
 * renderToString can't hoist and emits them inline, which would mismatch the
 * client tree — strip them. JSON-LD (<script type="application/ld+json">) is
 * NOT hoisted: React keeps it inline at the component's position, so it must
 * stay in the server markup to match. The head metadata is already baked into
 * each page's HTML by vite-plugin-seo-routes.
 */
const stripHoisted = (markup) =>
  markup
    .replace(/<link\b[^>]*>/gi, "")
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, "")
    .replace(/<meta\b[^>]*>/gi, "");

// The plugin rewrites each page's #root to
// `<div id="root"><nav …site index…></nav></div>`. That nav has no nested
// <div>, so the first </div> after the marker is the container's own close.
const rootRe = /<div id="root">([\s\S]*?)<\/div>/;

const failures = [];
let done = 0;

for (const route of prerenderablePaths) {
  const file = distFileFor(route);
  if (!existsSync(file)) {
    failures.push(`${route}: ${path.relative(ROOT, file)} missing`);
    continue;
  }

  let appHtml;
  try {
    appHtml = stripHoisted(render(route));
  } catch (err) {
    failures.push(`${route}: render threw — ${err?.message ?? err}`);
    continue;
  }

  // A page that renders almost nothing is a page whose tree did not mount the
  // way it does in the browser. Shipping that would replace real markup with a
  // stub, so it is left alone and reported.
  if (!appHtml || appHtml.length < 500) {
    failures.push(`${route}: rendered ${appHtml?.length ?? 0} bytes, expected at least 500`);
    continue;
  }

  const html = readFileSync(file, "utf8");
  const match = html.match(rootRe);
  if (!match) {
    failures.push(`${route}: could not locate <div id="root">…</div>`);
    continue;
  }
  const linkIndex = match[1].trim();
  if (!/aria-label="Site index"/.test(linkIndex)) {
    failures.push(`${route}: #root did not contain the expected crawler link-index`);
    continue;
  }

  // Keep the crawler link-index the plugin seeded, but move it OUT of #root to
  // a sibling before it. React never touches it (so it stays for crawlers) and
  // it no longer participates in hydration. The page goes inside #root, marked
  // so main.tsx hydrates rather than re-renders from scratch.
  writeFileSync(
    file,
    html.replace(rootRe, `${linkIndex}<div id="root" data-prerendered="true">${appHtml}</div>`),
    "utf8",
  );
  done++;
  console.log(`[prerender] ${route} → ${path.relative(ROOT, file)} (${appHtml.length} bytes)`);
}

console.log(`[prerender] Prerendered ${done}/${prerenderablePaths.length} pages.`);

if (failures.length) {
  console.error(`[prerender] ${failures.length} page(s) left as the SPA shell:`);
  for (const f of failures) console.error(`  - ${f}`);
}

/**
 * One page failing is tolerated. Every page failing is not.
 *
 * A page that fails here is left exactly as `vite build` produced it, which is
 * what it shipped as before any of this — an improvement lost, not a
 * regression — and losing a deploy over that is the worse outcome. So a single
 * page reports and the build carries on.
 *
 * But "fails soft" and "silently does nothing" are one bad refactor apart. If
 * the route map breaks, or the plugin changes where it writes files, every page
 * but the homepage fails the same way at once and a green build would go on
 * shipping empty shells to the AI crawlers this exists for, with the evidence
 * buried in a deploy log nobody reads. That is systemic, so that is fatal.
 *
 * The homepage is fatal on its own because it was already a build requirement
 * before this walked more than one page.
 */
const homepageFailed = failures.some((f) => f.startsWith("/:"));
if (homepageFailed) {
  console.error("[prerender] The homepage did not prerender. Failing the build.");
  process.exit(1);
}
// Counted without the homepage on purpose. The homepage is guarded above, so
// `done` is already 1 by the time we get here and a bare "nothing rendered"
// check could never fire. The systemic case is the homepage rendering while
// every other page fails — a broken route map, a changed output path — which
// is exactly the state this set out to fix.
const others = prerenderablePaths.filter((r) => r !== "/");
const othersDone = done - 1;
if (others.length > 0 && othersDone === 0) {
  console.error(
    `[prerender] The homepage rendered but all ${others.length} other pages failed. ` +
      "That is a broken route map or output path, not one bad page. Failing the build.",
  );
  process.exit(1);
}

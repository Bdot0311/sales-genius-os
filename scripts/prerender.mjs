// Build-time homepage prerender.
//
// Runs after `vite build` (client) and `vite build --ssr` (server bundle).
// Renders <Index/> to static HTML and injects it into #root in dist/index.html
// so the hero paints from HTML on first byte instead of waiting for the JS
// bundle to mount. src/main.tsx hydrateRoot()s over the marked container.
//
// Failure is non-fatal to the artifact: if anything goes wrong we leave
// dist/index.html exactly as `vite build` produced it (SPA still works) and
// exit non-zero so CI surfaces the regression.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = process.cwd();
const DIST_INDEX = path.join(ROOT, "dist", "index.html");
const SSR_ENTRY = path.join(ROOT, ".ssr-dist", "entry-server.js");

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

if (!existsSync(SSR_ENTRY)) {
  console.error(`[prerender] SSR bundle missing at ${SSR_ENTRY}. Run "vite build --ssr src/entry-server.tsx --outDir .ssr-dist" first.`);
  process.exit(1);
}
if (!existsSync(DIST_INDEX)) {
  console.error(`[prerender] ${DIST_INDEX} missing. Run "vite build" first.`);
  process.exit(1);
}

const { render } = await import(pathToFileURL(SSR_ENTRY).href);
const appHtml = render("/");

if (!appHtml || appHtml.length < 500) {
  console.error(`[prerender] Rendered homepage markup is suspiciously small (${appHtml?.length ?? 0} bytes). Aborting without changes.`);
  process.exit(1);
}

let html = readFileSync(DIST_INDEX, "utf8");

// vite-plugin-seo-routes rewrites the homepage #root to
// `<div id="root"><nav …site index…></nav></div>` (the nav has no nested
// <div>, so the first </div> after the marker is the container's own).
const rootRe = /<div id="root">([\s\S]*?)<\/div>(\s*<script type="module")/;
const match = html.match(rootRe);
if (!match) {
  console.error('[prerender] Could not locate <div id="root">…</div> in dist/index.html. Aborting without changes.');
  process.exit(1);
}

// Keep the crawler link-index the plugin seeded, but move it OUT of #root to a
// sibling before it. React never touches it (so it stays for crawlers) and it
// no longer participates in hydration. The hero goes inside #root, marked so
// main.tsx hydrates rather than re-renders from scratch.
const linkIndex = match[1].trim();
const replacement = `${linkIndex}<div id="root" data-prerendered="true">${appHtml}</div>$2`;
html = html.replace(rootRe, replacement);

writeFileSync(DIST_INDEX, html, "utf8");
console.log(`[prerender] Injected prerendered homepage into dist/index.html (${appHtml.length} bytes of hero markup).`);

import { Suspense, type ComponentType } from "react";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Index from "./pages/Index";
import ColdEmailSoftware from "./pages/ColdEmailSoftware";
import AiSdrAgent from "./pages/AiSdrAgent";
import SalesOperationsSoftware from "./pages/SalesOperationsSoftware";
import ApolloAlternative from "./pages/ApolloAlternative";
import VsApollo from "./pages/VsApollo";
import VsInstantly from "./pages/VsInstantly";
import VsLusha from "./pages/VsLusha";
import VsZoomInfo from "./pages/VsZoomInfo";
import VsRocketReach from "./pages/VsRocketReach";
import PricingPage from "./pages/PricingPage";
import Partners from "./pages/Partners";
import Security from "./pages/Security";
import Accessibility from "./pages/Accessibility";
import AlternativeTo from "./pages/AlternativeTo";
import { COMPETITORS } from "./data/competitors";

// Mirrors src/App.tsx's PageLoader so the Suspense boundary the client mounts
// around the routed page has an identical fallback here.
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

/**
 * The pages rendered to static HTML at build time.
 *
 * Only the homepage used to be. Every other public page shipped as an empty
 * `<div id="root">` with a head and a hidden link index, and nothing else —
 * which is fine for Googlebot, because it executes JavaScript and comes back.
 * It is not fine for the nine AI crawlers robots.txt explicitly invites:
 * GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot and the rest mostly
 * do not run JavaScript. They were being welcomed to pages with no prose on
 * them, so there was nothing to quote, summarise or ground an answer in.
 *
 * These are the commercial pages where that costs the most, and they are all
 * presentational: no Supabase, no data hooks, nothing that needs a session.
 * Only the footer is lazy, so the whole body of each one renders here.
 *
 * Anything that reads a session or fetches on mount stays off this list —
 * prerendering it would bake one visitor's state into a file served to
 * everyone.
 */
/**
 * `pattern` is the route path React Router matches against, which is only
 * different from the URL when the page reads a param. AlternativeTo calls
 * useParams(), and a component rendered directly under StaticRouter has no
 * matched route to take params from — it would have seen an empty slug, fallen
 * through to its redirect, and every one of these pages would have prerendered
 * to nothing.
 */
type Prerenderable = { Component: ComponentType; pattern?: string };

const PAGES: Record<string, Prerenderable> = {
  "/": { Component: Index },
  "/cold-email-software": { Component: ColdEmailSoftware },
  "/ai-sdr-agent": { Component: AiSdrAgent },
  "/sales-operations-software": { Component: SalesOperationsSoftware },
  "/apollo-alternative": { Component: ApolloAlternative },
  "/vs-apollo": { Component: VsApollo },
  "/vs-instantly": { Component: VsInstantly },
  "/vs-lusha": { Component: VsLusha },
  "/vs-zoominfo": { Component: VsZoomInfo },
  "/vs-rocketreach": { Component: VsRocketReach },
  "/pricing": { Component: PricingPage },
  "/partners": { Component: Partners },
  "/security": { Component: Security },
  "/accessibility": { Component: Accessibility },
};

/**
 * The alternative pages render from one template and differ only by the slug in
 * the URL, so they go in the same map rather than getting their own branch.
 * StaticRouter supplies the param, exactly as BrowserRouter does on the client.
 */
for (const tool of COMPETITORS) {
  PAGES[`/alternatives/${tool.slug}`] = {
    Component: AlternativeTo,
    pattern: "/alternatives/:slug",
  };
}

/** The paths scripts/prerender.mjs walks. */
export const prerenderablePaths: string[] = Object.keys(PAGES);

/**
 * Server entry for the build-time prerender.
 *
 * scripts/prerender.mjs imports this after the SSR build and injects the
 * returned markup into #root in the page's dist HTML, so the content paints
 * from static HTML instead of waiting for the JS bundle — and so a crawler
 * that never runs the bundle still reads the page. src/main.tsx hydrateRoot()s
 * over anything marked data-prerendered.
 *
 * The tree is the page alone under a StaticRouter: BrowserRouter/Routes/Route
 * and the app's context providers emit no DOM, so the hydration target is
 * exactly the page's own output. SEOHead and the JSON-LD schema components
 * short-circuit to null under import.meta.env.SSR; the head is already baked
 * per route by vite-plugin-seo-routes.
 */
export function render(url = "/"): string {
  const entry = PAGES[url];
  if (!entry) return "";
  const { Component, pattern } = entry;
  const queryClient = new QueryClient();
  return renderToString(
    <QueryClientProvider client={queryClient}>
      <StaticRouter location={url}>
        <Suspense fallback={<PageLoader />}>
          {/* Routes/Route emit no DOM of their own, so the hydration target is
              still exactly the page's output — but the match gives useParams()
              something to read. */}
          <Routes>
            <Route path={pattern ?? url} element={<Component />} />
          </Routes>
        </Suspense>
      </StaticRouter>
    </QueryClientProvider>,
  );
}

import { Suspense, type ComponentType } from "react";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
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
const PAGES: Record<string, ComponentType> = {
  "/": Index,
  "/cold-email-software": ColdEmailSoftware,
  "/ai-sdr-agent": AiSdrAgent,
  "/sales-operations-software": SalesOperationsSoftware,
  "/apollo-alternative": ApolloAlternative,
  "/vs-apollo": VsApollo,
  "/vs-instantly": VsInstantly,
  "/vs-lusha": VsLusha,
  "/vs-zoominfo": VsZoomInfo,
  "/vs-rocketreach": VsRocketReach,
  "/pricing": PricingPage,
  "/partners": Partners,
  "/security": Security,
  "/accessibility": Accessibility,
};

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
  const Page = PAGES[url];
  if (!Page) return "";
  const queryClient = new QueryClient();
  return renderToString(
    <QueryClientProvider client={queryClient}>
      <StaticRouter location={url}>
        <Suspense fallback={<PageLoader />}>
          <Page />
        </Suspense>
      </StaticRouter>
    </QueryClientProvider>,
  );
}

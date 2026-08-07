import { Suspense } from "react";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Index from "./pages/Index";

// Mirrors src/App.tsx's PageLoader so the Suspense boundary the client mounts
// around the routed page has an identical fallback here. Index isn't lazy, so
// this never actually renders — but the boundary must exist on both sides or
// hydrateRoot() reports a structural mismatch at the Suspense.
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

/**
 * Server entry for the build-time homepage prerender.
 *
 * scripts/prerender.mjs imports this after the SSR build and injects the
 * returned markup into #root in dist/index.html so the hero paints from static
 * HTML instead of waiting for the JS bundle to mount (LCP was ≈ TTI before).
 * src/main.tsx then hydrateRoot()s over it.
 *
 * Only "/" is prerendered, so the tree is just <Index/> under a StaticRouter —
 * BrowserRouter/Routes/Route and the app's context providers emit no DOM, so
 * the hydration target is exactly <Index/>'s output. SEOHead and the JSON-LD
 * schema components short-circuit to null under import.meta.env.SSR; the head
 * is already baked per-route by vite-plugin-seo-routes.
 */
export function render(url = "/"): string {
  const queryClient = new QueryClient();
  return renderToString(
    <QueryClientProvider client={queryClient}>
      <StaticRouter location={url}>
        <Suspense fallback={<PageLoader />}>
          <Index />
        </Suspense>
      </StaticRouter>
    </QueryClientProvider>,
  );
}

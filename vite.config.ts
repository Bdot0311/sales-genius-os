import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";
import { visualizer } from "rollup-plugin-visualizer";
import { seoRoutesPlugin } from "./vite-plugin-seo-routes";

// https://vitejs.dev/config/
export default defineConfig(({ mode, isSsrBuild }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mcpPlugin(),
    seoRoutesPlugin(),
    mode === "development" && componentTagger(),
    process.env.ANALYZE === "true" &&
      visualizer({
        open: false,
        filename: "dist/stats.json",
        template: "raw-data",
        gzipSize: true,
        brotliSize: true,
      }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      react: path.resolve(__dirname, "./node_modules/react"),
      "react-dom": path.resolve(__dirname, "./node_modules/react-dom"),
    },
  },
  ssr: {
    // The homepage prerender (src/entry-server.tsx) is the only SSR build.
    // resolve.alias pins react/react-dom to a single path so they get bundled,
    // but other deps (react-query, router, motion) would stay externalized and
    // pull a second React from node_modules — "Invalid hook call" at
    // renderToString. Bundle everything so there is exactly one React.
    noExternal: true,
  },
  optimizeDeps: {
    // Pre-bundle these on server start. Anything discovered later forces a
    // mid-session re-optimization, which can swap React's prebundled chunk
    // under an already-mounted tree and throw "Invalid hook call".
    include: ["react", "react-dom", "@heycatch/sdk", "posthog-js"],
  },
  build: {
    // Enable modulePreload (default) so statically-imported entry chunks
    // (vendor-react, vendor-router, vendor-query, vendor-ui-core) are fetched
    // in parallel with the main entry instead of being chained.
    // Lazy-loaded route chunks (Stripe, Recharts, dashboards) use dynamic
    // import() and are NOT preloaded — they still load on demand.
    // Reduce unused JS by splitting vendor chunks
    rollupOptions: {
      output: {
        // manualChunks is a client-bundle optimization. During the SSR build
        // (src/entry-server.tsx, used only by the homepage prerender) it would
        // force React into a shared chunk while Vite externalizes the rest,
        // producing two React instances and an "Invalid hook call" at
        // renderToString. Disable it for SSR so there is a single React.
        manualChunks: isSsrBuild ? undefined : (id) => {
          // Vite aliases react/react-dom to local node_modules; match on the
          // resolved path so the bulky CJS production builds actually move out
          // of the main entry chunk.
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom") || id.includes("node_modules/scheduler")) {
            return "vendor-react";
          }
          if (id.includes("node_modules/react-router-dom") || id.includes("node_modules/@remix-run/router")) {
            return "vendor-router";
          }
          if (id.includes("node_modules/@tanstack/react-query")) {
            return "vendor-query";
          }
          if (id.includes("node_modules/motion") || id.includes("node_modules/framer-motion")) {
            return "vendor-motion";
          }
          if (id.includes("node_modules/@supabase")) {
            return "vendor-supabase";
          }
          if (id.includes("node_modules/@sentry")) {
            return "vendor-sentry";
          }
          if (id.includes("node_modules/tailwind-merge") || id.includes("node_modules/class-variance-authority") || id.includes("node_modules/clsx")) {
            return "vendor-ui-utils";
          }
          if (id.includes("node_modules/lucide-react")) {
            return "vendor-icons";
          }
          // Keep app code in its owning chunk (route chunks or main entry).
          return null;
        },
      },
    },
    // Enable CSS code splitting
    cssCodeSplit: true,
    // Target modern browsers to reduce polyfill JS
    target: 'es2020',
    // Reduce chunk size warnings threshold
    chunkSizeWarningLimit: 600,
    sourcemap: true,
  },
}));

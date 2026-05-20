import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      react: path.resolve(__dirname, "./node_modules/react"),
      "react-dom": path.resolve(__dirname, "./node_modules/react-dom"),
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom"],
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
        manualChunks: {
          // Only chunk vendors that are actually statically imported on the
          // landing path. Radix dialog/popover/dropdown/select/tabs are only
          // pulled in by dashboard/auth pages which are lazy — letting Vite
          // bundle them into their owning route chunks avoids preloading
          // ~74KB of unused JS on the marketing landing.
          'vendor-react': ['react', 'react-dom'],
          'vendor-router': ['react-router-dom'],
          'vendor-query': ['@tanstack/react-query'],
          // motion is used by both sync (HeroSection) and many lazy chunks —
          // isolate it so Rollup never duplicates or mis-orders its initialisation
          'vendor-motion': ['motion'],
        },
      },
    },
    // Enable CSS code splitting
    cssCodeSplit: true,
    // Target modern browsers to reduce polyfill JS
    target: 'es2020',
    // Reduce chunk size warnings threshold
    chunkSizeWarningLimit: 600,
  },
}));

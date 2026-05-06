import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "prompt",
      injectRegister: null,
      devOptions: {
        enabled: false,
      },
      includeAssets: ["favicon.ico", "salesos-logo.webp", "salesos-logo-small.webp"],
      workbox: {
        // Only precache the app shell — JS/CSS/HTML and a couple critical icons.
        // Images, webp assets, and fonts are runtime-cached on demand. This
        // keeps the install payload small (was ~3.9 MB) so first visits are fast.
        globPatterns: ["**/*.{js,css,html}", "favicon.ico", "salesos-logo-small.webp"],
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024, // 2 MB cap per file
        navigateFallbackDenylist: [/^\/~oauth/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase-api",
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
            },
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|webp|avif|gif)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "images",
              expiration: { maxEntries: 80, maxAgeSeconds: 2592000 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-stylesheets",
              expiration: { maxEntries: 10, maxAgeSeconds: 31536000 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: { maxEntries: 30, maxAgeSeconds: 31536000 },
            },
          },
        ],
      },
      manifest: {
        id: "/",
        name: "SalesOS - AI Sales Platform",
        short_name: "SalesOS",
        description: "AI-powered sales automation and lead generation",
        theme_color: "#8B5CF6",
        background_color: "#09090B",
        display: "standalone",
        orientation: "any",
        scope: "/",
        start_url: "/",
        categories: ["business", "productivity"],
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
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

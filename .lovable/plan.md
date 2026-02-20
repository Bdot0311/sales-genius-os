

# PWA Setup for SalesOS

Make SalesOS installable as a mobile app from the browser with offline support, proper icons, and a dedicated install page.

## What You'll Get

- Users can install SalesOS to their phone's home screen (iPhone and Android)
- The app loads instantly and works offline for cached pages
- A dedicated `/install` page with instructions and an install button
- App appears with your SalesOS branding (icon, splash screen, colors)

## Implementation Steps

### 1. Install vite-plugin-pwa dependency
Add `vite-plugin-pwa` (and its types `@vite-pwa/assets-generator` is optional) to the project.

### 2. Create PWA icons
Generate the required icon sizes from the existing SalesOS logo and place them in `public/`:
- `pwa-192x192.png` (192x192)
- `pwa-512x512.png` (512x512)
- `apple-touch-icon-180x180.png` (180x180)

Since we can't generate images programmatically, we'll reference the existing logo URL used for the favicon and apple-touch-icon (the Google Storage URL already in index.html).

### 3. Configure vite-plugin-pwa in `vite.config.ts`
- Add `VitePWA` plugin with:
  - App name: "SalesOS"
  - Theme color: `#8B5CF6` (matching existing branding)
  - Background color: `#09090B` (dark background)
  - Display: `standalone`
  - Scope and start URL: `/`
  - Icons referencing the PWA icon files
  - Workbox config for runtime caching (API calls, fonts, images)
  - `navigateFallbackDenylist: [/^\/~oauth/]` to avoid caching OAuth redirects

### 4. Update `index.html`
- Add `<link rel="manifest">` (auto-injected by plugin)
- Ensure apple-touch-icon and theme-color meta tags are present (already there)

### 5. Create `/install` page (`src/pages/Install.tsx`)
A user-friendly page that:
- Detects if the app is already installed
- Shows a native "Install" button on supported browsers (Chrome/Edge on Android)
- Shows manual instructions for iOS (Share -> Add to Home Screen)
- Explains the benefits of installing (offline access, faster loading, app-like experience)

### 6. Add route in `App.tsx`
Add `<Route path="/install" element={<Install />} />` for the install page.

### 7. Add install prompt link in the dashboard sidebar
Add a subtle "Install App" link in the `DashboardLayout` sidebar so logged-in users can discover the install option.

## Technical Details

**vite.config.ts changes:**
```typescript
import { VitePWA } from 'vite-plugin-pwa';

// Add to plugins array:
VitePWA({
  registerType: 'autoUpdate',
  includeAssets: ['favicon.ico', 'salesos-logo.webp'],
  workbox: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
    navigateFallbackDenylist: [/^\/~oauth/],
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
        handler: 'NetworkFirst',
        options: { cacheName: 'supabase-api', expiration: { maxEntries: 50, maxAgeSeconds: 300 } }
      },
      {
        urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
        handler: 'CacheFirst',
        options: { cacheName: 'google-fonts', expiration: { maxEntries: 10, maxAgeSeconds: 31536000 } }
      }
    ]
  },
  manifest: {
    name: 'SalesOS - AI Sales Platform',
    short_name: 'SalesOS',
    description: 'AI-powered sales automation and lead generation',
    theme_color: '#8B5CF6',
    background_color: '#09090B',
    display: 'standalone',
    scope: '/',
    start_url: '/',
    icons: [
      { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
      { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  }
})
```

**Install page** will use the `beforeinstallprompt` browser event for native install on Android/Chrome, and show manual steps for iOS Safari.

**Files to create:**
- `src/pages/Install.tsx` -- install prompt page

**Files to modify:**
- `vite.config.ts` -- add VitePWA plugin
- `src/App.tsx` -- add /install route
- `src/components/dashboard/DashboardLayout.tsx` -- add "Install App" link in sidebar
- `index.html` -- minor PWA meta tag additions if needed

**New dependency:**
- `vite-plugin-pwa`

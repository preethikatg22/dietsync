import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { createRequire } from 'node:module'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

// Load the foods.json version at build time so the Workbox cache name is
// tied to the database version (Requirement 10.3–10.4).
const _require = createRequire(import.meta.url)
const foodsVersion: string = (_require('./src/data/foods.json') as { version: string }).version

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Use Workbox's generateSW strategy — the plugin generates the service worker
      // automatically from the configuration below (no hand-written SW file needed).
      strategies: 'generateSW',

      // Re-register and activate the new SW immediately when a new version is available.
      registerType: 'autoUpdate',

      // Registration is handled manually in src/main.tsx so that SW failures
      // can be caught and downgraded to a console.warn (Requirement 10.5).
      injectRegister: null,

      workbox: {
        // Pre-cache the application shell assets (JS/CSS/HTML bundles produced by Vite).
        // The glob patterns below are relative to the build output directory.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],

        // Runtime caching rule for foods.json.
        // Uses a CacheFirst strategy so the DB is served from cache while offline.
        // The versioned URL (e.g. /foods.json?v=1.0.0) acts as the cache-busting key:
        // when the foods.json version field changes, the app must be rebuilt with a
        // new query-string, which causes Workbox to treat it as a distinct request and
        // fetch the updated file on the next network opportunity (Requirement 10.4).
        runtimeCaching: [
          {
            // Match the exact path (with an optional version query parameter).
            urlPattern: /\/foods\.json(\?.*)?$/,
            handler: 'CacheFirst',
            options: {
              cacheName: `foods-db-cache-v${foodsVersion}`,
              expiration: {
                // Keep at most one copy; the versioned URL guarantees freshness.
                maxEntries: 1,
                // Expire after 365 days as a safety net.
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },

      // Web App Manifest (Requirement 10.1).
      // Icons are referenced here; the actual image files are created in task 16.1.
      manifest: {
        name: 'DietSync',
        short_name: 'DietSync',
        description: 'Track your daily nutrition and weight progress — offline-first PWA.',
        theme_color: '#10b981',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },

      // Enable the PWA plugin in dev mode so the manifest is available during development.
      devOptions: {
        enabled: true,
      },
    }),
  ],

  // Vitest configuration (Requirements 17–31: property-based and unit testing setup)
  test: {
    // Expose Vitest globals (describe, it, expect, etc.) without explicit imports.
    globals: true,

    // Use jsdom to simulate a browser environment for React component tests.
    environment: 'jsdom',

    // Setup file that imports @testing-library/jest-dom matchers globally.
    setupFiles: ['./src/tests/setup.ts'],

    coverage: {
      // Use V8's built-in coverage instrumentation.
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      // Include only application source files (exclude test files and config).
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/tests/**', 'src/**/*.test.{ts,tsx}'],
    },
  },
})

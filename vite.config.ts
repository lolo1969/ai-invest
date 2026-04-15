import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import https from 'node:https'

const yahooAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 25,
  timeout: 30_000,
})

function createYahooProxy(stripPrefix?: RegExp) {
  return {
    target: 'https://query1.finance.yahoo.com',
    changeOrigin: true,
    secure: true,
    agent: yahooAgent,
    timeout: 30_000,
    proxyTimeout: 30_000,
    rewrite: stripPrefix ? (path: string) => path.replace(stripPrefix, '') : undefined,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json,text/plain,*/*',
      'Connection': 'keep-alive',
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  server: {
    port: 5174,
    proxy: {
      // Canonical local prefix used in the app
      '/yahoo-api': createYahooProxy(/^\/yahoo-api/),
      // Compatibility routes: some stale clients/requesters may still hit these directly
      '/v8': createYahooProxy(),
      '/v7': createYahooProxy(),
      '/v1': createYahooProxy(),
      '/google-news': {
        target: 'https://news.google.com',
        changeOrigin: true,
        followRedirects: true,
        rewrite: (path) => path.replace(/^\/google-news/, ''),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }
    }
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'Vestia - Investment Advisor',
        short_name: 'Vestia',
        description: 'KI-gestützter Investment-Berater',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      }
    })
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunks
          'vendor-react': ['react', 'react-dom'],
          'vendor-charts': ['recharts'],
          'vendor-state': ['zustand', '@tanstack/react-query'],
          'vendor-utils': ['axios', 'lucide-react'],
        }
      }
    }
  }
})

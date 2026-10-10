import { fileURLToPath } from 'node:url';
const fromRoot = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url));
const netlify = process.env.NITRO_PRESET === 'netlify';
export default defineNuxtConfig({
  compatibilityDate: '2026-10-09',
  devtools: { enabled: false },
  css: ['@thijulio/biome-css/biome.css', '~/assets/product.css'],
  alias: { '@smart-library/domain': fromRoot('libs/domain/src/index.ts') },
  app: {
    head: {
      title: 'Smart Library',
      htmlAttrs: { lang: 'en', 'data-theme': 'claude', 'data-mode': 'light' },
      meta: [
        {
          name: 'description',
          content:
            'Your own reading library. Keep your books and reading life together in a private space.',
        },
      ],
    },
  },
  routeRules: {
    '/library': { ssr: false, headers: { 'cache-control': 'private, no-store, max-age=0' } },
    '/library/**': { ssr: false, headers: { 'cache-control': 'private, no-store, max-age=0' } },
    '/api/private/**': { headers: { 'cache-control': 'private, no-store, max-age=0' } },
    '/api/auth/**': { headers: { 'cache-control': 'private, no-store, max-age=0' } },
  },
  nitro: {
    output: {
      dir: fromRoot(netlify ? '.netlify/functions-internal' : 'dist/apps/web'),
      publicDir: fromRoot('dist/apps/web/public'),
      serverDir: fromRoot(netlify ? '.netlify/functions-internal/server' : 'dist/apps/web/server'),
    },
  },
  typescript: { strict: true },
});

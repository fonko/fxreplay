// @ts-check
import { defineConfig } from 'astro/config';

import vercel from '@astrojs/vercel';

import react from '@astrojs/react';

import sitemap from '@astrojs/sitemap';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://fxreplay.alfonsopayra.me',
  output: 'server',
  adapter: vercel(),
  integrations: [react(), sitemap()],
  build: {
    // The full CSS bundle is ~20KB, over Astro's 4KB auto-inline threshold,
    // so by default it ships as a render-blocking <link>. Single-page site
    // with no route-level CSS splitting to lose — inlining it into the HTML
    // response removes that extra round trip entirely.
    inlineStylesheets: 'always',
  },
  vite: {
    plugins: [tailwindcss()]
  }
});
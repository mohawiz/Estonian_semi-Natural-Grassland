/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// BASE_PATH lets the same build run at a domain root (Netlify, Vercel,
// Cloudflare Pages, Docker) or in a sub-folder (GitHub Pages: /<repo>/).
const base = process.env.BASE_PATH ?? '/';
const basePath = base.endsWith('/') ? base : `${base}/`;

/** Preload the two Latin font files the first screen uses, so text lays out once (no shift). */
function preloadFonts(): Plugin {
  const wanted = [/newsreader-latin-opsz-normal-.*\.woff2$/, /atkinson-hyperlegible-next-latin-wght-normal-.*\.woff2$/];
  return {
    name: 'preload-fonts',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const files = Object.keys(ctx.bundle ?? {}).filter((f) => wanted.some((re) => re.test(f)));
        return files.map((f) => ({ tag: 'link', attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: basePath + f, crossorigin: '' }, injectTo: 'head' as const }));
      },
    },
  };
}

export default defineConfig({
  base: basePath,
  plugins: [react(), preloadFonts()],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});

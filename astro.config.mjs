// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import svelte from '@astrojs/svelte';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  integrations: [
    svelte(),
    sitemap({
      filter: (page) => {
        // Exclude admin, internal, and redirect-only pages from sitemap
        const excluded = [
          '/shifts', '/checkin', '/volunteeradmin', '/subsadmin',
          '/subs', '/electionadmin', '/elections', '/admin/',
          '/gala/live', '/gala/volunteer-checkin',
          '/marketing', '/register', '/account',
          '/intake', '/lspgala', '/galaraffle', '/silentauction',
        ];
        return !excluded.some((path) => page.includes(path));
      },
    }),
  ],
  // Your existing Vite config for Tailwind v4
  vite: {
    plugins: [tailwindcss()]
  },

  // Add these lines for GitHub Pages deployment
  site: 'https://latinasweatproject.com',
  base: '/',
});
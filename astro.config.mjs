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
          '/marketing', '/forms', '/register', '/account',
          '/intake', '/donate', '/lspgala', '/galaraffle',
          '/silentauction', '/teachertrainingclasses', '/teach/',
          '/graduation',
        ];
        return !excluded.some((path) => page.includes(path));
      },
    }),
  ],
  // Legacy admin dashboards, consolidated into the unified portal at /admin
  redirects: {
    '/volunteeradmin': '/admin',
    '/subsadmin': '/admin',
    '/electionadmin': '/admin',
  },

  // Your existing Vite config for Tailwind v4
  vite: {
    plugins: [tailwindcss()]
  },

  // Add these lines for GitHub Pages deployment
  site: 'https://latinasweatproject.com',
  base: '/',
});

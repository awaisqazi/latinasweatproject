// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  // Your existing Vite config for Tailwind v4
  vite: {
    plugins: [tailwindcss()]
  },
  
  // Add these lines for GitHub Pages deployment
  site: 'https://latinasweatproject.com',
  base: '/',
});
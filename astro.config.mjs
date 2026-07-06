import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';

// For GitHub Pages project sites, set SITE and BASE_PATH env vars in the deploy
// workflow (e.g. SITE=https://<user>.github.io BASE_PATH=/<repo>). Local builds
// default to root.
export default defineConfig({
  integrations: [svelte()],
  site: process.env.SITE || 'http://localhost:4321',
  base: process.env.BASE_PATH || '/',
});

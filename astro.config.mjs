import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import sitemap from '@astrojs/sitemap';
import { readFileSync } from 'node:fs';
import { STILLS_SITE, stillPath } from './shared/stills.mjs';

// Image sitemap: a movie page lists Dr. X's still frames it shows, so image
// search can find them and link back to the page.
const stills = JSON.parse(readFileSync('./data/generated/stills.json', 'utf8')).films;
function withStills(item) {
  const id = item.url.match(/\/movie\/[^/]*-(\d+)\/?$/)?.[1];
  const film = id && stills[id];
  if (film) item.img = film.frames.map(([frame]) => ({ url: STILLS_SITE + stillPath(id, frame) }));
  return item;
}

// For GitHub Pages project sites, set SITE and BASE_PATH env vars in the deploy
// workflow (e.g. SITE=https://<user>.github.io BASE_PATH=/<repo>). Local builds
// default to root.
export default defineConfig({
  integrations: [svelte(), sitemap({ filter: (page) => !/\/404\/?$/.test(page), serialize: withStills })],
  site: process.env.SITE || 'http://localhost:4321',
  base: process.env.BASE_PATH || '/',
});

// robots.txt, generated so the sitemap URL carries the real site + base path.
// Note: on a GitHub Pages project site crawlers only read the origin-root
// robots.txt (kiarashfa.github.io/robots.txt, from the user-site repo); this
// copy takes effect if the site ever moves to its own domain.
import { withBase } from '../lib/util.js';

export function GET({ site }) {
  const sitemap = new URL(withBase('/sitemap-index.xml'), site).href;
  return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${sitemap}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

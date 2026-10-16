// Web app manifest, generated so every path runs through the base-path helper
// (a static file would be wrong either locally or on GitHub Pages).
import { SITE_TITLE, SITE_TAGLINE, THEME_BG, withBase } from '../lib/util.js';

export function GET() {
  const manifest = {
    name: SITE_TITLE,
    short_name: 'Cinema Ledger',
    description: `${SITE_TAGLINE}.`,
    start_url: withBase('/'),
    scope: withBase('/'),
    display: 'standalone',
    theme_color: THEME_BG.dark,
    background_color: THEME_BG.dark,
    icons: [
      { src: withBase('/icon-192.png'), sizes: '192x192', type: 'image/png' },
      { src: withBase('/icon-512.png'), sizes: '512x512', type: 'image/png' },
      { src: withBase('/favicon.svg'), sizes: 'any', type: 'image/svg+xml' },
    ],
  };
  return new Response(JSON.stringify(manifest, null, 2), {
    headers: { 'Content-Type': 'application/manifest+json' },
  });
}

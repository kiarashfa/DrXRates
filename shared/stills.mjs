// Dr. X's still frames are served by the DrXMedia GitHub Pages site (same
// origin as this site in production). Paths are stills/<tmdbId>/<NNN>.avif
// (long edge ≤ 1920) and stills/<tmdbId>/<NNN>-640.avif (gallery tiles, long
// edge ≤ 640); frame 001 is the lead. Used by the site (src/lib/util.js, the
// only place page URLs are built) and the sitemap (astro.config.mjs).
export const STILLS_SITE = 'https://kiarashfa.github.io/DrXMedia/';
export const STILL_THUMB_EDGE = 640;

export function stillPath(id, frame, size = 'full') {
  return `stills/${id}/${String(frame).padStart(3, '0')}${size === 'thumb' ? `-${STILL_THUMB_EDGE}` : ''}.avif`;
}

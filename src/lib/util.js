import meta from '../../data/generated/meta.json';

export const SITE_TITLE = 'The Cinema Ledger';
export const SITE_TAGLINE = 'A personal archive of film, rated in ten parts';

// TMDB image base comes from their /configuration endpoint at data-build time
// (meta.imageBase) — this is the ONLY place URLs get assembled from it. The JSON
// data stores relative file paths only.
const IMG_BASE = meta.imageBase || 'https://image.tmdb.org/t/p/';

export function withBase(path) {
  const b = import.meta.env.BASE_URL || '/';
  return (b.endsWith('/') ? b.slice(0, -1) : b) + path;
}

export function tmdbImg(path, size = 'w342') {
  return path ? `${IMG_BASE}${size}${path}` : null;
}

// Delegates to the one shared score formatter — see shared/rating-meta.mjs.
export { fmtScore as fmt1 } from '../../shared/rating-meta.mjs';

export function fmtRuntime(min) {
  if (!min) return null;
  const h = Math.floor(min / 60);
  return h ? `${h}h ${min % 60}m` : `${min}m`;
}

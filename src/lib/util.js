import meta from '../../data/generated/meta.json';

export const SITE_TITLE = 'The Cinema Ledger';
export const SITE_TAGLINE = 'A personal archive of film, rated in ten parts';
export const SITE_AUTHOR = 'Kiarash Farajzadehahary';
export const REPO_URL = 'https://github.com/kiarashfa/DrXRates';

// Theme chrome colors — each is that theme's --bg token in global.css. Used for
// <meta name="theme-color"> and the web manifest; keep in sync with the CSS.
export const THEME_BG = { light: '#f4efe4', dark: '#0f0e0c', matrix: '#020906' };

// TMDB image base comes from their /configuration endpoint at data-build time
// (meta.imageBase) — this is the ONLY place URLs get assembled from it. The JSON
// data stores relative TMDB file paths, with one exception: OMDb-fallback
// posters (films TMDB has no artwork for) are stored as full URLs and passed
// through untouched below.
const IMG_BASE = meta.imageBase || 'https://image.tmdb.org/t/p/';

export function withBase(path) {
  const b = import.meta.env.BASE_URL || '/';
  return (b.endsWith('/') ? b.slice(0, -1) : b) + path;
}

export function tmdbImg(path, size = 'w342') {
  if (!path) return null;
  if (path.startsWith('http')) return path; // OMDb-fallback poster: already a full URL
  return `${IMG_BASE}${size}${path}`;
}

// Delegates to the one shared score formatter — see shared/rating-meta.mjs.
export { fmtScore as fmt1 } from '../../shared/rating-meta.mjs';

export function fmtRuntime(min) {
  if (!min) return null;
  const h = Math.floor(min / 60);
  return h ? `${h}h ${min % 60}m` : `${min}m`;
}

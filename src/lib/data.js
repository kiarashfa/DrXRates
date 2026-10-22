// Build-time data access (Astro pages only; never shipped to the client).
import movies from '../../data/generated/movies.json';
import collections from '../../data/generated/collections.json';
import directors from '../../data/generated/directors.json';
import meta from '../../data/generated/meta.json';
import stillsIndex from '../../data/generated/stills.json';

export { movies, collections, directors, meta };

export const movieById = new Map(movies.map((m) => [m.id, m]));

// Dr. X's still frames per film (scripts/lib/stills.mjs). Rows are
// [frame, w, h, colour, group, scene index or -1]; frame 1 is the lead.
export function stillsFor(id) {
  const film = stillsIndex.films[id];
  if (!film) return null;
  return film.frames.map(([n, w, h, c, g, s]) => ({ n, w, h, c: `#${c}`, g, scene: s >= 0 ? film.scenes[s] : null }));
}
export const stillCounts = Object.fromEntries(Object.entries(stillsIndex.films).map(([id, f]) => [id, f.frames.length]));

const slugifyName = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export const directorSlugByName = new Map(directors.map((d) => [slugifyName(d.name), d.slug]));

export function directorPageFor(name) {
  const slug = slugifyName(name);
  return directorSlugByName.has(slug) ? slug : null;
}

export const directorBySlug = new Map(directors.map((d) => [d.slug, d]));

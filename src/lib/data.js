// Build-time data access (Astro pages only — never shipped to the client).
import movies from '../../data/generated/movies.json';
import collections from '../../data/generated/collections.json';
import directors from '../../data/generated/directors.json';
import meta from '../../data/generated/meta.json';

export { movies, collections, directors, meta };

export const movieById = new Map(movies.map((m) => [m.id, m]));

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

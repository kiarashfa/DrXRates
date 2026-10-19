// Build-time producers for the JSON the browser downloads, served as
// /data/<name>.json by src/pages/data/[file].json.ts. Everything is derived
// from the committed data/generated files during `astro build`, so client
// data always matches the pages it ships with. Read in the browser through
// src/lib/archive.js only.
import { createHash } from 'node:crypto';
import { movies, directors, collections } from './data.js';
import credits from '../../data/generated/credits.json';
import people from '../../data/generated/people.json';
import { movieSlug } from '../../shared/slug.mjs';
import { ALL_KEYS } from '../../shared/rating-meta.mjs';

// Slugs are rebuilt in the browser instead of shipped (~230KB gzipped), so a
// slug that can't be rebuilt must fail the build rather than break a link.
for (const m of movies) {
  if (m.slug !== movieSlug(m.title, m.year, m.id)) {
    throw new Error(`client-data: slug for movie ${m.id} can't be rebuilt from title/year/id ("${m.slug}")`);
  }
}

// Column files (films, scores, posters) share this row order and carry the
// same rev, so the loader can refuse to join rows from different builds.
const rows = [...movies].sort((a, b) => a.id - b.id);
const rev = createHash('sha1').update(rows.map((m) => m.id).join(',')).digest('hex').slice(0, 10);

const genreNames = [...new Set(rows.flatMap((m) => m.genres))].sort();
const genreBit = new Map(genreNames.map((g, i) => [g, 1 << i]));

const directorById = new Map();
for (const m of rows) for (const d of m.directors) if (!directorById.has(d.id)) directorById.set(d.id, d.name);
const directorIds = [...directorById.keys()].sort((a, b) => a - b);
const directorIndex = new Map(directorIds.map((id, i) => [id, i]));

const col = (get) => rows.map((m) => get(m) ?? null);

// Card rows: what a film card, Tonight or Compare shows for one film, as
// arrays in CARD_KEYS order (directors as [id, name], at most two).
const CARD_KEYS = ['id', 'title', 'year', 'directors', 'genres', 'runtime', 'tmdb', 'imdb', 'imdbVotes', 'rt', 'metacritic', 'poster'];
const cardRow = (m) => [
  m.id, m.title, m.year ?? null, m.directors.slice(0, 2).map((d) => [d.id, d.name]), m.genres, m.runtime ?? null,
  m.tmdbRating?.score ?? null, m.omdb?.imdb ?? null, m.omdb?.imdbVotes ?? null, m.omdb?.rottenTomatoes ?? null, m.omdb?.metacritic ?? null, m.poster ?? null,
];

// Poster lookups for a handful of films (search results, cards) come from
// small shards keyed by id % POSTER_SHARDS instead of the full posters file.
export const POSTER_SHARDS = 64;

const files = {
  // Every film: identity, genres (bitmask over genreNames), directors
  // (indices into directors) and pop, a popularity rank for ordering search
  // hits: round(10 × log10(TMDB votes)), so 100 votes → 20, 1M → 60.
  // Changes only when the archive itself changes.
  films: () => ({
    rev,
    genreNames,
    directors: directorIds.map((id) => [id, directorById.get(id)]),
    id: col((m) => m.id),
    title: col((m) => m.title),
    year: col((m) => m.year),
    genres: col((m) => m.genres.reduce((mask, g) => mask | genreBit.get(g), 0)),
    dirs: col((m) => m.directors.map((d) => directorIndex.get(d.id))),
    pop: col((m) => (m.tmdbRating?.votes ? Math.round(10 * Math.log10(m.tmdbRating.votes)) : 0)),
  }),
  // Community scores and runtime, aligned with films.
  scores: () => ({
    rev,
    tmdb: col((m) => m.tmdbRating?.score),
    tmdbVotes: col((m) => m.tmdbRating?.votes),
    imdb: col((m) => m.omdb?.imdb),
    imdbVotes: col((m) => m.omdb?.imdbVotes),
    rt: col((m) => m.omdb?.rottenTomatoes),
    metacritic: col((m) => m.omdb?.metacritic),
    runtime: col((m) => m.runtime),
  }),
  // TMDB poster paths (or absolute OMDb-fallback URLs), aligned with films.
  posters: () => ({ rev, poster: col((m) => m.poster) }),
  // Original titles, only where they differ from the title (search).
  'original-titles': () => ({
    byId: Object.fromEntries(rows.filter((m) => m.originalTitle).map((m) => [m.id, m.originalTitle])),
  }),
  // Dr. X's ten sub-scores per rated film, in ALL_KEYS order; totals are
  // recomputed client-side with computeTotals. Small, and the only file that
  // changes with day-to-day rating edits.
  rated: () => ({
    keys: ALL_KEYS.map((k) => k.key),
    byId: Object.fromEntries(rows.filter((m) => m.myRating).map((m) => [m.id, ALL_KEYS.map((k) => m.myRating.scores[k.key])])),
  }),
  // Dr. X's films as card rows minus the poster (posters are high-entropy and
  // only the picked film needs one): Tonight's default pool, ~50KB gzipped
  // instead of the whole archive.
  'rated-films': () => ({
    keys: CARD_KEYS.slice(0, -1),
    rows: rows.filter((m) => m.myRating).map((m) => cardRow(m).slice(0, -1)),
  }),
  // Search's non-film entries: directors with a page and collections.
  'search-extra': () => ({
    directors: directors.map((d) => ({ slug: d.slug, name: d.name, photo: d.profile ?? d.portraitUrl ?? null, rated: d.myCount })),
    collections: collections.map((c) => ({ slug: c.slug, title: c.title })),
  }),
  // The homepage catalog's first view: a fixed, evenly spread ~1/35 of the
  // archive with everything a card shows, so the page doesn't need the full
  // archive files until a visitor searches, filters, sorts or pages.
  'home-sample': () =>
    rows
      .filter((m) => (Math.imul(m.id, 2654435761) >>> 0) % 35 === 0)
      .map((m) => ({
        id: m.id,
        title: m.title,
        year: m.year,
        poster: m.poster,
        directors: m.directors.slice(0, 2).map((d) => d.name),
        my: m.myRating?.overall ?? null,
      })),
};

export const CLIENT_FILES = files;

// One poster shard: { [id]: poster } for films with id % POSTER_SHARDS === shard.
export function posterShard(shard) {
  return Object.fromEntries(rows.filter((m) => m.id % POSTER_SHARDS === shard && m.poster).map((m) => [m.id, m.poster]));
}

// Credits for a few films (compare, later the graph): /data/credits/<n>.json
// holds { roles: { [code]: label }, films: { [filmId]: { [code]: [personId, …] } } }
// for films with id % CREDIT_SHARDS === n (~23KB gzipped each). Names and
// portraits come separately from the people shards, so a lookup of a few
// people costs a few KB.
export const CREDIT_SHARDS = 64;
export const PEOPLE_SHARDS = 512;

export function creditShard(shard) {
  const films = {};
  for (const [id, roles] of Object.entries(credits.films)) if (Number(id) % CREDIT_SHARDS === shard) films[id] = roles;
  return { roles: credits.roles, films };
}

// One people shard: { [personId]: [name, profile path or null] } for people
// with id % PEOPLE_SHARDS === shard.
let peopleBuckets = null;
export function peopleShard(shard) {
  if (!peopleBuckets) {
    peopleBuckets = Array.from({ length: PEOPLE_SHARDS }, () => ({}));
    for (const [id, entry] of Object.entries(people)) peopleBuckets[Number(id) % PEOPLE_SHARDS][id] = entry;
  }
  return peopleBuckets[shard];
}

// Card shards: /data/cards/<n>.json holds { keys, rows } (card rows with the
// poster) for films with id % CARD_SHARDS === n (~14KB gzipped each), so a
// watchlist or a comparison loads only the films it shows.
export const CARD_SHARDS = 128;
export function cardShard(shard) {
  return { keys: CARD_KEYS, rows: rows.filter((m) => m.id % CARD_SHARDS === shard).map(cardRow) };
}

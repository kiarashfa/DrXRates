// Build-time producers for the JSON the browser downloads, served as
// /data/<name>.json by src/pages/data/[file].json.ts. Everything is derived
// from the committed data/generated files during `astro build`, so client
// data always matches the pages it ships with. Read in the browser through
// src/lib/archive.js only.
import { createHash } from 'node:crypto';
import { movies, directors, collections, stillCounts } from './data.js';
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
const popRank = (m) => (m.tmdbRating?.votes ? Math.round(10 * Math.log10(m.tmdbRating.votes)) : 0);
const delta = (ids) => ids.map((v, i) => (i ? v - ids[i - 1] : v));

// Dr. X Net graphs: the people credited on `films` (only those with at least
// `minFilms` of them) and, per film, per-role lists of indices into that
// people list, in NET_ROLES order (trailing empty roles dropped).
const NET_ROLES = ['d', 'a', 'w', 'c', 'm', 'e', 'p']; // = ROLES in src/lib/net.js
function netGraph(films, minFilms) {
  const count = new Map();
  for (const m of films) {
    const c = credits.films[m.id] ?? {};
    for (const p of new Set(NET_ROLES.flatMap((r) => c[r] ?? []))) count.set(p, (count.get(p) ?? 0) + 1);
  }
  const ids = [...count.keys()].filter((p) => count.get(p) >= minFilms).sort((a, b) => a - b);
  const index = new Map(ids.map((p, i) => [p, i]));
  const filmCredits = films.map((m) => {
    const c = credits.films[m.id] ?? {};
    const out = NET_ROLES.map((r) => (c[r] ?? []).filter((p) => index.has(p)).map((p) => index.get(p)));
    while (out.length && !out.at(-1).length) out.pop();
    return out;
  });
  const netRev = createHash('sha1').update(ids.join(',')).digest('hex').slice(0, 10);
  return { ids, credits: filmCredits, rev: netRev };
}
let ratedNet = null;
const ratedGraph = () => (ratedNet ??= netGraph(rows.filter((m) => m.myRating), 1));

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

// Name the Frame: Dr. X's films that have still frames. `e` holds four
// percentiles (0–100, within these films) that src/lib/frame-game.js weighs
// into how recognisable a film is: IMDb votes, IMDb rating, the best-known of
// the top three billed actors and the director's standing. Actors and
// directors are measured over the whole archive: every film they lead or
// direct adds log10(IMDb votes) − 4, so a 10k-vote film adds nothing and a
// 1M-vote film adds 2.
export const frameFilms = rows.filter((m) => m.myRating && stillCounts[m.id]);
function frameEase() {
  const fame = new Map();
  const add = (key, w) => fame.set(key, (fame.get(key) ?? 0) + w);
  for (const m of rows) {
    const w = Math.max(0, Math.log10(m.omdb?.imdbVotes || 1) - 4);
    if (!w) continue;
    for (const c of (m.cast ?? []).slice(0, 3)) add(`a${c.id}`, w);
    for (const d of m.directors) add(`d${d.id}`, w);
  }
  const raw = frameFilms.map((m) => [
    m.omdb?.imdbVotes ?? 0,
    m.omdb?.imdb ?? 0,
    Math.max(0, ...(m.cast ?? []).slice(0, 3).map((c) => fame.get(`a${c.id}`) ?? 0)),
    Math.max(0, ...m.directors.map((d) => fame.get(`d${d.id}`) ?? 0)),
  ]);
  const pct = [0, 1, 2, 3].map((k) => {
    const sorted = raw.map((r) => r[k]).sort((a, b) => a - b);
    return (v) => {
      let lo = 0;
      let hi = sorted.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (sorted[mid] < v) lo = mid + 1;
        else hi = mid;
      }
      return Math.round((100 * lo) / Math.max(1, sorted.length - 1));
    };
  });
  return raw.map((r) => r.map((v, k) => pct[k](v)));
}

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
  // changes with day-to-day rating edits. `stills`: how many of Dr. X's still
  // frames each film has (films without frames are left out), for card tags.
  rated: () => ({
    keys: ALL_KEYS.map((k) => k.key),
    byId: Object.fromEntries(rows.filter((m) => m.myRating).map((m) => [m.id, ALL_KEYS.map((k) => m.myRating.scores[k.key])])),
    stills: stillCounts,
  }),
  // Dr. X's films as card rows minus the poster (posters are high-entropy and
  // only the picked film needs one): Tonight's default pool, ~50KB gzipped
  // instead of the whole archive.
  'rated-films': () => ({
    keys: CARD_KEYS.slice(0, -1),
    rows: rows.filter((m) => m.myRating).map((m) => cardRow(m).slice(0, -1)),
  }),
  // Name the Frame's films (see frameFilms): ids delta-encoded, genres as a
  // bitmask over genreNames, director names, IMDb votes and rating, Dr. X's
  // total and halves, how many frames each has (numbered 1…n, 1 = the lead)
  // and the ease percentiles [votes, imdb, star, director].
  frames: () => {
    const ease = frameEase();
    return {
      genreNames,
      id: delta(frameFilms.map((m) => m.id)),
      title: frameFilms.map((m) => m.title),
      year: frameFilms.map((m) => m.year ?? null),
      genres: frameFilms.map((m) => m.genres.reduce((mask, g) => mask | genreBit.get(g), 0)),
      directors: frameFilms.map((m) => m.directors.slice(0, 2).map((d) => d.name)),
      votes: frameFilms.map((m) => m.omdb?.imdbVotes ?? 0),
      imdb: frameFilms.map((m) => m.omdb?.imdb ?? null),
      my: frameFilms.map((m) => [m.myRating.overall, m.myRating.contentAvg, m.myRating.formAvg]),
      frames: frameFilms.map((m) => stillCounts[m.id]),
      ease,
    };
  },
  // Search's non-film entries: directors with a page and collections.
  'search-extra': () => ({
    directors: directors.map((d) => ({ slug: d.slug, name: d.name, photo: d.profile ?? d.portraitUrl ?? null, rated: d.myCount })),
    collections: collections.map((c) => ({ slug: c.slug, title: c.title })),
  }),
  // Dr. X Net over Dr. X's films: the films (ids delta-encoded; pop as in
  // films), everyone credited on them and each film's credits. Faces are in
  // net-faces (same people order and rev), loaded after the graph shows.
  net: () => {
    const films = rows.filter((m) => m.myRating);
    const g = ratedGraph();
    return {
      rev: g.rev,
      roles: NET_ROLES,
      films: {
        id: delta(films.map((m) => m.id)),
        title: films.map((m) => m.title),
        year: films.map((m) => m.year ?? null),
        pop: films.map(popRank),
        imdb: films.map((m) => m.omdb?.imdb ?? null),
        poster: films.map((m) => m.poster ?? null),
      },
      people: { id: delta(g.ids), name: g.ids.map((p) => people[p]?.[0] ?? '') },
      credits: g.credits,
    };
  },
  'net-faces': () => {
    const g = ratedGraph();
    return { rev: g.rev, profile: g.ids.map((p) => people[p]?.[1] ?? null) };
  },
  // Search's people: everyone in two or more of Dr. X's films, except
  // directors with a page (search lists those already). Results open them in
  // Dr. X Net. Rows are [id, name, films]; faces come from the people shards
  // for the few results shown.
  'search-people': () => {
    const withPage = new Set(directors.map((d) => d.tmdbPersonId).filter(Boolean));
    const films = rows.filter((m) => m.myRating);
    const count = new Map();
    for (const m of films) {
      const c = credits.films[m.id] ?? {};
      for (const p of new Set(NET_ROLES.flatMap((r) => c[r] ?? []))) count.set(p, (count.get(p) ?? 0) + 1);
    }
    return {
      people: [...count]
        .filter(([p, n]) => n >= 2 && !withPage.has(p) && people[p])
        .sort((a, b) => b[1] - a[1] || a[0] - b[0])
        .map(([p, n]) => [p, people[p][0], n]),
    };
  },
  // Dr. X Net over the whole archive: only people in two or more films (the
  // rest can't link anywhere; a centred film's full credits come from the
  // credit shards). Films are the rows of `films` (same rev).
  'net-archive': () => {
    const g = netGraph(rows, 2);
    return { rev, roles: NET_ROLES, people: { id: delta(g.ids), name: g.ids.map((p) => people[p]?.[0] ?? '') }, credits: g.credits };
  },
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
        ...(stillCounts[m.id] ? { stills: stillCounts[m.id] } : {}),
      })),
};

export const CLIENT_FILES = files;

// One poster shard: { [id]: poster } for films with id % POSTER_SHARDS === shard.
export function posterShard(shard) {
  return Object.fromEntries(rows.filter((m) => m.id % POSTER_SHARDS === shard && m.poster).map((m) => [m.id, m.poster]));
}

// Backdrop shards, the same way: /data/backdrops/<n>.json holds { [id]: backdrop }
// (the profile page's cover is the backdrop of the visitor's highest-rated film).
export const BACKDROP_SHARDS = 64;
export function backdropShard(shard) {
  return Object.fromEntries(rows.filter((m) => m.id % BACKDROP_SHARDS === shard && m.backdrop).map((m) => [m.id, m.backdrop]));
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

// Synopsis shards: /data/overviews/<n>.json holds { [id]: text } for films
// with id % OVERVIEW_SHARDS === n, each clipped to a few sentences (what
// Tonight's ticket shows for the film it deals).
export const OVERVIEW_SHARDS = 128;
const OVERVIEW_MAX = 320;
function clipOverview(text) {
  if (text.length <= OVERVIEW_MAX) return text;
  const cut = text.slice(0, OVERVIEW_MAX);
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}
export function overviewShard(shard) {
  return Object.fromEntries(rows.filter((m) => m.id % OVERVIEW_SHARDS === shard && m.overview).map((m) => [m.id, clipOverview(m.overview)]));
}

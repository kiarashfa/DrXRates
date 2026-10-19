// Client-side access to the archive data in /data/*.json (built by
// src/pages/data/[file].json.ts from src/lib/client-data.js). Each file is
// fetched at most once per page view and shared by every component asking
// for it; film objects are built once and enriched in place as more files load.
import { withBase } from './util.js';
import { movieSlug } from '../../shared/slug.mjs';
import { computeTotals } from '../../shared/rating-meta.mjs';

const pending = new Map();

async function fetchFile(name, bust = false) {
  const res = await fetch(withBase(`/data/${name}.json${bust ? `?t=${Date.now()}` : ''}`));
  if (!res.ok) throw new Error(`Couldn't load ${name} (HTTP ${res.status}).`);
  return res.json();
}

function loadFile(name) {
  if (!pending.has(name)) {
    pending.set(
      name,
      fetchFile(name).catch((err) => {
        pending.delete(name); // let a later call retry
        throw err;
      })
    );
  }
  return pending.get(name);
}

// films/scores/posters are row-aligned. A deploy landing between two fetches
// could pair rows from different builds, so all must share one rev; on a
// mismatch everything is refetched once past the HTTP cache.
async function loadAligned(names) {
  let files = await Promise.all(names.map(loadFile));
  if (new Set(files.map((f) => f.rev)).size > 1) {
    files = await Promise.all(
      names.map((n) => {
        const p = fetchFile(n, true);
        pending.set(n, p);
        return p;
      })
    );
    if (new Set(files.map((f) => f.rev)).size > 1) {
      throw new Error('The archive was updated while loading. Reload the page to continue.');
    }
  }
  return files;
}

let archive = null; // { rev, list, byId }
const attached = new Set();

function buildArchive(f) {
  const directors = f.directors.map(([id, name]) => ({ id, name }));
  const list = f.id.map((id, i) => ({
    id,
    title: f.title[i],
    year: f.year[i],
    slug: movieSlug(f.title[i], f.year[i], id),
    genres: f.genreNames.filter((_, g) => f.genres[i] & (1 << g)),
    directors: f.dirs[i].map((d) => directors[d]),
    pop: f.pop[i],
  }));
  return { rev: f.rev, list, byId: new Map(list.map((m) => [m.id, m])) };
}

function attachScores(s) {
  archive.list.forEach((m, i) => {
    m.tmdb = s.tmdb[i];
    m.tmdbVotes = s.tmdbVotes[i];
    m.imdb = s.imdb[i];
    m.imdbVotes = s.imdbVotes[i];
    m.rt = s.rt[i];
    m.metacritic = s.metacritic[i];
    m.runtime = s.runtime[i];
  });
}

function attachPosters(p) {
  archive.list.forEach((m, i) => (m.poster = p.poster[i]));
}

function attachOriginalTitles(o) {
  for (const m of archive.list) m.originalTitle = o.byId[m.id] ?? null;
}

function attachRated(byId) {
  for (const m of archive.list) {
    m.myRating = byId.get(m.id) ?? null;
    m.my = m.myRating?.overall ?? null; // the number the shared sorts read
  }
}

// Dr. X's ratings as Map(id → { scores, contentAvg, formAvg, overall }).
let ratedMap = null;
export async function loadRated() {
  if (!ratedMap) {
    const r = await loadFile('rated');
    ratedMap = new Map(
      Object.entries(r.byId).map(([id, vals]) => {
        const scores = Object.fromEntries(r.keys.map((k, i) => [k, vals[i]]));
        return [Number(id), { scores, ...computeTotals(scores) }];
      })
    );
  }
  return ratedMap;
}

// The whole archive as { list, byId } of film objects:
//   always   id, title, year, slug, genres[], directors[{ id, name }], pop (search rank, see client-data.js)
//   scores   tmdb, tmdbVotes, imdb, imdbVotes, rt, metacritic, runtime (runtime in minutes)
//   posters  poster
//   rated    myRating ({ scores, contentAvg, formAvg, overall } or null), my (overall or null)
//   originalTitles  originalTitle (or null)
// Missing values are null. Options only add fields; objects stay the same.
export async function loadArchive({ scores = false, posters = false, rated = false, originalTitles = false } = {}) {
  const want = ['films', ...(scores ? ['scores'] : []), ...(posters ? ['posters'] : [])];
  const extras = [originalTitles ? loadFile('original-titles') : null, rated ? loadRated() : null];
  const [files, [orig, ratedById]] = await Promise.all([loadAligned(want), Promise.all(extras)]);
  const [films, ...rest] = files;
  if (!archive || archive.rev !== films.rev) {
    archive = buildArchive(films);
    attached.clear();
  }
  rest.forEach((file, i) => {
    const name = want[i + 1];
    if (attached.has(name)) return;
    if (name === 'scores') attachScores(file);
    else attachPosters(file);
    attached.add(name);
  });
  if (orig && !attached.has('original-titles')) {
    attachOriginalTitles(orig); // keyed by id, so no row alignment to check
    attached.add('original-titles');
  }
  if (ratedById && !attached.has('rated')) {
    attachRated(ratedById);
    attached.add('rated');
  }
  return archive;
}

// Posters for a few films by id, from the small shards rather than the full
// posters file. Resolves to Map(id → poster path or null).
const POSTER_SHARDS = 64; // = POSTER_SHARDS in client-data.js
export async function loadPosters(ids) {
  const shards = [...new Set(ids.map((id) => id % POSTER_SHARDS))];
  const maps = await Promise.all(shards.map((s) => loadFile(`posters/${s}`).catch(() => ({}))));
  const byShard = new Map(shards.map((s, i) => [s, maps[i]]));
  return new Map(ids.map((id) => [id, byShard.get(id % POSTER_SHARDS)[id] ?? null]));
}

// Search's directors-with-pages and collections (see client-data.js).
export function loadSearchExtra() {
  return loadFile('search-extra');
}

// The homepage catalog's first view (see client-data.js), as film objects
// with the fields a card needs.
export async function loadHomeSample() {
  const sample = await loadFile('home-sample');
  return sample.map((m) => ({ ...m, slug: movieSlug(m.title, m.year, m.id) }));
}

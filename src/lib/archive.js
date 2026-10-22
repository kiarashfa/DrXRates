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
    m.stills = stillCounts.get(m.id) ?? 0;
  }
}

// Dr. X's ratings as Map(id → { scores, contentAvg, formAvg, overall }); the
// same file carries how many still frames each film has (stillCounts).
let ratedMap = null;
const stillCounts = new Map();
export async function loadRated() {
  if (!ratedMap) {
    const r = await loadFile('rated');
    for (const [id, n] of Object.entries(r.stills ?? {})) stillCounts.set(Number(id), n);
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
//   rated    myRating ({ scores, contentAvg, formAvg, overall } or null), my (overall or null),
//            stills (number of Dr. X's still frames, 0 if none)
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

// Film objects from card rows (rated-films, card shards): the same fields as
// loadArchive with scores, rated and (from shards) posters, minus pop.
function cardFilm(keys, row, rated) {
  const m = Object.fromEntries(keys.map((k, i) => [k, row[i]]));
  m.slug = movieSlug(m.title, m.year, m.id);
  m.directors = m.directors.map(([id, name]) => ({ id, name }));
  m.myRating = rated.get(m.id) ?? null;
  m.my = m.myRating?.overall ?? null;
  m.stills = stillCounts.get(m.id) ?? 0;
  return m;
}

// Dr. X's rated films as film objects (no posters; see loadPosters).
export async function loadRatedFilms() {
  const [file, rated] = await Promise.all([loadFile('rated-films'), loadRated()]);
  return file.rows.map((row) => cardFilm(file.keys, row, rated));
}

// A few films by id from the card shards, posters included. Resolves to
// Map(id → film object or null).
const CARD_SHARDS = 128; // = CARD_SHARDS in client-data.js
export async function loadFilms(ids) {
  const shards = [...new Set(ids.map((id) => id % CARD_SHARDS))];
  const [files, rated] = await Promise.all([Promise.all(shards.map((s) => loadFile(`cards/${s}`))), loadRated()]);
  const wanted = new Set(ids);
  const found = new Map();
  for (const file of files) {
    const idCol = file.keys.indexOf('id');
    for (const row of file.rows) if (wanted.has(row[idCol])) found.set(row[idCol], cardFilm(file.keys, row, rated));
  }
  return new Map(ids.map((id) => [id, found.get(id) ?? null]));
}

// Credits for a few films from the credit shards. Resolves to
// { roles: { [code]: label }, byId: Map(id → { [code]: [personId, …] } or null) }.
const CREDIT_SHARDS = 64; // = CREDIT_SHARDS in client-data.js
export async function loadCredits(ids) {
  const shards = [...new Set(ids.map((id) => id % CREDIT_SHARDS))];
  const files = await Promise.all(shards.map((s) => loadFile(`credits/${s}`)));
  const byShard = new Map(shards.map((s, i) => [s, files[i]]));
  return {
    roles: files[0]?.roles ?? {},
    byId: new Map(ids.map((id) => [id, byShard.get(id % CREDIT_SHARDS).films[id] ?? null])),
  };
}

// Names and portraits for a few people. Resolves to
// Map(personId → { name, profile } or null).
const PEOPLE_SHARDS = 512; // = PEOPLE_SHARDS in client-data.js
export async function loadPeople(ids) {
  const shards = [...new Set(ids.map((id) => id % PEOPLE_SHARDS))];
  const maps = await Promise.all(shards.map((s) => loadFile(`people/${s}`).catch(() => ({}))));
  const byShard = new Map(shards.map((s, i) => [s, maps[i]]));
  return new Map(
    ids.map((id) => {
      const e = byShard.get(id % PEOPLE_SHARDS)[id];
      return [id, e ? { name: e[0], profile: e[1] ?? null } : null];
    })
  );
}

// Dr. X Net (see client-data.js), decoded for src/lib/net.js's buildNet:
// { films: { id, title, year, pop, imdb?, poster? }, people: { id, name }, credits }.
const undelta = (arr) => {
  let v = 0;
  return arr.map((d) => (v += d));
};
let netPending = null;
export function loadNet() {
  netPending ??= loadFile('net')
    .then((f) => ({ rev: f.rev, films: { ...f.films, id: undelta(f.films.id) }, people: { id: undelta(f.people.id), name: f.people.name }, credits: f.credits }))
    .catch((err) => {
      netPending = null;
      throw err;
    });
  return netPending;
}

// Faces for loadNet's people: Map(personId → profile path). Resolves to an
// empty map if they can't be matched to the graph (a deploy mid-load).
export async function loadNetFaces() {
  const net = await loadNet();
  let faces = await loadFile('net-faces');
  if (faces.rev !== net.rev) faces = await fetchFile('net-faces', true);
  if (faces.rev !== net.rev) return new Map();
  return new Map(net.people.id.map((id, i) => [id, faces.profile[i]]));
}

// The whole archive's graph: films from the films file (same rows and rev),
// people in two or more films. ~1.15MB gzipped plus the films file.
export async function loadNetArchive() {
  const [, file] = await loadAligned(['films', 'net-archive']);
  const { list } = await loadArchive();
  return {
    rev: file.rev,
    films: { id: list.map((m) => m.id), title: list.map((m) => m.title), year: list.map((m) => m.year), pop: list.map((m) => m.pop) },
    people: { id: undelta(file.people.id), name: file.people.name },
    credits: file.credits,
  };
}

// Name the Frame's films (see client-data.js) as
// [{ id, title, year, genres[], directors[name], votes, imdb, my, content,
//    form, frames (count; frame 1 is the lead), e: { votes, imdb, star, dir } (0–1) }].
let framesPending = null;
export function loadFrameFilms() {
  framesPending ??= loadFile('frames')
    .then((f) => {
      const ids = undelta(f.id);
      return ids.map((id, i) => ({
        id,
        title: f.title[i],
        year: f.year[i],
        genres: f.genreNames.filter((_, g) => f.genres[i] & (1 << g)),
        directors: f.directors[i],
        votes: f.votes[i],
        imdb: f.imdb[i],
        my: f.my[i][0],
        content: f.my[i][1],
        form: f.my[i][2],
        frames: f.frames[i],
        e: { votes: f.ease[i][0] / 100, imdb: f.ease[i][1] / 100, star: f.ease[i][2] / 100, dir: f.ease[i][3] / 100 },
      }));
    })
    .catch((err) => {
      framesPending = null;
      throw err;
    });
  return framesPending;
}

// Search's directors-with-pages and collections (see client-data.js).
export function loadSearchExtra() {
  return loadFile('search-extra');
}

// Search's people (Dr. X Net): [{ id, name, rated }] (faces: loadPeople).
export async function loadSearchPeople() {
  const { people } = await loadFile('search-people');
  return people.map(([id, name, rated]) => ({ id, name, rated }));
}

// The homepage catalog's first view (see client-data.js), as film objects
// with the fields a card needs.
export async function loadHomeSample() {
  const sample = await loadFile('home-sample');
  return sample.map((m) => ({ ...m, slug: movieSlug(m.title, m.year, m.id) }));
}

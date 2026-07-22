import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = 'https://api.themoviedb.org/3';
const CACHE_DIR = path.resolve('data/cache/tmdb');

let inFlight = 0;
let queue = [];
const MAX_CONCURRENT = 8;
const MIN_GAP_MS = 30;
let lastStart = 0;

const stats = { network: 0, cacheHits: 0 };
export function fetchStats() {
  return { ...stats };
}

function token() {
  const t = process.env.TMDB_TOKEN;
  if (!t) throw new Error('TMDB_TOKEN missing — put it in .env (see .env.example)');
  return t;
}

async function throttled(fn) {
  if (inFlight >= MAX_CONCURRENT) {
    await new Promise((resolve) => queue.push(resolve));
  }
  inFlight++;
  const wait = Math.max(0, lastStart + MIN_GAP_MS - Date.now());
  lastStart = Date.now() + wait;
  if (wait) await new Promise((r) => setTimeout(r, wait));
  try {
    return await fn();
  } finally {
    inFlight--;
    const next = queue.shift();
    if (next) next();
  }
}

// Cache reads need their own concurrency gate: build-data fires tens of
// thousands of tmdbGet calls at once, and unbounded parallel readFile calls
// exhaust Windows' ~8k open-file limit (EMFILE). Before this gate existed,
// those failures were silently treated as cache misses — a full re-fetch of
// the movie-detail cache on every run once the archive passed ~10k films.
const IO_MAX = 256;
let ioInFlight = 0;
const ioQueue = [];
async function ioGated(fn) {
  if (ioInFlight >= IO_MAX) {
    await new Promise((resolve) => ioQueue.push(resolve));
  }
  ioInFlight++;
  try {
    return await fn();
  } finally {
    ioInFlight--;
    const next = ioQueue.shift();
    if (next) next();
  }
}

async function rawGet(url) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token()}`, Accept: 'application/json' },
      });
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after')) || 2 * attempt;
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        continue;
      }
      if (res.status === 404) return { __notFound: true };
      if (!res.ok) throw new Error(`TMDB ${res.status} for ${url}`);
      return await res.json();
    } catch (err) {
      if (attempt === 4) throw err;
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
}

function cachePath(url) {
  const hash = createHash('sha1').update(url).digest('hex');
  return path.join(CACHE_DIR, `${hash}.json`);
}

export async function tmdbGet(endpoint, params = {}, { offline = false } = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `${BASE}${endpoint}${qs ? `?${qs}` : ''}`;
  const file = cachePath(url);
  try {
    const cached = JSON.parse(await ioGated(() => readFile(file, 'utf8')));
    stats.cacheHits++;
    return cached.data;
  } catch (err) {
    // Only a genuinely absent file (or corrupt JSON, which has no .code) is a
    // cache miss. Anything else (EMFILE, EPERM, …) must fail loudly — silently
    // refetching would waste thousands of calls and mask the real problem.
    if (err?.code && err.code !== 'ENOENT') throw err;
  }
  if (offline) return null;
  const data = await throttled(() => rawGet(url));
  stats.network++;
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify({ url, fetchedAt: new Date().toISOString(), data }), 'utf8');
  return data;
}

export const searchMovie = (query, params = {}, opts) =>
  tmdbGet('/search/movie', { query, include_adult: 'false', ...params }, opts);

export const movieDetails = (id, opts) =>
  tmdbGet(`/movie/${id}`, { append_to_response: 'credits,external_ids' }, opts);

export const searchPerson = (query, opts) => tmdbGet('/search/person', { query }, opts);

export const personDetails = (id, opts) =>
  tmdbGet(`/person/${id}`, { append_to_response: 'movie_credits' }, opts);

export const searchCollection = (query, opts) => tmdbGet('/search/collection', { query }, opts);

export const collectionDetails = (id, opts) => tmdbGet(`/collection/${id}`, {}, opts);

export const topRated = (page, opts) => tmdbGet('/movie/top_rated', { page: String(page) }, opts);

// Most-voted films via /discover. `maxVotes` (vote_count.lte) lets callers walk
// the universe downward in bands, past the 500-page cap of a single sorted list.
export const mostVoted = (page, { minVotes, maxVotes, ...opts } = {}) => {
  const params = { sort_by: 'vote_count.desc', 'vote_count.gte': String(minVotes), page: String(page) };
  if (maxVotes != null) params['vote_count.lte'] = String(maxVotes);
  return tmdbGet('/discover/movie', params, opts);
};

export const popular = (page, opts) => tmdbGet('/movie/popular', { page: String(page) }, opts);

export const configuration = (opts) => tmdbGet('/configuration', {}, opts);

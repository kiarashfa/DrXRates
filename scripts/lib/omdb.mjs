import path from 'node:path';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cachedJson } from './cached-fetch.mjs';

const CACHE_DIR = path.resolve('data/cache/omdb');

// True when a real OMDb answer (found or not-found) is already on disk —
// rate-limit errors are never cached, so this is safe for quota planning.
export function omdbHasCached(imdbId) {
  const hash = createHash('sha1').update(`omdb:${imdbId}`).digest('hex');
  return existsSync(path.join(CACHE_DIR, `${hash}.json`));
}

// OMDb free keys allow 1,000 requests/day. Once the limit trips we stop asking;
// the disk cache means each daily run fills in more coverage.
let limitHit = false;
export const omdbLimitHit = () => limitHit;

function parseOmdb(d) {
  if (!d || d.__notFound || d.Response === 'False') return null;
  const num = (s) => {
    if (s == null || s === 'N/A') return null;
    const m = /([\d.]+)/.exec(String(s));
    return m ? Number(m[1]) : null;
  };
  const rtRaw = (d.Ratings ?? []).find((r) => r.Source === 'Rotten Tomatoes')?.Value;
  const out = {
    imdb: num(d.imdbRating),
    imdbVotes: d.imdbVotes && d.imdbVotes !== 'N/A' ? Number(d.imdbVotes.replace(/,/g, '')) : null,
    metacritic: num(d.Metascore),
    rottenTomatoes: num(rtRaw),
  };
  return out.imdb == null && out.metacritic == null && out.rottenTomatoes == null ? null : out;
}

export async function omdbByImdbId(imdbId, { offline = false } = {}) {
  const key = process.env.OMDB_API_KEY;
  if (!key || !imdbId) return { ratings: null, poster: null, fetched: false };

  const url = `https://www.omdbapi.com/?i=${encodeURIComponent(imdbId)}&apikey=${key}`;
  const { data, fromCache } = await cachedJson(url, {
    cacheDir: CACHE_DIR,
    cacheKey: `omdb:${imdbId}`,
    offline: offline || limitHit,
    // Never cache rate-limit or auth errors — only real answers (incl. not-found).
    shouldCache: (d) =>
      d.__notFound === true || d.Response === 'True' || (d.Response === 'False' && /not found/i.test(d.Error ?? '')),
  });
  if (data && data.Response === 'False' && /limit|exceeded|invalid api key|unauthorized/i.test(data.Error ?? '')) {
    if (!limitHit) console.log(`  OMDb stopped: ${data.Error}`);
    limitHit = true;
    return { ratings: null, poster: null, fetched: false };
  }
  // Poster is independent of ratings — some obscure films have artwork but no scores.
  const poster = data?.Response === 'True' && data.Poster && data.Poster !== 'N/A' ? data.Poster : null;
  return { ratings: parseOmdb(data), poster, fetched: !fromCache && data != null };
}

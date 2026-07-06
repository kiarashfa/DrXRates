import path from 'node:path';
import { cachedJson } from './cached-fetch.mjs';

const CACHE_DIR = path.resolve('data/cache/wiki');

// Wikipedia REST summary — portrait + first-paragraph fallback for directors
// TMDB can't resolve (e.g. 'Coen Brothers', 'The Wachowskis').
export async function wikiSummary(title, { offline = false } = {}) {
  const slug = encodeURIComponent(title.trim().replace(/ /g, '_'));
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${slug}?redirect=true`;
  const { data } = await cachedJson(url, {
    cacheDir: CACHE_DIR,
    cacheKey: `wiki:${title}`,
    offline,
    headers: { 'User-Agent': 'CinemaLedger/1.0 (personal static site build)' },
  });
  if (!data || data.__notFound || data.type !== 'standard') return null;
  return {
    title: data.title,
    portrait: data.thumbnail?.source ?? null,
    extract: data.extract ?? null,
    pageUrl: data.content_urls?.desktop?.page ?? null,
  };
}

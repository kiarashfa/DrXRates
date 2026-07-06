// Daily OMDb top-up. Run once a day, unsupervised:
//
//   npm run omdb              (or: node scripts/fetch-omdb-batch.mjs --batch 3)
//
// Each run fetches OMDb data for the next ~1,000 movies that don't have a cached
// answer yet, in the same priority order the main build uses (your rated films
// first, then by TMDB vote count). Results land in the shared disk cache
// (data/cache/omdb/), so the next `npm run data` picks them up automatically —
// there is no separate data format. Already-cached movies are skipped, so
// re-running any batch number never wastes quota. Exits cleanly, no prompts.
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { omdbByImdbId, omdbHasCached, omdbLimitHit } from './lib/omdb.mjs';

const DEFAULT_LIMIT = 990; // headroom under OMDb's 1,000/day free tier

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const batch = arg('batch');
const limit = Number(arg('limit', DEFAULT_LIMIT));

async function main() {
  if (!process.env.OMDB_API_KEY) {
    console.error('OMDB_API_KEY missing from .env — nothing to do.');
    process.exit(1);
  }

  let movies;
  try {
    movies = JSON.parse(await readFile('data/generated/movies.json', 'utf8'));
  } catch {
    console.error("Can't read data/generated/movies.json — run `npm run data` first.");
    process.exit(1);
  }

  // Same id source and priority as the main build: rated first, then vote count.
  const queue = movies
    .filter((m) => m.imdbId)
    .sort((a, b) => (b.myRating ? 1 : 0) - (a.myRating ? 1 : 0) || (b.tmdbRating?.votes ?? 0) - (a.tmdbRating?.votes ?? 0));

  const cachedAlready = queue.filter((m) => omdbHasCached(m.imdbId));
  const todo = queue.filter((m) => !omdbHasCached(m.imdbId));

  console.log(`OMDb batch${batch ? ` #${batch}` : ''} — ${new Date().toISOString().slice(0, 16)}`);
  console.log(`  ${queue.length} movies with an IMDb id · ${cachedAlready.length} already cached · ${todo.length} still to fetch`);

  if (!todo.length) {
    console.log('  Nothing left to fetch — coverage is complete. 🎬');
  }

  let fetched = 0;
  let noData = 0;
  let errors = 0;
  const slice = todo.slice(0, limit);
  const workers = Array.from({ length: 8 }, async () => {
    while (slice.length && !omdbLimitHit()) {
      const m = slice.shift();
      if (!m) break;
      try {
        const { ratings, fetched: didFetch } = await omdbByImdbId(m.imdbId);
        if (didFetch) {
          fetched++;
          if (!ratings) noData++;
          if (fetched % 200 === 0) console.log(`  …${fetched} fetched`);
        }
      } catch (err) {
        errors++;
        if (errors <= 3) console.log(`  error on ${m.imdbId} (${m.title}): ${err.message}`);
      }
    }
  });
  await Promise.all(workers);

  const remaining = todo.length - fetched;
  console.log('');
  console.log(`  Fetched this run: ${fetched} (${noData} had no scores on OMDb)`);
  if (errors) console.log(`  Errors: ${errors}`);
  if (omdbLimitHit()) console.log('  Stopped early: OMDb daily limit reached — run again tomorrow.');

  // Overall coverage summary (cache-only, no extra quota).
  const nowCached = queue.filter((m) => omdbHasCached(m.imdbId)).length;
  const pct = queue.length ? Math.round((nowCached / queue.length) * 100) : 0;
  console.log('');
  console.log(`  Overall coverage: ${nowCached}/${queue.length} movies cached (${pct}%)`);
  if (remaining > 0) {
    console.log(`  Remaining: ${remaining} — roughly ${Math.ceil(remaining / limit)} more daily run(s).`);
  } else {
    console.log('  All done. Run `npm run data` once more so the site JSON includes everything.');
  }
  console.log('  (New answers reach the site on your next `npm run data` + build.)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

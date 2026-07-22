import 'dotenv/config';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { parseRatings, parseAsl } from './lib/excel.mjs';
import { matchMovie, normalizeTitle } from './lib/match.mjs';
import {
  movieDetails,
  searchPerson,
  personDetails,
  searchCollection,
  collectionDetails,
  topRated,
  popular,
  mostVoted,
  configuration,
  fetchStats,
} from './lib/tmdb.mjs';
import { omdbByImdbId, omdbLimitHit } from './lib/omdb.mjs';
import { wikiSummary } from './lib/wiki.mjs';

const offline = process.argv.includes('--excel-only');
const OUT_DIR = path.resolve('data/generated');
const REVIEW_DIR = path.resolve('data/review');
// Base layer target ≥20,000 movies: TMDB top-rated + popular list pages (20
// movies each; the API caps any list at page 500) + most-voted films via
// /discover, walked downward in vote-count bands until TARGET_MOVIES unique ids.
const TOP_RATED_PAGES = 500;
const POPULAR_PAGES = 160;
const VOTE_FLOOR = 100; // never take films below this many TMDB votes
const TARGET_MOVIES = 20300; // small buffer over 20k for detail-fetch dropouts
const FALLBACK_IMG_BASE = 'https://image.tmdb.org/t/p/';

function slugify(s) {
  const slug = String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'film';
}

function round1(n) {
  return n == null ? null : Math.round(n * 10) / 10;
}

async function loadJson(p, fallback) {
  try {
    return JSON.parse(await readFile(p, 'utf8'));
  } catch {
    return fallback;
  }
}

const log = (...a) => console.log(...a);

async function main() {
  const t0 = Date.now();
  log('— Parsing Excel sources…');
  const [{ movies: rated, warnings: excelWarnings }, { rows: aslRows, skipped: aslSkipped }] =
    await Promise.all([parseRatings('Rating_DB.xlsx'), parseAsl('ASL_DB.xlsx')]);
  log(`  ${rated.length} rated films, ${aslRows.length} ASL rows (${aslSkipped.length} skipped: NA/?/avg rows)`);

  const config = await loadJson('data/collections.config.json', { collections: [] });
  const overridesRaw = await loadJson('data/overrides.json', {});
  const overrides = Object.fromEntries(Object.entries(overridesRaw).filter(([k]) => k !== '_readme'));

  const review = { unmatched: [], ambiguous: [], loose: [], resolutionNotes: [] };

  log('— Matching rated films against TMDB…');
  const ratingByTmdbId = new Map();
  let matchedCount = 0;
  await Promise.all(
    rated.map(async (m) => {
      const res = await matchMovie(m, { overrides, offline });
      if (res.review) {
        const bucket = res.status === 'unmatched' ? 'unmatched' : res.status === 'ambiguous' ? 'ambiguous' : 'loose';
        review[bucket].push({ source: 'ratings', excelRow: m.excelRow, ...res.review });
      }
      if (res.id != null) {
        matchedCount++;
        if (ratingByTmdbId.has(res.id)) {
          review.ambiguous.push({
            source: 'ratings',
            excelRow: m.excelRow,
            title: m.title,
            year: m.year,
            chosen: { id: res.id },
            reason: `two Excel rows resolve to the same TMDB movie (also row ${ratingByTmdbId.get(res.id).excelRow}); keeping the first`,
            candidates: [],
          });
        } else {
          ratingByTmdbId.set(res.id, m);
        }
      }
    })
  );
  log(`  matched ${matchedCount}/${rated.length} (${review.unmatched.length} unmatched, ${review.ambiguous.length} ambiguous, ${review.loose.length} loose — see data/review/)`);

  log('— Resolving collections…');
  const collections = [];
  const directorPersonBySlug = new Map();
  const wantedIds = new Set(ratingByTmdbId.keys());

  for (const c of config.collections ?? []) {
    try {
      if (c.type === 'director') {
        const found = await searchPerson(c.person, { offline });
        const results = found?.results ?? [];
        const exact = results.find((p) => normalizeTitle(p.name) === normalizeTitle(c.person)) ?? results[0];
        if (!exact) {
          review.resolutionNotes.push(`director '${c.person}': no TMDB person found — collection skipped`);
          continue;
        }
        if (normalizeTitle(exact.name) !== normalizeTitle(c.person)) {
          review.resolutionNotes.push(`director '${c.person}': matched TMDB person '${exact.name}' (${exact.id}) — verify`);
        }
        const person = await personDetails(exact.id, { offline });
        if (!person) continue;
        const directed = (person.movie_credits?.crew ?? [])
          .filter((cr) => cr.job === 'Director' && !cr.video)
          .sort((a, b) => (a.release_date || '9999').localeCompare(b.release_date || '9999'));
        const ids = [...new Set(directed.map((d) => d.id))];
        ids.forEach((id) => wantedIds.add(id));
        collections.push({
          slug: c.slug,
          type: 'director',
          title: c.title ?? person.name,
          description: c.description ?? '',
          personId: person.id,
          personName: person.name,
          movieIds: ids,
        });
        directorPersonBySlug.set(slugify(person.name), person);
      } else if (c.type === 'franchise') {
        let colId = c.tmdbCollectionId;
        if (!colId && c.tmdbCollectionSearch) {
          const found = await searchCollection(c.tmdbCollectionSearch, { offline });
          const results = found?.results ?? [];
          const norm = normalizeTitle(c.tmdbCollectionSearch);
          const pick =
            results.find((r) => normalizeTitle(r.name).startsWith(norm)) ?? results[0];
          if (pick) {
            colId = pick.id;
            review.resolutionNotes.push(`franchise '${c.title}': using TMDB collection '${pick.name}' (${pick.id})`);
          }
        }
        if (!colId) {
          review.resolutionNotes.push(`franchise '${c.title}': could not resolve a TMDB collection — skipped`);
          continue;
        }
        const col = await collectionDetails(colId, { offline });
        if (!col || col.__notFound) continue;
        const parts = (col.parts ?? [])
          .filter((p) => p.release_date)
          .sort((a, b) => a.release_date.localeCompare(b.release_date));
        const ids = parts.map((p) => p.id);
        ids.forEach((id) => wantedIds.add(id));
        collections.push({
          slug: c.slug,
          type: 'franchise',
          title: c.title ?? col.name,
          description: c.description ?? '',
          movieIds: ids,
        });
      } else if (c.type === 'custom') {
        const ids = [];
        for (const ref of c.movies ?? []) {
          const res = await matchMovie(ref, { overrides, offline });
          if (res.id != null) {
            ids.push(res.id);
            wantedIds.add(res.id);
          } else if (res.review) {
            review.unmatched.push({ source: `collection:${c.slug}`, ...res.review });
          }
        }
        collections.push({
          slug: c.slug,
          type: 'custom',
          title: c.title,
          description: c.description ?? '',
          movieIds: ids,
        });
      }
    } catch (err) {
      review.resolutionNotes.push(`collection '${c.slug}': failed — ${err.message}`);
    }
  }
  log(`  ${collections.length} collections resolved`);

  log(`— Base layer: TMDB top rated ×${TOP_RATED_PAGES} pages + popular ×${POPULAR_PAGES} pages…`);
  await Promise.all([
    ...Array.from({ length: TOP_RATED_PAGES }, (_, i) =>
      topRated(i + 1, { offline }).then((page) => (page?.results ?? []).forEach((m) => wantedIds.add(m.id)))
    ),
    ...Array.from({ length: POPULAR_PAGES }, (_, i) =>
      popular(i + 1, { offline }).then((page) => (page?.results ?? []).forEach((m) => wantedIds.add(m.id)))
    ),
  ]);
  log(`  ${wantedIds.size} unique after list pages`);

  // Most-voted films, walked downward in vote-count bands (each band is one
  // /discover sort, page-capped at 500 by the API; the next band resumes below
  // the previous band's floor). Stops at TARGET_MOVIES. Pages are disk-cached
  // like everything else, so the selection freezes once fetched and re-runs
  // (including --excel-only) reproduce it exactly.
  log(`— Base layer: most-voted films via discover (target ${TARGET_MOVIES})…`);
  const CHUNK_PAGES = 50;
  let bandMax = null; // vote_count.lte of the current band; null = open-topped first band
  for (let band = 1; band <= 8 && wantedIds.size < TARGET_MOVIES; band++) {
    const bandOpts = { minVotes: VOTE_FLOOR, maxVotes: bandMax, offline };
    const first = await mostVoted(1, bandOpts);
    if (!first?.results?.length) break;
    let floor = Infinity;
    const absorb = (page) =>
      (page?.results ?? []).forEach((m) => {
        wantedIds.add(m.id);
        if (m.vote_count < floor) floor = m.vote_count;
      });
    absorb(first);
    const totalPages = Math.min(first.total_pages ?? 1, 500);
    for (let p = 2; p <= totalPages && wantedIds.size < TARGET_MOVIES; p += CHUNK_PAGES) {
      await Promise.all(
        Array.from({ length: Math.min(CHUNK_PAGES, totalPages - p + 1) }, (_, i) =>
          mostVoted(p + i, bandOpts).then(absorb)
        )
      );
    }
    log(`  band ${band}: down to ${floor} votes — ${wantedIds.size} unique`);
    if (totalPages < 500) break; // universe above VOTE_FLOOR exhausted
    bandMax = floor;
  }
  log(`  total unique movies wanted: ${wantedIds.size}`);

  const tmdbConfig = await configuration({ offline });
  const imageBase = tmdbConfig?.images?.secure_base_url ?? FALLBACK_IMG_BASE;
  if (!tmdbConfig?.images?.secure_base_url) {
    review.resolutionNotes.push(`TMDB /configuration unavailable — falling back to ${FALLBACK_IMG_BASE}`);
  }

  log('— Fetching movie details (cached after first run)…');
  const records = new Map();
  let fetched = 0;
  await Promise.all(
    [...wantedIds].map(async (id) => {
      const d = await movieDetails(id, { offline });
      if (!d || d.__notFound) {
        review.resolutionNotes.push(`movie ${id}: TMDB details unavailable — dropped`);
        return;
      }
      fetched++;
      if (fetched % 250 === 0) log(`  …${fetched}`);
      const year = d.release_date ? Number(d.release_date.slice(0, 4)) : null;
      const directors = (d.credits?.crew ?? [])
        .filter((cr) => cr.job === 'Director')
        .map((cr) => ({ id: cr.id, name: cr.name }));
      records.set(id, {
        id,
        slug: `${slugify(d.title)}-${year ?? 'tba'}-${id}`,
        title: d.title,
        originalTitle: d.original_title !== d.title ? d.original_title : null,
        year,
        runtime: d.runtime || null,
        genres: (d.genres ?? []).map((g) => g.name),
        overview: d.overview || null,
        tagline: d.tagline || null,
        poster: d.poster_path,
        backdrop: d.backdrop_path,
        directors,
        cast: (d.credits?.cast ?? []).slice(0, 12).map((c) => ({ name: c.name, character: c.character, profile: c.profile_path })),
        imdbId: d.external_ids?.imdb_id ?? d.imdb_id ?? null,
        tmdbRating: d.vote_count ? { score: round1(d.vote_average), votes: d.vote_count } : null,
        omdb: null,
        myRating: null,
        asl: null,
        hashtag: null,
        stills: [],
      });
    })
  );
  log(`  ${records.size} movie records built`);

  for (const [tmdbId, m] of ratingByTmdbId) {
    const rec = records.get(tmdbId);
    if (!rec) continue;
    rec.myRating = {
      scores: m.scores,
      contentAvg: m.contentAvg,
      formAvg: m.formAvg,
      overall: m.overall,
    };
    rec.hashtag = m.hashtagPrefix;
  }

  log('— OMDb enrichment (IMDb / Rotten Tomatoes / Metacritic)…');
  // Free OMDb keys allow ~1,000 calls/day: rated films go first, then the base
  // layer by vote count. Cached answers survive across runs, so coverage grows daily.
  const omdbQueue = [...records.values()]
    .filter((r) => r.imdbId)
    .sort((a, b) => (b.myRating ? 1 : 0) - (a.myRating ? 1 : 0) || (b.tmdbRating?.votes ?? 0) - (a.tmdbRating?.votes ?? 0));
  let omdbHave = 0;
  let omdbFetchedNow = 0;
  let omdbPosterFilled = 0;
  // OMDb poster URLs are often stale (IMDb rotates image ids) — a dead URL
  // would render a broken image where the styled no-poster card should be, so
  // verify with a HEAD request before adopting. Only runs for the handful of
  // TMDB-posterless films, and not in --excel-only mode (no network there).
  const posterAlive = async (url) => {
    try {
      return (await fetch(url, { method: 'HEAD' })).ok;
    } catch {
      return false;
    }
  };
  {
    const workers = Array.from({ length: 8 }, async () => {
      while (omdbQueue.length) {
        const rec = omdbQueue.shift();
        if (!rec) break;
        const { ratings, poster, fetched } = await omdbByImdbId(rec.imdbId, { offline });
        if (ratings) {
          rec.omdb = ratings;
          omdbHave++;
        }
        // TMDB occasionally has no artwork for obscure films — fall back to OMDb's
        // poster. Stored as a full URL; tmdbImg passes absolute URLs through as-is.
        if (!rec.poster && poster && !offline && (await posterAlive(poster))) {
          rec.poster = poster;
          omdbPosterFilled++;
        }
        if (fetched) omdbFetchedNow++;
      }
    });
    await Promise.all(workers);
  }
  const withImdbId = [...records.values()].filter((r) => r.imdbId).length;
  const ratedWithOmdb = [...records.values()].filter((r) => r.myRating && r.omdb).length;
  log(`  OMDb ratings on ${omdbHave}/${withImdbId} films (${omdbFetchedNow} fetched this run, ${omdbPosterFilled} missing posters filled from OMDb)${omdbLimitHit() ? ' — DAILY LIMIT HIT, rerun tomorrow to extend coverage' : ''}`);

  log('— Joining ASL data…');
  const aslIndex = new Map();
  for (const r of aslRows) {
    const key = `${normalizeTitle(r.title)}|${r.year}`;
    if (!aslIndex.has(key)) aslIndex.set(key, []);
    aslIndex.get(key).push(r);
  }
  const movieIdByTitleYear = new Map();
  let aslAttached = 0;
  for (const rec of records.values()) {
    if (rec.year == null) continue;
    movieIdByTitleYear.set(`${normalizeTitle(rec.title)}|${rec.year}`, rec.id);
    for (const dy of [0, -1, 1]) {
      const rows = aslIndex.get(`${normalizeTitle(rec.title)}|${rec.year + dy}`);
      if (rows?.length === 1) {
        rec.asl = { value: rows[0].asl, director: rows[0].director };
        aslAttached++;
        break;
      }
      if (rows && rows.length > 1) {
        const byDir = rows.find((r) => rec.directors.some((d) => normalizeTitle(d.name) === normalizeTitle(r.director)));
        if (byDir) {
          rec.asl = { value: byDir.asl, director: byDir.director };
          aslAttached++;
        } else {
          review.resolutionNotes.push(`ASL: multiple rows for '${rec.title}' (${rec.year}), none with matching director — not attached`);
        }
        break;
      }
    }
  }
  log(`  ASL attached to ${aslAttached} movies`);

  log('— Building director records…');
  const aslByDirector = new Map();
  for (const r of aslRows) {
    if (!aslByDirector.has(r.director)) aslByDirector.set(r.director, []);
    aslByDirector.get(r.director).push(r);
  }
  // Accept a TMDB person when names match exactly, or when first+last tokens agree
  // ('Alejandro G. Iñárritu' vs 'Alejandro González Iñárritu'). Compound acts like
  // 'Coen Brothers' fall through to Wikipedia.
  const nameNorm = (s) =>
    String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const samePerson = (a, b) => {
    const na = nameNorm(a);
    const nb = nameNorm(b);
    if (na === nb) return true;
    const ta = na.split(' ');
    const tb = nb.split(' ');
    return ta.length > 1 && tb.length > 1 && ta[0] === tb[0] && ta.at(-1) === tb.at(-1);
  };

  const directors = [];
  for (const [name, rows] of aslByDirector) {
    const slug = slugify(name);
    const aslAvg = round1(rows.reduce((a, r) => a + r.asl, 0) / rows.length);

    let person = directorPersonBySlug.get(slug) ?? null;
    if (!person) {
      try {
        const found = await searchPerson(name, { offline });
        const hit = (found?.results ?? []).find((p) => samePerson(p.name, name));
        if (hit) {
          person = await personDetails(hit.id, { offline });
          if (person && nameNorm(person.name) !== nameNorm(name)) {
            review.resolutionNotes.push(`director '${name}': using TMDB person '${person.name}' (${person.id})`);
          }
        }
      } catch (err) {
        review.resolutionNotes.push(`director '${name}': TMDB person lookup failed — ${err.message}`);
      }
    }

    let portraitUrl = null;
    let bio = person?.biography || null;
    let bioSource = bio ? 'tmdb' : null;
    if (!person?.profile_path || !bio) {
      try {
        const wiki = await wikiSummary(name, { offline });
        if (wiki) {
          if (!person?.profile_path && wiki.portrait) portraitUrl = wiki.portrait;
          if (!bio && wiki.extract) {
            bio = wiki.extract;
            bioSource = 'wikipedia';
          }
        }
      } catch {
        // portrait/bio stay null — the page renders fine without them
      }
    }
    const films = rows
      .map((r) => {
        const movieId = r.year != null ? movieIdByTitleYear.get(`${normalizeTitle(r.title)}|${r.year}`) ?? null : null;
        return { title: r.title, year: r.year, asl: r.asl, movieId };
      })
      .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));
    const ratedFilms = films
      .map((f) => (f.movieId != null ? records.get(f.movieId) : null))
      .filter((rec) => rec?.myRating);
    const collection = collections.find((c) => c.type === 'director' && slugify(c.personName ?? '') === slug);
    if (collection) {
      for (const id of collection.movieIds) {
        const rec = records.get(id);
        if (rec?.myRating && !ratedFilms.includes(rec)) ratedFilms.push(rec);
      }
    }

    // Other-source averages across the director's filmography (ASL films in the
    // archive + full collection filmography where present). Missing values are
    // simply excluded from each average.
    const filmSet = new Map();
    for (const f of films) {
      if (f.movieId != null && records.has(f.movieId)) filmSet.set(f.movieId, records.get(f.movieId));
    }
    for (const id of collection?.movieIds ?? []) {
      if (records.has(id)) filmSet.set(id, records.get(id));
    }
    const avgOf = (vals) => (vals.length ? { avg: round1(vals.reduce((a, b) => a + b, 0) / vals.length), count: vals.length } : null);
    const filmRecs = [...filmSet.values()];
    const sourceAvgs = {
      tmdb: avgOf(filmRecs.map((r) => r.tmdbRating?.score).filter((v) => v != null)),
      imdb: avgOf(filmRecs.map((r) => r.omdb?.imdb).filter((v) => v != null)),
      metacritic: avgOf(filmRecs.map((r) => r.omdb?.metacritic).filter((v) => v != null)),
    };
    directors.push({
      slug,
      name,
      aslAvg,
      aslCount: rows.length,
      myAvg: ratedFilms.length ? round1(ratedFilms.reduce((a, r) => a + r.myRating.overall, 0) / ratedFilms.length) : null,
      myCount: ratedFilms.length,
      sourceAvgs,
      films,
      bio,
      bioSource,
      profile: person?.profile_path || null,
      portraitUrl,
      born: person?.birthday || null,
      died: person?.deathday || null,
      tmdbPersonId: person?.id ?? null,
      collectionSlug: collection?.slug ?? null,
    });
  }
  directors.sort((a, b) => a.name.localeCompare(b.name));
  log(`  ${directors.length} directors`);

  const movies = [...records.values()].sort((a, b) => a.title.localeCompare(b.title));
  const catalog = movies.map((m) => ({
    id: m.id,
    slug: m.slug,
    title: m.title,
    year: m.year,
    poster: m.poster,
    directors: m.directors.slice(0, 2).map((d) => d.name),
    genres: m.genres.slice(0, 3),
    runtime: m.runtime,
    tmdb: m.tmdbRating?.score ?? null,
    imdb: m.omdb?.imdb ?? null,
    my: m.myRating?.overall ?? null,
    content: m.myRating?.contentAvg ?? null,
    form: m.myRating?.formAvg ?? null,
  }));

  const meta = {
    generatedAt: new Date().toISOString(),
    // Single source of truth for TMDB image URLs (from /configuration) — never
    // hardcode the image host anywhere else.
    imageBase,
    counts: {
      movies: movies.length,
      rated: movies.filter((m) => m.myRating).length,
      withAsl: aslAttached,
      directors: directors.length,
      collections: collections.length,
    },
    omdbCoverage: {
      have: omdbHave,
      withImdbId,
      ratedWithOmdb,
      limitHit: omdbLimitHit(),
    },
    attribution: 'This product uses the TMDB API but is not endorsed or certified by TMDB.',
  };

  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(REVIEW_DIR, { recursive: true });
  await writeFile(path.join(OUT_DIR, 'movies.json'), JSON.stringify(movies), 'utf8');
  await writeFile(path.join(OUT_DIR, 'catalog.json'), JSON.stringify(catalog), 'utf8');
  await writeFile(path.join(OUT_DIR, 'collections.json'), JSON.stringify(collections, null, 2), 'utf8');
  await writeFile(path.join(OUT_DIR, 'directors.json'), JSON.stringify(directors), 'utf8');
  await writeFile(path.join(OUT_DIR, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
  await mkdir(path.resolve('public/data'), { recursive: true });
  await copyFile(path.join(OUT_DIR, 'catalog.json'), path.resolve('public/data/catalog.json'));

  const reviewJson = { generatedAt: meta.generatedAt, ...review, excelWarnings, aslSkipped };
  await writeFile(path.join(REVIEW_DIR, 'match-review.json'), JSON.stringify(reviewJson, null, 2), 'utf8');

  const md = [];
  md.push(`# Match review — ${meta.generatedAt}`, '');
  md.push(`Fix entries by adding overrides to \`data/overrides.json\` ("Title|Year": tmdbId or "skip"), then re-run \`npm run data\`.`, '');
  const section = (title, items, fmt) => {
    md.push(`## ${title} (${items.length})`, '');
    if (!items.length) md.push('_none_', '');
    else {
      items.forEach((i) => md.push(fmt(i)));
      md.push('');
    }
  };
  const fmtCand = (c) => `${c.title}${c.originalTitle && c.originalTitle !== c.title ? ` / ${c.originalTitle}` : ''} (${c.year ?? '?'}, id ${c.id})`;
  section('Unmatched — needs a manual override', review.unmatched, (i) =>
    `- **${i.title}** (${i.year}) [${i.source}] — ${i.reason}${i.candidates.length ? `; nearest: ${i.candidates.map(fmtCand).join('; ')}` : ''}`);
  section('Ambiguous — picked a candidate, verify it', review.ambiguous, (i) =>
    `- **${i.title}** (${i.year}) [${i.source}] → ${i.chosen ? fmtCand(i.chosen) : '—'} — ${i.reason}${i.candidates.length > 1 ? `; others: ${i.candidates.filter((c) => c.id !== i.chosen?.id).map(fmtCand).join('; ')}` : ''}`);
  section('Loose matches — likely fine, skim these', review.loose, (i) =>
    `- **${i.title}** (${i.year}) [${i.source}] → ${i.chosen ? fmtCand(i.chosen) : '—'} — ${i.reason}`);
  section('Resolution notes', review.resolutionNotes, (i) => `- ${i}`);
  section('Excel warnings', excelWarnings, (i) => `- row ${i.row}: **${i.title}** — ${i.kind}: ${i.detail}`);
  md.push(`## ASL rows skipped (${aslSkipped.length})`, '', `Placeholder values (NA / ? / _) and embedded avg rows — informational only; full list in match-review.json.`, '');
  await writeFile(path.join(REVIEW_DIR, 'match-review.md'), md.join('\n'), 'utf8');

  const stats = fetchStats();
  log('');
  log(`Done in ${Math.round((Date.now() - t0) / 1000)}s — ${stats.network} network calls, ${stats.cacheHits} cache hits`);
  log(`  movies: ${meta.counts.movies} (${meta.counts.rated} rated by you, ${meta.counts.withAsl} with ASL)`);
  log(`  review file: data/review/match-review.md`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// Taste match: a visitor's local ratings against Dr. X's on the films both
// rated. Pure (no storage, no fetching), so it runs the same in tests.
import { ALL_KEYS, CONTENT_KEYS, FORM_KEYS, computeTotals } from '../../shared/rating-meta.mjs';

// Shared films needed before anything is compared, and before a correlation
// (which is noise on a handful of films) is shown.
export const MIN_SHARED = 3;
export const MIN_CORRELATION = 10;
// A criterion counts as "scored higher/lower" past this average difference.
export const BIAS_THRESHOLD = 0.3;
// "Dr. X rated these highly" means at least this overall score.
export const SUGGEST_FLOOR = 8;

const round2 = (n) => Math.round(n * 100) / 100;
const mean = (vals) => vals.reduce((a, b) => a + b, 0) / vals.length;

function pearson(xs, ys) {
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}

// visitor: { [movieId]: { scores, title } } (the visitor store's ratings).
// drx: Map(id → film object with myRating), e.g. from loadRatedFilms().
export function tasteMatch(visitor, drx) {
  const shared = [];
  for (const [key, entry] of Object.entries(visitor ?? {})) {
    const film = drx.get(Number(key));
    const you = entry?.scores ? computeTotals(entry.scores) : null;
    if (!film?.myRating || !you) continue;
    shared.push({ film, you: { scores: entry.scores, ...you }, x: film.myRating, diff: round2(you.overall - film.myRating.overall) });
  }
  const n = shared.length;
  if (n < MIN_SHARED) return { n, ready: false, shared };

  const profile = (side) => Object.fromEntries(ALL_KEYS.map((k) => [k.key, round2(mean(shared.map((s) => s[side].scores[k.key])))]));
  const you = profile('you');
  const x = profile('x');
  const bias = Object.fromEntries(ALL_KEYS.map((k) => [k.key, round2(you[k.key] - x[k.key])]));
  const order = (a, b) => Math.abs(a.diff) - Math.abs(b.diff) || b.x.overall - a.x.overall || a.film.id - b.film.id;
  const byGap = [...shared].sort(order);
  const listSize = Math.min(5, Math.floor(n / 2));
  return {
    n,
    ready: true,
    shared,
    meanDiff: round2(mean(shared.map((s) => s.diff))),
    correlation: n >= MIN_CORRELATION ? round2(pearson(shared.map((s) => s.x.overall), shared.map((s) => s.you.overall))) : null,
    withinOne: shared.filter((s) => Math.abs(s.diff) <= 1).length,
    profile: { you, x },
    bias,
    higher: ALL_KEYS.filter((k) => bias[k.key] >= BIAS_THRESHOLD).sort((a, b) => bias[b.key] - bias[a.key]).map((k) => k.key),
    lower: ALL_KEYS.filter((k) => bias[k.key] <= -BIAS_THRESHOLD).sort((a, b) => bias[a.key] - bias[b.key]).map((k) => k.key),
    closest: byGap.slice(0, listSize),
    furthest: byGap.slice(-listSize).reverse(),
  };
}

// Dr. X's highly rated films the visitor hasn't rated, ordered by how they
// score on the criteria the visitor scores highest: each criterion is weighted
// by the visitor's average on it relative to their average over all ten
// (equal weights without a profile), then ties go to Dr. X's overall and IMDb votes.
export function suggestions(visitor, drxFilms, profile = null, limit = 6) {
  const rated = new Set(Object.keys(visitor ?? {}).map(Number));
  const avg = profile ? mean(ALL_KEYS.map((k) => profile[k.key])) : 0;
  const weight = Object.fromEntries(ALL_KEYS.map((k) => [k.key, profile && avg > 0 ? profile[k.key] / avg : 1]));
  const fit = (m) => ALL_KEYS.reduce((t, k) => t + weight[k.key] * m.myRating.scores[k.key], 0);
  return drxFilms
    .filter((m) => m.myRating && m.myRating.overall >= SUGGEST_FLOOR && !rated.has(m.id))
    .map((m) => ({ m, fit: fit(m) }))
    .sort((a, b) => b.fit - a.fit || b.m.myRating.overall - a.m.myRating.overall || (b.m.imdbVotes ?? 0) - (a.m.imdbVotes ?? 0) || a.m.id - b.m.id)
    .slice(0, limit)
    .map(({ m }) => m);
}

// Plain-language list of criteria ("Character, Message and Design").
export function criteriaList(keys) {
  const label = Object.fromEntries([...CONTENT_KEYS, ...FORM_KEYS].map((k) => [k.key, k.short]));
  const names = keys.map((k) => label[k]);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : (names[0] ?? '');
}

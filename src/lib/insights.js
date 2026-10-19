// Build-time numbers for /insights, computed from the committed data files
// (movies, credits, people). Pure: no I/O, so tests can call it directly.
import { ALL_KEYS } from '../../shared/rating-meta.mjs';

// Dr. X vs the crowd only counts films with enough IMDb votes that the crowd
// score means something.
export const CROWD_VOTE_FLOOR = 25000;
// Groups smaller than this are drawn greyed out (decades) or left out (genres).
export const THIN_GROUP = 10;
// People and directors need this many rated films to be listed.
export const MIN_FILMS = 5;

const round2 = (n) => Math.round(n * 100) / 100;

export function mean(vals) {
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

export function median(vals) {
  if (!vals.length) return null;
  const s = [...vals].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function pearson(xs, ys) {
  if (xs.length < 2) return null;
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

// Percentile rank in [0, 1] with ties sharing the midpoint of their run, so
// the many identical Dr. X scores rank evenly.
export function percentileRanker(vals) {
  const s = [...vals].sort((a, b) => a - b);
  const below = (v) => {
    let lo = 0;
    let hi = s.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (s[m] < v) lo = m + 1;
      else hi = m;
    }
    return lo;
  };
  const atOrBelow = (v) => {
    let lo = 0;
    let hi = s.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (s[m] <= v) lo = m + 1;
      else hi = m;
    }
    return lo;
  };
  return (v) => (below(v) + atOrBelow(v)) / 2 / s.length;
}

// Points where both scales stand at the same percentile (a Q–Q line): a film
// on it ranks the same for Dr. X and for the crowd.
export function quantileCurve(xs, ys, steps = 24) {
  const sx = [...xs].sort((a, b) => a - b);
  const sy = [...ys].sort((a, b) => a - b);
  const at = (s, q) => s[Math.min(s.length - 1, Math.floor(q * s.length))];
  return Array.from({ length: steps + 1 }, (_, i) => {
    const q = 0.02 + (0.96 * i) / steps;
    return [at(sx, q), at(sy, q)];
  });
}

const decadeOf = (year) => (year ? Math.floor(year / 10) * 10 : null);

function groupBy(items, keysOf) {
  const groups = new Map();
  for (const item of items) {
    for (const key of keysOf(item)) {
      if (key == null) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
  }
  return groups;
}

const filmRef = (m) => ({ id: m.id, slug: m.slug, title: m.title, year: m.year ?? null, poster: m.poster ?? null });

// Crew roles set against the criterion closest to the job: writers against
// the content half, the four form-side roles against one form criterion.
const CREW = [
  { role: 'w', label: 'Writers', against: 'content average', side: 'content', score: (r) => r.contentAvg },
  { role: 'c', label: 'Directors of photography', against: 'cinematography', side: 'form', score: (r) => r.scores.cinematography },
  { role: 'm', label: 'Composers', against: 'sound', side: 'form', score: (r) => r.scores.sound },
  { role: 'e', label: 'Editors', against: 'directing & editing', side: 'form', score: (r) => r.scores.directing },
  { role: 'p', label: 'Production designers', against: 'design', side: 'form', score: (r) => r.scores.design },
];

export function computeInsights({ movies, credits, people, directorPageFor = () => null, listSize = 6 }) {
  const rated = movies.filter((m) => m.myRating);
  const overall = (m) => m.myRating.overall;

  // Dr. X vs the crowd (IMDb), ranked by percentile gap rather than points:
  // Dr. X's scale sits about a point lower, so raw differences mostly say that.
  const crowd = rated.filter((m) => m.omdb?.imdb != null && (m.omdb.imdbVotes ?? 0) >= CROWD_VOTE_FLOOR);
  const pX = percentileRanker(crowd.map(overall));
  const pI = percentileRanker(crowd.map((m) => m.omdb.imdb));
  const gaps = crowd
    .map((m) => ({ ...filmRef(m), x: overall(m), imdb: m.omdb.imdb, gap: pX(overall(m)) - pI(m.omdb.imdb) }))
    .sort((a, b) => b.gap - a.gap || b.x - b.imdb - (a.x - a.imdb) || a.id - b.id);
  const withMc = rated.filter((m) => m.omdb?.metacritic != null);
  const withRt = rated.filter((m) => m.omdb?.rottenTomatoes != null);

  // Content vs form.
  const c = rated.map((m) => m.myRating.contentAvg);
  const f = rated.map((m) => m.myRating.formAvg);
  const cells = new Map();
  for (const m of rated) {
    const key = `${m.myRating.contentAvg}|${m.myRating.formAvg}`;
    cells.set(key, (cells.get(key) ?? 0) + 1);
  }
  const lean = rated.map((m) => ({ ...filmRef(m), c: m.myRating.contentAvg, f: m.myRating.formAvg, x: overall(m) }));
  const byLean = (dir) => [...lean].sort((a, b) => dir * (b.c - b.f - (a.c - a.f)) || b.x - a.x || a.id - b.id).slice(0, listSize);

  // Breakdowns.
  const dist = new Map();
  for (const m of rated) {
    const bin = Math.floor(overall(m) * 2) / 2;
    dist.set(bin, (dist.get(bin) ?? 0) + 1);
  }
  const decades = [...groupBy(rated, (m) => [decadeOf(m.year)])]
    .sort((a, b) => a[0] - b[0])
    .map(([decade, ms]) => ({ decade, n: ms.length, mean: round2(mean(ms.map(overall))) }));
  const genres = [...groupBy(rated, (m) => m.genres)]
    .filter(([, ms]) => ms.length >= THIN_GROUP)
    .map(([name, ms]) => ({ name, n: ms.length, mean: round2(mean(ms.map(overall))) }))
    .sort((a, b) => b.mean - a.mean || b.n - a.n);
  const directorsTop = [...groupBy(rated, (m) => m.directors.map((d) => d.id))]
    .filter(([, ms]) => ms.length >= MIN_FILMS)
    .map(([id, ms]) => {
      const name = ms[0].directors.find((d) => d.id === id).name;
      return { id, name, page: directorPageFor(name), n: ms.length, mean: round2(mean(ms.map(overall))) };
    })
    .sort((a, b) => b.mean - a.mean || b.n - a.n || a.name.localeCompare(b.name))
    .slice(0, 10);

  // Average shot length: every film with a measurement, rated or not.
  const asl = movies.filter((m) => m.asl?.value);
  const aslValue = (m) => m.asl.value;
  const aslDecades = [...groupBy(asl, (m) => [decadeOf(m.year)])]
    .sort((a, b) => a[0] - b[0])
    .map(([decade, ms]) => ({ decade, n: ms.length, median: round2(median(ms.map(aslValue))) }));
  const aslGenres = [...groupBy(asl, (m) => m.genres)]
    .filter(([, ms]) => ms.length >= THIN_GROUP)
    .map(([name, ms]) => ({ name, n: ms.length, median: round2(median(ms.map(aslValue))) }))
    .sort((a, b) => b.median - a.median || b.n - a.n);
  const aslLongest = [...asl]
    .sort((a, b) => aslValue(b) - aslValue(a) || a.id - b.id)
    .slice(0, listSize)
    .map((m) => ({ ...filmRef(m), asl: aslValue(m) }));

  // Crew and the criteria.
  const crew = CREW.map(({ role, score, ...rest }) => {
    const byPerson = new Map();
    for (const m of rated) {
      for (const pid of credits.films[m.id]?.[role] ?? []) {
        if (!byPerson.has(pid)) byPerson.set(pid, []);
        byPerson.get(pid).push(score(m.myRating));
      }
    }
    const rows = [...byPerson]
      .filter(([, vals]) => vals.length >= MIN_FILMS)
      .map(([id, vals]) => ({ id, name: people[id]?.[0] ?? `#${id}`, n: vals.length, mean: round2(mean(vals)) }))
      .sort((a, b) => b.mean - a.mean || b.n - a.n || a.name.localeCompare(b.name));
    return { role, ...rest, people: rows.length, rows: rows.slice(0, listSize) };
  });

  return {
    n: rated.length,
    median: median(rated.map(overall)),
    mean: round2(mean(rated.map(overall))),
    crowd: {
      floor: CROWD_VOTE_FLOOR,
      n: crowd.length,
      medianX: median(crowd.map(overall)),
      medianImdb: median(crowd.map((m) => m.omdb.imdb)),
      r: round2(pearson(crowd.map(overall), crowd.map((m) => m.omdb.imdb))),
      points: crowd.map((m) => [m.omdb.imdb, overall(m)]),
      curve: quantileCurve(crowd.map((m) => m.omdb.imdb), crowd.map(overall)),
      higher: gaps.slice(0, listSize),
      lower: gaps.slice(-listSize).reverse(),
      metacritic: { n: withMc.length, r: round2(pearson(withMc.map(overall), withMc.map((m) => m.omdb.metacritic))) },
      rottenTomatoes: { n: withRt.length, r: round2(pearson(withRt.map(overall), withRt.map((m) => m.omdb.rottenTomatoes))) },
    },
    cf: {
      medianContent: median(c),
      medianForm: median(f),
      formAhead: lean.filter((m) => m.f > m.c).length,
      contentAhead: lean.filter((m) => m.c > m.f).length,
      even: lean.filter((m) => m.c === m.f).length,
      cells: [...cells].map(([key, count]) => [...key.split('|').map(Number), count]),
      criteria: Object.fromEntries(ALL_KEYS.map((k) => [k.key, round2(mean(rated.map((m) => m.myRating.scores[k.key])))])),
      contentLed: byLean(1),
      formLed: byLean(-1),
    },
    breakdown: {
      dist: [...dist].sort((a, b) => a[0] - b[0]),
      decades,
      genres,
      directors: directorsTop,
    },
    asl: { n: asl.length, decades: aslDecades, genres: aslGenres, longest: aslLongest },
    crew,
  };
}

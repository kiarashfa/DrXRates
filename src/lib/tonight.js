// "What to watch tonight": pure pool filtering and weighted picking, no DOM.
// Films are archive film objects (see archive.js) with scores and rated loaded.

export const VOTE_FLOOR = 25000; // whole-archive source: IMDb votes at least this

// The score a source ranks by: Dr. X's overall for his films, IMDb otherwise.
export function scoreOf(film, source) {
  return source === 'drx' ? film.my : film.imdb;
}

// filters: { source: 'drx' | 'archive' | 'watchlist', watchIds: Set<number>,
//   lengthMin, lengthMax, yearMin, yearMax (numbers or null), genre (or null),
//   minScore (or null) }
export function filterPool(list, f) {
  return list.filter((m) => {
    if (f.source === 'drx' && m.my == null) return false;
    if (f.source === 'archive' && !(m.imdbVotes >= VOTE_FLOOR)) return false;
    if (f.source === 'watchlist' && !f.watchIds?.has(m.id)) return false;
    if (f.lengthMin != null && !(m.runtime >= f.lengthMin)) return false;
    if (f.lengthMax != null && !(m.runtime > 0 && m.runtime <= f.lengthMax)) return false;
    if (f.yearMin != null && !(m.year >= f.yearMin)) return false;
    if (f.yearMax != null && !(m.year > 0 && m.year <= f.yearMax)) return false;
    if (f.genre && !m.genres.includes(f.genre)) return false;
    if (f.minScore != null && !(scoreOf(m, f.source) >= f.minScore)) return false;
    return true;
  });
}

// Higher scores come up more often: weight (score − 5)², floored so weaker or
// unscored films still have a small chance.
export function weightOf(film, source) {
  const s = scoreOf(film, source);
  return s == null ? 1 : Math.max(s - 5, 0.5) ** 2;
}

// One film from `pool` not in `seen` (Set of ids), or null when every film
// has been seen. `random` is injectable for tests.
export function pickFilm(pool, source, seen = new Set(), random = Math.random) {
  const open = pool.filter((m) => !seen.has(m.id));
  if (!open.length) return null;
  const weights = open.map((m) => weightOf(m, source));
  let r = random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < open.length; i++) {
    r -= weights[i];
    if (r < 0) return open[i];
  }
  return open[open.length - 1];
}

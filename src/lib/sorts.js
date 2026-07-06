// Shared movie-sort definitions. Rating sorts always group films without that
// score at the end (alphabetical there) — never interleaved blanks.
export const nullsLast = (get, dir) => (a, b) => {
  const va = get(a);
  const vb = get(b);
  if (va == null && vb == null) return a.title.localeCompare(b.title);
  if (va == null) return 1;
  if (vb == null) return -1;
  return dir * (va - vb) || a.title.localeCompare(b.title);
};

export const RATING_SORTS = {
  'my-desc': { label: 'My rating ↓', cmp: nullsLast((m) => m.my, -1), ratingSort: 'my rating' },
  'my-asc': { label: 'My rating ↑', cmp: nullsLast((m) => m.my, 1), ratingSort: 'my rating' },
  'tmdb-desc': { label: 'TMDB rating ↓', cmp: nullsLast((m) => m.tmdb, -1), ratingSort: 'TMDB score' },
  'tmdb-asc': { label: 'TMDB rating ↑', cmp: nullsLast((m) => m.tmdb, 1), ratingSort: 'TMDB score' },
  'imdb-desc': { label: 'IMDb rating ↓', cmp: nullsLast((m) => m.imdb, -1), ratingSort: 'IMDb score' },
  'imdb-asc': { label: 'IMDb rating ↑', cmp: nullsLast((m) => m.imdb, 1), ratingSort: 'IMDb score' },
};

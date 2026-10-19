// Site search ranking: pure functions, no DOM. Films match on title, original
// title and year; directors on name; collections and pages on their label.
// A query matches when every word in it starts a word of the candidate
// (or, for films, equals the year). Better matches rank first; among equals,
// Dr. X's films and then the more-voted films win.

export function normalize(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const ARTICLE = /^(the|a|an) /;
const YEAR = /^(18|19|20)\d\d$/;

function prepText(text) {
  const t = normalize(text);
  return { t, bare: t.replace(ARTICLE, ''), words: t.split(' ') };
}

// Tier of a match (lower is better), or Infinity.
//   0 exact title (ignoring a leading article), 1 title starts with the query,
//   2 every query word starts a title word (years may match the film's year),
//   3 the query appears inside the title.
function tier(p, q, year) {
  if (!p) return Infinity;
  if (p.t === q.t || p.bare === q.bare) return 0;
  if (p.t.startsWith(q.t) || p.bare.startsWith(q.bare)) return 1;
  if (q.words.every((w) => p.words.some((pw) => pw.startsWith(w)) || (year != null && YEAR.test(w) && Number(w) === year))) return 2;
  if (q.t.length >= 3 && p.t.includes(q.t)) return 3;
  return Infinity;
}

// films: archive film objects ({ id, title, year, originalTitle, pop, my, … });
// extra: { directors: [{ slug, name, photo, rated }], collections: [{ slug, title }] };
// pages: [{ label, href }].
export function buildIndex(films, extra, pages) {
  return {
    films: films.map((f) => ({ f, title: prepText(f.title), orig: f.originalTitle ? prepText(f.originalTitle) : null })),
    directors: (extra?.directors ?? []).map((d) => ({ d, name: prepText(d.name) })),
    places: [
      ...(extra?.collections ?? []).map((c) => ({ kind: 'Collection', label: c.title, href: `/collection/${c.slug}`, text: prepText(c.title) })),
      ...pages.map((p) => ({ kind: 'Page', label: p.label, href: p.href, text: prepText(p.label) })),
    ],
  };
}

export const MIN_QUERY = 2;

// Returns { films, directors, places } (each best first), or null when the
// query is too short to search.
export function search(index, query, { films: nFilms = 12, directors: nDirectors = 6, places: nPlaces = 6 } = {}) {
  const q = prepText(query);
  if (q.t.length < MIN_QUERY) return null;

  const films = [];
  for (const e of index.films) {
    const t = Math.min(tier(e.title, q, e.f.year), tier(e.orig, q, e.f.year) + 0.5);
    if (t === Infinity) continue;
    // Tier dominates; then Dr. X's films; then popularity; then shorter titles.
    const score = t * 1000 - (e.f.my != null ? 40 : 0) - (e.f.pop ?? 0) + e.title.t.length * 0.1;
    films.push({ f: e.f, score });
  }
  films.sort((a, b) => a.score - b.score || a.f.id - b.f.id);

  const directors = index.directors
    .map((e) => ({ d: e.d, t: tier(e.name, q, null) }))
    .filter((e) => e.t !== Infinity)
    .sort((a, b) => a.t - b.t || (b.d.rated ?? 0) - (a.d.rated ?? 0) || a.d.name.localeCompare(b.d.name));

  const places = index.places
    .map((p) => ({ p, t: tier(p.text, q, null) }))
    .filter((e) => e.t !== Infinity)
    .sort((a, b) => a.t - b.t || a.p.label.localeCompare(b.p.label));

  return {
    films: films.slice(0, nFilms).map((e) => e.f),
    filmCount: films.length,
    directors: directors.slice(0, nDirectors).map((e) => e.d),
    places: places.slice(0, nPlaces).map((e) => e.p),
  };
}

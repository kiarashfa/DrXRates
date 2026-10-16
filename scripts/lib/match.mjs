import { searchMovie } from './tmdb.mjs';

const ROMAN = { ii: '2', iii: '3', iv: '4', vi: '6', vii: '7', viii: '8', ix: '9' };
const FILLER = new Set(['part', 'vol', 'volume', 'chapter', 'episode']);

export function normalizeTitle(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => ROMAN[w] ?? w)
    .filter((w) => !FILLER.has(w))
    .join(' ');
}

function stripThe(n) {
  return n.replace(/^the /, '');
}

function titlesEqual(a, b) {
  return a === b || stripThe(a) === stripThe(b);
}

// 'Anchorman 2' vs 'Anchorman 2: The Legend Continues' — the Excel title is a
// word-boundary prefix and the extra text looks like a subtitle, or the Excel
// title is the movie's suffix behind a short prelude ("Lemony Snicket's …").
function subtitleMatch(candNorm, candRaw, norm) {
  const n = stripThe(norm);
  const c = stripThe(candNorm);
  if (c.startsWith(`${n} `)) {
    const extra = c.slice(n.length).trim();
    if (/[:(—-]/.test(candRaw) || extra.split(' ').length >= 2) return true;
  }
  if (c.endsWith(` ${n}`)) {
    const prelude = c.slice(0, c.length - n.length).trim();
    if (prelude.split(' ').length <= 4) return true;
  }
  return false;
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m || !n) return Math.max(m, n);
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

function candYear(c) {
  return c.release_date ? Number(c.release_date.slice(0, 4)) : null;
}

function votes(c) {
  return c.vote_count ?? 0;
}

function summarize(c) {
  return { id: c.id, title: c.title, originalTitle: c.original_title, year: candYear(c), popularity: c.popularity, votes: votes(c) };
}

// Most-voted first (the film people actually watched), then closest to the
// Excel year, then popularity. Popularity alone is a poor ranking: it tracks
// recent traffic, so a 2-vote namesake can outrank the well-known film.
function byVotes(year) {
  return (a, b) =>
    votes(b) - votes(a) ||
    Math.abs((candYear(a) ?? 9999) - (year ?? 0)) - Math.abs((candYear(b) ?? 9999) - (year ?? 0)) ||
    b.popularity - a.popularity;
}

// A "clear favourite" has ≥10× the runner-up's votes (and a meaningful count
// itself) — such picks go to the skim list instead of the must-verify list.
function clearFavourite(sorted) {
  const [a, b] = sorted;
  return votes(a) >= 50 && votes(a) >= 10 * votes(b);
}

// Orders candidates for picking. A film dated exactly the Excel year keeps
// priority (remakes often land a year apart: Perfect Strangers 2016 vs 2017)
// unless an off-by-one film dwarfs it — the premiere-vs-release-year case.
function rank(cands, year) {
  const sorted = [...cands].sort(byVotes(year));
  const sameYear = year ? sorted.find((c) => candYear(c) === year) : null;
  if (!sameYear || sameYear === sorted[0] || clearFavourite([sorted[0], sameYear])) return sorted;
  return [sameYear, ...sorted.filter((c) => c !== sameYear)];
}

// Matches one Excel row (title + year) to a TMDB movie.
// Returns { id, status, review } where status is one of
// 'override' | 'exact' | 'loose' | 'ambiguous' | 'unmatched'.
// Anything not 'exact'/'override' also produces a review entry — never a silent guess.
export async function matchMovie({ title, year }, { overrides = {}, offline = false } = {}) {
  const key = `${title}|${year}`;
  if (overrides[key] != null) {
    const o = overrides[key];
    // An array means one Excel row rates every part of a film TMDB splits in two
    // (Nymphomaniac Vol. I + II): the same scores go to each id.
    if (Array.isArray(o)) return { id: o[0], ids: o, status: 'override', review: null };
    return { id: o === 'skip' ? null : o, status: 'override', review: null };
  }

  const norm = normalizeTitle(title);
  const opts = { offline };
  let results = [];
  let searchNote = '';

  if (year) {
    const r = await searchMovie(title, { primary_release_year: String(year) }, opts);
    results = r?.results ?? [];
  }
  if (!results.length && year) {
    const r = await searchMovie(title, { year: String(year) }, opts);
    results = r?.results ?? [];
    if (results.length) searchNote = 'matched via secondary year field';
  }
  // Always pool the year-less search too. TMDB's year filters return only that
  // exact year, so when Excel carries the premiere year and TMDB the release
  // year (Crash 2004 vs 2005, Split 2016 vs 2017), the real film never showed
  // up and an obscure same-year namesake was accepted silently.
  const yearless = await searchMovie(title, {}, opts);
  const yearlessAll = yearless?.results ?? [];
  const hadYearResults = results.length > 0;
  const fromYearSearch = new Set(results.map((c) => c.id));
  const seen = new Set(fromYearSearch);
  for (const c of yearlessAll) {
    const y = candYear(c);
    if (!seen.has(c.id) && (!year || (y != null && Math.abs(y - year) <= 1))) {
      results.push(c);
      seen.add(c.id);
    }
  }
  if (!hadYearResults && results.length && year) searchNote = 'matched via year-less search, year within ±1';

  if (!results.length) {
    // Exact title exists but under a different year — probably a year typo in Excel.
    const exactWrongYear = yearlessAll.filter((c) =>
      titlesEqual(normalizeTitle(c.title), norm) || titlesEqual(normalizeTitle(c.original_title || ''), norm)
    );
    if (exactWrongYear.length) {
      const pick = [...exactWrongYear].sort(
        (a, b) => Math.abs((candYear(a) ?? 9999) - year) - Math.abs((candYear(b) ?? 9999) - year) || votes(b) - votes(a)
      )[0];
      return {
        id: pick.id,
        status: exactWrongYear.length > 1 ? 'ambiguous' : 'loose',
        review: {
          title,
          year,
          chosen: summarize(pick),
          reason: `exact title but year differs (Excel ${year} vs TMDB ${candYear(pick)}) — check for a year typo`,
          candidates: exactWrongYear.slice(0, 4).map(summarize),
        },
      };
    }
    return {
      id: null,
      status: 'unmatched',
      review: { title, year, chosen: null, reason: 'no TMDB search results', candidates: [] },
    };
  }

  // Year-search hits are trusted on year even when TMDB's primary date is
  // further off (the secondary `year` filter also matches later releases).
  const plausible = (c) =>
    fromYearSearch.has(c.id) || !year || (candYear(c) != null && Math.abs(candYear(c) - year) <= 1);
  const isExactTitle = (c) =>
    titlesEqual(normalizeTitle(c.title), norm) || titlesEqual(normalizeTitle(c.original_title || ''), norm);
  // Subtitle completion: 'Home Alone 2' → 'Home Alone 2: Lost in New York'.
  const isSubtitle = (c) =>
    subtitleMatch(normalizeTitle(c.title), c.title, norm) ||
    subtitleMatch(normalizeTitle(c.original_title || ''), c.original_title || '', norm);
  const exact = rank(results.filter((c) => plausible(c) && isExactTitle(c)), year);
  const subtitle = rank(results.filter((c) => plausible(c) && !isExactTitle(c) && isSubtitle(c)), year);

  // An obscure exact-title namesake (<50 votes) must not beat a famous subtitle
  // completion ('Days of Future Past' 2013, 0 votes vs 'X-Men: Days of Future
  // Past'). A known exact-title film always wins ('By the Sea' stays Jolie's,
  // not 'Manchester by the Sea').
  const useSubtitle =
    subtitle.length > 0 && (!exact.length || (votes(exact[0]) < 50 && clearFavourite([subtitle[0], exact[0]])));
  const pool = useSubtitle ? subtitle : exact;
  if (pool.length) {
    const pick = pool[0];
    const yearOff = year && candYear(pick) !== year;
    if (!useSubtitle && pool.length === 1 && !searchNote && !yearOff) {
      return { id: pick.id, status: 'exact', review: null };
    }
    const clear = pool.length === 1 || clearFavourite(pool);
    const notes = [];
    if (useSubtitle) notes.push('subtitle-completion match');
    if (pool.length > 1) {
      notes.push(
        clear
          ? `picked the clear favourite of ${pool.length} ${useSubtitle ? 'candidates' : 'same-title films'} (${votes(pool[0])} votes vs ${votes(pool[1])})`
          : `${pool.length} ${useSubtitle ? 'subtitle-completion candidates' : 'same-title films (remake/re-release?)'} — verify the pick`
      );
    }
    if (useSubtitle && exact.length) notes.push(`out-votes the exact-title namesake (${votes(exact[0])} votes)`);
    if (searchNote) notes.push(searchNote);
    if (yearOff) notes.push(`TMDB dates it ${candYear(pick)}`);
    return {
      id: pick.id,
      status: clear ? 'loose' : 'ambiguous',
      review: { title, year, chosen: summarize(pick), reason: notes.join('; '), candidates: pool.slice(0, 4).map(summarize) },
    };
  }

  // No exact title hit — rank by edit distance, then votes.
  const ranked = [...results].sort((a, b) => {
    const da = Math.min(levenshtein(normalizeTitle(a.title), norm), levenshtein(normalizeTitle(a.original_title || ''), norm));
    const db = Math.min(levenshtein(normalizeTitle(b.title), norm), levenshtein(normalizeTitle(b.original_title || ''), norm));
    return da - db || votes(b) - votes(a);
  });
  const best = ranked[0];
  const dist = Math.min(
    levenshtein(normalizeTitle(best.title), norm),
    levenshtein(normalizeTitle(best.original_title || ''), norm)
  );
  if (dist <= Math.max(2, Math.floor(norm.length * 0.2))) {
    return {
      id: best.id,
      status: 'loose',
      review: {
        title,
        year,
        chosen: summarize(best),
        reason: `fuzzy title match (edit distance ${dist})${searchNote ? `; ${searchNote}` : ''}`,
        candidates: ranked.slice(0, 3).map(summarize),
      },
    };
  }
  return {
    id: null,
    status: 'unmatched',
    review: {
      title,
      year,
      chosen: null,
      reason: 'search returned only dissimilar titles',
      candidates: ranked.slice(0, 3).map(summarize),
    },
  };
}

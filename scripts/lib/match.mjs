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

function summarize(c) {
  return { id: c.id, title: c.title, originalTitle: c.original_title, year: candYear(c), popularity: c.popularity };
}

// Matches one Excel row (title + year) to a TMDB movie.
// Returns { id, status, review } where status is one of
// 'override' | 'exact' | 'loose' | 'ambiguous' | 'unmatched'.
// Anything not 'exact'/'override' also produces a review entry — never a silent guess.
export async function matchMovie({ title, year }, { overrides = {}, offline = false } = {}) {
  const key = `${title}|${year}`;
  if (overrides[key] != null) {
    return { id: overrides[key] === 'skip' ? null : overrides[key], status: 'override', review: null };
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
  let yearlessAll = [];
  if (!results.length) {
    const r = await searchMovie(title, {}, opts);
    yearlessAll = r?.results ?? [];
    results = yearlessAll.filter((c) => {
      const y = candYear(c);
      return !year || (y != null && Math.abs(y - year) <= 1);
    });
    if (results.length) searchNote = 'matched via year-less search, year within ±1';
  }

  if (!results.length) {
    // Exact title exists but under a different year — probably a year typo in Excel.
    const exactWrongYear = yearlessAll.filter((c) =>
      titlesEqual(normalizeTitle(c.title), norm) || titlesEqual(normalizeTitle(c.original_title || ''), norm)
    );
    if (exactWrongYear.length) {
      const pick = [...exactWrongYear].sort(
        (a, b) => Math.abs((candYear(a) ?? 9999) - year) - Math.abs((candYear(b) ?? 9999) - year) || b.popularity - a.popularity
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

  const exact = results.filter((c) => {
    const y = candYear(c);
    const titleHit = titlesEqual(normalizeTitle(c.title), norm) || titlesEqual(normalizeTitle(c.original_title || ''), norm);
    return titleHit && (!year || (y != null && Math.abs(y - year) <= 1));
  });

  if (exact.length === 1 && !searchNote) {
    return { id: exact[0].id, status: 'exact', review: null };
  }
  if (exact.length === 1) {
    return {
      id: exact[0].id,
      status: 'loose',
      review: { title, year, chosen: summarize(exact[0]), reason: searchNote, candidates: results.slice(0, 3).map(summarize) },
    };
  }
  if (exact.length > 1) {
    const pick = [...exact].sort((a, b) => b.popularity - a.popularity)[0];
    return {
      id: pick.id,
      status: 'ambiguous',
      review: {
        title,
        year,
        chosen: summarize(pick),
        reason: `${exact.length} title+year matches (remake/re-release?); picked most popular`,
        candidates: exact.slice(0, 4).map(summarize),
      },
    };
  }

  // Subtitle-completion matches ('Home Alone 2' → 'Home Alone 2: Lost in New York').
  const subtitle = results.filter((c) => {
    const y = candYear(c);
    if (year && (y == null || Math.abs(y - year) > 1)) return false;
    return subtitleMatch(normalizeTitle(c.title), c.title, norm) || subtitleMatch(normalizeTitle(c.original_title || ''), c.original_title || '', norm);
  });
  if (subtitle.length === 1) {
    return {
      id: subtitle[0].id,
      status: 'loose',
      review: {
        title,
        year,
        chosen: summarize(subtitle[0]),
        reason: `subtitle-completion match${searchNote ? `; ${searchNote}` : ''}`,
        candidates: results.slice(0, 3).map(summarize),
      },
    };
  }
  if (subtitle.length > 1) {
    const pick = [...subtitle].sort((a, b) => b.popularity - a.popularity)[0];
    return {
      id: pick.id,
      status: 'ambiguous',
      review: {
        title,
        year,
        chosen: summarize(pick),
        reason: `${subtitle.length} subtitle-completion candidates; picked most popular`,
        candidates: subtitle.slice(0, 4).map(summarize),
      },
    };
  }

  // No exact title hit — rank by edit distance, then popularity.
  const ranked = [...results].sort((a, b) => {
    const da = Math.min(levenshtein(normalizeTitle(a.title), norm), levenshtein(normalizeTitle(a.original_title || ''), norm));
    const db = Math.min(levenshtein(normalizeTitle(b.title), norm), levenshtein(normalizeTitle(b.original_title || ''), norm));
    return da - db || b.popularity - a.popularity;
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

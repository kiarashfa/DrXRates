// The profile page's numbers, from what the browser keeps (visitor ratings,
// watchlist, Knockout and Name the Frame stores, the profile). Pure, so it
// runs the same in tests.
import { computeTotals } from '../../shared/rating-meta.mjs';

const mean = (vals) => vals.reduce((a, b) => a + b, 0) / vals.length;

// ratings: the visitor store's { [movieId]: { scores, title, updatedAt } }.
// Returns the rated films newest first, the averages and the highest score.
export function ratingStats(ratings) {
  const list = Object.entries(ratings ?? {})
    .map(([id, e]) => ({ id: Number(id), title: e?.title ?? null, updatedAt: e?.updatedAt ?? '', totals: e?.scores ? computeTotals(e.scores) : null }))
    .filter((r) => r.totals)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id - b.id);
  if (!list.length) return { n: 0, list, avg: null, avgC: null, avgF: null, top: null };
  const top = [...list].sort((a, b) => b.totals.overall - a.totals.overall || b.updatedAt.localeCompare(a.updatedAt))[0];
  return {
    n: list.length,
    list,
    avg: mean(list.map((r) => r.totals.overall)),
    avgC: mean(list.map((r) => r.totals.contentAvg)),
    avgF: mean(list.map((r) => r.totals.formAvg)),
    top,
  };
}

// The director and the decade the visitor has rated most (ties: the higher
// average), from film objects with directors and year. Null below 2 films.
export function peopleStats(list, films) {
  const tally = (key) => {
    const groups = new Map();
    for (const r of list) {
      const film = films.get(r.id);
      for (const k of film ? key(film) : []) {
        const g = groups.get(k.id) ?? { ...k, n: 0, sum: 0 };
        g.n++;
        g.sum += r.totals.overall;
        groups.set(k.id, g);
      }
    }
    const best = [...groups.values()].sort((a, b) => b.n - a.n || b.sum / b.n - a.sum / a.n || String(a.id).localeCompare(String(b.id)))[0];
    return best && best.n >= 2 ? { ...best, avg: best.sum / best.n } : null;
  };
  return {
    director: tally((f) => (f.directors ?? []).map((d) => ({ id: d.id, name: d.name }))),
    decade: tally((f) => (f.year ? [{ id: Math.floor(f.year / 10) * 10, name: `${Math.floor(f.year / 10) * 10}s` }] : [])),
  };
}

// The earliest date anything here was saved: the start of "since".
export function memberSince({ ratings, watchlist, knockout, frames, profile }) {
  const dates = [
    profile?.createdAt,
    ...Object.values(ratings ?? {}).map((e) => e?.updatedAt),
    ...Object.values(watchlist ?? {}).map((e) => e?.addedAt),
    ...(knockout?.history ?? []).map((h) => h.finishedAt),
    ...Object.values(knockout?.cups ?? {}).map((c) => c.startedAt),
    ...Object.keys(frames?.daily ?? {}).map((d) => `${d}T12:00:00Z`),
  ].filter((d) => typeof d === 'string' && !Number.isNaN(Date.parse(d)));
  return dates.length ? dates.sort()[0] : null;
}

// Whether this browser holds anything at all (else the page welcomes).
export function hasAnything({ ratings, watchlist, knockout, frames, profile }) {
  return Boolean(
    profile ||
      Object.keys(ratings ?? {}).length ||
      Object.keys(watchlist ?? {}).length ||
      knockout?.history?.length ||
      knockout?.current ||
      Object.keys(knockout?.cups ?? {}).length ||
      Object.keys(frames?.best ?? {}).length ||
      Object.keys(frames?.daily ?? {}).length
  );
}

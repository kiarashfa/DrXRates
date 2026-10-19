// Film of the day: one of Dr. X's films rated 7.5 or more (with a backdrop),
// the same for everyone on a given date. Days are grouped into cycles as long
// as the pool; each cycle walks a shuffle of the pool seeded by the cycle
// number, so no film repeats within a cycle and the choice depends only on
// the date and the pool. Build-time only: the homepage embeds a schedule.
export const FOD_MIN_SCORE = 7.5;
const DAY_MS = 86400000;

// Mulberry32: a small seeded PRNG.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(list, seed) {
  const out = [...list];
  const next = rng(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const isoDay = (n) => new Date(n * DAY_MS).toISOString().slice(0, 10);

function clip(text, max) {
  if (!text || text.length <= max) return text ?? null;
  const cut = text.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

// [{ date: 'YYYY-MM-DD', id, slug, title, year, directors, runtime, backdrop, my, overview }]
// for `days` days starting the day before `from` (so a visitor whose local
// date is behind UTC still finds today).
export function filmOfDaySchedule(movies, from = new Date(), days = 62) {
  const pool = movies.filter((m) => m.myRating?.overall >= FOD_MIN_SCORE && m.backdrop).sort((a, b) => a.id - b.id);
  if (!pool.length) return [];
  const start = Math.floor(from.getTime() / DAY_MS) - 1;
  const cycles = new Map();
  const out = [];
  for (let day = start; day < start + days; day++) {
    const cycle = Math.floor(day / pool.length);
    if (!cycles.has(cycle)) cycles.set(cycle, shuffled(pool, cycle * 2654435761));
    const m = cycles.get(cycle)[day % pool.length];
    out.push({
      date: isoDay(day),
      id: m.id,
      slug: m.slug,
      title: m.title,
      year: m.year,
      directors: m.directors.slice(0, 2).map((d) => d.name),
      runtime: m.runtime,
      backdrop: m.backdrop,
      my: m.myRating.overall,
      overview: clip(m.overview, 190),
    });
  }
  return out;
}

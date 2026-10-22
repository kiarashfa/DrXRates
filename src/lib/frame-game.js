// Name the Frame: the pure game engine (no DOM). Films come from
// loadFrameFilms() (src/lib/archive.js); a frame is (film id, frame number),
// frame 1 being the film's lead frame. Everything random draws from a seeded
// generator, so a run can be replayed exactly from its seed (challenge links).
import { mulberry32 } from './knockout.js';

export { mulberry32 };

// ---------- modes and options ----------
// lives: tickets (0 = none); clock: 'frame' (per frame), 'run' (one clock for
// the whole run) or null; answer: 'choices' | 'typing' | 'frames' (pick the
// frame for a title); score: what the result line counts.
export const MODES = {
  survival: { label: 'Survival', lives: 5, clock: 'frame', answer: 'choices', tag: '5 tickets', blurb: 'Ten seconds a frame; wrong or late costs a ticket. Gets harder.' },
  sprint: { label: 'Sprint', lives: 0, clock: 'run', answer: 'choices', tag: '60 sec', blurb: 'One minute, as many frames as you can. A miss costs 3 s.' },
  cinephile: { label: 'Cinephile', lives: 5, clock: 'frame', answer: 'typing', tag: 'Typing', blurb: 'No choices: type the title. Any film in the archive is a valid guess; original titles count.' },
  reverse: { label: 'Find the frame', lives: 5, clock: 'frame', answer: 'frames', tag: 'Reverse', blurb: 'You get the title; pick its frame out of four.' },
  slow: { label: 'Slow reveal', lives: 5, clock: 'frame', answer: 'choices', reveal: 'zoom', tag: 'Zoom out', blurb: 'Starts as a detail and pulls back. The sooner you know, the more it pays.' },
  party: { label: 'Party', lives: 0, clock: 'frame', answer: 'choices', tag: '2–4 players', blurb: 'One screen, a buzzer key each. For movie nights.' },
  practice: { label: 'Practice', lives: 0, clock: null, answer: 'choices', tag: 'No clock', blurb: 'No tickets, no clock. Pick a director, a collection, your watchlist.' },
};
export const SPRINT_SECONDS = 60;
export const SPRINT_PENALTY = 3;
export const PARTY_ROUNDS = 15;
export const PARTY_KEYS = ['q', 'p', 'b', 'm'];
export const REVEALS = { full: 'Whole frame', zoom: 'Zoom out', key: 'Keyhole', spot: 'Spotlight', pix: 'Pixels' };
export const DIFFICULTIES = { rising: 'Rising (easy first)', easy: 'Easy only', hard: 'Hard only' };
export const HINTS = { clue: 2, frame: 2, skip: 1 };

export const DEFAULT_OPTS = {
  mode: 'survival',
  source: 'drx', // drx | yours | watchlist | director | collection
  director: '',
  collection: '',
  yearFrom: null,
  yearTo: null,
  minVotes: 25000,
  seconds: 10,
  difficulty: 'rising',
  answer: 'choices', // choices | typing (for the modes that offer both)
  reveal: 'full',
  retakes: true,
  bonus: false,
};

// The films a run draws its frames from.
export function filterPool(films, opts, { ids = null } = {}) {
  return films.filter(
    (f) =>
      (!ids || ids.has(f.id)) &&
      (opts.yearFrom == null || (f.year ?? 0) >= opts.yearFrom) &&
      (opts.yearTo == null || (f.year ?? 9999) <= opts.yearTo) &&
      (!opts.minVotes || f.votes >= opts.minVotes) &&
      (opts.source !== 'director' || !opts.director || f.directors.includes(opts.director))
  );
}

// ---------- difficulty ----------
// How recognisable one frame is, 0–1: mostly how many people saw the film,
// then its stars, the frame itself (the lead frame is the film's signature
// shot), the director and the rating.
const W = { votes: 0.4, imdb: 0.1, star: 0.15, dir: 0.1, frame: 0.25 };
export const frameEase = (n) => (n === 1 ? 1 : 0.4);
export function ease(film, n) {
  return W.votes * film.e.votes + W.imdb * film.e.imdb + W.star * film.e.star + W.dir * film.e.dir + W.frame * frameEase(n);
}
export const TIERS = ['Easy', 'Medium', 'Hard'];
const BANDS = [[0.74, 1], [0.55, 0.82], [0, 0.66]];
export function tierFor(round, difficulty) {
  if (difficulty === 'easy') return 0;
  if (difficulty === 'hard') return 2;
  return round <= 4 ? 0 : round <= 12 ? 1 : 2;
}
export function easeFormula(film, n) {
  return { total: ease(film, n), ...film.e, frame: frameEase(n), weights: W };
}

// ---------- clues ----------
// A clue names something the answer shares with exactly one other option, so
// it narrows four to two and never gives the answer away.
const decade = (y) => Math.floor((y ?? 0) / 10) * 10;
const band = (s) => (s >= 8.5 ? '8.5 or more' : s >= 8 ? 'from 8 to 8.5' : s >= 7 ? 'from 7 to 8' : s >= 6 ? 'from 6 to 7' : 'under 6');
const CLUES = {
  decade: { ok: (a) => a.year, same: (a, b) => b.year && decade(a.year) === decade(b.year), text: (a) => `It came out in the ${decade(a.year)}s.` },
  genre: { ok: (a) => a.genres.length, same: (a, b) => b.genres.includes(a.genres[0]), text: (a) => `It is filed under ${a.genres[0]}.` },
  director: { ok: (a) => a.directors.length, same: (a, b) => b.directors.some((d) => a.directors.includes(d)), text: (a) => `Directed by ${a.directors.join(' and ')}.` },
  score: { ok: (a) => a.my != null, same: (a, b) => b.my != null && band(b.my) === band(a.my), text: (a) => `Dr. X scored it ${band(a.my)}.` },
};
// A text clue on its own (typing mode): any fact, no elimination.
export function textClue(film, r) {
  const k = pick(Object.keys(CLUES).filter((key) => CLUES[key].ok(film)), r);
  return k ? CLUES[k].text(film) : null;
}

const pick = (list, r) => list[Math.floor(r() * list.length)];
function shuffle(list, r) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export const frameKey = (id, n) => `${id}:${n}`;

// ---------- questions ----------
// Picks the answer and its frame. `pool` is what the run draws from, `used`
// the films already shown this run, `avoid` frame keys seen in recent runs,
// `retake` a [id, frame] the visitor missed before (used as is when it fits).
function pickAnswer(r, { pool, tier, used, avoid, retake }) {
  if (retake) {
    const f = pool.find((x) => x.id === retake[0]);
    if (f && !used.has(f.id) && retake[1] <= f.frames) return { film: f, n: retake[1], retake: true };
  }
  const [lo, hi] = BANDS[tier];
  const candidates = (fits) => {
    const out = [];
    for (const f of pool) {
      if (used.has(f.id)) continue;
      const opts = [1];
      if (f.frames > 1) opts.push(2 + Math.floor(r() * (f.frames - 1)));
      for (const n of opts) {
        if (avoid?.has(frameKey(f.id, n))) continue;
        if (fits(ease(f, n))) out.push([f, n]);
      }
    }
    return out;
  };
  let list = candidates((e) => e >= lo && e <= hi);
  if (!list.length) list = candidates(() => true); // small pools: any unused film
  if (!list.length) return null;
  const [film, n] = pick(list, r);
  return { film, n, retake: false };
}

// Three other films for the options: about as well known as the answer;
// medium and hard rounds share a genre, hard ones the era too. Titles stay
// distinct. One of them shares the clue's fact (the "twin").
function others(r, answer, all, tier, count = 3) {
  const rest = all.filter((f) => f.id !== answer.id && f.title.toLowerCase() !== answer.title.toLowerCase());
  const near = (f, w) => Math.abs(f.e.votes - answer.e.votes) < w;
  let pool = rest.filter((f) => near(f, [0.25, 0.2, 0.25][tier]));
  if (tier >= 1) pool = pool.filter((f) => f.genres.some((g) => answer.genres.includes(g)));
  if (tier === 2) pool = pool.filter((f) => Math.abs((f.year ?? 0) - (answer.year ?? 0)) <= 10);
  if (pool.length < count + 5) pool = rest.filter((f) => near(f, 0.3));
  if (pool.length < count + 5) pool = rest;
  for (const k of shuffle(Object.keys(CLUES), r)) {
    const c = CLUES[k];
    if (!c.ok(answer)) continue;
    const twins = (k === 'director' ? rest : pool).filter((f) => c.same(answer, f));
    const unlike = pool.filter((f) => !c.same(answer, f));
    if (!twins.length || unlike.length < count - 1) continue;
    const twin = pick(twins, r);
    const titles = new Set([answer.title, twin.title]);
    const picked = [twin];
    for (const f of shuffle(unlike, r)) {
      if (picked.length === count) break;
      if (titles.has(f.title)) continue;
      titles.add(f.title);
      picked.push(f);
    }
    return { films: picked, clue: { text: c.text(answer), keep: [answer.id, twin.id] } };
  }
  const titles = new Set([answer.title]);
  const picked = [];
  for (const f of shuffle(pool, r)) {
    if (picked.length === count) break;
    if (titles.has(f.title)) continue;
    titles.add(f.title);
    picked.push(f);
  }
  return { films: picked, clue: null };
}

// One question: { film, n, tier, ease, retake, options: [film ×4], clue,
// focus: [x%, y%] (where zoom and keyhole reveals centre) }. `frames` mode
// (Find the frame) adds choices: [{ film, n } ×4] instead of title options.
export function makeQuestion(r, { pool, all, round, difficulty = 'rising', used, avoid = null, retake = null, answer = 'choices' }) {
  const tier = tierFor(round, difficulty);
  const a = pickAnswer(r, { pool, tier, used, avoid, retake });
  if (!a) return null;
  const { films, clue } = others(r, a.film, all, tier);
  const q = {
    film: a.film,
    n: a.n,
    tier,
    ease: ease(a.film, a.n),
    retake: a.retake,
    options: shuffle([a.film, ...films], r),
    clue,
    focus: [35 + r() * 30, 35 + r() * 30],
  };
  if (answer === 'frames') {
    // Hard rounds avoid lead frames, which give a film away.
    const frameOf = (f) => (tier === 2 && f.frames > 1 ? 2 + Math.floor(r() * (f.frames - 1)) : f.frames > 1 && r() < 0.5 ? 2 + Math.floor(r() * (f.frames - 1)) : 1);
    q.choices = q.options.map((f) => ({ film: f, n: f.id === a.film.id ? a.n : frameOf(f) }));
  }
  return q;
}

// Points for a right answer: 50 plus up to 100 for time left, halved when a
// hint was used, plus 10% per frame of streak (up to double).
export function points({ left = 0, seconds = 10, hinted = false, streak = 1, clock = true }) {
  const base = 50 + (clock ? (100 * Math.max(0, left)) / seconds : 50);
  return Math.round(base * (hinted ? 0.5 : 1) * (1 + 0.1 * Math.min(Math.max(streak - 1, 0), 10)));
}

// Bonus round: guess Dr. X's score; within 0.5 doubles the frame's points.
export const BONUS_RANGE = 0.5;
export const bonusHit = (guess, actual) => guess != null && actual != null && Math.abs(guess - actual) <= BONUS_RANGE + 1e-9;

// ---------- Daily Reel ----------
// One film a day, the same for everyone: Dr. X's films with six or more
// frames and 100k+ IMDb votes, walked in a shuffle per cycle (as Film of the
// day). Six frames, other frames first in a shuffled order, the lead last.
export const DAILY_EPOCH = '2026-10-22'; // reel #1
export const DAILY_FRAMES = 6;
const DAY_MS = 86400000;
const dayNumber = (iso) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
export const dailyNumber = (iso) => dayNumber(iso) - dayNumber(DAILY_EPOCH) + 1;
export function dailyPool(films) {
  return films.filter((f) => f.frames >= DAILY_FRAMES && f.votes >= 100000).sort((a, b) => a.id - b.id);
}
// [{ date, id, frames: [n ×6] }] for `days` days from the day before `from`.
export function dailySchedule(pool, from = new Date(), days = 62) {
  if (!pool.length) return [];
  const start = Math.floor(from.getTime() / DAY_MS) - 1;
  // A cycle's first weeks skip films its predecessor showed in its last
  // weeks; those move to the middle of the cycle (never its end, so every
  // cycle's last weeks stay exactly its shuffle's), and a film never comes
  // back days later.
  const GAP = Math.min(60, Math.floor(pool.length / 4));
  const raw = (c) => shuffle(pool, mulberry32(c * 2654435761));
  const cycles = new Map();
  const order = (c) => {
    if (!cycles.has(c)) {
      const tail = new Set(raw(c - 1).slice(-GAP).map((f) => f.id));
      const list = raw(c);
      const head = list.slice(0, GAP);
      const rest = list.slice(GAP);
      const mid = Math.floor(rest.length / 2);
      cycles.set(c, [...head.filter((f) => !tail.has(f.id)), ...rest.slice(0, mid), ...head.filter((f) => tail.has(f.id)), ...rest.slice(mid)]);
    }
    return cycles.get(c);
  };
  const out = [];
  for (let day = start; day < start + days; day++) {
    const cycle = Math.floor(day / pool.length);
    const f = order(cycle)[day % pool.length];
    const r = mulberry32(day * 40503 + f.id);
    const rest = shuffle(Array.from({ length: f.frames - 1 }, (_, i) => i + 2), r).slice(0, DAILY_FRAMES - 1);
    out.push({ date: new Date(day * DAY_MS).toISOString().slice(0, 10), id: f.id, frames: [...rest, 1] });
  }
  return out;
}

// ---------- typing ----------
// How close a wrong typed guess was: shown under it as a nudge.
export function nearMiss(guess, answer) {
  if (!guess) return null;
  const gd = (guess.directors ?? []).map((d) => (typeof d === 'string' ? d : d.name));
  if (gd.some((d) => answer.directors.includes(d))) return 'same director';
  if (guess.year && answer.year && decade(guess.year) === decade(answer.year)) return 'right decade';
  if ((guess.genres ?? []).some((g) => answer.genres.includes(g))) return 'same genre';
  return null;
}

// ---------- results ----------
// Plain share text (no coloured squares).
export function shareText({ mode, score, named, total, marks, url }) {
  const what = MODES[mode]?.label ?? mode;
  const tally = mode === 'sprint' || mode === 'practice' ? `${named} frames named` : `${score.toLocaleString('en-US')} points · ${named} of ${total} frames named`;
  return `Name the Frame · ${what}\n${tally}\n${marks}\n${url}`;
}
export function dailyShareText({ number, solvedAt, guesses, url }) {
  const marks = Array.from({ length: DAILY_FRAMES }, (_, i) => (i < guesses ? (i === solvedAt - 1 ? '✓' : '✗') : '·')).join(' ');
  const line = solvedAt ? `Named on frame ${solvedAt} of ${DAILY_FRAMES}` : `Not named in ${DAILY_FRAMES} frames`;
  return `Name the Frame · Daily Reel #${number}\n${line}   ${marks}\n${url}`;
}

// ---------- challenge links ----------
// #c1.<base64url JSON>: mode, seed, the rules that shape the questions, and
// the challenger's result. Only pools anyone can rebuild are shareable (Dr.
// X's films, a director or a collection; not a visitor's own lists).
const b64 = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
export const SHAREABLE_SOURCES = ['drx', 'director', 'collection'];
export function encodeChallenge({ opts, seed, score, named }) {
  const o = opts;
  return `c1.${b64(JSON.stringify({ m: o.mode, s: seed, src: o.source, d: o.director || undefined, c: o.collection || undefined, y: [o.yearFrom, o.yearTo], v: o.minVotes, t: o.seconds, df: o.difficulty, a: o.answer, rv: o.reveal, p: score, n: named }))}`;
}
export function parseChallenge(hash) {
  const m = /^#?c1\.([A-Za-z0-9_-]+)$/.exec(hash ?? '');
  if (!m) return null;
  try {
    const c = JSON.parse(unb64(m[1]));
    if (!MODES[c.m] || c.m === 'party' || !Number.isInteger(c.s) || !SHAREABLE_SOURCES.includes(c.src)) return null;
    return {
      seed: c.s >>> 0,
      score: Number(c.p) || 0,
      named: Number(c.n) || 0,
      opts: {
        ...DEFAULT_OPTS,
        mode: c.m,
        source: c.src,
        director: c.d ?? '',
        collection: c.c ?? '',
        yearFrom: Number.isInteger(c.y?.[0]) ? c.y[0] : null,
        yearTo: Number.isInteger(c.y?.[1]) ? c.y[1] : null,
        minVotes: Number(c.v) || 0,
        seconds: Math.min(60, Math.max(3, Number(c.t) || 10)),
        difficulty: DIFFICULTIES[c.df] ? c.df : 'rising',
        answer: c.a === 'typing' ? 'typing' : 'choices',
        reveal: REVEALS[c.rv] ? c.rv : 'full',
        retakes: false,
        bonus: false,
      },
    };
  } catch {
    return null;
  }
}

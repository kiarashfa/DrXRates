// The visitor's Name the Frame record, kept in this browser only (via store.js):
// { version: 1,
//   best: { [mode]: number } (points; frames named for sprint and practice),
//   daily: { [YYYY-MM-DD]: { id, guesses: [filmId | 0 (skipped)], solved: frame number or 0 } },
//   missed: [[filmId, frame, at]] frames answered wrong, newest first (retakes),
//   recent: [frameKey] frames shown lately, newest first (kept out of new runs),
//   prefs: { opts, players } the lobby's last settings }
import { readJson, writeJson } from './store.js';

const KEY = 'cinema.frames.v1';
export const MISSED_CAP = 80;
export const RECENT_CAP = 300;
const DAILY_CAP = 400;

const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const isDay = (d) => /^\d{4}-\d\d-\d\d$/.test(d);
const validMissed = (m) => Array.isArray(m) && Number.isInteger(m[0]) && Number.isInteger(m[1]) && typeof m[2] === 'string';
const validDaily = (d) => isObj(d) && Number.isInteger(d.id) && Array.isArray(d.guesses) && d.guesses.every(Number.isInteger) && Number.isInteger(d.solved);

function load() {
  const p = readJson(KEY);
  return {
    version: 1,
    best: isObj(p?.best) ? Object.fromEntries(Object.entries(p.best).filter(([, v]) => Number.isFinite(v))) : {},
    daily: isObj(p?.daily) ? Object.fromEntries(Object.entries(p.daily).filter(([d, v]) => isDay(d) && validDaily(v))) : {},
    missed: Array.isArray(p?.missed) ? p.missed.filter(validMissed) : [],
    recent: Array.isArray(p?.recent) ? p.recent.filter((k) => typeof k === 'string') : [],
    prefs: isObj(p?.prefs) ? p.prefs : {},
  };
}

function save(store) {
  writeJson(KEY, store);
}

export function frameStore() {
  return load();
}

// Records a finished run; returns true when it beat the previous best.
export function saveRun(mode, score) {
  const store = load();
  const beat = score > (store.best[mode] ?? 0);
  if (beat) store.best[mode] = score;
  save(store);
  return beat;
}

// Frames shown and missed during a run. A frame named right leaves the
// missed list; one missed (again) goes to its top.
export function recordFrames(shown, missed, named) {
  const store = load();
  const at = new Date().toISOString();
  store.recent = [...new Set([...shown, ...store.recent])].slice(0, RECENT_CAP);
  const drop = new Set([...named, ...missed.map(([id, n]) => `${id}:${n}`)]);
  store.missed = [...missed.map(([id, n]) => [id, n, at]), ...store.missed.filter(([id, n]) => !drop.has(`${id}:${n}`))].slice(0, MISSED_CAP);
  save(store);
}

export function saveDaily(date, entry) {
  const store = load();
  store.daily[date] = entry;
  const days = Object.keys(store.daily).sort();
  for (const d of days.slice(0, Math.max(0, days.length - DAILY_CAP))) delete store.daily[d];
  save(store);
}

export function savePrefs(prefs) {
  const store = load();
  store.prefs = prefs;
  save(store);
}

// Days in a row (ending today or yesterday) with a solved reel.
export function dailyStreak(daily, today) {
  let streak = 0;
  const day = new Date(`${today}T00:00:00Z`);
  if (!daily[today]?.solved) day.setUTCDate(day.getUTCDate() - 1);
  while (daily[day.toISOString().slice(0, 10)]?.solved) {
    streak++;
    day.setUTCDate(day.getUTCDate() - 1);
  }
  return streak;
}

// Backup import: best scores keep the higher; daily results and missed
// frames are a union (this browser's entry wins for the same day or frame).
export function mergeFrames(incoming) {
  const store = load();
  let imported = 0;
  let skipped = 0;
  if (!isObj(incoming)) return { imported, skipped: 1 };
  for (const [mode, v] of Object.entries(isObj(incoming.best) ? incoming.best : {})) {
    if (!Number.isFinite(v)) {
      skipped++;
      continue;
    }
    if (v > (store.best[mode] ?? 0)) {
      store.best[mode] = v;
      imported++;
    }
  }
  for (const [d, v] of Object.entries(isObj(incoming.daily) ? incoming.daily : {})) {
    if (!isDay(d) || !validDaily(v)) {
      skipped++;
      continue;
    }
    if (!store.daily[d]) {
      store.daily[d] = v;
      imported++;
    }
  }
  const have = new Set(store.missed.map(([id, n]) => `${id}:${n}`));
  for (const m of Array.isArray(incoming.missed) ? incoming.missed : []) {
    if (!validMissed(m)) {
      skipped++;
      continue;
    }
    if (!have.has(`${m[0]}:${m[1]}`)) {
      store.missed.push(m);
      have.add(`${m[0]}:${m[1]}`);
      imported++;
    }
  }
  store.missed.sort((a, b) => b[2].localeCompare(a[2]));
  store.missed = store.missed.slice(0, MISSED_CAP);
  save(store);
  return { imported, skipped };
}

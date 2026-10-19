// The visitor's Knockout brackets, kept in this browser only (via store.js):
// { version: 1,
//   current: bracket in progress or just finished, or null,
//   history: [{ champion: { id, title, year, poster }, size, label, cup?, finishedAt }] (newest first),
//   cups: { [slug]: { picks, mode: 'free' | 'path', startedAt, finishedAt? } } }
// A bracket: { label, size, rankBy, seeding, seed, slots, picks, films, startedAt, finishedAt? }
// where `films` holds what a card shows for every entrant ({ [id]: film }), so
// resuming needs no data download.
import { readJson, writeJson } from './store.js';

const KEY = 'cinema.knockout.v1';
export const HISTORY_CAP = 50;

const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const isIds = (v) => Array.isArray(v) && v.every((id) => Number.isInteger(id) && id > 0);

function validBracket(b) {
  return isObj(b) && isIds(b.slots) && isIds(b.picks) && b.picks.length < b.slots.length && isObj(b.films);
}
function validCupPlay(c) {
  return isObj(c) && isIds(c.picks) && (c.mode === 'free' || c.mode === 'path');
}
function validHistory(h) {
  return isObj(h) && isObj(h.champion) && Number.isInteger(h.champion.id) && typeof h.finishedAt === 'string';
}

function load() {
  const p = readJson(KEY);
  return {
    version: 1,
    current: validBracket(p?.current) ? p.current : null,
    history: Array.isArray(p?.history) ? p.history.filter(validHistory) : [],
    cups: isObj(p?.cups) ? Object.fromEntries(Object.entries(p.cups).filter(([, c]) => validCupPlay(c))) : {},
  };
}

function save(store) {
  writeJson(KEY, store);
}

export function knockoutStore() {
  return load();
}

export function saveCurrent(bracket) {
  const store = load();
  store.current = bracket;
  save(store);
}

export function clearCurrent() {
  const store = load();
  store.current = null;
  save(store);
}

export function addHistory(entry) {
  const store = load();
  store.history = [entry, ...store.history.filter((h) => !(h.finishedAt === entry.finishedAt && h.champion.id === entry.champion.id))].slice(0, HISTORY_CAP);
  save(store);
}

export function cupPlay(slug) {
  return load().cups[slug] ?? null;
}

export function saveCupPlay(slug, play) {
  const store = load();
  if (play) store.cups[slug] = play;
  else delete store.cups[slug];
  save(store);
}

// Backup import: history is a union (newest first, capped); a bracket in
// progress here wins over the file's; per cup, a finished play wins over an
// unfinished one, then the later one.
export function mergeKnockout(incoming) {
  const store = load();
  let imported = 0;
  let skipped = 0;
  if (!isObj(incoming)) return { imported, skipped: 1 };
  for (const h of Array.isArray(incoming.history) ? incoming.history : []) {
    if (!validHistory(h)) {
      skipped++;
      continue;
    }
    if (!store.history.some((x) => x.finishedAt === h.finishedAt && x.champion.id === h.champion.id)) {
      store.history.push(h);
      imported++;
    }
  }
  store.history.sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
  store.history = store.history.slice(0, HISTORY_CAP);
  if (incoming.current != null) {
    if (validBracket(incoming.current)) {
      if (!store.current) {
        store.current = incoming.current;
        imported++;
      }
    } else skipped++;
  }
  for (const [slug, c] of Object.entries(isObj(incoming.cups) ? incoming.cups : {})) {
    if (!validCupPlay(c)) {
      skipped++;
      continue;
    }
    const mine = store.cups[slug];
    const rank = (p) => [p?.finishedAt ? 1 : 0, p?.finishedAt ?? p?.startedAt ?? ''];
    const [fa, ta] = rank(c);
    const [fb, tb] = rank(mine);
    if (!mine || fa > fb || (fa === fb && ta > tb)) {
      store.cups[slug] = c;
      imported++;
    }
  }
  save(store);
  return { imported, skipped };
}

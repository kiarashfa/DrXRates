// The visitor's watchlist, kept in this browser only (via store.js):
// { version: 1, items: { [movieId]: { title, addedAt } } }.
// Every change fires a `cinema:watchlist` event on window so all toggles on a
// page stay in step; other tabs are followed through the `storage` event.
import { readJson, writeJson } from './store.js';

const KEY = 'cinema.watchlist.v1';
export const WATCHLIST_EVENT = 'cinema:watchlist';

function load() {
  const parsed = readJson(KEY);
  const items = parsed && typeof parsed === 'object' && parsed.items && typeof parsed.items === 'object' ? parsed.items : {};
  return { version: 1, items };
}

function save(store) {
  writeJson(KEY, store);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(WATCHLIST_EVENT));
}

// Items as [{ id (number), title, addedAt }], newest first.
export function listWatchlist() {
  return Object.entries(load().items)
    .map(([id, e]) => ({ id: Number(id), title: e.title ?? null, addedAt: e.addedAt ?? null }))
    .sort((a, b) => (b.addedAt ?? '').localeCompare(a.addedAt ?? '') || a.id - b.id);
}

export function watchlistItems() {
  return load().items;
}

export function inWatchlist(movieId) {
  return Object.hasOwn(load().items, movieId);
}

export function addToWatchlist(movieId, title, addedAt = new Date().toISOString()) {
  const store = load();
  store.items[movieId] = { title, addedAt };
  save(store);
}

export function removeFromWatchlist(movieId) {
  const store = load();
  delete store.items[movieId];
  save(store);
}

// Returns the new state (true = on the list).
export function toggleWatchlist(movieId, title) {
  if (inWatchlist(movieId)) {
    removeFromWatchlist(movieId);
    return false;
  }
  addToWatchlist(movieId, title);
  return true;
}

// Calls fn() whenever the list changes, here or in another tab; returns an
// unsubscribe function.
export function onWatchlistChange(fn) {
  const onStorage = (e) => {
    if (e.key === KEY || e.key == null) fn();
  };
  window.addEventListener(WATCHLIST_EVENT, fn);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(WATCHLIST_EVENT, fn);
    window.removeEventListener('storage', onStorage);
  };
}

// Backup import: union with what's here, keeping the earlier addedAt.
// Entries need a positive integer id; anything else is skipped.
export function mergeWatchlist(incoming) {
  const store = load();
  let imported = 0;
  let skipped = 0;
  for (const [id, entry] of Object.entries(incoming)) {
    if (!/^\d+$/.test(id) || Number(id) <= 0 || !entry || typeof entry !== 'object') {
      skipped++;
      continue;
    }
    const addedAt = typeof entry.addedAt === 'string' ? entry.addedAt : null;
    const prev = store.items[id];
    const earlier = prev?.addedAt && (!addedAt || prev.addedAt < addedAt) ? prev.addedAt : addedAt;
    store.items[id] = { title: typeof entry.title === 'string' ? entry.title : (prev?.title ?? null), addedAt: earlier ?? new Date().toISOString() };
    imported++;
  }
  save(store);
  return { imported, skipped };
}

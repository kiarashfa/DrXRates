// Visitor ratings live ONLY in the browser's localStorage; there is no backend.
import { ALL_KEYS } from '../../shared/rating-meta.mjs';
import { readJson, writeJson } from './store.js';

const KEY = 'cinema.visitor.v1';

function emptyStore() {
  return { version: 1, ratings: {} };
}

export function loadStore() {
  const parsed = readJson(KEY);
  if (parsed && typeof parsed === 'object' && parsed.ratings && typeof parsed.ratings === 'object') {
    return { version: 1, ratings: parsed.ratings };
  }
  return emptyStore();
}

function saveStore(store) {
  writeJson(KEY, store);
}

export function getRating(movieId) {
  return loadStore().ratings[movieId] ?? null;
}

export function setRating(movieId, scores, movieTitle) {
  const store = loadStore();
  store.ratings[movieId] = { scores, title: movieTitle, updatedAt: new Date().toISOString() };
  saveStore(store);
}

export function removeRating(movieId) {
  const store = loadStore();
  delete store.ratings[movieId];
  saveStore(store);
}

export function countRatings() {
  return Object.keys(loadStore().ratings).length;
}

export function validScores(scores) {
  if (!scores || typeof scores !== 'object') return false;
  return ALL_KEYS.every((k) => {
    const v = scores[k.key];
    return typeof v === 'number' && v >= 0 && v <= 5;
  });
}

// Merges incoming ratings ({ [movieId]: { scores, title, updatedAt } }) into
// the store; entries with invalid scores are skipped. Used by backup import.
export function mergeRatings(incoming) {
  const store = loadStore();
  let imported = 0;
  let skipped = 0;
  for (const [id, entry] of Object.entries(incoming)) {
    if (entry && validScores(entry.scores)) {
      store.ratings[id] = entry;
      imported++;
    } else {
      skipped++;
    }
  }
  saveStore(store);
  return { imported, skipped };
}

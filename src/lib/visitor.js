// Visitor ratings live ONLY in the browser's localStorage — there is no backend.
import { ALL_KEYS } from '../../shared/rating-meta.mjs';

const KEY = 'cinema.visitor.v1';

function emptyStore() {
  return { version: 1, ratings: {} };
}

export function loadStore() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.ratings && typeof parsed.ratings === 'object') {
      return { version: 1, ratings: parsed.ratings };
    }
  } catch {}
  return emptyStore();
}

function saveStore(store) {
  localStorage.setItem(KEY, JSON.stringify(store));
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

export function exportRatings() {
  const store = loadStore();
  const blob = new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `cinema-ledger-ratings-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Merges an exported file back in. Returns { imported, skipped }.
export async function importRatingsFile(file) {
  const text = await file.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Not a valid JSON file.');
  }
  const incoming = parsed?.ratings;
  if (!incoming || typeof incoming !== 'object') {
    throw new Error('Not a Cinema Ledger export — missing a "ratings" object.');
  }
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

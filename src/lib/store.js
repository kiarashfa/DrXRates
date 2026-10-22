// Every localStorage access goes through here. Storage can be missing or
// throw (private browsing, a full quota, blocked site data); values then live
// in memory for the rest of the page view, so features keep working and
// simply don't persist.
const memory = new Map();

// The keys the backup file carries (see backup.js). Writing one stamps
// CHANGED_KEY with the time and fires CHANGED_EVENT, so cloud saving
// (cloud.js) can tell there is something it hasn't saved yet.
const SAVED_KEYS = /^cinema\.(visitor|watchlist|knockout|frames|profile)\.v1$/;
export const CHANGED_KEY = 'cinema.changed';
export const CHANGED_EVENT = 'cinema:changed';

function stampChange(key) {
  if (!SAVED_KEYS.test(key)) return;
  const now = Date.now();
  memory.set(CHANGED_KEY, now);
  try {
    localStorage.setItem(CHANGED_KEY, String(now));
  } catch {}
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(CHANGED_EVENT));
}

// When a saved key last changed (ms since epoch), 0 if never.
export function changedAt() {
  return Number(readJson(CHANGED_KEY, 0)) || 0;
}

export function readJson(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    if (raw != null) return JSON.parse(raw);
  } catch {}
  return memory.has(key) ? structuredClone(memory.get(key)) : fallback;
}

// Returns false when the value could only be kept in memory.
export function writeJson(key, value) {
  memory.set(key, structuredClone(value));
  let stored = true;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    stored = false;
  }
  stampChange(key);
  return stored;
}

export function removeKey(key) {
  memory.delete(key);
  try {
    localStorage.removeItem(key);
  } catch {}
  stampChange(key);
}

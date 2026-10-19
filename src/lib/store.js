// Every localStorage access goes through here. Storage can be missing or
// throw (private browsing, a full quota, blocked site data); values then live
// in memory for the rest of the page view, so features keep working and
// simply don't persist.
const memory = new Map();

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
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key) {
  memory.delete(key);
  try {
    localStorage.removeItem(key);
  } catch {}
}

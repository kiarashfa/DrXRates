// What every page needs to know about cloud saving without loading cloud.js:
// whether the visitor connected Google Drive or Dropbox, and whether this
// browser holds changes that aren't in that save yet. Kept in this browser
// only, never in the backup file:
// { provider: 'google' | 'dropbox', account: { name, email } | null,
//   savedAt: when the data last saved was gathered (ISO) | null,
//   rev: the cloud file's version as last seen here | null,
//   file: Google Drive file id | null,
//   token: { access, expires (ms) } | null, refresh: Dropbox refresh token }
import { readJson, changedAt } from './store.js';

export const CLOUD_KEY = 'cinema.cloud.v1';
export const CLOUD_EVENT = 'cinema:cloud';
export const PROVIDERS = { google: 'Google Drive', dropbox: 'Dropbox' };

export function cloudState() {
  const s = readJson(CLOUD_KEY);
  return s && typeof s === 'object' && PROVIDERS[s.provider] ? s : null;
}

// True when something saved in the backup changed after the last cloud save.
export function unsaved(s = cloudState()) {
  return !!s && changedAt() > (s.savedAt ? Date.parse(s.savedAt) : 0);
}

// "just now", "4 min ago", "3 h ago", "yesterday", "12 Oct".
export function ago(iso, now = Date.now()) {
  if (!iso) return '';
  const min = Math.round((now - Date.parse(iso)) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  if (min < 24 * 60) return `${Math.round(min / 60)} h ago`;
  if (min < 48 * 60) return 'yesterday';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

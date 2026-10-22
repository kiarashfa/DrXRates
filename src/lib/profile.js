// The visitor's profile, kept in this browser only (via store.js) and in the
// backup file:
// { version: 1,
//   name: display name ('' = none),
//   picture: a square image as a data: URL (256 px WebP or JPEG), or null,
//   mono: { letters, color } when the picture is a monogram, else null,
//   source: where the picture came from: { kind: 'frame', film, frame } | { kind: 'upload' } | null,
//   createdAt, updatedAt }
// Every change fires `cinema:profile` on window; the header repaints its
// pictures with window.__paintAvatars (inline in SiteHeader.astro).
import { readJson, writeJson, removeKey } from './store.js';

export const PROFILE_KEY = 'cinema.profile.v1';
export const PROFILE_EVENT = 'cinema:profile';
export const NAME_MAX = 40;
export const PICTURE_SIZE = 256;
// Monogram backgrounds; global.css colours `.avatar[data-mono=…]` per theme.
export const MONO_COLORS = ['accent', 'content', 'form', 'sage', 'plum', 'amber', 'ink'];
// A 256 px WebP is ~5–15KB as a data: URL; anything far past that isn't ours.
const PICTURE_MAX = 200_000;

const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const validPicture = (p) => typeof p === 'string' && p.length <= PICTURE_MAX && /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(p);
const validMono = (m) => isObj(m) && typeof m.letters === 'string' && m.letters.trim().length > 0 && m.letters.length <= 2 && MONO_COLORS.includes(m.color);
function validSource(s) {
  if (!isObj(s)) return false;
  if (s.kind === 'upload') return true;
  return s.kind === 'frame' && Number.isInteger(s.film) && s.film > 0 && Number.isInteger(s.frame) && s.frame > 0;
}

function clean(p) {
  if (!isObj(p)) return null;
  const picture = validPicture(p.picture) ? p.picture : null;
  return {
    version: 1,
    name: typeof p.name === 'string' ? p.name.trim().slice(0, NAME_MAX) : '',
    picture,
    mono: !picture && validMono(p.mono) ? { letters: p.mono.letters.trim(), color: p.mono.color } : null,
    source: picture && validSource(p.source) ? p.source : null,
    createdAt: typeof p.createdAt === 'string' ? p.createdAt : null,
    updatedAt: typeof p.updatedAt === 'string' ? p.updatedAt : null,
  };
}

// The stored profile, or null when there is none.
export function loadProfile() {
  return clean(readJson(PROFILE_KEY));
}

function announce() {
  if (typeof window === 'undefined') return;
  window.__paintAvatars?.();
  window.dispatchEvent(new CustomEvent(PROFILE_EVENT));
}

// Applies a change ({ name } or { picture, mono, source }) and returns the
// profile as stored.
export function updateProfile(patch) {
  const now = new Date().toISOString();
  const prev = loadProfile() ?? { name: '', picture: null, mono: null, source: null, createdAt: now };
  const next = clean({ ...prev, ...patch, updatedAt: now });
  writeJson(PROFILE_KEY, next);
  announce();
  return next;
}

export function clearProfile() {
  removeKey(PROFILE_KEY);
  announce();
}

// Two letters from a name ("Sara Moradi" → "SM", "Sara" → "SA").
export function initials(name) {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  const letters = words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0].slice(0, 2);
  return letters.toUpperCase();
}

// Calls fn() whenever the profile changes, here or in another tab; returns an
// unsubscribe function.
export function onProfileChange(fn) {
  const onStorage = (e) => {
    if (e.key === PROFILE_KEY || e.key == null) fn();
  };
  window.addEventListener(PROFILE_EVENT, fn);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(PROFILE_EVENT, fn);
    window.removeEventListener('storage', onStorage);
  };
}

// Backup import: the more recently changed profile wins (a file without a
// date only fills an empty browser).
export function mergeProfile(incoming) {
  const theirs = clean(incoming);
  if (!theirs) return { imported: 0, skipped: 1 };
  const mine = loadProfile();
  const newer = !mine || (theirs.updatedAt && (!mine.updatedAt || theirs.updatedAt > mine.updatedAt));
  if (!newer) return { imported: 0, skipped: 0 };
  writeJson(PROFILE_KEY, { ...theirs, createdAt: [mine?.createdAt, theirs.createdAt].filter(Boolean).sort()[0] ?? theirs.updatedAt });
  announce();
  return { imported: 1, skipped: 0 };
}

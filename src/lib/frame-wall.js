// The frame wall's pure parts: colour families and the spectrum order,
// filtering, the three layouts' geometry (justified rows, an even grid, the
// endless board's tile choice) and the row windowing that keeps thousands of
// frames down to the few on screen. Frames are { f: film index, n, ar: width /
// height, col: six hex digits } (see loadWall in archive.js).
import { mulberry32 } from './knockout.js';

export const VIEWS = [
  { id: 'gallery', label: 'Gallery', hint: 'Rows of frames, each in its own proportions' },
  { id: 'spectrum', label: 'Spectrum', hint: 'Every frame in order of its colour' },
  { id: 'drift', label: 'Drift', hint: 'An endless board to wander' },
];

export const FAMILIES = [
  { id: 'red', label: 'Red', swatch: '#c0392b' },
  { id: 'orange', label: 'Orange', swatch: '#d9822b' },
  { id: 'yellow', label: 'Yellow', swatch: '#cfb53b' },
  { id: 'green', label: 'Green', swatch: '#4c9a4c' },
  { id: 'teal', label: 'Teal', swatch: '#2a9d9d' },
  { id: 'blue', label: 'Blue', swatch: '#3867c8' },
  { id: 'purple', label: 'Purple', swatch: '#8e5bc4' },
  { id: 'grey', label: 'Black and white', swatch: 'linear-gradient(135deg, #eee, #222)' },
];

// [hue 0–360, saturation 0–1, lightness 0–1] of six hex digits.
export function hsl(hex) {
  const n = parseInt(hex, 16);
  const r = (n >> 16) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  const d = mx - mn;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

// Most frames are dark, so their dominant colour is faint: below this
// saturation (or lightness) a frame counts as black and white.
const GREY_SAT = 0.12;
const GREY_LIGHT = 0.05;

export function colourFamily(hex) {
  const [h, s, l] = hsl(hex);
  if (s <= GREY_SAT || l < GREY_LIGHT) return 'grey';
  if (h < 15 || h >= 340) return 'red';
  if (h < 42) return 'orange';
  if (h < 70) return 'yellow';
  if (h < 165) return 'green';
  if (h < 200) return 'teal';
  if (h < 255) return 'blue';
  return 'purple';
}

// Spectrum order: reds first, round through the hues to purples, then the greys from light to dark.
export function colourKey(hex) {
  const [h, s, l] = hsl(hex);
  if (s <= GREY_SAT || l < GREY_LIGHT) return 1000 + (1 - l) * 100;
  return ((h + 20) % 360) + l * 0.5;
}

// Adds each frame's colour family and spectrum position in place.
export function prepareFrames(frames) {
  for (const fr of frames) {
    fr.fam = colourFamily(fr.col);
    fr.key = colourKey(fr.col);
  }
  return frames;
}

// Frames of the films that match, in their original order. A film matches a
// text on its title or a director's name.
export function filterFrames(frames, films, { q = '', decade = '', genre = '', top = false, family = '' } = {}) {
  const needle = q.trim().toLowerCase();
  const ok = films.map(
    (f) =>
      (!needle || f.title.toLowerCase().includes(needle) || f.directors.some((d) => d.toLowerCase().includes(needle))) &&
      (!decade || (f.year != null && Math.floor(f.year / 10) * 10 === Number(decade))) &&
      (!genre || f.genres.includes(genre)) &&
      (!top || f.my >= 8)
  );
  return frames.filter((fr) => ok[fr.f] && (!family || fr.fam === family));
}

export function shuffled(list, seed) {
  const rnd = mulberry32(seed);
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const bySpectrum = (list) => [...list].sort((a, b) => a.key - b.key);

// Justified rows: each row is filled to `width` by scaling its frames to one
// height (close to `target`); the last row keeps `target` instead of
// stretching. Rows: { start, end, top, h }.
export function justifyRows(ars, width, target, gap) {
  const rows = [];
  let top = 0;
  let start = 0;
  let sum = 0;
  for (let i = 0; i < ars.length; i++) {
    sum += ars[i];
    if (sum * target + gap * (i - start) >= width) {
      const h = (width - gap * (i - start)) / sum;
      rows.push({ start, end: i + 1, top, h });
      top += h + gap;
      start = i + 1;
      sum = 0;
    }
  }
  if (start < ars.length) {
    const h = Math.min(target, (width - gap * (ars.length - start - 1)) / sum);
    rows.push({ start, end: ars.length, top, h });
    top += h + gap;
  }
  return { rows, height: Math.max(0, top - gap) };
}

// An even grid of tiles at `ratio` (width / height), as many columns as fit
// tiles of at least `minTile`.
export function gridLayout(count, width, minTile, gap, ratio = 16 / 9) {
  const cols = Math.max(1, Math.floor((width + gap) / (minTile + gap)));
  const tw = (width - gap * (cols - 1)) / cols;
  const th = tw / ratio;
  const rows = Math.ceil(count / cols);
  return { cols, tw, th, rowH: th + gap, rows, height: Math.max(0, rows * (th + gap) - gap) };
}

// Index range of the justified rows that overlap [from, to].
export function rowRange(rows, from, to) {
  let lo = 0;
  let hi = rows.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid].top + rows[mid].h < from) lo = mid + 1;
    else hi = mid;
  }
  let end = lo;
  while (end < rows.length && rows[end].top <= to) end++;
  return [lo, end];
}

// The endless board: a deterministic frame for each cell of a plane whose
// columns are staggered by thirds of a row.
export function hash2(a, b) {
  let h = Math.imul(a, 73856093) ^ Math.imul(b, 19349663);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

export const DRIFT_WIDTHS = [180, 260, 380];

// Cells of the board in view: [{ key, c, r, x, y, w, h }] for a viewport of
// sw × sh whose plane is offset by (px, py), at zoom level `zoom`.
export function driftCells(zoom, px, py, sw, sh) {
  const w = DRIFT_WIDTHS[zoom];
  const h = Math.round((w * 9) / 16);
  const gap = Math.round(w * 0.06);
  const cw = w + gap;
  const ch = h + gap;
  const out = [];
  const c0 = Math.floor(-px / cw) - 1;
  const c1 = Math.ceil((sw - px) / cw) + 1;
  for (let c = c0; c <= c1; c++) {
    const off = ((((c % 3) + 3) % 3) * ch) / 3;
    const r0 = Math.floor((-py - off) / ch) - 1;
    const r1 = Math.ceil((sh - py - off) / ch) + 1;
    for (let r = r0; r <= r1; r++) out.push({ key: `${zoom}:${c}:${r}`, c, r, x: c * cw, y: r * ch + off, w, h });
  }
  return out;
}

// Single source of truth for the 10-part rating system.
// Imported by both the Node build scripts and the Astro/Svelte site.

export const CONTENT_KEYS = [
  { key: 'originality', label: 'Uniqueness & originality', short: 'Originality' },
  { key: 'character', label: 'Character development', short: 'Character' },
  { key: 'continuity', label: 'Continuity & coherence', short: 'Continuity' },
  { key: 'suspense', label: 'Suspense & tension', short: 'Suspense' },
  { key: 'message', label: 'Message & meaning', short: 'Message' },
];

export const FORM_KEYS = [
  { key: 'acting', label: 'Casting & acting', short: 'Acting' },
  { key: 'cinematography', label: 'Cinematography & visual effects', short: 'Cinematography' },
  { key: 'sound', label: 'Sound engineering & score', short: 'Sound' },
  { key: 'directing', label: 'Directing & editing', short: 'Directing' },
  { key: 'design', label: 'Production design & costume', short: 'Design' },
];

export const ALL_KEYS = [...CONTENT_KEYS, ...FORM_KEYS];

export function halfAverage(scores, keys) {
  const vals = keys.map((k) => scores[k.key]);
  if (vals.some((v) => typeof v !== 'number' || Number.isNaN(v))) return null;
  return vals.reduce((a, b) => a + b, 0) / keys.length;
}

// THE score formatter — every score on the site renders through this.
// (A previous per-component copy stripped trailing zeros with a regex and
// turned 10 into "1" and 0 into "" — never format scores with string surgery.)
export function fmtScore(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return String(Math.round(n * 100) / 100);
}

export function computeTotals(scores) {
  const contentAvg = halfAverage(scores, CONTENT_KEYS);
  const formAvg = halfAverage(scores, FORM_KEYS);
  if (contentAvg == null || formAvg == null) return null;
  const round = (n) => Math.round(n * 100) / 100;
  return { contentAvg: round(contentAvg), formAvg: round(formAvg), overall: round(contentAvg + formAvg) };
}

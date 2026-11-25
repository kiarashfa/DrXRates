// Single source of truth for the 10-part rating system.
// Imported by both the Node build scripts and the Astro/Svelte site.

export const CONTENT_KEYS = [
  {
    key: 'originality',
    label: 'Uniqueness & originality',
    short: 'Originality',
    hint: 'something not seen before',
  },
  {
    key: 'character',
    label: 'Character development',
    short: 'Character',
    hint: 'people who change, or reveal themselves',
  },
  {
    key: 'continuity',
    label: 'Continuity & coherence',
    short: 'Continuity',
    hint: 'a story that holds together',
  },
  {
    key: 'suspense',
    label: 'Suspense & tension',
    short: 'Suspense',
    hint: 'what keeps you leaning in',
  },
  {
    key: 'message',
    label: 'Message & meaning',
    short: 'Message',
    hint: 'what stays after the credits',
  },
];

export const FORM_KEYS = [
  { key: 'acting', label: 'Casting & acting', short: 'Acting', hint: 'who plays whom, and how' },
  {
    key: 'cinematography',
    label: 'Cinematography & visual effects',
    short: 'Cinematography',
    hint: 'the image, the camera, the effects',
  },
  {
    key: 'sound',
    label: 'Sound engineering & score',
    short: 'Sound',
    hint: 'the mix, the silence, the music',
  },
  {
    key: 'directing',
    label: 'Directing & editing',
    short: 'Directing',
    hint: 'the hand on the whole, and the cut',
  },
  {
    key: 'design',
    label: 'Production design & costume',
    short: 'Design',
    hint: 'sets, costume, the made world',
  },
];

export const ALL_KEYS = [...CONTENT_KEYS, ...FORM_KEYS];

export function halfAverage(scores, keys) {
  const vals = keys.map((k) => scores[k.key]);
  if (vals.some((v) => typeof v !== 'number' || Number.isNaN(v))) return null;
  return vals.reduce((a, b) => a + b, 0) / keys.length;
}

// THE score formatter: every score on the site renders through this.
// (A previous per-component copy stripped trailing zeros with a regex and
// turned 10 into "1" and 0 into "". Never format scores with string surgery.)
export function fmtScore(n) {
  if (n == null || Number.isNaN(Number(n))) return '–';
  return String(Math.round(n * 100) / 100);
}

export function computeTotals(scores) {
  const contentAvg = halfAverage(scores, CONTENT_KEYS);
  const formAvg = halfAverage(scores, FORM_KEYS);
  if (contentAvg == null || formAvg == null) return null;
  const round = (n) => Math.round(n * 100) / 100;
  return {
    contentAvg: round(contentAvg),
    formAvg: round(formAvg),
    overall: round(contentAvg + formAvg),
  };
}

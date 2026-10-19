// Knockout brackets: pure pool ranking, draws, bracket state, share codes and
// agreement, no DOM. Films are archive film objects (see archive.js); a
// bracket is its draw (`slots`: film ids in bracket order, top to bottom) plus
// `picks`: the winner's id for each match in play order (round by round, top
// to bottom), so undo is a pop and the state is two arrays.

export const SIZES = [8, 16, 32, 64, 128, 256];
export const SECTION = 32; // bracket table: bigger draws show in sections of this many entrants

export function roundName(entrants) {
  if (entrants === 2) return 'Final';
  if (entrants === 4) return 'Semifinals';
  if (entrants === 8) return 'Quarterfinals';
  return `Round of ${entrants}`;
}

// Standard seeding order for a draw of n (a power of two): 1 v n, then the
// halves are mirrored recursively, so seeds 1 and 2 can only meet in the
// final, 1–4 not before the semifinals, and so on.
export function seedOrder(n) {
  let order = [1];
  while (order.length < n) {
    const sum = order.length * 2 + 1;
    order = order.flatMap((s) => [s, sum - s]);
  }
  return order;
}

// Small seeded PRNG for random draws; the seed travels in the bracket, so a
// draw can be rebuilt.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// What a pool can be ranked by. `visitor` is the visitor's own overall score,
// attached to film objects by the page.
export const RANKS = {
  imdb: { label: 'IMDb', get: (f) => f.imdb },
  tmdb: { label: 'TMDB', get: (f) => f.tmdb },
  metacritic: { label: 'Metacritic', get: (f) => f.metacritic },
  rt: { label: 'Rotten Tomatoes', get: (f) => f.rt },
  my: { label: 'Dr. X overall', get: (f) => f.my },
  content: { label: 'Dr. X content', get: (f) => f.myRating?.contentAvg },
  form: { label: 'Dr. X form', get: (f) => f.myRating?.formAvg },
  visitor: { label: 'Your score', get: (f) => f.visitor },
};
// Ties (Dr. X's overall has few distinct values) break on a second score,
// then IMDb votes, TMDB votes and id, so a ranking is always total.
const SECONDARY = { imdb: 'tmdb' };

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function rankValue(film, rankBy) {
  return num(RANKS[rankBy]?.get(film));
}

const fold = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');

// filters: { yearMin, yearMax (numbers or null), genre (or null), director
// (name fragment or ''), collection (Set of ids or null), minVotes (IMDb votes
// or null), rankBy }. Films without a value for rankBy never qualify.
export function filterPool(list, f) {
  const director = fold(f.director).trim();
  return list.filter((m) => {
    if (rankValue(m, f.rankBy) == null) return false;
    if (f.yearMin != null && !(m.year >= f.yearMin)) return false;
    if (f.yearMax != null && !(m.year > 0 && m.year <= f.yearMax)) return false;
    if (f.genre && !m.genres?.includes(f.genre)) return false;
    if (f.collection && !f.collection.has(m.id)) return false;
    if (f.minVotes && !(m.imdbVotes >= f.minVotes)) return false;
    if (director && !(m.directors ?? []).some((d) => fold(typeof d === 'string' ? d : d.name).includes(director))) return false;
    return true;
  });
}

// A sorted copy, best first.
export function rankPool(list, rankBy) {
  const second = SECONDARY[rankBy] ?? 'imdb';
  const key = (m) => [rankValue(m, rankBy), rankValue(m, second) ?? -1, num(m.imdbVotes) ?? -1, num(m.tmdbVotes) ?? -1];
  return list
    .map((m) => ({ m, k: key(m) }))
    .sort((a, b) => {
      for (let i = 0; i < 4; i++) if (a.k[i] !== b.k[i]) return b.k[i] - a.k[i];
      return a.m.id - b.m.id;
    })
    .map((x) => x.m);
}

export function availableSizes(poolSize) {
  return SIZES.filter((s) => s <= poolSize);
}

// The draw: the top `size` of a ranked pool placed in bracket order. Seeds are
// ranks (1 = best). Seeded follows seedOrder; random shuffles with the PRNG.
export function drawSlots(ranked, size, seeding = 'seeded', seed = 1) {
  const entrants = ranked.slice(0, size).map((m) => m.id);
  if (entrants.length !== size || !SIZES.includes(size)) throw new Error(`A ${size}-film bracket needs ${size} films.`);
  if (seeding === 'seeded') return seedOrder(size).map((s) => entrants[s - 1]);
  const rand = mulberry32(seed);
  const out = entrants.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Rounds as arrays of { a, b, w } (film ids or null while undecided), filled
// from `picks` in play order. With `pairsFrom` (another bracket's picks on the
// same draw), the matchups come from that bracket and `picks` only choose
// winners: "replay these exact matchups".
export function bracketRounds(slots, picks = [], pairsFrom = null) {
  const rounds = [];
  for (let n = slots.length; n > 1; n /= 2) rounds.push(Array.from({ length: n / 2 }, () => ({ a: null, b: null, w: null })));
  if (!rounds.length) return rounds;
  rounds[0].forEach((m, i) => {
    m.a = slots[2 * i];
    m.b = slots[2 * i + 1];
  });
  const ref = pairsFrom ? bracketRounds(slots, pairsFrom) : null;
  let k = 0;
  fill: for (let r = 0; r < rounds.length; r++) {
    for (let i = 0; i < rounds[r].length; i++) {
      const m = rounds[r][i];
      if (ref) {
        m.a = ref[r][i].a;
        m.b = ref[r][i].b;
      }
      if (m.a == null || m.b == null || k >= picks.length) continue;
      const w = picks[k];
      if (w !== m.a && w !== m.b) break fill; // an illegal pick ends the bracket there
      m.w = w;
      k++;
      if (!ref && r + 1 < rounds.length) rounds[r + 1][i >> 1][i % 2 ? 'b' : 'a'] = w;
    }
  }
  return rounds;
}

// The first undecided match: { round, index, play (its play-order index), a, b }.
export function nextMatch(rounds) {
  let play = 0;
  for (let r = 0; r < rounds.length; r++) {
    for (let i = 0; i < rounds[r].length; i++) {
      const m = rounds[r][i];
      if (m.w == null) return m.a != null && m.b != null ? { round: r, index: i, play, a: m.a, b: m.b } : null;
      play++;
    }
  }
  return null;
}

export const matchCount = (slots) => slots.length - 1;

export function champion(rounds) {
  return rounds.length ? (rounds[rounds.length - 1][0].w ?? null) : null;
}

// True when every pick is a legal winner and the bracket is complete.
export function isComplete(slots, picks, pairsFrom = null) {
  if (picks.length !== matchCount(slots)) return false;
  const rounds = bracketRounds(slots, picks, pairsFrom);
  return rounds.every((r) => r.every((m) => m.w != null));
}

// ---- Share codes (URL hash; the hash never reaches the server) ----
// Picks as bits in play order (0 = the top film won, 1 = the bottom one),
// packed into bytes and written as base64url. A 256 draw needs 43 characters.

function toBase64Url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64Url(str) {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

export function encodePicks(slots, picks, pairsFrom = null) {
  const rounds = bracketRounds(slots, picks, pairsFrom);
  const bits = [];
  for (const r of rounds) for (const m of r) if (m.w != null) bits.push(m.w === m.b ? 1 : 0);
  const bytes = new Uint8Array(Math.ceil(bits.length / 8) + 1);
  bytes[0] = bits.length; // at most 255 matches (a 256 draw)
  bits.forEach((bit, i) => bit && (bytes[1 + (i >> 3)] |= 0x80 >> (i & 7)));
  return toBase64Url(bytes);
}

// Returns picks (winner ids), or null if the code doesn't fit this draw.
export function decodePicks(slots, code, pairsFrom = null) {
  if (!code) return [];
  let bytes;
  try {
    bytes = fromBase64Url(code);
  } catch {
    return null;
  }
  const count = bytes[0];
  if (count > (bytes.length - 1) * 8 || count > matchCount(slots)) return null;
  const picks = [];
  for (let i = 0; i < count; i++) {
    const rounds = bracketRounds(slots, picks, pairsFrom);
    const next = nextMatch(rounds);
    if (!next) return null;
    picks.push(bytes[1 + (i >> 3)] & (0x80 >> (i & 7)) ? next.b : next.a);
  }
  return picks;
}

// "k1.<slot ids in base36, dot-joined>.<picks>" for any draw;
// "c1.<cup slug>.<picks>" for a published cup (its draw is in the page), with
// ".path" appended when the picks replay the cup's own matchups.
export function encodeShare({ slots, picks, cup = null, pairsFrom = null }) {
  const p = encodePicks(slots, picks, pairsFrom);
  if (cup) return `c1.${cup}.${p}${pairsFrom ? '.path' : ''}`;
  return `k1.${slots.map((id) => id.toString(36)).join('.')}.${p}`;
}

// Parses a hash (with or without '#'): { kind: 'k', slots, code } or
// { kind: 'c', cup, code, path }, or null.
export function parseShare(hash) {
  const parts = String(hash ?? '').replace(/^#/, '').split('.');
  if (parts[0] === 'c1' && /^[a-z0-9-]+$/.test(parts[1] ?? '') && (parts.length === 3 || (parts.length === 4 && parts[3] === 'path'))) {
    return { kind: 'c', cup: parts[1], code: parts[2], path: parts.length === 4 };
  }
  if (parts[0] !== 'k1' || parts.length < 3) return null;
  const slots = parts.slice(1, -1).map((s) => parseInt(s, 36));
  if (!SIZES.includes(slots.length) || slots.some((id) => !(id > 0)) || new Set(slots).size !== slots.length) return null;
  return { kind: 'k', slots, code: parts[parts.length - 1] };
}

// ---- Comparing two brackets on the same draw ----
// Matchups both brackets played (same round, same two films) and how many
// went the same way, plus whether the champions match.
export function agreement(refRounds, mineRounds) {
  let both = 0;
  let same = 0;
  refRounds.forEach((r, ri) =>
    r.forEach((m, i) => {
      const o = mineRounds[ri]?.[i];
      if (!o || m.w == null || o.w == null) return;
      const pair = (x) => [x.a, x.b].sort((p, q) => p - q).join(',');
      if (pair(m) !== pair(o)) return;
      both++;
      if (m.w === o.w) same++;
    })
  );
  const a = champion(refRounds);
  const b = champion(mineRounds);
  return { both, same, champion: a != null && a === b };
}

// The bracket table's views: draws of up to SECTION show whole; bigger ones as
// sections of SECTION entrants (down to each section's winner) plus "Finals".
// Each view: { id, label, rounds: [{ name, matches: [{ ...match, round, index }] }] }.
export function bracketViews(rounds) {
  const size = rounds.length ? rounds[0].length * 2 : 0;
  const named = rounds.map((r, ri) => ({ name: roundName(r.length * 2), matches: r.map((m, i) => ({ ...m, round: ri, index: i })) }));
  if (size <= SECTION) return [{ id: 'all', label: 'Bracket', rounds: named }];
  const sections = size / SECTION;
  const deep = Math.log2(SECTION);
  const views = Array.from({ length: sections }, (_, s) => ({
    id: `q${s + 1}`,
    label: `Q${s + 1}`,
    rounds: named.slice(0, deep).map((r) => {
      const per = r.matches.length / sections;
      return { name: r.name, matches: r.matches.slice(s * per, s * per + per) };
    }),
  }));
  views.push({ id: 'finals', label: 'Finals', rounds: named.slice(deep) });
  return views;
}

// ---- Cup files (data/cups/<slug>.json) ----
// { format: 1, slug, title, description, date: 'YYYY-MM-DD', size, seeding,
//   rankBy, pool (a sentence), entrants: [{ id, seed, title, year, poster,
//   directors: [names], imdb, tmdb, rt, metacritic, my }] in draw order,
//   picks: [winner id per match in play order] }. Entrants are copied in
// whole, so later data changes can't alter a published cup.
export const CUP_FORMAT = 1;

export function cupProblems(cup, fileSlug = cup?.slug) {
  const out = [];
  if (!isObjLike(cup)) return ['not an object'];
  if (cup.format !== CUP_FORMAT) out.push(`format must be ${CUP_FORMAT}`);
  if (typeof cup.slug !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(cup.slug)) out.push('slug must be lowercase words joined by hyphens');
  else if (cup.slug !== fileSlug) out.push(`slug "${cup.slug}" doesn't match the file name "${fileSlug}"`);
  if (typeof cup.title !== 'string' || !cup.title.trim()) out.push('title is missing');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cup.date ?? '')) out.push('date must be YYYY-MM-DD');
  if (!SIZES.includes(cup.size)) out.push(`size must be one of ${SIZES.join(', ')}`);
  const entrants = Array.isArray(cup.entrants) ? cup.entrants : [];
  if (entrants.length !== cup.size) out.push(`entrants: expected ${cup.size}, found ${entrants.length}`);
  const ids = entrants.map((e) => e?.id);
  if (!ids.every((id) => Number.isInteger(id) && id > 0) || new Set(ids).size !== ids.length) out.push('entrant ids must be unique positive integers');
  const seeds = entrants.map((e) => e?.seed).sort((a, b) => a - b);
  if (!seeds.every((s, i) => s === i + 1)) out.push(`seeds must be 1 to ${cup.size}, each once`);
  if (!entrants.every((e) => typeof e?.title === 'string' && e.title)) out.push('every entrant needs a title');
  if (out.length) return out;
  if (!Array.isArray(cup.picks) || !isComplete(ids, cup.picks)) out.push(`picks must be ${cup.size - 1} legal winners in play order`);
  return out;
}

function isObjLike(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

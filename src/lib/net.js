// Dr. X Net: pure graph functions (no DOM) over the compact files built by
// client-data.js. Films and people are nodes; a credit (director, top-12
// cast, writer, DP, composer, editor, production designer) is an edge.
// Nodes are addressed by keys: 'f<filmId>' and 'p<personId>'.
import { normalize } from './search.js';

// Role codes, in the order the files store them per film.
export const ROLES = ['d', 'a', 'w', 'c', 'm', 'e', 'p'];
// Order of the role groups around a film in the centre.
export const GROUP_ORDER = ['d', 'w', 'a', 'c', 'm', 'e', 'p'];
// Default links for six degrees: cast only (directors and crew are opt-in,
// since prolific directors, composers and editors would shortcut most paths).
export const DEFAULT_LINKS = ['a'];

export const filmKey = (id) => `f${id}`;
export const personKey = (id) => `p${id}`;
export const keyId = (key) => Number(key.slice(1));
export const isFilm = (key) => key[0] === 'f';

// Undoes the delta encoding of a sorted id column.
export function undelta(arr) {
  const out = new Array(arr.length);
  let v = 0;
  for (let i = 0; i < arr.length; i++) out[i] = v += arr[i];
  return out;
}

// films: { id[], title[], year[], pop[] (+ any other columns, kept as is) };
// people: { id[], name[] }; credits[i]: per ROLES index, people indices of
// film i (trailing empty roles may be missing). Ids are plain (not deltas).
export function buildNet({ films, people, credits }) {
  const nF = films.id.length;
  const nP = people.id.length;
  const fIdx = new Map(films.id.map((id, i) => [id, i]));
  const pIdx = new Map(people.id.map((id, j) => [id, j]));
  const pFilms = Array.from({ length: nP }, () => []);
  for (let i = 0; i < nF; i++) {
    const c = credits[i];
    if (!c) continue;
    for (let r = 0; r < c.length; r++) for (const j of c[r] ?? []) pFilms[j].push(i, r);
  }
  // Each person's films (as flat [film, role] pairs), better known first, so
  // equally short paths and capped neighbourhoods favour familiar films.
  const pCount = new Int32Array(nP);
  for (let j = 0; j < nP; j++) {
    const pairs = [];
    for (let k = 0; k < pFilms[j].length; k += 2) pairs.push([pFilms[j][k], pFilms[j][k + 1]]);
    pairs.sort((a, b) => (films.pop[b[0]] ?? 0) - (films.pop[a[0]] ?? 0) || a[0] - b[0]);
    pFilms[j] = pairs.flat();
    pCount[j] = new Set(pairs.map((p) => p[0])).size;
  }
  return { nF, nP, films, people, credits, fIdx, pIdx, pFilms, pCount };
}

export const hasNode = (g, key) => (isFilm(key) ? g.fIdx.has(keyId(key)) : g.pIdx.has(keyId(key)));

// Films a person is credited on: Map(film index → [role codes]).
function filmsOf(g, j) {
  const out = new Map();
  const pf = g.pFilms[j];
  for (let k = 0; k < pf.length; k += 2) {
    const roles = out.get(pf[k]) ?? out.set(pf[k], []).get(pf[k]);
    roles.push(ROLES[pf[k + 1]]);
  }
  return out;
}

// A film's credits as Map(personId → [role codes]) in GROUP_ORDER, billing
// order kept within a role. `full` ({ code: [personId] }, from the credit
// shards) adds people outside the graph (archive films' one-film people).
function creditsOf(g, i, full) {
  const out = new Map();
  const c = g.credits[i] ?? [];
  for (const code of GROUP_ORDER) {
    const r = ROLES.indexOf(code);
    const ids = full ? (full[code] ?? []) : (c[r] ?? []).map((j) => g.people.id[j]);
    for (const id of ids) (out.get(id) ?? out.set(id, []).get(id)).push(code);
  }
  return out;
}

const popOf = (g, i) => g.films.pop[i] ?? 0;

// A film in the centre: its people on ring 1 (role = first role in
// GROUP_ORDER), and on ring 2 the films they connect to: films sharing two or
// more of them first, then each person's best-known other film while room.
export function egoFilm(g, filmId, { cap = 24, full = null } = {}) {
  const i = g.fIdx.get(filmId);
  const people = creditsOf(g, i, full);
  const shared = new Map(); // film index → Set(person ids)
  for (const id of people.keys()) {
    const j = g.pIdx.get(id);
    if (j == null) continue;
    for (const f of filmsOf(g, j).keys()) if (f !== i) (shared.get(f) ?? shared.set(f, new Set()).get(f)).add(id);
  }
  const strong = [...shared.entries()]
    .filter(([, s]) => s.size >= 2)
    .sort((a, b) => b[1].size - a[1].size || popOf(g, b[0]) - popOf(g, a[0]) || a[0] - b[0])
    .map(([f]) => f);
  const ring2 = strong.slice(0, Math.ceil(cap * 0.6));
  const inRing2 = new Set(ring2);
  for (const id of people.keys()) {
    if (ring2.length >= cap) break;
    const j = g.pIdx.get(id);
    if (j == null) continue;
    const own = [...filmsOf(g, j).keys()].filter((f) => f !== i); // already best known first
    if (!own.length || own.some((f) => inRing2.has(f))) continue;
    ring2.push(own[0]);
    inRing2.add(own[0]);
  }
  for (const f of strong) {
    if (ring2.length >= cap) break;
    if (!inRing2.has(f)) { ring2.push(f); inRing2.add(f); }
  }
  const focus = filmKey(filmId);
  const edges = [...people].map(([id, roles]) => [focus, personKey(id), roles[0]]);
  for (const f of ring2) {
    for (const [id, roles] of creditsOf(g, f)) if (people.has(id)) edges.push([filmKey(g.films.id[f]), personKey(id), roles[0]]);
  }
  return {
    focus,
    ring1: [...people].map(([id, roles]) => ({ key: personKey(id), role: roles[0], roles })),
    ring2: ring2.map((f) => ({ key: filmKey(g.films.id[f]) })),
    edges,
    more: 0,
  };
}

// A person in the centre: their films on ring 1 in year order (the best known
// `cap1` when there are more; `more` says how many are left out), and on ring
// 2 the people they made two or more of those films with. Thin neighbourhoods
// add each film's director and top-billed actor.
export function egoPerson(g, personId, { cap1 = 36, cap2 = 18 } = {}) {
  const j = g.pIdx.get(personId);
  const byFilm = filmsOf(g, j);
  let films = [...byFilm.keys()]; // best known first
  const total = films.length;
  if (films.length > cap1) films = films.slice(0, cap1);
  films.sort((a, b) => (g.films.year[a] ?? 0) - (g.films.year[b] ?? 0) || String(g.films.title[a]).localeCompare(String(g.films.title[b])));
  const co = new Map(); // person id → Map(film index → role)
  for (const f of films) {
    for (const [id, roles] of creditsOf(g, f)) if (id !== personId) (co.get(id) ?? co.set(id, new Map()).get(id)).set(f, roles[0]);
  }
  const countOf = (id) => g.pCount[g.pIdx.get(id)] ?? 0;
  const ring2 = [...co.entries()]
    .filter(([, m]) => m.size >= 2)
    .sort((a, b) => b[1].size - a[1].size || countOf(b[0]) - countOf(a[0]) || a[0] - b[0])
    .slice(0, cap2)
    .map(([id]) => id);
  if (ring2.length < 10) {
    const taken = new Set(ring2);
    for (const f of [...films].sort((a, b) => popOf(g, b) - popOf(g, a))) {
      const c = g.credits[f] ?? [];
      for (const k of [c[0]?.[0], c[1]?.[0]]) {
        const id = k == null ? null : g.people.id[k];
        if (id != null && id !== personId && !taken.has(id) && ring2.length < Math.min(14, cap2)) { ring2.push(id); taken.add(id); }
      }
    }
  }
  const focus = personKey(personId);
  const edges = films.map((f) => [focus, filmKey(g.films.id[f]), byFilm.get(f)[0]]);
  for (const id of ring2) for (const [f, role] of co.get(id) ?? []) edges.push([filmKey(g.films.id[f]), personKey(id), role]);
  return {
    focus,
    ring1: films.map((f) => ({ key: filmKey(g.films.id[f]), role: byFilm.get(f)[0], roles: byFilm.get(f), year: g.films.year[f] ?? null })),
    ring2: ring2.map((id) => ({ key: personKey(id) })),
    edges,
    more: total - films.length,
  };
}

export const ego = (g, key, opts) => (isFilm(key) ? egoFilm(g, keyId(key), opts) : egoPerson(g, keyId(key), opts));

// Six degrees: breadth-first search from `from` to `to` through credits whose
// role is in `links`; a person at either end links through any of their own
// credits (a director is reachable with cast-only links). Returns
// [[key, role of the link into it], …] starting with [from, null], or null
// when there is no connection. Neighbours are
// visited best known first, so among equally short paths the familiar wins.
export function findPath(g, from, to, links = DEFAULT_LINKS) {
  if (!hasNode(g, from) || !hasNode(g, to)) return null;
  if (from === to) return [[from, null]];
  const ok = ROLES.map((r) => links.includes(r));
  const { nF } = g;
  const node = (key) => (isFilm(key) ? g.fIdx.get(keyId(key)) : nF + g.pIdx.get(keyId(key)));
  const keyOf = (n) => (n < nF ? filmKey(g.films.id[n]) : personKey(g.people.id[n - nF]));
  const start = node(from);
  const goal = node(to);
  const prev = new Int32Array(nF + g.nP).fill(-1);
  const via = new Int8Array(nF + g.nP);
  prev[start] = start;
  let frontier = [start];
  // Films list their people by role, so order them once by how well known
  // each person is (how many films they have).
  const byFame = (a, b) => g.pCount[b] - g.pCount[a] || a - b;
  while (frontier.length) {
    const next = [];
    for (const n of frontier) {
      if (n < nF) {
        const c = g.credits[n] ?? [];
        const nb = [];
        for (let r = 0; r < c.length; r++) for (const j of c[r] ?? []) if (ok[r] || nF + j === goal) nb.push([j, r]);
        nb.sort((a, b) => byFame(a[0], b[0]));
        for (const [j, r] of nb) {
          const m = nF + j;
          if (prev[m] !== -1) continue;
          prev[m] = n; via[m] = r;
          if (m === goal) return trace();
          next.push(m);
        }
      } else {
        const pf = g.pFilms[n - nF];
        for (let k = 0; k < pf.length; k += 2) {
          if (!ok[pf[k + 1]] && n !== start) continue;
          const m = pf[k];
          if (prev[m] !== -1) continue;
          prev[m] = n; via[m] = pf[k + 1];
          if (m === goal) return trace();
          next.push(m);
        }
      }
    }
    frontier = next;
  }
  return null;
  function trace() {
    const out = [];
    for (let n = goal; ; n = prev[n]) {
      out.unshift([keyOf(n), n === start ? null : ROLES[via[n]]]);
      if (n === start) break;
    }
    return out;
  }
}

// Search over the graph's films and people: every query word must start a
// word of the name; people rank by film count, films by popularity.
export function searchNet(g, query, n = 8) {
  const words = normalize(query).split(' ').filter(Boolean);
  if (words.join('').length < 2) return [];
  if (!g.index) {
    g.index = [
      ...g.films.id.map((id, i) => ({ key: filmKey(id), w: normalize(g.films.title[i]).split(' '), rank: popOf(g, i) })),
      ...g.people.id.map((id, j) => ({ key: personKey(id), w: normalize(g.people.name[j]).split(' '), rank: 100 + g.pCount[j] })),
    ];
  }
  const hits = [];
  for (const e of g.index) if (words.every((q) => e.w.some((w) => w.startsWith(q)))) hits.push(e);
  return hits.sort((a, b) => b.rank - a.rank || (a.key < b.key ? -1 : 1)).slice(0, n).map((e) => e.key);
}

// ---------- layout (deterministic; positions in the stage's own pixels) ----------

// Maps an angle (as a fraction of a full turn from the top) to the angle at
// the same fraction of the ellipse's perimeter: equal angles bunch nodes up
// at the narrow ends of a wide ellipse.
function arcMap(rx, ry) {
  const N = 720;
  const cum = [0];
  let px = 0, py = -ry;
  for (let i = 1; i <= N; i++) {
    const t = -Math.PI / 2 + (i / N) * 2 * Math.PI;
    const x = rx * Math.cos(t), y = ry * Math.sin(t);
    cum.push(cum[i - 1] + Math.hypot(x - px, y - py));
    px = x; py = y;
  }
  const L = cum[N];
  return (a) => {
    const f = ((((a + Math.PI / 2) / (2 * Math.PI)) % 1) + 1) % 1;
    const target = f * L;
    let lo = 0, hi = N;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] < target) lo = mid; else hi = mid; }
    const k = (target - cum[lo]) / Math.max(1e-9, cum[hi] - cum[lo]);
    return -Math.PI / 2 + ((lo + k) / N) * 2 * Math.PI;
  };
}

const circMean = (as) => Math.atan2(as.reduce((s, a) => s + Math.sin(a), 0), as.reduce((s, a) => s + Math.cos(a), 0));

export const isNarrow = (W) => W < 560;

// Ring geometry for a stage of W × H. `shrink` tightens both rings to leave
// an outer ring for a six-degrees path.
export function rings(W, H, shrink = 1) {
  const narrow = isNarrow(W);
  const cx = W / 2, cy = H / 2 + (narrow ? 0 : 6);
  const r1 = (narrow ? [W * 0.33, H * 0.25] : [Math.min(W * 0.25, H * 0.48), H * 0.3]).map((v) => v * shrink);
  const r2 = (narrow ? [W * 0.44, H * 0.44] : [Math.min(W * 0.45, H * 0.86), H * 0.45]).map((v) => v * shrink);
  const outer = narrow ? [W * 0.46, H * 0.47] : [Math.min(W * 0.47, H * 0.92), H * 0.47];
  return { cx, cy, r1, r2, outer, narrow };
}

// Positions for a neighbourhood: Map(key → { x, y, a, ring }) plus what the
// decoration layer draws (role groups or the career clock's decade marks).
export function layoutOrbit(view, W, H, { shrink = 1 } = {}) {
  const { cx, cy, r1, r2 } = rings(W, H, shrink);
  const pos = new Map([[view.focus, { x: cx, y: cy, a: 0, ring: 0 }]]);
  const deco = { cx, cy, r1, r2, groups: [], ticks: [] };
  const ring1 = view.ring1.map((m) => ({ ...m }));
  if (!isFilm(view.focus)) {
    // Career clock: clockwise from the top in year order, a mark per decade.
    const n = ring1.length;
    ring1.forEach((m, i) => (m.a = -Math.PI / 2 + ((i + 0.5) / Math.max(n, 1)) * 2 * Math.PI));
    let last = null;
    for (const m of ring1) {
      const dec = m.year == null ? null : Math.floor(m.year / 10) * 10;
      if (dec != null && dec !== last) deco.ticks.push({ a: m.a, label: m.year });
      last = dec;
    }
  } else {
    const groups = [];
    for (const m of ring1) {
      if (!groups.length || groups.at(-1).r !== m.role) groups.push({ r: m.role, ns: [] });
      groups.at(-1).ns.push(m);
    }
    const gap = groups.length > 1 ? 0.6 : 0;
    const step = (2 * Math.PI) / Math.max(1, ring1.length + groups.length * gap * 2);
    let t = -Math.PI / 2 - ((groups[0]?.ns.length ?? 0) * step) / 2 - gap * step;
    for (const g of groups) {
      t += gap * step;
      for (const m of g.ns) { m.a = t + step / 2; t += step; }
      t += gap * step;
      deco.groups.push({ r: g.r, a0: g.ns[0].a, a1: g.ns.at(-1).a, n: g.ns.length });
    }
  }
  const toArc = arcMap(r1[0], r1[1]);
  for (const m of ring1) {
    m.a = toArc(m.a);
    pos.set(m.key, { x: cx + r1[0] * Math.cos(m.a), y: cy + r1[1] * Math.sin(m.a), a: m.a, ring: 1 });
  }
  for (const g of deco.groups) { g.a0 = toArc(g.a0); g.a1 = toArc(g.a1); }
  for (const t of deco.ticks) t.a = toArc(t.a);

  // Ring 2 sits at the mean angle of its ring-1 links, then spreads out.
  const adj = new Map();
  for (const [a, b] of view.edges) {
    (adj.get(a) ?? adj.set(a, []).get(a)).push(b);
    (adj.get(b) ?? adj.set(b, []).get(b)).push(a);
  }
  const ring2 = view.ring2.map((m) => {
    const as = (adj.get(m.key) ?? []).map((k) => pos.get(k)).filter((p) => p?.ring === 1).map((p) => p.a);
    return { ...m, a: as.length ? circMean(as) : 0 };
  });
  ring2.sort((a, b) => a.a - b.a || (a.key < b.key ? -1 : 1));
  const minGap = Math.min(0.42, ((2 * Math.PI) / Math.max(ring2.length, 1)) * 0.9);
  if (ring2.length > 1) {
    for (let pass = 0; pass < 60; pass++) {
      for (let i = 0; i < ring2.length; i++) {
        const a = ring2[i], b = ring2[(i + 1) % ring2.length];
        let d = b.a - a.a;
        if (i === ring2.length - 1) d += 2 * Math.PI;
        if (d < minGap) { const push = (minGap - d) / 2; a.a -= push; b.a += push; }
      }
    }
  }
  ring2.forEach((m, i) => {
    const k = ring2.length > 14 && i % 2 ? 0.86 : 1; // stagger crowded rings for label room
    pos.set(m.key, { x: cx + r2[0] * k * Math.cos(m.a), y: cy + r2[1] * k * Math.sin(m.a), a: m.a, ring: 2 });
  });
  return { pos, deco };
}

// Puts the path's nodes that the neighbourhood lacks on the outer ring,
// walking outward from the centre end of the path. Returns how many it placed.
export function placePath(path, pos, W, H) {
  const { cx, cy, outer, narrow } = rings(W, H);
  const step = narrow ? 0.5 : 0.36;
  let lastA = null;
  let placed = 0;
  for (let i = path.length - 1; i >= 0; i--) {
    const key = path[i][0];
    const p = pos.get(key);
    if (p) { if (p.ring) lastA = p.a; continue; }
    if (lastA == null) lastA = -Math.PI / 2 - step;
    const a = lastA + step;
    pos.set(key, { x: cx + outer[0] * Math.cos(a), y: cy + outer[1] * Math.sin(a), a, ring: 3 });
    lastA = a;
    placed++;
  }
  return placed;
}

// Steps of a path: how many films it passes through (a person-to-person
// path through two films is two steps).
export const pathSteps = (path) => Math.ceil((path.length - 1) / 2);

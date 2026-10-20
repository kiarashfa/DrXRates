// Dr. X Net's drawing: an SVG "orrery" of one neighbourhood (see
// layoutOrbit in net.js), plain DOM so a re-centre can animate every node from
// where it was to where it goes. Nodes are posters (films) and faces (people),
// kept by key across re-centres; links, ring guides and labels are redrawn
// once the nodes settle. A six-degrees path is drawn into the same picture.
import { layoutOrbit, placePath, rings, isFilm, isNarrow } from './net.js';
import { tmdbImg } from './util.js';

const SVG = 'http://www.w3.org/2000/svg';
const GROUP = { d: 'Directed', w: 'Wrote', a: 'Cast', c: 'Shot', m: 'Music', e: 'Edited', p: 'Design' };
// Base node sizes (ring nodes); the centre is drawn larger by scaling.
const SIZE = { film: [30, 45], person: 17, filmFocus: 70, personFocus: 44 };
const SIZE_NARROW = { film: [22, 33], person: 12, filmFocus: 52, personFocus: 32 };
const MOVE_MS = 700;

export const linkClass = (r) => (r === 'a' ? 'l-cast' : r === 'd' ? 'l-dir' : r === 'w' ? 'l-content' : 'l-form');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const short = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const f1 = (n) => n.toFixed(1);

export class Orbit {
  // resolve(key) → { label, year?, img? } (img: TMDB path or null).
  // onLayout(y): the centre node's bottom edge, for the caption under it.
  constructor(stage, { resolve, onSelect, onHover, onLayout, uid = 'net' }) {
    this.stage = stage;
    this.onLayout = onLayout;
    this.resolve = resolve;
    this.onSelect = onSelect;
    this.onHover = onHover;
    this.uid = uid;
    this.reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.els = new Map(); // key → <g>
    this.cur = new Map(); // key → { x, y, s, o } as drawn now
    this.svg = document.createElementNS(SVG, 'svg');
    this.svg.setAttribute('class', 'orrery');
    this.svg.setAttribute('role', 'group');
    this.svg.setAttribute('aria-label', 'Network of films and people');
    this.svg.innerHTML = `<defs><clipPath id="${uid}-face" clipPathUnits="objectBoundingBox"><circle cx=".5" cy=".5" r=".5"/></clipPath></defs>
      <g class="o-deco"></g><g class="o-links"></g><g class="o-path"></g><g class="o-nodes"></g><g class="o-badges"></g>`;
    [this.gDeco, this.gLinks, this.gPath, this.gNodes, this.gBadges] = ['deco', 'links', 'path', 'nodes', 'badges'].map((n) => this.svg.querySelector(`.o-${n}`));
    stage.append(this.svg);
    this.measure();
  }

  measure() {
    this.W = Math.max(280, this.stage.clientWidth);
    this.H = Math.max(320, this.stage.clientHeight);
    this.narrow = isNarrow(this.W);
    this.S = this.narrow ? SIZE_NARROW : SIZE;
    this.svg.setAttribute('viewBox', `0 0 ${this.W} ${this.H}`);
  }

  // Redraws the current picture for a new stage size, without animation.
  resize() {
    const [w, h] = [this.W, this.H];
    this.measure();
    if (!this.view || (w === this.W && h === this.H)) return;
    // Base sizes depend on the width, so nodes are rebuilt.
    for (const g of this.els.values()) g.remove();
    this.els.clear();
    this.cur.clear();
    this.show(this.view, this.path, { instant: true });
  }

  // Scale of a node relative to its base size.
  scaleOf(key, centre) {
    if (!centre) return 1;
    return isFilm(key) ? this.S.filmFocus / this.S.film[0] : this.S.personFocus / this.S.person;
  }

  imgUrl(key, centre) {
    const img = this.resolve(key).img;
    if (!img) return null;
    return isFilm(key) ? tmdbImg(img, centre ? 'w342' : 'w92') : tmdbImg(img, 'w185');
  }

  node(key) {
    let g = this.els.get(key);
    if (g) return g;
    const n = this.resolve(key);
    g = document.createElementNS(SVG, 'g');
    g.setAttribute('class', `o-node ${isFilm(key) ? 'film' : 'person'}`);
    g.dataset.key = key;
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'button');
    g.setAttribute('aria-label', n.year ? `${n.label} (${n.year})` : n.label);
    if (isFilm(key)) {
      const [w, h] = this.S.film;
      const box = `x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}"`;
      g.innerHTML = `<g class="o-shape"><rect class="o-bg" ${box} rx="2"/><image ${box} preserveAspectRatio="xMidYMid slice"/><rect class="o-ring" ${box} rx="2" vector-effect="non-scaling-stroke"/></g><text class="o-lbl"></text>`;
    } else {
      const r = this.S.person;
      const initials = n.label.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('');
      g.innerHTML = `<g class="o-shape"><circle class="o-bg" r="${r}"/><text class="o-ini" dy="0.35em" font-size="${r * 0.75}">${esc(initials)}</text><image x="${-r}" y="${-r}" width="${2 * r}" height="${2 * r}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${this.uid}-face)"/><circle class="o-ring" r="${r}" vector-effect="non-scaling-stroke"/></g><text class="o-lbl"></text>`;
    }
    this.setImage(g, key, false);
    const select = () => key !== this.view?.focus && this.onSelect(key);
    g.addEventListener('click', select);
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        select();
      }
    });
    g.addEventListener('mouseenter', () => this.hover(key));
    g.addEventListener('mouseleave', () => this.hover(null));
    g.addEventListener('focus', () => this.hover(key));
    g.addEventListener('blur', () => this.hover(null));
    this.gNodes.append(g);
    this.els.set(key, g);
    return g;
  }

  setImage(g, key, centre) {
    const url = this.imgUrl(key, centre);
    const im = g.querySelector('image');
    if (url && im.getAttribute('href') !== url) {
      im.style.opacity = '0';
      im.addEventListener('load', () => (im.style.opacity = ''), { once: true });
      im.setAttribute('href', url);
    }
    g.classList.toggle('has-img', !!url);
  }

  // Posters or faces that arrived after the nodes were drawn.
  refreshImages() {
    for (const [key, g] of this.els) this.setImage(g, key, key === this.view?.focus);
  }

  // Draws `view` (from ego() in net.js), with `path` ([[key, role], …] ending
  // at the centre) drawn in when given.
  show(view, path = null, { instant = false } = {}) {
    this.view = view;
    this.path = path && path.length > 1 ? path : null;
    let { pos, deco } = layoutOrbit(view, this.W, this.H);
    if (this.path && placePath(this.path, new Map(pos), this.W, this.H)) {
      ({ pos, deco } = layoutOrbit(view, this.W, this.H, { shrink: 0.87 }));
      placePath(this.path, pos, this.W, this.H);
    }
    const ring = new Map([[view.focus, 0], ...view.ring1.map((m) => [m.key, 1]), ...view.ring2.map((m) => [m.key, 2])]);
    const onPath = new Set(this.path ? this.path.map(([k]) => k) : []);
    for (const k of onPath) if (!ring.has(k)) ring.set(k, 3);
    this.svg.classList.toggle('has-path', !!this.path);
    const half = isFilm(view.focus) ? (this.S.filmFocus / this.S.film[0]) * (this.S.film[1] / 2) : this.S.personFocus;
    this.onLayout?.(rings(this.W, this.H).cy + half);
    this.move(pos, ring, onPath, instant, () => {
      this.drawLinks(view.edges, pos);
      this.drawPath(pos);
      this.drawDeco(deco, view);
    });
  }

  move(target, ring, onPath, instant, done) {
    for (const g of [this.gLinks, this.gDeco, this.gPath, this.gBadges]) g.classList.add('out');
    const from = new Map();
    const { W, H } = this;
    const origin = target.get(this.view.focus);
    for (const [k, p] of target) {
      const g = this.node(k);
      const r = ring.get(k);
      const centre = r === 0;
      g.classList.toggle('centre', centre);
      g.classList.toggle('outer', r === 2);
      g.classList.toggle('on-path', onPath.has(k));
      // Labels: the inner ring always (on phones only when it is small), the
      // outer ring on wide screens, the path always; the rest on hover.
      const lbl = g.lastChild;
      lbl.classList.toggle('shown', !centre && (onPath.has(k) || (r === 1 && (!this.narrow || this.view.ring1.length <= 14)) || (r === 2 && !this.narrow)));
      lbl.textContent = short(this.resolve(k).label, r === 2 ? 16 : 20);
      if (centre) this.setImage(g, k, true);
      // Newcomers grow out of the centre; path members on the outer ring
      // drift in from beyond it.
      const start = r === 3 ? { x: W / 2 + (p.x - W / 2) * 1.12, y: H / 2 + (p.y - H / 2) * 1.12 } : origin;
      from.set(k, this.cur.get(k) ?? { x: start.x, y: start.y, s: 0.3, o: 0 });
    }
    for (const [k, c] of this.cur) if (!target.has(k)) from.set(k, c);
    const to = new Map();
    for (const [k, c] of from) {
      to.set(k, target.has(k) ? { ...target.get(k), s: this.scaleOf(k, ring.get(k) === 0), o: 1 } : { x: c.x, y: c.y, s: c.s * 0.5, o: 0 });
    }
    const dur = instant || this.reduce ? 0 : MOVE_MS;
    const t0 = performance.now();
    cancelAnimationFrame(this.raf);
    const frame = (now) => {
      const t = dur ? Math.min(1, (now - t0) / dur) : 1;
      const e = ease(t);
      for (const [k, a] of from) {
        const b = to.get(k);
        const p = { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, s: a.s + (b.s - a.s) * e, o: a.o + (b.o - a.o) * e };
        this.cur.set(k, p);
        const g = this.els.get(k);
        g.setAttribute('transform', `translate(${f1(p.x)},${f1(p.y)})`);
        g.firstChild.setAttribute('transform', `scale(${p.s.toFixed(3)})`);
        const half = isFilm(k) ? (this.S.film[1] / 2) * p.s : this.S.person * p.s;
        g.lastChild.setAttribute('y', f1(half + 12));
        g.style.opacity = p.o;
      }
      if (t < 1) {
        this.raf = requestAnimationFrame(frame);
        return;
      }
      for (const k of from.keys()) {
        if (target.has(k)) continue;
        this.els.get(k)?.remove();
        this.els.delete(k);
        this.cur.delete(k);
      }
      done();
    };
    this.raf = requestAnimationFrame(frame);
  }

  // Links between ring nodes bend toward the centre; spokes stay straight.
  d(p, q) {
    if (!p.ring || !q.ring) return `M${f1(p.x)},${f1(p.y)} L${f1(q.x)},${f1(q.y)}`;
    const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
    const cx = mx + (this.W / 2 - mx) * 0.32, cy = my + (this.H / 2 - my) * 0.32;
    return `M${f1(p.x)},${f1(p.y)} Q${f1(cx)},${f1(cy)} ${f1(q.x)},${f1(q.y)}`;
  }

  drawLinks(edges, pos) {
    let h = '';
    for (const [a, b, r] of edges) {
      const p = pos.get(a), q = pos.get(b);
      if (p && q) h += `<path class="o-link ${linkClass(r)}" data-a="${a}" data-b="${b}" d="${this.d(p, q)}"/>`;
    }
    this.gLinks.innerHTML = h;
    this.gLinks.classList.remove('out');
  }

  // The path's links draw in order from its start to the centre; its films
  // get the step numbers the chain under the panel repeats.
  drawPath(pos) {
    this.gPath.innerHTML = '';
    this.gBadges.innerHTML = '';
    if (!this.path) return;
    let links = '';
    let badges = '';
    let film = 0;
    this.path.forEach(([k], i) => {
      const delay = `animation-delay:${(Math.max(0, i - 1) * 0.28).toFixed(2)}s`;
      if (i) links += `<path class="o-link on-path" data-a="${this.path[i - 1][0]}" data-b="${k}" d="${this.d(pos.get(this.path[i - 1][0]), pos.get(k))}" style="${delay}"/>`;
      if (!isFilm(k)) return;
      film++;
      const p = pos.get(k);
      const s = this.scaleOf(k, k === this.view.focus);
      const x = p.x - (this.S.film[0] / 2) * s, y = p.y - (this.S.film[1] / 2) * s;
      badges += `<g class="o-badge" transform="translate(${f1(x)},${f1(y)})"><g style="${delay}"><circle r="9"/><text dy="0.35em">${film}</text></g></g>`;
    });
    this.gPath.innerHTML = links;
    this.gBadges.innerHTML = badges;
    this.gPath.classList.toggle('drawing', !this.reduce);
    this.gBadges.classList.toggle('drawing', !this.reduce);
    this.gPath.classList.remove('out');
    this.gBadges.classList.remove('out');
  }

  drawDeco(deco, view) {
    const { cx, cy, r1, r2 } = deco;
    const at = (f, a) => [f1(cx + r1[0] * f * Math.cos(a)), f1(cy + r1[1] * f * Math.sin(a))];
    let h = `<ellipse class="o-guide" cx="${cx}" cy="${cy}" rx="${f1(r1[0])}" ry="${f1(r1[1])}"/><ellipse class="o-guide" cx="${cx}" cy="${cy}" rx="${f1(r2[0])}" ry="${f1(r2[1])}"/>`;
    for (const g of deco.groups) {
      const [x, y] = at(this.narrow ? 0.62 : 0.72, (g.a0 + g.a1) / 2);
      h += `<text class="o-group" x="${x}" y="${y}">${GROUP[g.r]}${g.n > 1 && !this.narrow ? ` · ${g.n}` : ''}</text>`;
      if (g.n > 1) {
        let d = '';
        for (let i = 0; i <= 12; i++) d += `${i ? 'L' : 'M'}${at(0.86, g.a0 + ((g.a1 - g.a0) * i) / 12).join(',')}`;
        h += `<path class="o-arc" d="${d}"/>`;
      }
    }
    for (const t of deco.ticks) {
      const [x1, y1] = at(0.82, t.a), [x2, y2] = at(0.9, t.a), [tx, ty] = at(0.73, t.a);
      h += `<line class="o-tick" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/><text class="o-year" x="${tx}" y="${f1(Number(ty) + 3)}">${t.label}</text>`;
    }
    if (view.more) h += `<text class="o-more" role="button" tabindex="0" x="${cx}" y="${f1(cy - r1[1] - 34)}">+ ${view.more} more films · show all</text>`;
    this.gDeco.innerHTML = h;
    const more = this.gDeco.querySelector('.o-more');
    if (more) {
      const all = () => this.onSelect(view.focus, { all: true });
      more.addEventListener('click', all);
      more.addEventListener('keydown', (e) => e.key === 'Enter' && all());
    }
    this.gDeco.classList.remove('out');
  }

  // Traces a node's links and tells the page which node to describe.
  hover(key) {
    this.svg.classList.toggle('hovering', key != null);
    const near = new Set(key ? [key] : []);
    for (const l of this.svg.querySelectorAll('.o-link')) {
      const hit = key != null && (l.dataset.a === key || l.dataset.b === key);
      l.classList.toggle('hl', hit);
      if (hit) near.add(l.dataset.a).add(l.dataset.b);
    }
    for (const [k, g] of this.els) g.classList.toggle('hl', near.has(k));
    this.onHover?.(key);
  }
}

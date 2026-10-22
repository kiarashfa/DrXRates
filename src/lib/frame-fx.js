// Name the Frame: the effects that need more than CSS, as plain DOM (styled
// from FramePlayer.svelte through the fx-* classes). Each returns nothing and
// cleans up after itself; prefers-reduced-motion skips the moving parts.
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const rnd = (a, b) => a + Math.random() * (b - a);

// Confetti bursting from an element (a right answer's board).
export function confetti(from) {
  if (!from || reduced()) return;
  const r = from.getBoundingClientRect();
  const host = document.createElement('div');
  host.className = 'fx-confetti';
  host.style.left = `${r.left + r.width / 2 + window.scrollX}px`;
  host.style.top = `${r.top + r.height / 2 + window.scrollY}px`;
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2 + rnd(0, 0.3);
    const d = rnd(50, 150);
    const bit = document.createElement('i');
    bit.style.cssText = `--x:${Math.cos(a) * d * 1.4}px;--y:${Math.sin(a) * d - 40}px;--r:${rnd(0, 600)}deg;--d:${rnd(0, 120)}ms`;
    host.append(bit);
  }
  document.body.append(host);
  setTimeout(() => host.remove(), 1500);
}

// Blood hitting the board as if it struck glass. The shape is liquid: a pool
// of drops plus chains of shrinking drops along each spray line, merged by a
// "goo" filter (blur, then a hard alpha threshold) into one mass with
// tapering tendrils, then lit with a specular highlight so it reads as wet.
// On impact every drop flies out from the hit point; afterwards two or three
// drips run slowly down. Fine mist stays as separate droplets.
let splatCount = 0;
const SVG = 'http://www.w3.org/2000/svg';
export function splat(host, scale = 0.7) {
  if (!host) return;
  const W = 260;
  const H = 150;
  const cx = W / 2;
  const cy = H / 2;
  const f = (n) => n.toFixed(1);
  const id = `ff-goo-${++splatCount}`;
  const goo = [];
  const mist = [];
  for (let i = 0; i < 12; i++) {
    const a = rnd(0, Math.PI * 2);
    const d = rnd(0, 9);
    goo.push([cx + Math.cos(a) * d * 1.5, cy + Math.sin(a) * d, rnd(8, 15), d]);
  }
  const rays = 13 + Math.floor(Math.random() * 6);
  for (let i = 0; i < rays; i++) {
    let a = (i / rays) * Math.PI * 2 + rnd(-0.2, 0.2);
    const len = Math.random() < 0.35 ? rnd(55, 85) : rnd(22, 48);
    let r = rnd(3.8, 6);
    let x = cx;
    let y = cy;
    for (let d = 10; d < len; d += r * 0.7) {
      a += rnd(-0.035, 0.035);
      x = cx + Math.cos(a) * d * 1.5;
      y = cy + Math.sin(a) * d;
      goo.push([x, y, r, d]);
      r = Math.max(1.7, r * rnd(0.88, 0.96));
    }
    // A flung drop just past the end of the line, stretched along its path.
    if (Math.random() < 0.75) mist.push({ x: x + Math.cos(a) * rnd(5, 12) * 1.5, y: y + Math.sin(a) * rnd(5, 12), rx: rnd(1.6, 3), ry: rnd(1, 1.7), rot: (a * 180) / Math.PI, d: len });
  }
  for (let i = 0; i < 60; i++) {
    const a = rnd(0, Math.PI * 2);
    const d = rnd(16, 92);
    const rr = rnd(0.35, 1.4);
    mist.push({ x: cx + Math.cos(a) * d * 1.5, y: cy + Math.sin(a) * d, rx: rr, ry: rr, rot: 0, d });
  }
  const drips = Array.from({ length: 2 + Math.floor(Math.random() * 2) }, () => ({ x: cx + rnd(-16, 16), len: rnd(18, 40) }));
  host.innerHTML = `<svg class="fx-splat" xmlns="${SVG}" viewBox="0 0 ${W} ${H}" width="${f(W * scale)}" height="${f(H * scale)}" aria-hidden="true">
    <defs><filter id="${id}" x="-10%" y="-10%" width="120%" height="140%" color-interpolation-filters="sRGB">
      <feGaussianBlur in="SourceGraphic" stdDeviation="2.4" result="b"/>
      <feColorMatrix in="b" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -11" result="g"/>
      <feGaussianBlur in="g" stdDeviation="1.6" result="h"/>
      <feSpecularLighting in="h" surfaceScale="2.6" specularConstant="0.85" specularExponent="22" lighting-color="#ffe8e8" result="s"><fePointLight x="${cx - 70}" y="${cy - 90}" z="110"/></feSpecularLighting>
      <feComposite in="s" in2="g" operator="in" result="si"/>
      <feComponentTransfer in="si" result="sl"><feFuncA type="linear" slope="0.55"/></feComponentTransfer>
      <feMerge><feMergeNode in="g"/><feMergeNode in="sl"/></feMerge>
    </filter></defs>
    <g filter="url(#${id})">
      ${goo.map(([x, y, r, d]) => `<circle class="fx-drop" cx="${f(x)}" cy="${f(y)}" r="${f(r)}" data-d="${f(d)}"/>`).join('')}
      ${drips.map((dr) => `<g class="fx-drip" data-len="${f(dr.len)}"><rect x="${f(dr.x - 2.6)}" y="${f(cy)}" width="5.2" height="0.1" rx="2.6"/><circle cx="${f(dr.x)}" cy="${f(cy)}" r="3.6"/></g>`).join('')}
    </g>
    <g class="fx-mist">${mist.map((m) => `<ellipse class="fx-drop" cx="${f(m.x)}" cy="${f(m.y)}" rx="${f(m.rx)}" ry="${f(m.ry)}" transform="rotate(${f(m.rot)} ${f(m.x)} ${f(m.y)})" data-d="${f(m.d)}"/>`).join('')}</g>
  </svg>`;
  const svg = host.firstElementChild;
  svg.style.left = `${rnd(30, 70)}%`;
  svg.style.transform = `translate(-50%, -50%) rotate(${Math.round(rnd(-12, 12))}deg)`;
  if (reduced()) return;
  // Impact: each drop starts at the hit point and lands in 90–220 ms, the
  // farthest last.
  svg.querySelectorAll('.fx-drop').forEach((el) => {
    const x = Number(el.getAttribute('cx'));
    const y = Number(el.getAttribute('cy'));
    el.animate([{ transform: `translate(${cx - x}px, ${cy - y}px) scale(0.3)` }, { transform: 'none' }], {
      duration: 90 + Number(el.dataset.d) * 1.6,
      easing: 'cubic-bezier(.15,.8,.3,1)',
      fill: 'backwards',
    });
  });
  // Drips: a thin trail grows and a bead slides down, slowing as it goes.
  svg.querySelectorAll('.fx-drip').forEach((g, i) => {
    const len = Number(g.dataset.len);
    const rect = g.querySelector('rect');
    const bead = g.querySelector('circle');
    const t0 = performance.now() + 350 + i * 260 + Math.random() * 200;
    const dur = rnd(2600, 3800);
    const step = (now) => {
      if (!g.isConnected) return;
      const k = Math.min(1, Math.max(0, (now - t0) / dur));
      const e = 1 - (1 - k) ** 2.2;
      rect.setAttribute('height', (len * e + 0.1).toFixed(1));
      bead.setAttribute('cy', (cy + len * e).toFixed(1));
      bead.setAttribute('r', (3.6 - 0.5 * e).toFixed(2));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

// TV snow over the frame for about a second (the CSS then collapses it to a
// line and cuts the power). Grain is two screen pixels per noise pixel,
// slightly smoothed, from eight frames made once per size and drawn at a
// random offset each tick, so no pattern repeats.
let snowCache = null;
export function snow(layer) {
  if (!layer || reduced()) return;
  const w = Math.max(80, Math.min(800, Math.round(layer.clientWidth / 2)));
  const h = Math.round(w / 2);
  const c = document.createElement('canvas');
  c.className = 'fx-snow';
  c.width = w;
  c.height = h;
  layer.append(c);
  const ctx = c.getContext('2d');
  if (!snowCache || snowCache.w !== w) {
    const tiles = Array.from({ length: 8 }, () => {
      const t = document.createElement('canvas');
      t.width = w * 2;
      t.height = h * 2;
      const tc = t.getContext('2d');
      const img = tc.createImageData(t.width, t.height);
      const px = new Uint32Array(img.data.buffer);
      for (let i = 0; i < px.length; i++) {
        const v = (Math.random() * 256) | 0;
        px[i] = 0xff000000 | (v << 16) | (v << 8) | v;
      }
      tc.putImageData(img, 0, 0);
      return t;
    });
    snowCache = { w, tiles };
  }
  const t0 = performance.now();
  let last = 0;
  const step = (now) => {
    const k = (now - t0) / 1000;
    if (!c.isConnected || k > 1.1) return c.remove();
    if (now - last >= 33) {
      last = now;
      const tile = snowCache.tiles[(Math.random() * snowCache.tiles.length) | 0];
      ctx.drawImage(tile, -Math.random() * w, -Math.random() * h);
      const band = ((k * 0.8) % 1) * h * 1.3 - h * 0.15;
      ctx.fillStyle = 'rgb(255 255 255 / 0.14)';
      ctx.fillRect(0, band, w, h * 0.08);
      ctx.fillStyle = 'rgb(0 0 0 / 0.12)';
      ctx.fillRect(0, band + h * 0.08, w, h * 0.03);
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Pixel reveal: the frame drawn into a small canvas, scaled up blocky.
export function pixelate(canvas, img, block) {
  if (!canvas || !img?.naturalWidth) return;
  const box = canvas.getBoundingClientRect();
  const w = Math.max(2, Math.round(box.width / block));
  const h = Math.max(1, Math.round(box.height / block));
  canvas.width = w;
  canvas.height = h;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const sw = Math.min(iw, ih * 2);
  const sh = sw / 2;
  canvas.getContext('2d').drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, w, h);
}

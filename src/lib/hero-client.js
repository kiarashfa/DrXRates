// Homepage hero, in the browser (markup and styles: src/components/Hero.astro).
// - Depth: every .hx-pl plane moves by (its depth - 0.5) with the smoothed
//   cursor; with no mouse (phones, or after 2.5 s still) the view drifts slowly.
// - The figure: once the page is idle, a WebGL layer draws the still picture
//   through its depth map (parallax occlusion, so near parts hide far ones),
//   lit by two coloured gels from the sides (red = form, blue = content), the
//   pills glowing on the palms. Without WebGL, or with reduced motion, the
//   still picture stays.
// - Pills: hover lights a side (its word, gel and panel with the five names);
//   a click keeps it open and adds a line on each criterion.
// - Matrix theme: a light code rain on a canvas behind him.

const clamp = (v) => Math.max(-1, Math.min(1, v));
const STRENGTH = [0.03, 0.02]; // view shift at full tilt, in parts of the picture (x, y)
const FOCUS = 0.5; // the depth that stays put

const VS = 'attribute vec2 p;varying vec2 vUv;void main(){vUv=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}';
const FS = `precision highp float;
varying vec2 vUv;
uniform sampler2D uFig, uDep;
uniform vec4 uRect; uniform vec2 uOff, uPR, uPB, uPD, uTex, uHot, uLR; uniform float uFocus, uAsp, uT, uMode;
float dep(vec2 t){ return texture2D(uDep, t).r; }
void main(){
  vec2 t = (vUv - uRect.xy) / uRect.zw;
  // parallax occlusion: walk from near (1) to far (0) until the ray meets the depth surface
  vec2 prevS = t - uOff * (1. - uFocus); float prevD = dep(prevS), prevH = 1.;
  vec2 hit = t + uOff * uFocus;
  if (prevD >= .999) hit = prevS; else {
    for (int i = 1; i <= 40; i++) {
      float h = 1. - float(i) / 40.;
      vec2 s = t - uOff * (h - uFocus);
      float d = dep(s);
      if (d >= h) { float a = prevD - prevH, b = d - h; hit = mix(prevS, s, a / (a - b)); break; }
      prevS = s; prevD = d; prevH = h;
    }
  }
  vec4 c = texture2D(uFig, hit);
  float a = c.a * step(0., hit.x) * step(hit.x, 1.) * step(0., hit.y) * step(hit.y, 1.);
  a *= smoothstep(1., .9, hit.y);
  vec3 col = c.rgb, base = c.rgb;
  float dR = length((hit - uPR) * vec2(uAsp, 1.)), dB = length((hit - uPB) * vec2(uAsp, 1.));
  float sat = max(col.r, max(col.g, col.b)) - min(col.r, min(col.g, col.b));
  float pill = smoothstep(.18, .32, sat) * (1. - smoothstep(.02, .04, min(dR, dB)));
  if (uMode > .5) {
    // matrix: mostly grey with a green cast; the pills keep their colour
    float L = dot(col, vec3(.3, .59, .11));
    vec3 g = L < .3 ? mix(vec3(.004, .024, .016), vec3(.03, .24, .12), L / .3) : L < .7 ? mix(vec3(.03, .24, .12), vec3(.16, .8, .43), (L - .3) / .4) : mix(vec3(.16, .8, .43), vec3(.8, 1., .88), (L - .7) / .3);
    col = mix(mix(vec3(L) * vec3(.8, 1., .86), g, .38), col, pill);
  }
  // two gels from the sides; the normals come from the depth map, so the light rims the silhouette
  vec2 e = uTex * 2.;
  float dx = dep(hit + vec2(e.x, 0.)) - dep(hit - vec2(e.x, 0.));
  float dy = dep(hit + vec2(0., e.y)) - dep(hit - vec2(0., e.y));
  vec3 n = normalize(vec3(-dx * 10., -dy * 10., 1.));
  float rimL = pow(max(dot(n, normalize(vec3(-1., -.25, .35))), 0.), 1.6);
  float rimR = pow(max(dot(n, normalize(vec3(1., -.25, .35))), 0.), 1.6);
  col += base * (vec3(1., .25, .18) * rimL * uLR.x + vec3(.2, .5, 1.) * rimR * uLR.y);
  float pulse = .88 + .12 * sin(uT * 2.2);
  float kR = (.45 + .9 * uHot.x) * pulse, kB = (.45 + .9 * uHot.y) * (1.76 - pulse);
  col += base * vec3(1., .25, .18) * exp(-dR * dR / (.0025 + .004 * uHot.x)) * kR * .8;
  col += base * vec3(.2, .55, 1.) * exp(-dB * dB / (.0025 + .004 * uHot.y)) * kB * .8;
  vec2 tr = uPR + uOff * (uPD.x - uFocus), tb = uPB + uOff * (uPD.y - uFocus);
  float bR = length((t - tr) * vec2(uAsp, 1.)), bB = length((t - tb) * vec2(uAsp, 1.));
  vec3 bloom = vec3(1., .2, .12) * exp(-bR * bR / .0009) * .3 * kR + vec3(.15, .5, 1.) * exp(-bB * bB / .0009) * .3 * kB;
  gl_FragColor = vec4(col * a + bloom * (1. - a * .5), a);
}`;

const loadImage = (src) =>
  new Promise((ok, no) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = no;
    i.src = src;
  });

// The depth-mapped figure. Returns { draw(params) } or null when WebGL is unavailable.
async function makeLens(canvas, still, cfg) {
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
  if (!gl) return null;
  const shader = (type, text) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, text);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = {};
  for (const n of ['uFig', 'uDep', 'uRect', 'uOff', 'uPR', 'uPB', 'uPD', 'uTex', 'uHot', 'uLR', 'uFocus', 'uAsp', 'uT', 'uMode']) U[n] = gl.getUniformLocation(prog, n);
  const texture = (unit, img) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  };
  // The figure texture is whichever size the still <img> picked, so nothing loads twice.
  if (!still.complete) await new Promise((ok) => still.addEventListener('load', ok, { once: true }));
  const [fig, dep] = await Promise.all([loadImage(still.currentSrc || still.src), loadImage(cfg.depth)]);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  texture(0, fig);
  texture(1, dep);
  gl.uniform1i(U.uFig, 0);
  gl.uniform1i(U.uDep, 1);
  gl.uniform2f(U.uTex, 1 / dep.width, 1 / dep.height);
  gl.uniform1f(U.uAsp, cfg.w / cfg.h);
  gl.uniform1f(U.uFocus, FOCUS);
  gl.uniform2f(U.uPR, cfg.form[0] / 100, cfg.form[1] / 100);
  gl.uniform2f(U.uPB, cfg.content[0] / 100, cfg.content[1] / 100);
  gl.uniform2f(U.uPD, cfg.form[2], cfg.content[2]);
  let lost = false;
  canvas.addEventListener('webglcontextlost', () => (lost = true));
  return {
    get lost() {
      return lost;
    },
    draw({ off, hot, gels, matrix, t }) {
      const cr = canvas.getBoundingClientRect();
      const ir = still.getBoundingClientRect();
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const W = Math.round(cr.width * dpr);
      const H = Math.round(cr.height * dpr);
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
        gl.viewport(0, 0, W, H);
      }
      gl.uniform4f(U.uRect, (ir.left - cr.left) / cr.width, (ir.top - cr.top) / cr.height, ir.width / cr.width, ir.height / cr.height);
      gl.uniform2f(U.uOff, off[0], off[1]);
      gl.uniform2f(U.uHot, hot[0], hot[1]);
      gl.uniform2f(U.uLR, gels[0], gels[1]);
      gl.uniform1f(U.uMode, matrix ? 1 : 0);
      gl.uniform1f(U.uT, t / 1000);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
  };
}

// Matrix theme: a faint code rain, ~14 frames a second, only while it shows.
function startRain(canvas, isOn) {
  const g = canvas.getContext('2d');
  if (!g) return;
  const chars = 'アカサタナハマヤラ0123456789ﾊﾐﾋｰｳｼﾅﾓﾆｻﾜﾂｵﾘｱﾎﾃﾏｹﾒｴｶｷﾑﾕﾗｾﾈｽﾀﾇﾍ';
  const fs = 15;
  let cols = [];
  let last = 0;
  const size = () => {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    cols = Array.from({ length: Math.ceil(canvas.width / fs) }, () => (Math.random() * canvas.height) / fs);
  };
  const step = (t) => {
    requestAnimationFrame(step);
    if (!isOn() || t - last < 70) return;
    last = t;
    if (!cols.length || canvas.width !== canvas.clientWidth) size();
    g.fillStyle = 'rgb(1 6 4 / 0.16)';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.font = `${fs}px monospace`;
    cols.forEach((c, i) => {
      g.fillStyle = Math.random() < 0.06 ? '#c8ffe0' : '#1fbf62';
      g.fillText(chars[(Math.random() * chars.length) | 0], i * fs, c * fs);
      cols[i] = c * fs > canvas.height && Math.random() > 0.975 ? 0 : c + 1;
    });
  };
  requestAnimationFrame(step);
}

export function initHero(root) {
  if (!root) return;
  const cfg = JSON.parse(root.dataset.cfg);
  const stage = root.querySelector('.hx-stage');
  const photo = root.querySelector('.hx-photo');
  const still = root.querySelector('.hx-still');
  const canvas = root.querySelector('.hx-fig');
  const leads = root.querySelector('.hx-leads');
  const planes = [...root.querySelectorAll('.hx-pl')].map((el) => ({ el, d: Number(el.dataset.d) }));
  const pills = { form: root.querySelector('.hx-pill.form'), content: root.querySelector('.hx-pill.content') };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const theme = () => document.documentElement.dataset.theme || 'dark';

  // ── pills: hover lights a side, a click keeps it open with the details ──
  let hot = '';
  let open = '';
  const sync = () => {
    const lit = hot || open;
    if (lit) root.dataset.lit = lit;
    else delete root.dataset.lit;
    if (open) root.dataset.open = open;
    else delete root.dataset.open;
    for (const k of ['form', 'content']) pills[k].setAttribute('aria-expanded', String(open === k));
  };
  for (const [k, b] of Object.entries(pills)) {
    b.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && ((hot = k), sync()));
    b.addEventListener('pointerleave', () => ((hot = ''), sync()));
    b.addEventListener('focus', () => ((hot = k), sync()));
    b.addEventListener('blur', () => ((hot = ''), sync()));
    b.addEventListener('click', () => ((open = open === k ? '' : k), sync()));
  }
  document.addEventListener('click', (e) => {
    if (open && !e.target.closest('.hx-pill, .hx-ann')) (open = ''), sync();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) (open = ''), sync();
  });

  // ── pointer, smoothed; a slow drift when there is no mouse ──
  let tx = 0;
  let ty = 0;
  let x = 0;
  let y = 0;
  let lastMove = -1e9;
  addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return;
      const r = root.getBoundingClientRect();
      tx = clamp(((e.clientX - r.left) / r.width) * 2 - 1);
      ty = clamp(((e.clientY - r.top) / r.height) * 2 - 1);
      lastMove = performance.now();
    },
    { passive: true },
  );
  let visible = true;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(root);

  startRain(root.querySelector('.hx-rain'), () => visible && theme() === 'matrix');

  // ── the WebGL figure, once the page is idle ──
  let lens = null;
  const startLens = () => {
    root.classList.add('fx'); // the fog textures, now that the page has loaded
    if (reduce.matches) return;
    makeLens(canvas, still, cfg)
      .then((l) => (lens = l))
      .catch(() => (lens = null));
  };
  const idle = () => ('requestIdleCallback' in window ? requestIdleCallback(startLens, { timeout: 2000 }) : setTimeout(startLens, 300));
  if (document.readyState === 'complete') idle();
  else addEventListener('load', idle, { once: true });

  let gr = 0.5;
  let gb = 0.5;
  let hR = 0;
  let hB = 0;
  const frame = (t) => {
    requestAnimationFrame(frame);
    if (!visible) return;
    if (reduce.matches) {
      x = y = 0;
    } else {
      const still_ = t - lastMove > 2500;
      const gx = still_ ? Math.sin(t * 0.00031) * 0.45 : tx;
      const gy = still_ ? Math.sin(t * 0.00023 + 1) * 0.27 : ty;
      const k = still_ ? 0.02 : 0.06;
      x += (gx - x) * k;
      y += (gy - y) * k;
    }
    const off = [-x * STRENGTH[0], -y * STRENGTH[1]];
    const W = photo.clientWidth;
    const H = photo.clientHeight;
    for (const p of planes) p.el.style.transform = `translate3d(${(off[0] * W * (p.d - FOCUS)).toFixed(2)}px, ${(off[1] * H * (p.d - FOCUS)).toFixed(2)}px, 0)`;

    // The pills' hit areas (and the leader lines) follow the hands: a point at depth d moves by off * (d - focus).
    const sr = stage.getBoundingClientRect();
    const ir = still.getBoundingClientRect();
    const at = {};
    for (const k of ['form', 'content']) {
      const [px, py, d] = cfg[k];
      at[k] = [(px / 100 + off[0] * (d - FOCUS)) * ir.width + ir.left - sr.left, (py / 100 + off[1] * (d - FOCUS)) * ir.height + ir.top - sr.top];
      pills[k].style.left = `${at[k][0].toFixed(1)}px`;
      pills[k].style.top = `${at[k][1].toFixed(1)}px`;
    }
    const lit = hot || open;
    if (lit && leads.clientWidth) {
      leads.setAttribute('viewBox', `0 0 ${sr.width} ${sr.height}`);
      const a = root.querySelector(`.hx-ann.${lit} .anchor`).getBoundingClientRect();
      const ax = (lit === 'form' ? a.right : a.left) - sr.left;
      const ay = a.top + a.height / 2 - sr.top;
      const ex = lit === 'form' ? ax + 24 : ax - 24;
      const [px, py] = at[lit];
      leads.querySelector(`path.${lit}`).setAttribute('d', `M${px.toFixed(1)} ${py.toFixed(1)} L${ex.toFixed(1)} ${ay.toFixed(1)} L${ax.toFixed(1)} ${ay.toFixed(1)}`);
      const c = leads.querySelector(`circle.${lit}`);
      c.setAttribute('cx', px.toFixed(1));
      c.setAttribute('cy', py.toFixed(1));
    }

    // The lit side's gel brightens, the other dims.
    const tr = lit === 'form' ? 1 : lit ? 0.3 : 0.5;
    const tb = lit === 'content' ? 1 : lit ? 0.3 : 0.5;
    gr += (tr - gr) * 0.07;
    gb += (tb - gb) * 0.07;
    hR += ((lit === 'form' ? 1 : 0) - hR) * 0.1;
    hB += ((lit === 'content' ? 1 : 0) - hB) * 0.1;
    root.style.setProperty('--gr', gr.toFixed(3));
    root.style.setProperty('--gb', gb.toFixed(3));

    if (lens && !lens.lost) {
      lens.draw({ off, hot: [hR, hB], gels: [gr * 0.95, gb * 0.95], matrix: theme() === 'matrix', t });
      root.classList.add('gl');
    } else if (lens) {
      root.classList.remove('gl');
      lens = null;
    }
  };
  requestAnimationFrame(frame);
}

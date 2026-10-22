// Movie page stills: tile loading, the Grid / 2×2 switch (remembered per
// visitor) and the full-screen viewer. The viewer is built on first open; ← → keys, swipe and
// the side buttons step through the frames, and the address bar carries
// #still-<n> while it is open, so a frame can be shared and opens on load.
import { readJson, writeJson } from './store.js';
import { withBase } from './util.js';

const VIEW_KEY = 'cinema.stills.view'; // 'grid' | 'posts', a display preference only

export function initStills() {
  const section = document.getElementById('stills');
  if (!section) return;

  for (const b of section.querySelectorAll('[data-set-view]')) {
    b.setAttribute('aria-pressed', String(section.dataset.view === b.dataset.setView));
    b.addEventListener('click', () => {
      section.dataset.view = b.dataset.setView;
      writeJson(VIEW_KEY, b.dataset.setView);
      for (const x of section.querySelectorAll('[data-set-view]')) x.setAttribute('aria-pressed', String(x === b));
    });
  }
  if (readJson(VIEW_KEY) === 'posts' && section.dataset.view !== 'posts') section.querySelector('[data-set-view="posts"]')?.click();

  // Frames load when they come within 600px of the screen (hidden views never do).
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.src = e.target.dataset.src;
        e.target.removeAttribute('data-src');
        io.unobserve(e.target);
      }
    },
    { rootMargin: '600px 0px' }
  );
  for (const img of section.querySelectorAll('img[data-src]')) io.observe(img);

  // One entry per frame, in frame order, from the lead and Grid links (the
  // 2×2 links repeat them without sizes).
  const byN = new Map();
  for (const a of section.querySelectorAll('a.still[data-w]')) {
    const n = Number(a.dataset.frame);
    if (!byN.has(n)) byN.set(n, { n, href: a.href, w: Number(a.dataset.w), h: Number(a.dataset.h), c: a.style.getPropertyValue('--c'), scene: a.dataset.scene || null, alt: a.querySelector('img')?.alt ?? '' });
  }
  const frames = [...byN.values()].sort((a, b) => a.n - b.n);
  const title = section.dataset.film;
  let dialog = null, index = 0, opener = null;

  section.addEventListener('click', (e) => {
    const a = e.target.closest('a.still[data-frame]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    opener = a;
    open(frames.findIndex((f) => f.n === Number(a.dataset.frame)));
  });

  function build() {
    const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="${withBase('/icons.svg')}#i-${name}"></use></svg>`;
    dialog = document.createElement('dialog');
    dialog.className = 'still-viewer';
    dialog.setAttribute('aria-label', `Stills from ${title}`);
    dialog.innerHTML = `
      <div class="sv-top"><p class="sv-title"><b></b> <i></i></p>
        <button type="button" class="sv-btn" data-act="copy">${icon('link')}<span>Copy link</span></button>
        <button type="button" class="sv-btn" data-act="close" aria-label="Close">${icon('close')}</button></div>
      <div class="sv-stage"><div class="sv-frame"><img alt="" decoding="async"></div>
        <button type="button" class="sv-side prev" data-act="prev" aria-label="Previous frame"></button>
        <button type="button" class="sv-side next" data-act="next" aria-label="Next frame"></button></div>
      <div class="sv-bottom"><button type="button" class="sv-btn" data-act="prev">← Prev</button><span class="sv-count" aria-live="polite"></span><button type="button" class="sv-btn" data-act="next">Next →</button></div>`;
    dialog.querySelector('.sv-title b').textContent = title;
    dialog.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'close') dialog.close();
      else if (act === 'prev') step(-1);
      else if (act === 'next') step(1);
      else if (act === 'copy') copyLink(e.target.closest('[data-act]'));
    });
    dialog.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    });
    let x0 = null;
    const stage = dialog.querySelector('.sv-stage');
    stage.addEventListener('pointerdown', (e) => (x0 = e.clientX));
    stage.addEventListener('pointerup', (e) => {
      if (x0 != null && Math.abs(e.clientX - x0) > 40) step(e.clientX < x0 ? 1 : -1);
      x0 = null;
    });
    dialog.addEventListener('close', () => {
      history.replaceState(history.state, '', location.pathname + location.search);
      opener?.focus({ preventScroll: true });
      opener = null;
    });
    document.body.append(dialog);
  }

  function show() {
    const f = frames[index];
    const frame = dialog.querySelector('.sv-frame');
    frame.style.setProperty('--c', f.c);
    frame.style.setProperty('--ar', `${f.w} / ${f.h}`);
    frame.style.setProperty('--r', String(f.w / f.h));
    const img = frame.querySelector('img');
    img.removeAttribute('src'); // drop the previous frame at once, the colour shows until the next arrives
    img.width = f.w;
    img.height = f.h;
    img.alt = f.alt;
    img.src = f.href;
    dialog.querySelector('.sv-title i').textContent = f.n === 1 ? 'the lead frame' : f.scene ?? '';
    dialog.querySelector('.sv-count').textContent = `${f.n} / ${frames.at(-1).n}`;
    for (const b of dialog.querySelectorAll('[data-act="prev"], [data-act="next"]')) b.hidden = frames.length < 2;
    history.replaceState(history.state, '', `#still-${f.n}`);
    for (const d of [-1, 1]) new Image().src = frames[(index + d + frames.length) % frames.length].href;
  }

  function open(i) {
    if (i < 0) return;
    if (!dialog) build();
    index = i;
    show();
    if (!dialog.open) dialog.showModal();
  }
  function step(d) {
    index = (index + d + frames.length) % frames.length;
    show();
  }
  async function copyLink(btn) {
    const label = btn.querySelector('span');
    try {
      await navigator.clipboard.writeText(location.href);
      label.textContent = 'Copied';
    } catch {
      label.textContent = 'Copy failed';
    }
    setTimeout(() => (label.textContent = 'Copy link'), 1400);
  }

  // replaceState (used while the viewer is open) fires no hashchange, so this
  // only reacts to links and typed addresses.
  const fromHash = () => {
    const m = location.hash.match(/^#still-(\d+)$/);
    if (m) open(frames.findIndex((f) => f.n === Number(m[1])));
  };
  window.addEventListener('hashchange', fromHash);
  fromHash();
}

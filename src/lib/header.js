// Behaviour for SiteHeader.astro: desktop menus, the theme menus, the phone
// tab bar's sheets, and search. Every open/close is a CSS transition keyed on
// a data attribute, so closing animates as well as opening (and both collapse
// to instant under prefers-reduced-motion, in global.css). Search code and
// data load on first open only.
import meta from '../../data/generated/meta.json';
import { withBase, tmdbImg } from './util.js';
import { fmtScore } from '../../shared/rating-meta.mjs';
import { NAV, NAV_LINKS, isCurrent } from './nav.js';

const PHONE = window.matchMedia('(max-width: 860px)');
const BASE = import.meta.env.BASE_URL || '/';
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const svg = (name) => `<svg class="icon" aria-hidden="true"><use href="${withBase('/icons.svg')}#i-${name}"></use></svg>`;

/* ── Menus: the desktop nav groups and both theme menus ─────────────────── */

function initMenus() {
  const groups = [...document.querySelectorAll('[data-menu]')];
  const trigger = (g) => g.querySelector('[data-menu-trigger]');
  const entries = (g) => [...g.querySelectorAll('[data-menu-pop] a, [data-menu-pop] button')];
  const isOpen = (g) => g.hasAttribute('data-open');

  function close(g, focusBack = false) {
    if (!isOpen(g)) return;
    g.removeAttribute('data-open');
    trigger(g).setAttribute('aria-expanded', 'false');
    if (focusBack) trigger(g).focus();
  }
  const closeAll = (except) => groups.forEach((g) => g !== except && close(g));
  function open(g, focusFirst = false) {
    closeAll(g);
    g.setAttribute('data-open', '');
    trigger(g).setAttribute('aria-expanded', 'true');
    if (focusFirst) entries(g)[0]?.focus();
  }

  for (const g of groups) {
    trigger(g).addEventListener('click', () => (isOpen(g) ? close(g) : open(g)));
    g.addEventListener('keydown', (e) => {
      const list = entries(g);
      const i = list.indexOf(document.activeElement);
      if (e.key === 'Escape' && isOpen(g)) {
        e.preventDefault();
        e.stopPropagation();
        close(g, true);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!isOpen(g)) open(g, true);
        else list[(i + 1) % list.length]?.focus();
      } else if (e.key === 'ArrowUp' && isOpen(g)) {
        e.preventDefault();
        list[i <= 0 ? list.length - 1 : i - 1]?.focus();
      }
    });
    // Tabbing out of a menu closes it.
    g.addEventListener('focusout', (e) => {
      if (!g.contains(e.relatedTarget)) close(g);
    });
  }
  document.addEventListener('pointerdown', (e) => groups.forEach((g) => !g.contains(e.target) && close(g)));
  return { close, closeAll };
}

/* ── Theme ────────────────────────────────────────────────────────────── */

function initTheme(menus) {
  const options = [...document.querySelectorAll('[data-theme-option]')];
  const sync = () => {
    const theme = document.documentElement.dataset.theme || 'dark';
    options.forEach((o) => o.setAttribute('aria-pressed', String(o.dataset.themeOption === theme)));
  };
  for (const o of options) {
    o.addEventListener('click', () => {
      const theme = o.dataset.themeOption;
      document.documentElement.dataset.theme = theme;
      window.__setFavicon?.(theme);
      try {
        // A bare string (not JSON): the pre-paint script in Base.astro reads it as-is.
        localStorage.setItem('cinema.theme', theme);
      } catch {}
      sync();
      menus.close(o.closest('[data-menu]'), true);
    });
  }
  sync();
}

/* ── Phone sheets: one per nav group, opened from the tab bar ─────────── */

function initSheets() {
  const triggers = [...document.querySelectorAll('[data-sheet-trigger]')];
  const sheets = new Map();
  let backdrop = null;
  let openId = null;

  function build(id) {
    if (sheets.has(id)) return sheets.get(id);
    const group = NAV.find((n) => n.id === id);
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'sheet-backdrop';
      backdrop.addEventListener('click', () => close());
      document.body.append(backdrop);
    }
    const sheet = document.createElement('div');
    sheet.className = 'sheet';
    sheet.id = `sheet-${id}`;
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-label', group.label);
    sheet.innerHTML =
      `<div class="sheet-handle" aria-hidden="true"><span></span></div>` +
      `<h2 class="sheet-title">${esc(group.label)}</h2>` +
      `<ul class="sheet-list" role="list">${group.items
        .map(
          (i) =>
            `<li><a class="sheet-item" href="${withBase(i.href)}"${isCurrent(i, location.pathname, BASE) ? ' aria-current="page"' : ''}>` +
            `<span class="sheet-icon">${svg(i.icon)}</span>` +
            `<span><span class="sheet-t">${esc(i.label)}</span><span class="sheet-d">${esc(i.desc ?? '')}</span></span></a></li>`
        )
        .join('')}</ul>`;
    document.body.append(sheet);
    enableDrag(sheet);
    sheets.set(id, sheet);
    return sheet;
  }

  // Dragging the handle or title down far or fast enough closes the sheet;
  // otherwise it springs back.
  function enableDrag(sheet) {
    let startY = null;
    let dy = 0;
    let t0 = 0;
    sheet.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !e.target.closest('.sheet-handle, .sheet-title')) return;
      startY = e.clientY;
      dy = 0;
      t0 = performance.now();
      sheet.setPointerCapture(e.pointerId);
      sheet.classList.add('dragging');
    });
    sheet.addEventListener('pointermove', (e) => {
      if (startY == null) return;
      dy = Math.max(0, e.clientY - startY);
      sheet.style.transform = `translateY(${dy}px)`;
    });
    const end = () => {
      if (startY == null) return;
      const speed = dy / Math.max(1, performance.now() - t0);
      startY = null;
      sheet.classList.remove('dragging');
      sheet.style.transform = '';
      if (dy > 80 || speed > 0.6) close(false);
    };
    sheet.addEventListener('pointerup', end);
    sheet.addEventListener('pointercancel', end);
  }

  function open(id) {
    if (openId === id) return;
    if (openId) close(false);
    const sheet = build(id);
    void sheet.offsetHeight; // commit the closed position so the first open animates too
    sheet.setAttribute('data-open', '');
    backdrop.setAttribute('data-open', '');
    triggers.forEach((t) => t.setAttribute('aria-expanded', String(t.dataset.sheetTrigger === id)));
    openId = id;
    sheet.querySelector('a')?.focus({ preventScroll: true });
  }

  function close(focusBack = true) {
    if (!openId) return;
    const trigger = triggers.find((t) => t.dataset.sheetTrigger === openId);
    sheets.get(openId).removeAttribute('data-open');
    backdrop.removeAttribute('data-open');
    triggers.forEach((t) => t.setAttribute('aria-expanded', 'false'));
    openId = null;
    if (focusBack) trigger?.focus({ preventScroll: true });
  }

  triggers.forEach((t) => t.addEventListener('click', () => (openId === t.dataset.sheetTrigger ? close() : open(t.dataset.sheetTrigger))));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openId) {
      e.preventDefault();
      close();
    }
  });
  PHONE.addEventListener('change', () => close(false));
  return { close };
}

/* ── Search ───────────────────────────────────────────────────────────── */
// Wide screens: the search button grows leftwards into a field while the nav
// makes way, and results fill the page under the header ("bar" mode). Phones:
// the Search tab opens the same panel full screen with its own field ("full").

function initSearch({ menus, sheets }) {
  const header = document.querySelector('[data-header]');
  const box = header?.querySelector('[data-hs]');
  const button = box?.querySelector('[data-hs-button]');
  const input = box?.querySelector('[data-hs-input]');
  const phoneTab = document.querySelector('[data-hs-phone]');
  if (!header || !box || !button || !input) return;

  let panel = null;
  let results = null;
  let phoneInput = null;
  let live = null;
  let mode = null; // null (closed) | 'bar' | 'full'
  let opener = null;
  let engine = null;
  let query = '';
  let active = -1;
  let ticket = 0;
  let timer;

  const activeInput = () => (mode === 'full' ? phoneInput : input);
  const options = () => (results ? [...results.querySelectorAll('[role="option"]')] : []);
  const outside = () => [header, document.querySelector('main'), document.querySelector('.site-footer'), document.querySelector('.tabbar')].filter(Boolean);

  function buildPanel() {
    panel = document.createElement('div');
    panel.className = 'search-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Search');
    panel.innerHTML =
      `<div class="sp-bar">${svg('search')}` +
      `<input type="search" class="sp-input" placeholder="Search the archive" aria-label="Search the archive" autocomplete="off" spellcheck="false" role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="search-results">` +
      `<button type="button" class="sp-close" aria-label="Close search">${svg('close')}</button></div>` +
      `<div class="wrap sp-body"><div id="search-results" class="sr" role="listbox" aria-label="Search results"></div>` +
      `<p class="sr-keys"><span><kbd class="kbd">↑</kbd> <kbd class="kbd">↓</kbd> move</span><span><kbd class="kbd">Enter</kbd> open</span><span><kbd class="kbd">Esc</kbd> close</span></p></div>` +
      `<p class="visually-hidden" aria-live="polite"></p>`;
    document.body.append(panel);
    results = panel.querySelector('#search-results');
    phoneInput = panel.querySelector('.sp-input');
    live = panel.querySelector('[aria-live]');
    panel.querySelector('.sp-close').addEventListener('click', () => close());
    phoneInput.addEventListener('input', () => onInput(phoneInput.value));
    phoneInput.addEventListener('keydown', onKey);
    // A click on the panel's empty space closes it, like clicking away.
    panel.addEventListener('click', (e) => {
      if (e.target === panel || e.target.classList.contains('sp-body')) close(false);
    });
    results.addEventListener('pointermove', (e) => {
      const o = e.target.closest('[role="option"]');
      if (o) setActive(options().indexOf(o), false);
    });
    renderIdle();
  }

  // The field runs from the search button back to the wordmark, capped.
  function measure() {
    const right = box.getBoundingClientRect().right;
    const logo = header.querySelector('[data-hs-logo]').getBoundingClientRect().right;
    box.style.setProperty('--hs-w', `${Math.round(Math.max(220, Math.min(560, right - logo - 28)))}px`);
    document.documentElement.style.setProperty('--hs-top', `${Math.round(header.getBoundingClientRect().bottom)}px`);
  }

  function open(as = PHONE.matches ? 'full' : 'bar') {
    if (mode) return activeInput().focus();
    menus.closeAll();
    sheets.close(false);
    if (!panel) buildPanel();
    opener = document.activeElement;
    mode = as;
    panel.dataset.mode = as;
    if (as === 'bar') {
      measure();
      header.setAttribute('data-hs-open', '');
      button.setAttribute('aria-expanded', 'true');
      input.setAttribute('aria-expanded', 'true');
    } else {
      phoneTab?.setAttribute('aria-expanded', 'true');
      document.documentElement.classList.add('search-lock');
      outside().forEach((el) => (el.inert = true));
    }
    void panel.offsetHeight; // commit the closed state so the first open animates too
    panel.setAttribute('data-open', '');
    input.value = phoneInput.value = query;
    activeInput().focus({ preventScroll: true });
    // Start loading now; a query typed meanwhile renders once it's ready.
    getEngine().then(
      () => query.trim() && render(),
      () => {}
    );
  }

  function close(focusBack = true) {
    if (!mode) return;
    header.removeAttribute('data-hs-open');
    button.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-expanded', 'false');
    phoneTab?.setAttribute('aria-expanded', 'false');
    document.documentElement.classList.remove('search-lock');
    outside().forEach((el) => (el.inert = false));
    panel.removeAttribute('data-open');
    setActive(-1);
    mode = null;
    activeInput().blur();
    if (focusBack && opener instanceof HTMLElement && opener.isConnected && opener !== document.body) opener.focus({ preventScroll: true });
  }

  // The search engine (code + index), built once; a failed load is retried on
  // the next open.
  function getEngine() {
    if (!engine) {
      engine = Promise.all([import('./archive.js'), import('./search.js')]).then(async ([archive, s]) => {
        const [{ list }, extra, people] = await Promise.all([
          archive.loadArchive({ rated: true, originalTitles: true }),
          archive.loadSearchExtra(),
          archive.loadSearchPeople().catch(() => []),
        ]);
        const index = s.buildIndex(list, extra, NAV_LINKS, people);
        return { run: (q) => s.search(index, q), posters: archive.loadPosters, faces: archive.loadPeople, minQuery: s.MIN_QUERY };
      });
      engine.catch(() => {
        engine = null;
        if (results) results.innerHTML = `<p class="sr-status">Search couldn't load the archive. Check the connection and try again.</p>`;
      });
    }
    return engine;
  }

  function onInput(value) {
    query = value;
    if (input.value !== value) input.value = value;
    if (phoneInput && phoneInput.value !== value) phoneInput.value = value;
    clearTimeout(timer);
    timer = setTimeout(render, 70);
  }

  function setActive(i, scroll = true) {
    const list = options();
    list[active]?.setAttribute('aria-selected', 'false');
    active = i;
    const el = list[i];
    el?.setAttribute('aria-selected', 'true');
    for (const field of [input, phoneInput]) {
      if (!field) continue;
      if (el) field.setAttribute('aria-activedescendant', el.id);
      else field.removeAttribute('aria-activedescendant');
    }
    if (el && scroll) el.scrollIntoView({ block: 'nearest' });
  }

  function onKey(e) {
    const list = options();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!list.length) return;
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive(active === -1 ? (step > 0 ? 0 : list.length - 1) : (active + step + list.length) % list.length);
    } else if (e.key === 'Enter') {
      const pick = list[active] ?? (query.trim() ? list[0] : null);
      if (pick) {
        e.preventDefault();
        window.location.href = pick.href;
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  }

  const placeHtml = (p) =>
    `<a class="sr-chip" role="option" aria-selected="false" href="${withBase(p.href)}"><span class="sr-kind">${esc(p.kind ?? 'Page')}</span>${esc(p.label)}</a>`;

  function finish(html, summary) {
    results.innerHTML = html;
    options().forEach((o, i) => (o.id = `sr-${i}`));
    active = -1;
    setActive(-1);
    if (live) live.textContent = summary;
  }

  function renderIdle() {
    finish(
      `<p class="sr-status">Search ${meta.counts.movies.toLocaleString('en-US')} films by title, original title or year, plus directors, people and collections.</p>` +
        `<div class="sr-group" role="group" aria-label="Pages"><h3 class="sr-h" aria-hidden="true">Jump to</h3>` +
        `<div class="sr-chips">${NAV_LINKS.map((p) => placeHtml({ ...p, kind: 'Page' })).join('')}</div></div>`,
      ''
    );
  }

  async function render() {
    const mine = ++ticket;
    if (!results) return;
    if (!query.trim()) return renderIdle();
    const e = await getEngine().catch(() => null);
    if (!e || mine !== ticket) return;
    const r = e.run(query);
    if (!r) return finish(`<p class="sr-status">Keep typing: at least ${e.minQuery} letters.</p>`, '');
    if (!r.films.length && !r.directors.length && !r.people.length && !r.places.length) {
      return finish(`<p class="sr-status">Nothing in the archive matches “${esc(query.trim())}”.</p>`, 'No results');
    }
    let html = '';
    if (r.films.length) {
      const note = r.filmCount > r.films.length ? `<span class="sr-note">best ${r.films.length} of ${r.filmCount.toLocaleString('en-US')}</span>` : '';
      html +=
        `<div class="sr-group" role="group" aria-label="Films"><h3 class="sr-h" aria-hidden="true">Films ${note}</h3><div class="sr-posters">` +
        r.films
          .map(
            (f) =>
              `<a class="sr-film" role="option" aria-selected="false" href="${withBase(`/movie/${f.slug}`)}">` +
              `<span class="sr-poster"><span class="sr-noposter">${esc(f.title)}</span><img data-poster-id="${f.id}" alt="" decoding="async">` +
              `${f.my != null ? `<span class="rating-tag">${fmtScore(f.my)}</span>` : ''}</span>` +
              `<span class="sr-t">${esc(f.title)}</span><span class="sr-m">${[f.year, f.directors[0]?.name].filter(Boolean).map(esc).join(' · ') || '–'}</span></a>`
          )
          .join('') +
        `</div></div>`;
    }
    if (r.directors.length) {
      html +=
        `<div class="sr-group" role="group" aria-label="Directors"><h3 class="sr-h" aria-hidden="true">Directors</h3><div class="sr-faces">` +
        r.directors
          .map((d) => {
            const photo = tmdbImg(d.photo, 'w185');
            const initials = d.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('');
            return (
              `<a class="sr-face" role="option" aria-selected="false" href="${withBase(`/director/${d.slug}`)}">` +
              (photo ? `<img src="${esc(photo)}" alt="" loading="lazy" decoding="async">` : `<span class="sr-initial" aria-hidden="true">${esc(initials)}</span>`) +
              `<span><span class="sr-t">${esc(d.name)}</span><span class="sr-m">Director${d.rated ? ` · ${d.rated} rated by Dr. X` : ''}</span></span></a>`
            );
          })
          .join('') +
        `</div></div>`;
    }
    if (r.people.length) {
      html +=
        `<div class="sr-group" role="group" aria-label="People"><h3 class="sr-h" aria-hidden="true">People <span class="sr-note">in Dr. X Net</span></h3><div class="sr-faces">` +
        r.people
          .map((p) => {
            const initials = p.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('');
            return (
              `<a class="sr-face" role="option" aria-selected="false" href="${withBase(`/net?focus=p${p.id}`)}">` +
              `<span class="sr-initial" aria-hidden="true" data-face-id="${p.id}">${esc(initials)}</span>` +
              `<span><span class="sr-t">${esc(p.name)}</span><span class="sr-m">In ${p.rated} of Dr. X's films</span></span></a>`
            );
          })
          .join('') +
        `</div></div>`;
    }
    if (r.places.length) {
      html += `<div class="sr-group" role="group" aria-label="Collections and pages"><h3 class="sr-h" aria-hidden="true">Collections and pages</h3><div class="sr-chips">${r.places.map(placeHtml).join('')}</div></div>`;
    }
    const parts = [
      r.filmCount && `${r.filmCount} film${r.filmCount === 1 ? '' : 's'}`,
      r.directors.length && `${r.directors.length} director${r.directors.length === 1 ? '' : 's'}`,
      r.people.length && `${r.people.length} ${r.people.length === 1 ? 'person' : 'people'}`,
      r.places.length && `${r.places.length} page${r.places.length === 1 ? '' : 's'}`,
    ].filter(Boolean);
    finish(html, parts.join(', '));

    // People's faces and films' posters come from small shards, after the
    // results are already on screen.
    if (r.people.length) {
      e.faces(r.people.map((p) => p.id))
        .then((faces) => {
          if (mine !== ticket) return;
          for (const el of results.querySelectorAll('[data-face-id]')) {
            const photo = tmdbImg(faces.get(Number(el.dataset.faceId))?.profile, 'w185');
            if (!photo) continue;
            const img = document.createElement('img');
            img.alt = '';
            img.decoding = 'async';
            img.src = photo;
            el.replaceWith(img);
          }
        })
        .catch(() => {});
    }
    const ids = r.films.map((f) => f.id);
    if (!ids.length) return;
    const posters = await e.posters(ids).catch(() => new Map());
    if (mine !== ticket) return;
    for (const img of results.querySelectorAll('img[data-poster-id]')) {
      const path = posters.get(Number(img.dataset.posterId));
      if (path) {
        img.addEventListener('load', () => img.classList.add('loaded'), { once: true });
        img.src = tmdbImg(path, 'w185');
      }
    }
  }

  button.addEventListener('click', () => (mode ? close() : open('bar')));
  box.querySelector('[data-hs-close]')?.addEventListener('click', () => close());
  input.addEventListener('input', () => onInput(input.value));
  input.addEventListener('keydown', onKey);
  phoneTab?.addEventListener('click', () => (mode ? close() : open('full')));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mode) {
      e.preventDefault();
      return close();
    }
    const typing = e.target instanceof HTMLElement && e.target.matches('input, textarea, select, [contenteditable]');
    const shortcut =
      (e.key?.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey) && !e.altKey) ||
      (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey);
    if (shortcut) {
      e.preventDefault();
      open();
    }
  });
  document.addEventListener('pointerdown', (e) => {
    if (mode === 'bar' && !box.contains(e.target) && !panel.contains(e.target)) close(false);
  });
  window.addEventListener('resize', () => mode === 'bar' && measure());
  PHONE.addEventListener('change', () => close(false));
}

export function initHeader() {
  const menus = initMenus();
  initTheme(menus);
  const sheets = initSheets();
  initSearch({ menus, sheets });
}

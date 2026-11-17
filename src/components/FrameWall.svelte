<script>
  import { onMount, untrack } from 'svelte';
  import { fmtScore } from '../../shared/rating-meta.mjs';
  import { movieSlug } from '../../shared/slug.mjs';
  import { withBase, stillUrl } from '../lib/util.js';
  import { loadWall } from '../lib/archive.js';
  import { readJson, writeJson } from '../lib/store.js';
  import { VIEWS, FAMILIES, prepareFrames, filterFrames, shuffled, bySpectrum, justifyRows, gridLayout, rowRange, driftCells, hash2, DRIFT_WIDTHS } from '../lib/frame-wall.js';

  // Menus and totals are known at build time, so the controls render on the server.
  let { decades = [], genres = [], filmCount = 0, frameCount = 0 } = $props();

  const VIEW_KEY = 'cinema.wall.view'; // a display preference, not part of the backup
  const GAP = 6; // gallery
  const GRID_GAP = 3; // spectrum
  const AR_MIN = 0.6;
  const AR_MAX = 3.2;

  let view = $state('gallery');
  let wall = $state.raw(null); // { films, frames }: thousands of frames, no deep proxies
  let error = $state('');
  let q = $state('');
  let decade = $state('');
  let genre = $state('');
  let top = $state(false);
  let family = $state('');
  let seed = $state(1);

  const matching = $derived(wall ? filterFrames(wall.frames, wall.films, { q, decade, genre, top, family }) : []);
  const ordered = $derived(view === 'spectrum' ? bySpectrum(matching) : shuffled(matching, seed));
  const filmsShown = $derived(new Set(matching.map((f) => f.f)).size);

  // ── Gallery and Spectrum: rows laid out for the whole list, only the ones near the screen drawn.
  let wallEl = $state();
  let width = $state(0);
  let win = $state({ from: 0, to: 0 }); // the visible part of the wall, in its own pixels, plus a margin
  let frameQueued = false;
  function measure() {
    frameQueued = false;
    const el = wallEl;
    if (!el) return;
    const r = el.getBoundingClientRect();
    win = { from: -r.top - innerHeight * 0.6, to: -r.top + innerHeight * 1.6 };
  }
  function schedule() {
    if (frameQueued) return;
    frameQueued = true;
    requestAnimationFrame(measure);
  }

  const layout = $derived.by(() => {
    if (!wall || width < 10 || view === 'drift' || !ordered.length) return null;
    if (view === 'gallery') {
      const target = width < 600 ? 110 : width < 900 ? 160 : 200;
      return { kind: 'rows', ...justifyRows(ordered.map((f) => Math.min(AR_MAX, Math.max(AR_MIN, f.ar))), width, target, GAP) };
    }
    return { kind: 'grid', ...gridLayout(ordered.length, width, width < 600 ? 104 : 150, GRID_GAP) };
  });

  const tiles = $derived.by(() => {
    const L = layout;
    if (!L) return [];
    const out = [];
    if (L.kind === 'rows') {
      const [a, b] = rowRange(L.rows, win.from, win.to);
      for (let i = a; i < b; i++) {
        const row = L.rows[i];
        let x = 0;
        for (let k = row.start; k < row.end; k++) {
          const fr = ordered[k];
          const w = Math.floor(Math.min(AR_MAX, Math.max(AR_MIN, fr.ar)) * row.h);
          out.push({ key: `${fr.f}:${fr.n}`, fr, x, y: Math.round(row.top), w, h: Math.round(row.h) });
          x += w + GAP;
        }
      }
    } else {
      const r0 = Math.max(0, Math.floor(win.from / L.rowH));
      const r1 = Math.min(L.rows - 1, Math.floor(win.to / L.rowH));
      for (let r = r0; r <= r1; r++) {
        for (let c = 0; c < L.cols; c++) {
          const fr = ordered[r * L.cols + c];
          if (!fr) break;
          out.push({ key: `${fr.f}:${fr.n}`, fr, x: c * (L.tw + GRID_GAP), y: r * L.rowH, w: L.tw, h: L.th });
        }
      }
    }
    return out;
  });

  $effect(() => {
    if (wallEl && layout) untrack(measure);
  });

  // The colour bar over the Spectrum: each family's share of the frames shown.
  const bands = $derived(
    FAMILIES.map((f) => ({ ...f, n: matching.reduce((n, fr) => n + (fr.fam === f.id ? 1 : 0), 0) })).filter((f) => f.n)
  );
  const hueAt = $derived(layout ? Math.min(1, Math.max(0, (win.from + win.to) / 2 / Math.max(1, layout.height))) : 0);
  function jumpTo(e) {
    if (!layout || !wallEl) return;
    const bar = e.currentTarget.getBoundingClientRect();
    const t = (e.clientX - bar.left) / bar.width;
    scrollTo({ top: wallEl.getBoundingClientRect().top + scrollY + t * layout.height - innerHeight / 2, behavior: reduced ? 'auto' : 'smooth' });
  }

  // ── Drift: an endless board, dragged with the pointer or the arrow keys.
  let stageEl = $state();
  let sw = $state(0);
  let sh = $state(0);
  let px = $state(-40);
  let py = $state(-30);
  let zoom = $state(1);
  let dragging = $state(false);
  let moved = $state(false);
  let reduced = false;
  let pointer = null;
  let vx = 0;
  let vy = 0;
  let glide = 0;

  const cells = $derived(
    view === 'drift' && wall && ordered.length && sw
      ? driftCells(zoom, px, py, sw, sh).map((c) => ({ ...c, fr: ordered[hash2(c.c, c.r) % ordered.length] }))
      : []
  );

  function pan(dx, dy) {
    px += dx;
    py += dy;
    moved = true;
  }
  function down(e) {
    if (e.button !== 0 || e.target.closest('.zoom')) return;
    cancelAnimationFrame(glide);
    pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, travelled: 0 };
    vx = vy = 0;
  }
  function move(e) {
    if (!pointer || e.pointerId !== pointer.id) return;
    const dx = e.clientX - pointer.x;
    const dy = e.clientY - pointer.y;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.travelled += Math.abs(dx) + Math.abs(dy);
    // A drag only starts past a few pixels, so a plain click still reaches the frame under it.
    if (!dragging && pointer.travelled > 5) {
      dragging = true;
      stageEl.setPointerCapture(e.pointerId);
    }
    if (dragging) {
      pan(dx, dy);
      vx = dx;
      vy = dy;
    }
  }
  function up(e) {
    if (!pointer || e.pointerId !== pointer.id) return;
    pointer = null;
    if (!dragging) return;
    dragging = false;
    if (reduced) return;
    const step = () => {
      if (Math.abs(vx) + Math.abs(vy) < 0.3) return;
      pan(vx, vy);
      vx *= 0.93;
      vy *= 0.93;
      glide = requestAnimationFrame(step);
    };
    glide = requestAnimationFrame(step);
  }
  function setZoom(n) {
    n = Math.max(0, Math.min(DRIFT_WIDTHS.length - 1, n));
    if (n === zoom) return;
    const s = DRIFT_WIDTHS[n] / DRIFT_WIDTHS[zoom];
    px = sw / 2 - (sw / 2 - px) * s;
    py = sh / 2 - (sh / 2 - py) * s;
    zoom = n;
  }
  function key(e) {
    const step = e.shiftKey ? 360 : 120;
    const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[e.key]) {
      e.preventDefault();
      pan(...moves[e.key]);
    } else if (e.key === '+' || e.key === '=') setZoom(zoom + 1);
    else if (e.key === '-') setZoom(zoom - 1);
  }

  // ── Controls
  function chooseView(id) {
    view = id;
    writeJson(VIEW_KEY, id);
  }
  const reshuffle = () => (seed = Math.floor(Math.random() * 1e9));
  function pickFamily(id) {
    family = family === id ? '' : id;
  }

  // After a filter or view change, bring the top of the wall back into view.
  let settled = false;
  $effect(() => {
    q; decade; genre; top; family; view; seed;
    if (!settled) return void (settled = true);
    untrack(() =>
      requestAnimationFrame(() => {
        const el = wallEl ?? stageEl;
        if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: 'start' });
      })
    );
  });

  onMount(() => {
    reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const asked = new URLSearchParams(location.search).get('view');
    const saved = readJson(VIEW_KEY);
    const start = [asked, saved].find((v) => VIEWS.some((x) => x.id === v));
    if (start) view = start;
    seed = Math.floor(Math.random() * 1e9);
    loadWall()
      .then((w) => (wall = { films: w.films, frames: prepareFrames(w.frames) }))
      .catch((err) => (error = err.message || "Couldn't load the frames."));
    return () => cancelAnimationFrame(glide);
  });

  const href = (film, fr) => `${withBase(`/movie/${movieSlug(film.title, film.year, film.id)}`)}#still-${fr.n}`;
  const label = (film, fr) => `${film.title}${film.year ? ` (${film.year})` : ''}, frame ${fr.n}`;
</script>

<svelte:window onscroll={schedule} onresize={schedule} />

{#snippet tile(fr, x, y, w, h, thumb)}
  {@const film = wall.films[fr.f]}
  <a class="ft" href={href(film, fr)} style="--c:#{fr.col}; left:{x}px; top:{y}px; width:{w}px; height:{h}px;" aria-label={label(film, fr)} draggable="false" data-testid="wall-tile">
    <img src={stillUrl(film.id, fr.n, thumb ? 'thumb' : 'full')} alt="" width={Math.round(w)} height={Math.round(h)} draggable="false" decoding="async" onload={(e) => e.currentTarget.classList.add('ok')} />
    <span class="cap">
      <span class="cn"><b>{film.title}</b><small>{film.year ?? ''} · frame {fr.n}</small></span>
      <span class="sc">{fmtScore(film.my)}</span>
    </span>
  </a>
{/snippet}

<div class="fw" data-view={view}>
  <div class="tools" role="search">
    <div class="seg views" role="group" aria-label="How to see the wall">
      {#each VIEWS as v}
        <button class:active={view === v.id} aria-pressed={view === v.id} title={v.hint} onclick={() => chooseView(v.id)} data-testid={`wall-view-${v.id}`}>{v.label}</button>
      {/each}
    </div>
    <input type="search" class="find" placeholder="Find a film or director…" aria-label="Find a film or director" bind:value={q} data-testid="wall-search" />
    <select bind:value={decade} aria-label="Decade" data-testid="wall-decade">
      <option value="">Any decade</option>
      {#each decades as d}<option value={String(d)}>{d}s</option>{/each}
    </select>
    <select bind:value={genre} aria-label="Genre" data-testid="wall-genre">
      <option value="">Any genre</option>
      {#each genres as g}<option value={g}>{g}</option>{/each}
    </select>
    <button class="tog" aria-pressed={top} onclick={() => (top = !top)} data-testid="wall-top">Dr. X 8+</button>
    <span class="sw" role="group" aria-label="Colour">
      {#each FAMILIES as f}
        <button class="swatch" style="background:{f.swatch}" title={f.label} aria-label={f.label} aria-pressed={family === f.id} onclick={() => pickFamily(f.id)} data-testid={`wall-colour-${f.id}`}></button>
      {/each}
    </span>
    <button class="tog" onclick={reshuffle} disabled={view === 'spectrum'} title={view === 'spectrum' ? 'The Spectrum keeps its colour order' : 'Mix the frames up'}>Shuffle</button>
  </div>

  <p class="count" aria-live="polite" data-testid="wall-count">
    {#if wall}{matching.length.toLocaleString()} frame{matching.length === 1 ? '' : 's'} from {filmsShown.toLocaleString()} film{filmsShown === 1 ? '' : 's'}{:else}{frameCount.toLocaleString()} frames from {filmCount.toLocaleString()} films{/if}
  </p>

  {#if view === 'spectrum' && wall && matching.length}
    <div class="hue" onclick={jumpTo} role="presentation" title="Jump along the spectrum">
      {#each bands as b}<i style="flex:{b.n}; background:{b.swatch}"></i>{/each}
      <b style="left:{hueAt * 100}%"></b>
    </div>
  {/if}

  {#if error}
    <p class="muted empty" data-testid="wall-error">{error}</p>
  {:else if !wall}
    <div class="hold"><p class="muted">Hanging the frames…</p></div>
  {:else if !matching.length}
    <div class="hold"><p class="muted" data-testid="wall-empty">No frames match. Loosen a filter or two.</p></div>
  {:else if view === 'drift'}
    <div
      class="stage"
      class:dragging
      bind:this={stageEl}
      bind:clientWidth={sw}
      bind:clientHeight={sh}
      role="application"
      tabindex="0"
      aria-label="Frame board. Drag, or use the arrow keys, to explore; plus and minus zoom."
      onpointerdown={down}
      onpointermove={move}
      onpointerup={up}
      onpointercancel={up}
      onkeydown={key}
      data-testid="wall-stage"
    >
      <div class="plane" style="transform: translate({px}px, {py}px)">
        {#each cells as c (c.key)}{@render tile(c.fr, c.x, c.y, c.w, c.h, zoom < 2)}{/each}
      </div>
      <div class="zoom">
        <button onclick={() => setZoom(zoom + 1)} disabled={zoom === DRIFT_WIDTHS.length - 1} aria-label="Zoom in">+</button>
        <button onclick={() => setZoom(zoom - 1)} disabled={zoom === 0} aria-label="Zoom out">−</button>
      </div>
      {#if !moved}<p class="hint">Drag to explore</p>{/if}
    </div>
  {:else}
    <div class="box" bind:this={wallEl} bind:clientWidth={width} style="height:{layout?.height ?? 0}px" data-testid="wall-box">
      {#each tiles as t (t.key)}{@render tile(t.fr, t.x, t.y, t.w, t.h, true)}{/each}
    </div>
    {#if layout}<p class="end faint small">That is every frame that matches. Click one to open its film.</p>{/if}
  {/if}
</div>

<style>
  .tools {
    position: sticky; top: var(--header-h); z-index: 10;
    display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center;
    padding: 0.7rem 0; background: color-mix(in srgb, var(--bg) 94%, transparent);
    backdrop-filter: blur(8px); border-bottom: 1px solid var(--border);
  }
  .find { flex: 1 1 200px; min-width: 160px; }
  .tog {
    padding: 0.45rem 0.8rem; border: 1px solid var(--border-strong); border-radius: var(--radius);
    background: var(--bg-panel); font-size: 0.84rem; color: var(--ink-muted);
  }
  .tog:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
  .tog[aria-pressed='true'] { border-color: var(--accent); color: var(--accent); }
  .tog:disabled { opacity: 0.45; cursor: default; }
  .sw { display: inline-flex; gap: 4px; align-items: center; }
  .swatch { width: 20px; height: 20px; padding: 0; border-radius: 50%; border: 2px solid var(--bg); box-shadow: 0 0 0 1px var(--border-strong); }
  .swatch:hover { box-shadow: 0 0 0 2px var(--ink-muted); }
  .swatch[aria-pressed='true'] { box-shadow: 0 0 0 2px var(--accent); }
  .count { margin: 0.8rem 0; font-size: 0.8rem; color: var(--ink-faint); min-height: 1.4em; }
  .hold { min-height: max(70svh, 480px); display: grid; place-items: center; }
  .empty { margin: 2rem 0; }
  .end { text-align: center; margin: 2rem 0 1rem; }

  /* The colour bar over the Spectrum */
  .hue { position: relative; display: flex; height: 18px; margin-bottom: 1rem; border-radius: 9px; overflow: hidden; cursor: pointer; border: 1px solid var(--border-strong); }
  .hue i { display: block; opacity: 0.85; }
  .hue b { position: absolute; top: 0; bottom: 0; width: 3px; margin-left: -1.5px; background: var(--ink); box-shadow: 0 0 0 2px var(--bg); }

  /* Gallery and Spectrum */
  .box { position: relative; scroll-margin-top: 9rem; }
  .box .ft { position: absolute; border-radius: 2px; }

  /* Frame tiles: the frame's colour shows until its picture arrives */
  .ft { display: block; overflow: hidden; background: var(--c, #222); text-decoration: none; }
  .ft img { width: 100%; height: 100%; object-fit: cover; display: block; opacity: 0; transition: opacity 0.4s ease, transform 0.5s ease; }
  .ft img:global(.ok) { opacity: 1; }
  .ft:hover img, .ft:focus-visible img { transform: scale(1.05); }
  .cap {
    position: absolute; left: 0; right: 0; bottom: 0; display: flex; justify-content: space-between; align-items: end; gap: 0.5rem;
    padding: 1.6rem 0.6rem 0.45rem; background: linear-gradient(transparent, rgb(0 0 0 / 0.85)); color: #fff;
    font-size: 0.78rem; line-height: 1.3; opacity: 0; transform: translateY(6px); transition: opacity 0.2s, transform 0.2s; pointer-events: none;
  }
  .cap b { display: block; font-family: var(--font-display); font-size: 0.98rem; font-weight: 560; }
  .cap small { opacity: 0.75; }
  .sc { font: 600 0.72rem var(--font-mono); color: #f3d99a; white-space: nowrap; }
  :global(:root[data-theme='matrix']) .sc { color: var(--accent); }
  .ft:hover .cap, .ft:focus-visible .cap { opacity: 1; transform: none; }
  .ft:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  @media (hover: none) {
    .box .cap { opacity: 1; transform: none; padding-top: 1.1rem; }
    .cap small, .cap .sc { display: none; }
    .cap b { font-size: 0.8rem; }
  }
  @media (prefers-reduced-motion: reduce) {
    .ft img, .cap { transition: none; }
    .ft:hover img { transform: none; }
  }

  /* Spectrum: small even tiles that rise on hover */
  .box .ft { transition: transform 0.2s ease, box-shadow 0.2s; }
  .box .ft:hover { z-index: 3; }
  :global(.fw[data-view='spectrum']) .box .ft:hover { transform: scale(1.9); box-shadow: 0 12px 30px rgb(0 0 0 / 0.6); }

  /* Drift */
  .stage {
    position: relative; height: clamp(480px, 76svh, 760px); overflow: hidden; cursor: grab; scroll-margin-top: 9rem;
    background: #050505; border: 1px solid var(--border); border-radius: var(--radius); touch-action: none; user-select: none; contain: layout paint;
  }
  .stage.dragging { cursor: grabbing; }
  .stage::after { content: ''; position: absolute; inset: 0; pointer-events: none; box-shadow: inset 0 0 120px 40px #050505; }
  .stage:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .plane { position: absolute; left: 0; top: 0; will-change: transform; }
  .plane .ft { position: absolute; border-radius: 3px; box-shadow: 0 6px 18px rgb(0 0 0 / 0.5); }
  .zoom { position: absolute; z-index: 5; right: 1rem; bottom: 1rem; display: grid; gap: 4px; }
  .zoom button {
    width: 36px; height: 36px; padding: 0; border-radius: 50%; border: 1px solid rgb(255 255 255 / 0.2);
    background: rgb(15 14 12 / 0.82); color: #eee; font-size: 1.1rem; line-height: 1;
  }
  .zoom button:hover:not(:disabled) { border-color: #c9a86a; color: #f3d99a; }
  .zoom button:disabled { opacity: 0.35; cursor: default; }
  .hint {
    position: absolute; z-index: 5; left: 50%; bottom: 1.4rem; transform: translateX(-50%); margin: 0; pointer-events: none;
    padding: 0.4rem 0.9rem; border-radius: 999px; background: rgb(0 0 0 / 0.55); color: rgb(255 255 255 / 0.8); font-size: 0.8rem;
  }

  @media (max-width: 700px) {
    .views { order: -1; flex: 1 1 100%; }
    .views button { flex: 1; }
    select { flex: 1 1 40%; min-width: 0; }
    .sw { order: 5; flex: 1 1 100%; justify-content: space-between; }
  }
</style>

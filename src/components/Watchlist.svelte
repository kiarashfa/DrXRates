<script>
  import { fmtScore } from '../../shared/rating-meta.mjs';
  import { tmdbImg, withBase, fmtRuntime } from '../lib/util.js';
  import { listWatchlist, addToWatchlist, removeFromWatchlist, onWatchlistChange } from '../lib/watchlist.js';
  import { loadFilms } from '../lib/archive.js';
  import { readJson, writeJson } from '../lib/store.js';
  import FilmCard from './FilmCard.svelte';

  const VIEW_KEY = 'cinema.watchlist.view'; // 'grid' | 'list', a display preference only

  let items = $state(listWatchlist());
  let byId = $state(new Map()); // id → film object, or null when it's no longer in the archive
  let loadError = $state('');
  let view = $state(readJson(VIEW_KEY) === 'list' ? 'list' : 'grid');
  let sort = $state('added');
  let undo = $state(null); // { id, title, addedAt }
  let undoTimer;

  const SORTS = [
    { id: 'added', label: 'Added' },
    { id: 'my', label: 'Dr. X' },
    { id: 'imdb', label: 'IMDb' },
    { id: 'year', label: 'Year' },
    { id: 'runtime', label: 'Length' },
  ];

  $effect(() => onWatchlistChange(() => (items = listWatchlist())));

  // Only the listed films are fetched (card shards), each once.
  $effect(() => {
    const missing = items.map((i) => i.id).filter((id) => !byId.has(id));
    if (!missing.length) return;
    loadFilms(missing)
      .then((map) => (byId = new Map([...byId, ...map])))
      .catch((err) => (loadError = err.message));
  });

  const rows = $derived(items.map((i) => ({ ...i, film: byId.get(i.id) ?? null, known: byId.has(i.id) })));

  const sorted = $derived.by(() => {
    if (sort === 'added') return rows;
    const val = (r) => r.film?.[sort];
    const asc = sort === 'runtime';
    return [...rows].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      if (x == null || y == null) return (x == null) - (y == null);
      return asc ? x - y : y - x;
    });
  });

  const totalMinutes = $derived(rows.reduce((t, r) => t + (r.film?.runtime ?? 0), 0));

  function setView(v) {
    view = v;
    writeJson(VIEW_KEY, v);
  }

  function remember(id) {
    const r = items.find((i) => i.id === id);
    clearTimeout(undoTimer);
    undo = r ? { id: r.id, title: r.title, addedAt: r.addedAt } : null;
    undoTimer = setTimeout(() => (undo = null), 6000);
  }

  function remove(id) {
    remember(id);
    removeFromWatchlist(id);
  }

  // FilmCard's own bookmark removes the film; keep it for Undo first.
  function onCardWatch(film, saved) {
    if (!saved) remember(film.id);
  }

  function restore() {
    if (!undo) return;
    addToWatchlist(undo.id, undo.title, undo.addedAt);
    undo = null;
  }

  const fmtAdded = (iso) =>
    iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '–';
  const icon = (name) => `${withBase('/icons.svg')}#i-${name}`;
</script>

<div class="watchlist" data-testid="watchlist">
  {#if items.length === 0 && !undo}
    <div class="panel wl-empty" data-testid="watchlist-empty">
      <svg class="icon" aria-hidden="true"><use href={icon('bookmark')}></use></svg>
      <h3>Nothing on your watchlist yet</h3>
      <p class="muted small">
        Use the bookmark on any film page or poster. The list stays in this browser and goes into your backup file with
        your ratings.
      </p>
      <p><a class="btn" href={withBase('/#catalog')}>Browse the archive</a></p>
    </div>
  {:else}
    <div class="wl-bar">
      <span class="wl-count" data-testid="watchlist-count">
        {items.length} film{items.length === 1 ? '' : 's'}{totalMinutes ? ` · ${fmtRuntime(totalMinutes)} in all` : ''}
      </span>
      <div class="seg" role="group" aria-label="Sort">
        {#each SORTS as s}
          <button class:active={sort === s.id} aria-pressed={sort === s.id} onclick={() => (sort = s.id)}>{s.label}</button>
        {/each}
      </div>
      <div class="seg wl-view" role="group" aria-label="View">
        <button class:active={view === 'grid'} aria-pressed={view === 'grid'} onclick={() => setView('grid')} title="Cards" data-testid="view-grid">
          <svg class="icon" aria-hidden="true"><use href={icon('grid')}></use></svg><span class="visually-hidden">Cards</span>
        </button>
        <button class:active={view === 'list'} aria-pressed={view === 'list'} onclick={() => setView('list')} title="List" data-testid="view-list">
          <svg class="icon" aria-hidden="true"><use href={icon('list')}></use></svg><span class="visually-hidden">List</span>
        </button>
      </div>
      <span class="wl-spacer"></span>
      <a class="btn" href={withBase('/tonight?src=watchlist')} data-testid="watchlist-tonight">
        <svg class="icon" aria-hidden="true"><use href={icon('dice')}></use></svg>Pick one for tonight
      </a>
    </div>

    {#if loadError}<p class="muted small">{loadError}</p>{/if}

    {#if view === 'grid'}
      <div class="film-grid" data-testid="watchlist-grid">
        {#each sorted as r (r.id)}
          {#if r.film}
            <FilmCard film={r.film} watch onwatch={onCardWatch} />
          {:else if r.known}
            <div class="wl-gone">
              <div class="fc-poster"><div class="no-poster">{r.title ?? `#${r.id}`}</div></div>
              <div class="fc-title">{r.title ?? `#${r.id}`}</div>
              <button class="btn" onclick={() => remove(r.id)}>Remove</button>
            </div>
          {:else}
            <div class="wl-skel"><div class="fc-poster"></div><div class="fc-title">{r.title}</div></div>
          {/if}
        {/each}
      </div>
    {:else}
      <div class="wl-list" data-testid="watchlist-list">
        <div class="wl-row wl-head" aria-hidden="true">
          <span></span><span>Film</span><span class="n sc">Dr. X</span><span class="n sc">IMDb</span><span class="n sc">RT</span>
          <span class="n sc">Length</span><span class="n sc">Added</span><span></span>
        </div>
        {#each sorted as r (r.id)}
          <div class="wl-row">
            {#if r.film?.poster}
              <img src={tmdbImg(r.film.poster, 'w92')} alt="" width="46" height="69" loading="lazy" />
            {:else}
              <span class="wl-thumb"></span>
            {/if}
            <span class="wl-film">
              {#if r.film}
                <a class="wl-t" href={withBase(`/movie/${r.film.slug}`)}>{r.film.title}</a>
                <span class="wl-s">
                  {r.film.year ?? '–'}{r.film.directors.length ? ` · ${r.film.directors.slice(0, 2).map((d) => d.name).join(', ')}` : ''}<span class="wl-phone">{r.film.runtime ? ` · ${fmtRuntime(r.film.runtime)}` : ''}</span>
                </span>
              {:else}
                <span class="wl-t">{r.title ?? `#${r.id}`}</span>
              {/if}
            </span>
            <span class="n sc my">{fmtScore(r.film?.my)}</span>
            <span class="n sc">{fmtScore(r.film?.imdb)}</span>
            <span class="n sc">{r.film?.rt == null ? '–' : `${r.film.rt}%`}</span>
            <span class="n sc">{r.film?.runtime ? `${r.film.runtime}m` : '–'}</span>
            <span class="n sc faint">{fmtAdded(r.addedAt)}</span>
            <button class="wl-x" onclick={() => remove(r.id)} aria-label={`Remove ${r.title ?? 'film'} from your watchlist`} title="Remove" data-testid="row-remove">
              <svg class="icon" aria-hidden="true"><use href={icon('close')}></use></svg>
            </button>
          </div>
        {/each}
      </div>
    {/if}
  {/if}

  {#if undo}
    <div class="wl-toast" role="status" data-testid="watchlist-undo">
      Removed <b>{undo.title ?? 'a film'}</b> from your watchlist <button onclick={restore}>Undo</button>
    </div>
  {/if}
</div>

<style>
  .wl-bar { display: flex; flex-wrap: wrap; gap: 0.8rem 1rem; align-items: center; margin-bottom: 1.4rem; }
  .wl-count { font-size: 0.86rem; color: var(--ink-muted); }
  .wl-spacer { flex: 1; }
  .wl-bar .btn { display: inline-flex; align-items: center; gap: 0.45em; text-decoration: none; }
  .wl-bar .btn .icon { width: 15px; height: 15px; }
  .wl-view button { display: inline-flex; align-items: center; padding: 0.4em 0.7em; }
  .wl-view .icon { width: 16px; height: 16px; }
  .wl-empty { text-align: center; padding: 2.4rem 1rem; }
  .wl-empty > .icon { width: 34px; height: 34px; color: var(--ink-faint); margin: 0 auto; }
  .wl-empty h3 { margin-top: 0.6rem; }
  .wl-empty p { max-width: 420px; margin: 0.4rem auto 0; }
  .wl-empty p + p { margin-top: 1rem; }
  .wl-gone .btn { margin-top: 0.4rem; }
  .wl-skel .fc-poster { box-shadow: none; }

  .wl-list { border-top: 1px solid var(--border-strong); }
  .wl-row { display: grid; grid-template-columns: 46px minmax(0, 1fr) repeat(4, 64px) 104px 34px; gap: 1rem; align-items: center; padding: 0.55rem 0.2rem; border-bottom: 1px solid var(--border); }
  .wl-head { font-size: 0.68rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-faint); padding: 0.45rem 0.2rem; }
  .wl-row img, .wl-thumb { width: 46px; height: 69px; object-fit: cover; border-radius: 3px; border: 1px solid var(--border); background: var(--bg-raised); }
  .wl-film { min-width: 0; display: flex; flex-direction: column; }
  .wl-t { font-family: var(--font-display); font-size: 1.1rem; line-height: 1.2; text-decoration: none; color: var(--ink); }
  a.wl-t:hover { color: var(--accent); }
  .wl-s { font-size: 0.76rem; color: var(--ink-faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .wl-phone { display: none; }
  .n { font-family: var(--font-mono); font-size: 0.82rem; text-align: right; }
  .wl-head .n { font-family: var(--font-ui); font-size: 0.68rem; }
  .n.my { color: var(--accent); }
  .wl-x { width: 32px; height: 32px; border-radius: 50%; border: 1px solid transparent; background: none; color: var(--ink-faint); display: flex; align-items: center; justify-content: center; padding: 0; }
  .wl-x:hover, .wl-x:focus-visible { border-color: var(--border-strong); color: var(--ink); }
  .wl-x .icon { width: 14px; height: 14px; }

  .wl-toast { position: fixed; left: 50%; bottom: calc(1.2rem + env(safe-area-inset-bottom)); transform: translateX(-50%); z-index: 60;
    display: flex; gap: 0.8rem; align-items: center; font-size: 0.86rem; padding: 0.6rem 1rem; max-width: calc(100vw - 2rem);
    border: 1px solid var(--border-strong); border-radius: var(--radius); background: var(--bg-raised); box-shadow: 0 8px 24px rgb(0 0 0 / 0.3);
    animation: wl-toast-in 0.25s var(--ease-out); }
  .wl-toast button { background: none; border: 0; color: var(--accent); font-weight: 600; padding: 0; }
  @keyframes wl-toast-in { from { opacity: 0; transform: translate(-50%, 8px); } }
  @media (prefers-reduced-motion: reduce) { .wl-toast { animation: none; } }

  /* Phones: titles and posters only, no score ledgers or columns. */
  @media (max-width: 640px) {
    .watchlist :global(.fc-ledger) { display: none; }
    .wl-bar .seg:not(.wl-view) { order: 5; }
    .wl-row { grid-template-columns: 40px minmax(0, 1fr) 32px; gap: 0.7rem; }
    .wl-row img, .wl-thumb { width: 40px; height: 60px; }
    .sc, .wl-head { display: none; }
    .wl-phone { display: inline; }
    .wl-toast { bottom: calc(var(--tabbar-h) + 0.8rem + env(safe-area-inset-bottom)); }
  }
</style>

<script>
  import { untrack } from 'svelte';
  import { fmtScore } from '../../shared/rating-meta.mjs';
  import { tmdbImg, withBase, fmtRuntime } from '../lib/util.js';
  import { loadArchive, loadPosters, loadRatedFilms, loadFilms } from '../lib/archive.js';
  import { listWatchlist, inWatchlist, toggleWatchlist, onWatchlistChange } from '../lib/watchlist.js';
  import { filterPool, pickFilm, VOTE_FLOOR } from '../lib/tonight.js';
  import RangePair from './RangePair.svelte';

  // Bounds and menus are known at build time.
  let { genres = [], yearMin = 1900, yearMax = new Date().getFullYear(), counts = {} } = $props();
  const LENGTH_MIN = 40;
  const LENGTH_MAX = 240;

  const SOURCES = [
    { id: 'drx', label: "Dr. X's films", note: () => `${(counts.drx ?? 0).toLocaleString()} rated` },
    { id: 'archive', label: 'The archive', note: () => `${(counts.archive ?? 0).toLocaleString()} with ${VOTE_FLOOR / 1000}k+ IMDb votes` },
    { id: 'watchlist', label: 'Your watchlist', note: () => `${watchIds.size} film${watchIds.size === 1 ? '' : 's'}` },
  ];

  const params = new URLSearchParams(location.search);
  let source = $state(SOURCES.some((s) => s.id === params.get('src')) ? params.get('src') : 'drx');
  let lengthMin = $state(null);
  let lengthMax = $state(null);
  let yearFrom = $state(null);
  let yearTo = $state(null);
  let genre = $state('');
  let minScore = $state('');

  let watchIds = $state(new Set(listWatchlist().map((i) => i.id)));
  $effect(() => onWatchlistChange(() => (watchIds = new Set(listWatchlist().map((i) => i.id)))));

  // Each source's films, loaded on first use: Dr. X's from the small
  // rated-films file, the archive in full, the watchlist from card shards.
  let lists = $state.raw({ drx: null, archive: null, watchlist: null }); // raw: thousands of films, no deep proxies
  const LOADERS = {
    drx: () => loadRatedFilms(),
    archive: () => loadArchive({ scores: true, rated: true }).then((a) => a.list),
    watchlist: () => loadFilms([...watchIds]).then((m) => [...m.values()].filter(Boolean)),
  };
  function ensure(src) {
    return lists[src] ? Promise.resolve(lists[src]) : LOADERS[src]().then((list) => ((lists = { ...lists, [src]: list }), list));
  }
  const ready = $derived(lists[source] != null);
  let loadError = $state('');
  let pick = $state(null);
  let poster = $state(null);
  let seen = new Set();
  let seenCount = $state(0);
  let cycled = $state(false);
  let saved = $state(false);
  let copied = $state(false);
  let dealKey = $state(0);

  const pool = $derived(
    lists[source]
      ? filterPool(lists[source], {
          source,
          watchIds,
          lengthMin,
          lengthMax,
          yearMin: yearFrom,
          yearMax: yearTo,
          genre: genre || null,
          minScore: minScore === '' ? null : Number(minScore),
        })
      : []
  );
  const scoreLabel = $derived(source === 'drx' ? 'Dr. X at least' : 'IMDb at least');

  // First view: a shared ?pick= link shows its film, otherwise deal one.
  const sharedId = Number(params.get('pick')) || null;
  let started = false;
  ensure(source)
    .then(async (list) => {
      const shared = sharedId && (list.find((m) => m.id === sharedId) ?? (await loadFilms([sharedId])).get(sharedId));
      started = true;
      if (shared) show(shared);
      else another();
    })
    .catch((err) => (loadError = err.message));

  // A new filter set or source starts a fresh round of "no repeats" and
  // deals a new pick.
  $effect(() => {
    void [source, lengthMin, lengthMax, yearFrom, yearTo, genre, minScore];
    untrack(() => {
      if (!started) return;
      seen = new Set();
      seenCount = 0;
      ensure(source)
        .then(another)
        .catch((err) => (loadError = err.message));
    });
  });

  // Films added to the watchlist elsewhere join that source's pool.
  $effect(() => {
    const ids = watchIds;
    untrack(() => {
      if (lists.watchlist && [...ids].some((id) => !lists.watchlist.some((m) => m.id === id))) {
        LOADERS.watchlist().then((list) => (lists = { ...lists, watchlist: list }));
      }
    });
  });

  function show(film) {
    pick = film;
    poster = film.poster ?? null;
    seen.add(film.id);
    seenCount = seen.size;
    saved = inWatchlist(film.id);
    copied = false;
    dealKey++;
    const url = new URL(location.href);
    url.searchParams.set('pick', film.id);
    url.searchParams.set('src', source);
    history.replaceState(null, '', url);
    if (!film.poster) loadPosters([film.id]).then((m) => pick?.id === film.id && (poster = m.get(film.id))).catch(() => {});
  }

  function another() {
    if (!lists[source]) return;
    cycled = false;
    let next = pickFilm(pool, source, seen);
    if (!next && pool.length) {
      // Every match has been shown: start the round again.
      seen = new Set(pick ? [pick.id] : []);
      next = pickFilm(pool, source, seen) ?? pool[0];
      cycled = true;
    }
    if (next) show(next);
    else pick = null;
  }

  $effect(() => {
    if (!pick) return;
    const id = pick.id;
    return onWatchlistChange(() => (saved = inWatchlist(id)));
  });

  async function copyLink() {
    const url = new URL(withBase('/tonight'), location.origin);
    url.searchParams.set('pick', pick.id);
    url.searchParams.set('src', source);
    try {
      await navigator.clipboard.writeText(url.href);
      copied = true;
    } catch {
      prompt('Copy this link', url.href);
    }
  }

  const directorNames = (f) => f.directors.slice(0, 2).map((d) => d.name).join(', ');
  const icon = (name) => `${withBase('/icons.svg')}#i-${name}`;
</script>

<div class="tn">
  <div class="tn-ctrl panel" data-testid="tonight-controls">
    <div>
      <span class="tn-lbl" id="tn-src">Pick from</span>
      <div class="tn-src" role="radiogroup" aria-labelledby="tn-src">
        {#each SOURCES as s}
          <button role="radio" aria-checked={source === s.id} class:on={source === s.id} onclick={() => (source = s.id)} data-testid={`src-${s.id}`}>
            <b>{s.label}</b><span>{s.note()}</span>
          </button>
        {/each}
      </div>
    </div>
    <RangePair label="Length" min={LENGTH_MIN} max={LENGTH_MAX} unit=" min" anyText="Any length" bind:lo={lengthMin} bind:hi={lengthMax} testid="length" />
    <RangePair label="Year" min={yearMin} max={yearMax} anyText="Any year" bind:lo={yearFrom} bind:hi={yearTo} testid="year" />
    <div class="tn-sel">
      <label><span class="tn-lbl">Genre</span>
        <select bind:value={genre} data-testid="genre"><option value="">Any genre</option>{#each genres as g}<option value={g}>{g}</option>{/each}</select>
      </label>
      <label><span class="tn-lbl">{scoreLabel}</span>
        <select bind:value={minScore} data-testid="min-score">
          <option value="">Any score</option>{#each [5, 6, 7, 7.5, 8, 8.5, 9] as n}<option value={String(n)}>{n}</option>{/each}
        </select>
      </label>
    </div>
    <span class="small faint" data-testid="tonight-count">
      {ready ? `${pool.length.toLocaleString()} film${pool.length === 1 ? '' : 's'} match` : 'Loading films…'}
    </span>
  </div>

  <div class="tn-stage">
    {#if loadError}
      <p class="muted">{loadError}</p>
    {:else if !ready && !pick}
      <div class="tn-ticket tn-wait" aria-hidden="true"></div>
    {:else if !pick}
      <div class="panel tn-none" data-testid="tonight-empty">
        <h3>Nothing matches</h3>
        <p class="muted small">
          {source === 'watchlist' && watchIds.size === 0
            ? 'Your watchlist is empty. Add films with the bookmark on any film page or poster.'
            : 'Loosen a limit or pick another source.'}
        </p>
      </div>
    {:else}
      {#key dealKey}
        <article class="tn-ticket" data-testid="tonight-pick" data-id={pick.id}>
          <a class="tn-stub" href={withBase(`/movie/${pick.slug}`)} tabindex="-1" aria-hidden="true">
            {#if poster}<img src={tmdbImg(poster, 'w342')} alt="" width="342" height="513" />{:else}<span class="no-poster">{pick.title}</span>{/if}
          </a>
          <div class="tn-body">
            <span class="tn-kicker">Admit one · tonight</span>
            <h2><a href={withBase(`/movie/${pick.slug}`)}>{pick.title}</a></h2>
            <div class="tn-sub">
              {[pick.year, directorNames(pick), fmtRuntime(pick.runtime), pick.genres.slice(0, 3).join(', ')].filter(Boolean).join(' · ')}
            </div>
            <div class="fc-ledger tn-ledger">
              <div><span class="k">Dr. X</span><span class="dots"></span><span class="v">{fmtScore(pick.my)}</span></div>
              <div><span class="k">IMDb</span><span class="dots"></span><span class="v">{fmtScore(pick.imdb)}</span></div>
              <div><span class="k">Rotten Tomatoes</span><span class="dots"></span><span class="v">{pick.rt == null ? '–' : `${pick.rt}%`}</span></div>
              <div><span class="k">Metacritic</span><span class="dots"></span><span class="v">{fmtScore(pick.metacritic)}</span></div>
            </div>
            <div class="tn-acts">
              <button class="btn primary" onclick={another} disabled={!pool.length} data-testid="tonight-another">
                <svg class="icon" aria-hidden="true"><use href={icon('dice')}></use></svg>Another
              </button>
              <a class="btn" href={withBase(`/movie/${pick.slug}`)}>Open film</a>
              <button class="btn" aria-pressed={saved} onclick={() => (saved = toggleWatchlist(pick.id, pick.title))} title={saved ? 'Remove from watchlist' : 'Add to watchlist'} data-testid="tonight-watch">
                <svg class="icon" aria-hidden="true"><use href={icon(saved ? 'bookmarked' : 'bookmark')}></use></svg><span class="tn-lb">{saved ? 'On your watchlist' : 'Watchlist'}</span>
              </button>
              <button class="btn" onclick={copyLink} title="Copy a link to this pick">
                <svg class="icon" aria-hidden="true"><use href={icon('link')}></use></svg><span class="tn-lb">{copied ? 'Link copied' : 'Copy link'}</span>
              </button>
            </div>
            <div class="tn-seen" data-testid="tonight-seen">
              {cycled ? "That's every match; starting the round again. " : ''}{seenCount} seen this visit · {pool.length.toLocaleString()} matching
            </div>
          </div>
        </article>
      {/key}
    {/if}
  </div>
</div>

<style>
  .tn { display: grid; grid-template-columns: 330px minmax(0, 1fr); gap: 1.5rem; align-items: start; }
  .tn-ctrl { display: flex; flex-direction: column; gap: 1.2rem; }
  .tn-lbl { font-size: 0.68rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-faint); margin-bottom: 0.4rem; display: block; }
  .tn-src { display: grid; gap: 0.5rem; }
  .tn-src button { text-align: left; padding: 0.6rem 0.85rem; border-radius: var(--radius); border: 1px solid var(--border-strong); background: var(--bg-raised); color: var(--ink); }
  .tn-src button:hover { border-color: var(--accent); }
  .tn-src b { display: block; font-family: var(--font-display); font-weight: 560; font-size: 1.06rem; }
  .tn-src span { font-size: 0.75rem; color: var(--ink-faint); }
  .tn-src .on { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
  .tn-src .on b { color: var(--accent); }
  .tn-sel { display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; }
  .tn-sel select { width: 100%; }

  .tn-ticket { display: grid; grid-template-columns: 230px minmax(0, 1fr); border: 1px solid var(--border-strong); border-radius: 10px; background: var(--bg-panel); overflow: hidden;
    animation: tn-deal 0.45s var(--ease-out) both; }
  .tn-wait { min-height: 345px; animation: none; background: var(--bg-panel); }
  .tn-stub { position: relative; display: block; background: var(--bg-raised); aspect-ratio: 2 / 3; }
  .tn-stub img { width: 100%; height: 100%; object-fit: cover; }
  .tn-stub .no-poster { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 1rem; text-align: center; font-family: var(--font-display); color: var(--ink-muted); }
  /* The perforation between stub and body, with punched notches. */
  .tn-body { position: relative; padding: 1.4rem 1.6rem 1.3rem; border-left: 2px dashed var(--border-strong); display: flex; flex-direction: column; min-width: 0; }
  .tn-body::before, .tn-body::after { content: ''; position: absolute; left: -11px; width: 20px; height: 20px; border-radius: 50%; background: var(--bg); border: 1px solid var(--border-strong); }
  .tn-body::before { top: -11px; }
  .tn-body::after { bottom: -11px; }
  .tn-kicker { font: 600 0.7rem/1 var(--font-ui); letter-spacing: 0.16em; text-transform: uppercase; color: var(--accent); }
  .tn-body h2 { font-size: clamp(1.6rem, 3.4vw, 2.4rem); margin: 0.5rem 0 0.15rem; }
  .tn-body h2 a { text-decoration: none; }
  .tn-body h2 a:hover { color: var(--accent); }
  .tn-sub { font-size: 0.86rem; color: var(--ink-muted); }
  .tn-ledger { max-width: 340px; font-size: 0.84rem; margin-top: 1rem; }
  .tn-acts { display: flex; gap: 0.6rem; flex-wrap: wrap; margin-top: auto; padding-top: 1.3rem; }
  .tn-acts .btn { display: inline-flex; align-items: center; gap: 0.45em; text-decoration: none; }
  .tn-acts .btn .icon { width: 15px; height: 15px; }
  .tn-acts .btn[aria-pressed='true'] { color: var(--accent); border-color: var(--accent); }
  .tn-acts .btn:disabled { opacity: 0.5; cursor: default; }
  .tn-seen { font-size: 0.74rem; color: var(--ink-faint); margin-top: 0.8rem; }
  .tn-none h3 { margin-bottom: 0.3rem; }
  @keyframes tn-deal { from { opacity: 0; transform: translateY(10px) scale(0.985); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .tn-ticket { animation: none; } }

  @media (max-width: 900px) {
    .tn { grid-template-columns: 1fr; }
    .tn-src { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .tn-stage { order: -1; }
  }
  @media (max-width: 640px) {
    .tn-src button { padding: 0.5rem 0.55rem; }
    .tn-src b { font-size: 0.92rem; }
    .tn-src span { display: none; }
    /* The ticket sits above the controls here: one fixed height (text is clamped)
       for the ticket and its placeholder, so loading and re-dealing never move them. */
    .tn-ticket { grid-template-columns: 112px minmax(0, 1fr); height: 392px; }
    .tn-wait { height: 392px; min-height: 0; }
    .tn-stub { aspect-ratio: auto; }
    .tn-stub img { aspect-ratio: 2 / 3; height: auto; }
    .tn-body { padding: 1rem 0.9rem; }
    .tn-body h2, .tn-sub { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .tn-seen { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .tn-ledger { font-size: 0.76rem; }
    .tn-acts { gap: 0.4rem; }
    .tn-acts .btn { padding: 0.42em 0.7em; }
    .tn-lb { display: none; }
  }
</style>

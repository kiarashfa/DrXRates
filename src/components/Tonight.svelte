<script>
  import { untrack } from 'svelte';
  import { fmtScore } from '../../shared/rating-meta.mjs';
  import { tmdbImg, withBase, fmtRuntime } from '../lib/util.js';
  import { loadArchive, loadPosters, loadRatedFilms, loadFilms, loadOverview } from '../lib/archive.js';
  import { listWatchlist, inWatchlist, toggleWatchlist, onWatchlistChange } from '../lib/watchlist.js';
  import { filterPool, pickFilm, VOTE_FLOOR } from '../lib/tonight.js';
  import RangePair from './RangePair.svelte';

  // Bounds and menus are known at build time.
  let { genres = [], yearMin = 1900, yearMax = new Date().getFullYear(), counts = {} } = $props();
  const LENGTH_MIN = 40;
  const LENGTH_MAX = 240;

  const SOURCES = [
    { id: 'drx', label: "Dr. X's films", short: 'Dr. X', note: () => `${(counts.drx ?? 0).toLocaleString()} rated` },
    { id: 'archive', label: 'The archive', short: 'Archive', note: () => `${(counts.archive ?? 0).toLocaleString()} with ${VOTE_FLOOR / 1000}k+ IMDb votes` },
    { id: 'watchlist', label: 'Your watchlist', short: 'Watchlist', note: () => `${watchIds.size} film${watchIds.size === 1 ? '' : 's'}` },
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
  let overview = $state('');
  let dealtAt = $state(new Date());
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
    overview = '';
    dealtAt = new Date();
    loadOverview(film.id).then((text) => pick?.id === film.id && (overview = text));
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
          <button role="radio" aria-checked={source === s.id} class:on={source === s.id} title={s.label} onclick={() => (source = s.id)} data-testid={`src-${s.id}`}>{s.short}</button>
        {/each}
      </div>
      <span class="tn-srcnote">{SOURCES.find((s) => s.id === source).note()}</span>
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
          <div class="tn-main">
            <a class="tn-stub" href={withBase(`/movie/${pick.slug}`)} tabindex="-1" aria-hidden="true">
              {#if poster}<img src={tmdbImg(poster, 'w342')} alt="" width="342" height="513" />{:else}<span class="no-poster">{pick.title}</span>{/if}
            </a>
            <div class="tn-body">
              <span class="tn-kicker">Tonight's feature</span>
              <h2><a href={withBase(`/movie/${pick.slug}`)}>{pick.title}</a></h2>
              <div class="tn-sub">
                {[pick.year, directorNames(pick), fmtRuntime(pick.runtime), pick.genres.slice(0, 3).join(', ')].filter(Boolean).join(' · ')}
              </div>
              <p class="tn-plot" data-testid="tonight-plot">{overview}</p>
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
                <a class="btn tn-open" href={withBase(`/movie/${pick.slug}`)}>Open film</a>
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
          </div>
          <div class="tn-tear" aria-hidden="true">
            <span class="tn-vert">Admit one</span>
            <div class="tn-num" data-testid="tonight-stamp">{dealtAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}<small>{dealtAt.toLocaleDateString([], { day: 'numeric', month: 'short' })}</small></div>
            <div class="tn-bars"></div>
          </div>
        </article>
      {/key}
    {/if}
  </div>
</div>

<style>
  /* Controls and ticket share one height: the ticket never gets shorter than
     450px and stretches with the controls panel. */
  .tn { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 1.5rem; align-items: stretch; }
  .tn-ctrl { display: flex; flex-direction: column; justify-content: space-between; gap: 1rem; }
  .tn-lbl { font-size: 0.68rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-faint); margin-bottom: 0.4rem; display: block; }
  .tn-src { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border: 1px solid var(--border-strong); border-radius: var(--radius); overflow: hidden; }
  .tn-src button { padding: 0.5em 0.3em; border: 0; border-left: 1px solid var(--border-strong); background: transparent; color: var(--ink-muted); font-size: 0.84rem; }
  .tn-src button:first-child { border-left: 0; }
  .tn-src button:hover { color: var(--ink); }
  .tn-src .on { background: var(--accent); color: var(--bg); font-weight: 600; }
  .tn-srcnote { display: block; min-height: 1.2em; margin-top: 0.4rem; font-size: 0.75rem; color: var(--ink-faint); }
  .tn-sel { display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; }
  .tn-sel select { width: 100%; }

  .tn-stage { display: flex; flex-direction: column; min-width: 0; }
  /* The ticket: the film on the left, a tear-off stub on the right. */
  .tn-ticket { display: grid; grid-template-columns: minmax(0, 1fr) 150px; min-height: 450px; flex: 1; border: 1px solid var(--border-strong); border-radius: 10px; background: var(--bg-panel); overflow: hidden;
    box-shadow: 0 10px 26px rgb(0 0 0 / 0.18); animation: tn-deal 0.45s var(--ease-out) both; }
  .tn-wait { animation: none; box-shadow: none; }
  .tn-main { display: grid; grid-template-columns: clamp(160px, 30%, 270px) minmax(0, 1fr); gap: 1.6rem; padding: 1.5rem; min-width: 0; }
  .tn-stub { position: relative; display: block; border-radius: 4px; overflow: hidden; border: 1px solid var(--border); background: var(--bg-raised); box-shadow: 0 6px 14px rgb(0 0 0 / 0.28); }
  .tn-stub img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .tn-stub .no-poster { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 1rem; text-align: center; font-family: var(--font-display); color: var(--ink-muted); }
  .tn-body { display: flex; flex-direction: column; min-width: 0; container-type: inline-size; }
  .tn-kicker { font: 600 0.7rem/1 var(--font-ui); letter-spacing: 0.18em; text-transform: uppercase; color: var(--accent); }
  .tn-body h2 { font-size: clamp(1.6rem, 3.4vw, 2.4rem); margin: 0.5rem 0 0.15rem; }
  .tn-body h2, .tn-sub { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .tn-body h2 a { text-decoration: none; }
  .tn-body h2 a:hover { color: var(--accent); }
  .tn-sub { font-size: 0.86rem; color: var(--ink-muted); }
  /* The synopsis and the scores follow each other directly; any spare height collects above the buttons. */
  .tn-plot { margin: 0.8rem 0 0; max-width: 72ch; font-size: 0.95rem; line-height: 1.55; color: var(--ink-muted); display: -webkit-box; -webkit-line-clamp: 6; -webkit-box-orient: vertical; overflow: hidden; }
  .tn-plot:empty { display: none; }
  .tn-ledger { font-size: 0.84rem; margin-top: 1rem; display: grid; grid-template-columns: 1fr 1fr; gap: 0 1.8rem; max-width: 460px; }
  @container (min-width: 720px) { .tn-ledger { grid-template-columns: repeat(4, auto); max-width: none; } }
  .tn-acts { display: flex; gap: 0.6rem; flex-wrap: wrap; margin-top: auto; padding-top: 1.1rem; }
  .tn-acts .btn { display: inline-flex; align-items: center; gap: 0.45em; text-decoration: none; }
  .tn-acts .btn .icon { width: 15px; height: 15px; }
  .tn-acts .btn[aria-pressed='true'] { color: var(--accent); border-color: var(--accent); }
  .tn-acts .btn:disabled { opacity: 0.5; cursor: default; }
  .tn-seen { font-size: 0.74rem; color: var(--ink-faint); margin-top: 0.8rem; }

  /* The tear-off stub, with punched notches at both ends of the perforation. */
  .tn-tear { position: relative; border-left: 2.5px dotted var(--border-strong); display: flex; flex-direction: column; align-items: center; justify-content: space-between; padding: 1.5rem 0.6rem;
    background: color-mix(in srgb, var(--accent) 7%, transparent); }
  .tn-tear::before, .tn-tear::after { content: ''; position: absolute; left: -13px; width: 22px; height: 22px; border-radius: 50%; background: var(--bg); border: 1px solid var(--border-strong); }
  .tn-tear::before { top: -12px; }
  .tn-tear::after { bottom: -12px; }
  .tn-vert { writing-mode: vertical-rl; transform: rotate(180deg); font: 700 0.95rem var(--font-ui); letter-spacing: 0.42em; text-transform: uppercase; color: var(--accent); }
  .tn-num { font-family: var(--font-numeral); font-size: 1.9rem; white-space: nowrap; line-height: 1; color: var(--accent); font-weight: 600; text-align: center; }
  .tn-num small { display: block; font: 0.62rem var(--font-ui); letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-faint); margin-top: 0.3rem; }
  .tn-bars { width: 52px; height: 90px; opacity: 0.8; background: repeating-linear-gradient(0deg, var(--ink) 0 2px, transparent 2px 4px, var(--ink) 4px 5px, transparent 5px 9px, var(--ink) 9px 12px, transparent 12px 14px); }

  .tn-none h3 { margin-bottom: 0.3rem; }
  @keyframes tn-deal { from { opacity: 0; transform: translateY(10px) scale(0.985); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .tn-ticket { animation: none; } }

  @media (min-width: 901px) and (max-width: 1099px) {
    .tn-ledger { grid-template-columns: 1fr; }
    .tn-ticket { grid-template-columns: minmax(0, 1fr) 110px; }
  }
  @media (max-width: 900px) {
    .tn { grid-template-columns: 1fr; }
    .tn-stage { order: -1; }
  }
  @media (max-width: 640px) {
    /* The ticket sits above the controls here: a fixed height (text is clamped)
       for the ticket and its placeholder, so loading and re-dealing never move them.
       The poster and the title block share the first rows; scores and buttons use the full width below. */
    .tn-ticket { grid-template-columns: minmax(0, 1fr) 56px; height: 340px; min-height: 0; flex: none; }
    .tn-main { grid-template-columns: 104px minmax(0, 1fr); grid-template-rows: auto auto auto auto 1fr auto; gap: 0 0.9rem; padding: 0.9rem; }
    .tn-body { display: contents; container-type: normal; }
    .tn-stub { grid-column: 1; grid-row: 1 / span 3; align-self: start; aspect-ratio: 2 / 3; }
    .tn-kicker, .tn-body h2, .tn-sub { grid-column: 2; align-self: start; }
    .tn-plot, .tn-acts .tn-open { display: none; }
    .tn-ledger { grid-column: 1 / -1; grid-row: 4; grid-template-columns: 1fr 1fr; gap: 0 1.2rem; font-size: 0.8rem; margin-top: 0.9rem; max-width: none; }
    .tn-acts { grid-column: 1 / -1; grid-row: 5; align-self: end; margin-top: 0; padding-top: 0.8rem; gap: 0.5rem; }
    .tn-lb { display: none; }
    .tn-seen { grid-column: 1 / -1; grid-row: 6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .tn-tear { padding: 1rem 0.3rem; }
    .tn-num, .tn-bars { display: none; }
    .tn-vert { font-size: 0.72rem; }
  }
</style>

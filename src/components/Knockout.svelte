<script>
  // /knockout: the draw desk (pool, rank, size, draw), the published cups and
  // the visitor's brackets; then the bracket itself in KnockoutPlayer. The
  // bracket in progress lives in cinema.knockout.v1 and resumes on return; a
  // #k1… link opens a shared bracket.
  import { loadArchive, loadFilms, loadRatedFilms, loadPosters } from '../lib/archive.js';
  import { listWatchlist } from '../lib/watchlist.js';
  import { loadStore } from '../lib/visitor.js';
  import { computeTotals } from '../../shared/rating-meta.mjs';
  import { movieSlug } from '../../shared/slug.mjs';
  import { tmdbImg, withBase } from '../lib/util.js';
  import {
    RANKS, filterPool, rankPool, availableSizes, drawSlots, bracketRounds, nextMatch, roundName,
    encodeShare, parseShare, decodePicks, SIZES, CUP_FORMAT,
  } from '../lib/knockout.js';
  import { knockoutStore, saveCurrent, addHistory } from '../lib/knockout-store.js';
  import RangePair from './RangePair.svelte';
  import KnockoutPlayer from './KnockoutPlayer.svelte';

  let { genres = [], yearMin = 1900, yearMax = new Date().getFullYear(), counts = {}, collections = [], cups = [] } = $props();

  const VOTE_FLOOR = 25000; // the archive's default minimum IMDb votes
  const LIST_LIMIT = 60; // more ids than this load the whole archive instead of card shards

  const visitorScores = new Map(Object.entries(loadStore().ratings).map(([id, r]) => [Number(id), computeTotals(r.scores).overall]));
  const watchIds = listWatchlist().map((i) => i.id);

  const SOURCES = [
    { id: 'drx', label: "Dr. X's films", note: `${(counts.drx ?? 0).toLocaleString()} rated` },
    { id: 'archive', label: 'The archive', note: `${(counts.archive ?? 0).toLocaleString()} films` },
    { id: 'yours', label: 'Your ratings', note: `${visitorScores.size} rated` },
    { id: 'watchlist', label: 'Watchlist', note: `${watchIds.length} film${watchIds.length === 1 ? '' : 's'}` },
  ];

  let store = $state(knockoutStore());
  let current = $state(store.current);
  let mode = $state(store.current ? 'play' : 'desk');
  let notice = $state('');
  let pendingShared = $state(null);

  // ---- Draw desk ----
  let source = $state('drx');
  let yearFrom = $state(null);
  let yearTo = $state(null);
  let genre = $state('');
  let director = $state('');
  let collection = $state('');
  let rankBy = $state('imdb');
  let minVotes = $state('');
  let size = $state(32);
  let seeding = $state('seeded');

  async function idsList(ids) {
    if (!ids.length) return [];
    if (ids.length <= LIST_LIMIT) return [...(await loadFilms(ids)).values()].filter(Boolean);
    const a = await loadArchive({ scores: true, rated: true });
    return ids.map((id) => a.byId.get(id)).filter(Boolean);
  }
  const LOADERS = {
    drx: () => loadRatedFilms(),
    archive: () => loadArchive({ scores: true, rated: true }).then((a) => a.list),
    yours: () => idsList([...visitorScores.keys()]),
    watchlist: () => idsList(watchIds),
  };
  let lists = $state.raw({}); // raw: up to the whole archive, no deep proxies
  let loadError = $state('');
  function ensure(src) {
    if (lists[src]) return;
    LOADERS[src]()
      .then((list) => {
        for (const m of list) m.visitor = visitorScores.get(m.id) ?? null;
        lists = { ...lists, [src]: list };
      })
      .catch((err) => (loadError = err.message));
  }
  $effect(() => {
    if (mode === 'desk') ensure(source);
  });

  function setSource(id) {
    source = id;
    minVotes = id === 'archive' ? VOTE_FLOOR : '';
  }

  const collectionIds = $derived(collection ? new Set(collections.find((c) => c.slug === collection)?.ids ?? []) : null);
  const ready = $derived(lists[source] != null);
  const pool = $derived(
    ready
      ? rankPool(
          filterPool(lists[source], {
            rankBy,
            yearMin: yearFrom,
            yearMax: yearTo,
            genre: genre || null,
            director,
            collection: collectionIds,
            minVotes: Number(minVotes) || null,
          }),
          rankBy
        )
      : []
  );
  const sizes = $derived(availableSizes(pool.length));
  const drawSize = $derived(sizes.includes(size) ? size : (sizes.filter((s) => s <= size).at(-1) ?? sizes.at(-1) ?? null));

  const summary = $derived(
    [
      SOURCES.find((s) => s.id === source).label,
      yearFrom != null || yearTo != null ? `${yearFrom ?? yearMin}–${yearTo ?? yearMax}` : null,
      genre || null,
      director.trim() || null,
      collection ? collections.find((c) => c.slug === collection)?.title : null,
      `by ${RANKS[rankBy].label}`,
    ]
      .filter(Boolean)
      .join(' · ')
  );

  const compact = (m, seed) => ({
    id: m.id,
    slug: m.slug ?? movieSlug(m.title, m.year, m.id),
    title: m.title,
    year: m.year ?? null,
    seed,
    directors: (m.directors ?? []).slice(0, 2).map((d) => (typeof d === 'string' ? d : d.name)),
    poster: m.poster ?? null,
    my: m.my ?? null,
    imdb: m.imdb ?? null,
    tmdb: m.tmdb ?? null,
    rt: m.rt ?? null,
    metacritic: m.metacritic ?? null,
  });

  function start() {
    if (!drawSize) return;
    const seed = (Math.random() * 2 ** 32) >>> 0;
    const films = Object.fromEntries(pool.slice(0, drawSize).map((m, i) => [m.id, compact(m, i + 1)]));
    begin({ label: summary, size: drawSize, rankBy, seeding, seed, slots: drawSlots(pool, drawSize, seeding, seed), picks: [], films, startedAt: new Date().toISOString() });
  }

  function begin(bracket) {
    current = bracket;
    saveCurrent($state.snapshot(bracket));
    mode = 'play';
    exportOpen = false;
    scrollTo({ top: 0 });
  }

  // ---- Playing ----
  function onchange(picks) {
    current.picks = picks;
    delete current.finishedAt;
    saveCurrent($state.snapshot(current));
  }
  function onfinish(id) {
    const f = current.films[id];
    current.finishedAt = new Date().toISOString();
    saveCurrent($state.snapshot(current));
    addHistory({ champion: { id, title: f.title, year: f.year, poster: f.poster }, size: current.size, label: current.label, finishedAt: current.finishedAt });
    store = knockoutStore();
  }
  const shareUrl = (picks) => `${location.origin}${withBase('/knockout')}#${encodeShare({ slots: current.slots, picks })}`;

  const progress = (b) => {
    const next = nextMatch(bracketRounds(b.slots, b.picks));
    return next ? `${roundName(b.size >> next.round)}, match ${next.index + 1}` : 'Finished';
  };

  // ---- A shared bracket (#k1.…) ----
  async function openShared(share) {
    try {
      const list = await idsList(share.slots);
      const byId = new Map(list.map((m) => [m.id, m]));
      if (share.slots.some((id) => !byId.has(id))) throw new Error('Some films in this bracket are no longer in the archive.');
      const picks = decodePicks(share.slots, share.code);
      if (!picks) throw new Error("This link's picks don't fit its draw.");
      const films = Object.fromEntries(share.slots.map((id) => [id, compact(byId.get(id), null)]));
      const bracket = { label: 'Shared bracket', size: share.slots.length, rankBy: null, seeding: null, seed: null, slots: share.slots, picks, films, startedAt: new Date().toISOString() };
      if (bracket.picks.length === bracket.size - 1) bracket.finishedAt = bracket.startedAt;
      if (current && !current.finishedAt && current.slots.join() !== share.slots.join()) pendingShared = bracket;
      else begin(bracket);
    } catch (err) {
      notice = err.message;
    }
    history.replaceState(null, '', location.pathname + location.search);
  }
  const share = parseShare(location.hash);
  if (share?.kind === 'c') location.replace(`${withBase(`/knockout/cup/${share.cup}`)}${location.hash}`);
  else if (share?.kind === 'k') openShared(share);

  // ---- Bracket file (the format published cups use) ----
  let exportOpen = $state(false);
  let exportTitle = $state('');
  let exportDesc = $state('');
  let exporting = $state(false);
  const slugify = (s) =>
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'bracket';
  function openExport() {
    exportTitle ||= current.label;
    exportOpen = true;
  }
  async function downloadFile() {
    exporting = true;
    try {
      const b = $state.snapshot(current);
      const missing = b.slots.filter((id) => !b.films[id].poster);
      const posters = missing.length ? await loadPosters(missing) : new Map();
      const d = new Date();
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const title = exportTitle.trim() || b.label;
      const file = {
        format: CUP_FORMAT,
        slug: slugify(title),
        title,
        description: exportDesc.trim(),
        date,
        size: b.size,
        seeding: b.seeding,
        rankBy: b.rankBy,
        pool: b.label,
        entrants: b.slots.map((id, i) => {
          const { slug, ...f } = b.films[id];
          return { ...f, seed: f.seed ?? i + 1, poster: f.poster ?? posters.get(id) ?? null };
        }),
        picks: b.picks,
      };
      const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2) + '\n'], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${file.slug}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      exporting = false;
    }
  }

  const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const cupMonth = (date) => new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
</script>

{#if pendingShared}
  <div class="panel ko-banner" data-testid="ko-shared-banner">
    <span>This link holds a bracket. Opening it replaces your bracket in progress.</span>
    <button class="btn primary" onclick={() => (begin(pendingShared), (pendingShared = null))}>Open it</button>
    <button class="btn" onclick={() => (pendingShared = null)}>Keep mine</button>
  </div>
{/if}
{#if notice}<p class="muted small ko-notice" data-testid="ko-notice">{notice}</p>{/if}

{#if mode === 'play' && current}
  <div class="ko-playhead">
    <button class="btn" onclick={() => (mode = 'desk')} data-testid="ko-desk">← Draw desk</button>
    <span class="small muted">{current.label} · {current.size} films</span>
  </div>
  <KnockoutPlayer slots={current.slots} bind:picks={current.picks} films={current.films} kicker="Knockout" {shareUrl} {onchange} {onfinish}>
    {#snippet done()}
      <div class="ko-done">
        <button class="btn primary" onclick={() => (mode = 'desk')}>New bracket</button>
        <button class="btn" onclick={openExport} data-testid="ko-export">Download bracket file</button>
      </div>
      {#if exportOpen}
        <div class="ko-export">
          <label><span class="ko-lbl">Title</span><input type="text" bind:value={exportTitle} data-testid="ko-export-title" /></label>
          <label><span class="ko-lbl">Description</span><input type="text" bind:value={exportDesc} placeholder="One line about this bracket" /></label>
          <button class="btn" onclick={downloadFile} disabled={exporting} data-testid="ko-export-go">{exporting ? 'Preparing…' : `Download ${slugify(exportTitle || current.label)}.json`}</button>
          <span class="small faint">The whole bracket in one file: the draw, every film as it stands today and your picks.</span>
        </div>
      {/if}
    {/snippet}
  </KnockoutPlayer>
{:else}
  <div class="ko-desk">
    <div class="panel ko-ctrl" data-testid="ko-builder">
      <div>
        <span class="ko-lbl" id="ko-src">Films from</span>
        <div class="ko-src" role="radiogroup" aria-labelledby="ko-src">
          {#each SOURCES as s}
            <button role="radio" aria-checked={source === s.id} class:on={source === s.id} onclick={() => setSource(s.id)} data-testid={`ko-src-${s.id}`}>
              <b>{s.label}</b><span>{s.note}</span>
            </button>
          {/each}
        </div>
      </div>
      <RangePair label="Released" min={yearMin} max={yearMax} anyText="Any year" bind:lo={yearFrom} bind:hi={yearTo} testid="ko-year" />
      <div class="ko-two">
        <label><span class="ko-lbl">Genre</span>
          <select bind:value={genre}><option value="">Any genre</option>{#each genres as g}<option value={g}>{g}</option>{/each}</select>
        </label>
        <label><span class="ko-lbl">Collection</span>
          <select bind:value={collection}><option value="">Any</option>{#each collections as c}<option value={c.slug}>{c.title}</option>{/each}</select>
        </label>
      </div>
      <label><span class="ko-lbl">Director</span><input type="text" bind:value={director} placeholder="Any director" data-testid="ko-director" /></label>
      <div class="ko-two">
        <label><span class="ko-lbl">Rank by</span>
          <select bind:value={rankBy} data-testid="ko-rank">{#each Object.entries(RANKS) as [id, r]}<option value={id}>{r.label}</option>{/each}</select>
        </label>
        <label><span class="ko-lbl">Min. IMDb votes</span>
          <input type="number" inputmode="numeric" min="0" step="1000" bind:value={minVotes} placeholder="Any" data-testid="ko-votes" />
        </label>
      </div>
      <div>
        <span class="ko-lbl" id="ko-size">Bracket size</span>
        <div class="ko-sizes" role="radiogroup" aria-labelledby="ko-size">
          {#each SIZES as s}
            <button role="radio" aria-checked={drawSize === s} class:on={drawSize === s} disabled={!sizes.includes(s)} onclick={() => (size = s)} data-testid={`ko-size-${s}`}>{s}</button>
          {/each}
        </div>
        <p class="ko-pool" data-testid="ko-pool">
          {#if loadError}{loadError}
          {:else if !ready}Loading films…
          {:else if pool.length < SIZES[0]}Only <b>{pool.length}</b> film{pool.length === 1 ? '' : 's'} match; a bracket needs at least 8. Widen the years or drop a filter.
          {:else}<b>{pool.length.toLocaleString()}</b> film{pool.length === 1 ? '' : 's'} match; {pool.length === drawSize ? 'all' : `the top ${drawSize}`} by {RANKS[rankBy].label} play.
          {/if}
        </p>
      </div>
      <div>
        <span class="ko-lbl">Draw</span>
        <div class="seg" role="group" aria-label="Draw">
          <button class:active={seeding === 'seeded'} aria-pressed={seeding === 'seeded'} onclick={() => (seeding = 'seeded')}>Seeded</button>
          <button class:active={seeding === 'random'} aria-pressed={seeding === 'random'} onclick={() => (seeding = 'random')} data-testid="ko-random">Random</button>
        </div>
        <p class="small faint ko-note">{seeding === 'seeded' ? 'Seeded like a tennis draw: 1 meets the lowest seed first, and 1 and 2 can only meet in the final.' : 'A random draw: anyone can meet anyone in the first round.'}</p>
      </div>
      <button class="btn primary ko-start" onclick={start} disabled={!drawSize} data-testid="ko-start">Start the bracket</button>
      {#if current && !current.finishedAt}<span class="small faint">Starting a new bracket replaces the one in progress.</span>{/if}
    </div>

    <div class="panel-stack">
      {#if current}
        <div class="panel ko-resume" data-testid="ko-resume">
          <span class="ko-lbl">{current.finishedAt ? 'Your last bracket' : 'In progress'}</span>
          <b>{current.label} · {current.size}</b>
          <span class="small muted">{progress(current)}</span>
          <button class="btn" onclick={() => (mode = 'play')}>{current.finishedAt ? 'See it' : 'Resume'}</button>
        </div>
      {/if}
      {#each cups as cup}
        <div class="panel ko-cup" data-testid="ko-cup">
          <div class="ko-fan" aria-hidden="true">
            {#each cup.posters as p}{#if p}<img src={tmdbImg(p, 'w185')} alt="" width="185" height="278" loading="lazy" />{/if}{/each}
          </div>
          <div>
            <span class="ko-kicker">Dr. X's Cup</span>
            <h2>{cup.title}</h2>
            {#if cup.description}<p>{cup.description}</p>{/if}
            <div class="small faint ko-meta">{cup.size} films · {cup.seeding === 'random' ? 'random draw' : 'seeded'} · played {cupMonth(cup.date)}</div>
            <div class="ko-acts">
              <a class="btn primary" href={withBase(`/knockout/cup/${cup.slug}?play`)}>Play this cup</a>
              <a class="btn" href={withBase(`/knockout/cup/${cup.slug}`)}>Cup page</a>
            </div>
          </div>
        </div>
      {/each}
      <div class="panel ko-hist" data-testid="ko-history">
        <span class="ko-lbl">Your champions</span>
        {#if store.history.length}
          <ul>
            {#each store.history.slice(0, 8) as h}
              <li><b>{h.champion.title}</b><span class="small muted">{h.label}{h.size ? ` · ${h.size}` : ''}</span><span class="small faint">{fmtDate(h.finishedAt)}</span></li>
            {/each}
          </ul>
        {:else}
          <p class="small muted">Finished brackets appear here, kept in this browser.</p>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .ko-banner { display: flex; flex-wrap: wrap; gap: 0.8rem; align-items: center; margin-bottom: 1.2rem; }
  .ko-banner span { flex: 1 1 260px; }
  .ko-notice { margin: 0 0 1rem; }
  .ko-lbl { font-size: 0.68rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-faint); margin-bottom: 0.4rem; display: block; }
  .ko-kicker { font: 600 0.7rem/1 var(--font-ui); letter-spacing: 0.16em; text-transform: uppercase; color: var(--accent); }

  .ko-desk { display: grid; grid-template-columns: 340px minmax(0, 1fr); gap: 1.5rem; align-items: start; }
  .ko-ctrl { display: flex; flex-direction: column; gap: 1.1rem; }
  .ko-ctrl label { display: block; min-width: 0; }
  .ko-ctrl select, .ko-ctrl input[type='text'], .ko-ctrl input[type='number'] { width: 100%; }
  .ko-ctrl input[type='text'], .ko-ctrl input[type='number'], .ko-export input {
    background: var(--bg-raised); color: var(--ink); border: 1px solid var(--border-strong); border-radius: var(--radius); padding: 0.4em 0.6em; font: inherit; font-size: 0.88rem; }
  .ko-two { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem; }
  .ko-src { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
  .ko-src button { text-align: left; padding: 0.55rem 0.75rem; border-radius: var(--radius); border: 1px solid var(--border-strong); background: var(--bg-raised); color: var(--ink); min-width: 0; }
  .ko-src button:hover { border-color: var(--accent); }
  .ko-src b { display: block; font-family: var(--font-display); font-weight: 560; font-size: 1rem; }
  .ko-src span { font-size: 0.72rem; color: var(--ink-faint); }
  .ko-src .on { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
  .ko-src .on b { color: var(--accent); }
  .ko-sizes { display: flex; border: 1px solid var(--border-strong); border-radius: var(--radius); overflow: hidden; width: max-content; max-width: 100%; }
  .ko-sizes button { border: 0; border-left: 1px solid var(--border); background: transparent; color: var(--ink); font: 600 0.82rem var(--font-mono); padding: 0.45em 0.78em; }
  .ko-sizes button:first-child { border-left: 0; }
  .ko-sizes button:hover:not(:disabled) { color: var(--accent); }
  .ko-sizes button.on { background: var(--accent); color: var(--bg); }
  .ko-sizes button:disabled { color: var(--ink-faint); opacity: 0.55; text-decoration: line-through; cursor: default; }
  .ko-pool { font-size: 0.8rem; color: var(--ink-muted); margin: 0.5rem 0 0; }
  .ko-pool b { color: var(--ink); font-family: var(--font-mono); font-weight: 600; }
  .ko-note { margin: 0.45rem 0 0; }
  .ko-start { justify-content: center; }
  .ko-start:disabled { opacity: 0.5; cursor: default; }

  .ko-resume { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0.15rem 1rem; align-items: center; }
  .ko-resume .ko-lbl, .ko-resume b, .ko-resume span.small { grid-column: 1; }
  .ko-resume button { grid-column: 2; grid-row: 1 / span 3; }
  .ko-resume b { font-family: var(--font-display); font-weight: 560; font-size: 1.1rem; }

  .ko-cup { display: grid; grid-template-columns: 190px minmax(0, 1fr); gap: 1.3rem; align-items: center; }
  .ko-fan { position: relative; height: 200px; }
  .ko-fan img { position: absolute; top: 14px; width: 112px; height: auto; aspect-ratio: 2 / 3; object-fit: cover; border-radius: 4px; border: 1px solid var(--border); box-shadow: 0 6px 16px rgb(0 0 0 / 0.35); }
  .ko-fan img:nth-child(1) { left: 0; transform: rotate(-8deg); }
  .ko-fan img:nth-child(2) { left: 38px; top: 6px; transform: rotate(-2deg); z-index: 1; }
  .ko-fan img:nth-child(3) { left: 76px; top: 12px; transform: rotate(5deg); }
  .ko-cup h2 { font-size: 1.9rem; margin: 0.35rem 0 0.25rem; }
  .ko-cup p { margin: 0; font-size: 0.9rem; color: var(--ink-muted); }
  .ko-meta { margin-top: 0.5rem; }
  .ko-acts, .ko-done { display: flex; gap: 0.6rem; flex-wrap: wrap; margin-top: 1rem; }
  .ko-done { justify-content: center; margin-top: 0.4rem; }
  .ko-acts .btn { text-decoration: none; }

  .ko-hist ul { list-style: none; padding: 0; margin: 0.2rem 0 0; }
  .ko-hist li { display: flex; flex-wrap: wrap; gap: 0.2rem 0.6rem; align-items: baseline; padding: 0.4rem 0; border-bottom: 1px dotted var(--border-strong); font-size: 0.88rem; }
  .ko-hist li:last-child { border-bottom: 0; }
  .ko-hist li .faint { margin-left: auto; }
  .ko-hist p { margin: 0; }

  .ko-playhead { display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; margin-bottom: 1rem; }
  .ko-export { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem; max-width: 620px; margin: 1.2rem auto 0; text-align: left; align-items: end; }
  .ko-export input { width: 100%; }
  .ko-export .btn { justify-content: center; }
  .ko-export .faint { align-self: center; }

  @media (max-width: 900px) {
    .ko-desk { grid-template-columns: 1fr; }
    .ko-src { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  }
  @media (max-width: 640px) {
    .ko-src { grid-template-columns: 1fr 1fr; }
    .ko-cup { grid-template-columns: 1fr; }
    .ko-fan { width: 190px; height: 180px; margin: 0 auto; }
    .ko-export { grid-template-columns: 1fr; }
  }
</style>

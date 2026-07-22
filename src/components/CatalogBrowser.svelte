<script>
  import { withBase, tmdbImg } from '../lib/util.js';
  import { fmtScore } from '../../shared/rating-meta.mjs';

  let catalog = $state(null);
  let q = $state('');
  let rated = $state('all');
  let decade = $state('all');
  let genre = $state('all');
  let sort = $state('shuffle');
  let visible = $state(120);

  const base = withBase('');
  const img = (p) => tmdbImg(p, 'w342');
  const f1 = fmtScore;

  // Fisher–Yates; runs once per visit so the default order is fresh every time
  // but stable while filtering/paginating within the visit.
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  $effect(() => {
    fetch(`${base}/data/catalog.json`)
      .then((r) => r.json())
      .then((d) => (catalog = shuffle(d)))
      .catch(() => (catalog = []));
  });

  const decades = $derived(
    catalog ? [...new Set(catalog.filter((m) => m.year).map((m) => Math.floor(m.year / 10) * 10))].sort((a, b) => b - a) : []
  );
  const genres = $derived(catalog ? [...new Set(catalog.flatMap((m) => m.genres))].sort() : []);

  import { RATING_SORTS } from '../lib/sorts.js';

  const SORTS = {
    shuffle: { label: 'Shuffled', cmp: null }, // null cmp = keep the per-visit random order
    title: { label: 'Title A–Z', cmp: (a, b) => a.title.localeCompare(b.title) },
    'year-desc': { label: 'Newest first', cmp: (a, b) => (b.year ?? 0) - (a.year ?? 0) },
    ...RATING_SORTS,
  };

  const filtered = $derived.by(() => {
    if (!catalog) return [];
    const needle = q.trim().toLowerCase();
    let list = catalog.filter((m) => {
      if (needle && !m.title.toLowerCase().includes(needle)) return false;
      if (rated === 'rated' && m.my == null) return false;
      if (rated === 'unrated' && m.my != null) return false;
      if (decade !== 'all' && (m.year == null || Math.floor(m.year / 10) * 10 !== Number(decade))) return false;
      if (genre !== 'all' && !m.genres.includes(genre)) return false;
      return true;
    });
    const cmp = (SORTS[sort] ?? SORTS.shuffle).cmp;
    return cmp ? [...list].sort(cmp) : list; // no cmp: `list` is already a fresh array in shuffled order
  });

  $effect(() => {
    // reset pagination whenever filters change
    q; rated; decade; genre; sort;
    visible = 120;
  });
</script>

<div data-testid="catalog">
  <div style="display:flex; gap:0.7rem; flex-wrap:wrap; align-items:center; margin-bottom:1.2rem;">
    <input type="search" placeholder="Search the archive…" bind:value={q} style="flex:1; min-width:180px;" data-testid="catalog-search" />
    <select bind:value={rated} aria-label="Rated filter" data-testid="filter-rated">
      <option value="all">All films</option>
      <option value="rated">Rated by me</option>
      <option value="unrated">Not yet rated</option>
    </select>
    <select bind:value={decade} aria-label="Decade" data-testid="filter-decade">
      <option value="all">Any decade</option>
      {#each decades as d}<option value={String(d)}>{d}s</option>{/each}
    </select>
    <select bind:value={genre} aria-label="Genre" data-testid="filter-genre">
      <option value="all">Any genre</option>
      {#each genres as g}<option value={g}>{g}</option>{/each}
    </select>
    <select bind:value={sort} aria-label="Sort" data-testid="catalog-sort">
      {#each Object.entries(SORTS) as [id, s]}
        <option value={id}>{s.label}</option>
      {/each}
    </select>
  </div>

  {#if !catalog}
    <p class="muted">Loading the archive…</p>
  {:else}
    <p class="small faint" style="margin:0 0 1rem;" data-testid="catalog-count">
      {filtered.length} film{filtered.length === 1 ? '' : 's'}{#if SORTS[sort]?.ratingSort}
        <span data-testid="nulls-note"> — films without a {SORTS[sort].ratingSort} are listed last</span>
      {/if}
    </p>
    <div class="poster-grid" data-testid="catalog-grid">
      {#each filtered.slice(0, visible) as m (m.id)}
        <a class="movie-card" href={`${base}/movie/${m.slug}`} style="width:100%;">
          <div class="poster" style="width:100%; aspect-ratio:2/3; height:auto;">
            {#if img(m.poster)}
              <img src={img(m.poster)} alt={`${m.title} poster`} loading="lazy" />
            {:else}
              <div class="no-poster">{m.title}</div>
            {/if}
            {#if m.my != null}<span class="rating-tag">{f1(m.my)}</span>{/if}
          </div>
          <div class="card-title">{m.title}</div>
          <div class="card-sub">{m.year ?? ''}{m.directors?.length ? ` · ${m.directors.join(', ')}` : ''}</div>
        </a>
      {/each}
    </div>
    {#if filtered.length > visible}
      <div style="text-align:center; margin-top:1.6rem;">
        <button class="btn" onclick={() => (visible += 120)}>Show more ({filtered.length - visible} remaining)</button>
      </div>
    {/if}
  {/if}
</div>

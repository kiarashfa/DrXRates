<script>
  import { withBase, tmdbImg } from '../lib/util.js';
  import { fmtScore } from '../../shared/rating-meta.mjs';
  import { RATING_SORTS } from '../lib/sorts.js';

  // films: [{ slug, title, year, poster, my, tmdb, imdb }] in curated order.
  let { films, defaultLabel = 'Original order' } = $props();

  let sort = $state('default');
  const base = withBase('');

  const SORTS = {
    default: { label: defaultLabel, cmp: null },
    'year-asc': { label: 'Year ↑', cmp: (a, b) => (a.year ?? 9999) - (b.year ?? 9999) },
    'year-desc': { label: 'Year ↓', cmp: (a, b) => (b.year ?? 0) - (a.year ?? 0) },
    ...RATING_SORTS,
  };

  const sorted = $derived.by(() => {
    const s = SORTS[sort] ?? SORTS.default;
    return s.cmp ? [...films].sort(s.cmp) : films;
  });
</script>

<div data-testid="sortable-grid">
  <div style="display:flex; align-items:center; gap:0.8rem; flex-wrap:wrap; margin-bottom:1rem;">
    <select bind:value={sort} aria-label="Sort films" data-testid="grid-sort">
      {#each Object.entries(SORTS) as [id, s]}
        <option value={id}>{s.label}</option>
      {/each}
    </select>
    {#if SORTS[sort]?.ratingSort}
      <span class="small faint" data-testid="grid-nulls-note">films without a {SORTS[sort].ratingSort} are listed last</span>
    {/if}
  </div>
  <div class="poster-grid" data-testid="collection-grid">
    {#each sorted as m (m.slug)}
      <a class="movie-card" href={`${base}/movie/${m.slug}`}>
        <div class="poster">
          {#if tmdbImg(m.poster, 'w342')}
            <img src={tmdbImg(m.poster, 'w342')} alt={`${m.title} poster`} loading="lazy" />
          {:else}
            <div class="no-poster">{m.title}</div>
          {/if}
          {#if m.my != null}<span class="rating-tag">{fmtScore(m.my)}</span>{/if}
        </div>
        <div class="card-title">{m.title}</div>
        <div class="card-sub">{m.year ?? ''}</div>
      </a>
    {/each}
  </div>
</div>

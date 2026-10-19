<script>
  // The shared film card: poster tile (2:3, Dr. X's score tagged when rated),
  // title, year · director, and a dotted ledger of scores. `rows` picks the
  // ledger rows (none: no ledger), `blind` hides every number, `watch` adds
  // the watchlist bookmark on the poster.
  import { fmtScore } from '../../shared/rating-meta.mjs';
  import { tmdbImg, withBase } from '../lib/util.js';
  import { inWatchlist, toggleWatchlist, onWatchlistChange } from '../lib/watchlist.js';

  let { film, rows = ['my', 'imdb', 'tmdb', 'rt', 'metacritic'], blind = false, watch = false, onwatch = null } = $props();

  const LABEL = { my: 'Dr. X', imdb: 'IMDb', tmdb: 'TMDB', rt: 'Rotten Tomatoes', metacritic: 'Metacritic' };
  const value = (key) => (key === 'rt' ? (film[key] == null ? '–' : `${film[key]}%`) : fmtScore(film[key]));
  const directors = $derived((film.directors ?? []).slice(0, 2).map((d) => (typeof d === 'string' ? d : d.name)).join(', '));
  const img = $derived(tmdbImg(film.poster, 'w342'));

  let saved = $state(false);
  $effect(() => {
    if (!watch) return;
    const sync = () => (saved = inWatchlist(film.id));
    sync();
    return onWatchlistChange(sync);
  });

  function onToggle(e) {
    e.preventDefault();
    e.stopPropagation();
    saved = toggleWatchlist(film.id, film.title);
    onwatch?.(film, saved);
  }
  const icon = (name) => `${withBase('/icons.svg')}#i-${name}`;
</script>

<a class="film-card" href={withBase(`/movie/${film.slug}`)} data-testid="film-card">
  <div class="fc-poster">
    {#if img}
      <img src={img} alt={`${film.title} poster`} loading="lazy" width="342" height="513" />
    {:else}
      <div class="no-poster">{film.title}</div>
    {/if}
    {#if film.my != null && !blind}<span class="rating-tag">{fmtScore(film.my)}</span>{/if}
    {#if watch}
      <button
        class="fc-watch"
        type="button"
        aria-pressed={saved}
        aria-label={saved ? `Remove ${film.title} from your watchlist` : `Add ${film.title} to your watchlist`}
        title={saved ? 'Remove from watchlist' : 'Add to watchlist'}
        onclick={onToggle}
        data-testid="card-watch"
      >
        <svg class="icon" aria-hidden="true"><use href={icon(saved ? 'bookmarked' : 'bookmark')}></use></svg>
      </button>
    {/if}
  </div>
  <div class="fc-title">{film.title}</div>
  <div class="fc-sub">{film.year ?? '–'}{directors ? ` · ${directors}` : ''}</div>
  {#if rows.length}
    <div class="fc-ledger">
      {#if blind}
        <div><span class="k">Scores hidden</span><span class="dots"></span><span class="v">· · ·</span></div>
      {:else}
        {#each rows as key}
          <div><span class="k">{LABEL[key]}</span><span class="dots"></span><span class="v">{value(key)}</span></div>
        {/each}
      {/if}
    </div>
  {/if}
</a>

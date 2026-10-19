<script>
  // Movie page hero actions: the watchlist pill and a link into Compare.
  // Renders on the server as "Add to watchlist"; both labels share one grid
  // cell so the pill keeps its width when hydration flips it.
  import { withBase } from '../lib/util.js';
  import { inWatchlist, toggleWatchlist, onWatchlistChange } from '../lib/watchlist.js';

  let { id, title } = $props();
  let saved = $state(false);

  $effect(() => {
    const sync = () => (saved = inWatchlist(id));
    sync();
    return onWatchlistChange(sync);
  });

  const icon = (name) => `${withBase('/icons.svg')}#i-${name}`;
</script>

<button class="watch-pill" type="button" aria-pressed={saved} onclick={() => (saved = toggleWatchlist(id, title))} data-testid="watch-btn">
  <svg class="icon" aria-hidden="true"><use href={icon(saved ? 'bookmarked' : 'bookmark')}></use></svg>
  <span class="watch-labels">
    <span class:off={saved}>Add to watchlist</span>
    <span class:off={!saved}>On your watchlist</span>
  </span>
</button>
<a class="quiet-link" href={withBase(`/compare?a=${id}`)} data-testid="compare-link">
  <svg class="icon" aria-hidden="true"><use href={icon('compare')}></use></svg>Compare with…
</a>

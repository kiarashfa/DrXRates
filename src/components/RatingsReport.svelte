<script>
  import { computeTotals, fmtScore } from '../../shared/rating-meta.mjs';
  import { getRating } from '../lib/visitor.js';

  let { movie } = $props();

  let visitorTotals = $state(null);

  function refreshVisitor() {
    const saved = getRating(movie.id);
    visitorTotals = saved?.scores ? computeTotals(saved.scores) : null;
  }

  $effect(() => {
    refreshVisitor();
    const onChange = (e) => {
      if (!e.detail || e.detail.movieId === movie.id) refreshVisitor();
    };
    window.addEventListener('cinema:visitor-changed', onChange);
    window.addEventListener('storage', refreshVisitor);
    return () => {
      window.removeEventListener('cinema:visitor-changed', onChange);
      window.removeEventListener('storage', refreshVisitor);
    };
  });

  const f1 = fmtScore;

  // Missing sources simply don't render — no empty slots, no broken layout.
  // (Content/Form sub-scores live ONLY in the scorecard island — not repeated here.)
  const sources = $derived.by(() => {
    const list = [];
    if (movie.myRating) {
      list.push({
        id: 'my',
        label: 'My score',
        value: f1(movie.myRating.overall),
        suffix: '/ 10',
        accent: true,
      });
    }
    if (movie.tmdbRating?.score != null) {
      list.push({
        id: 'tmdb',
        label: 'TMDB',
        value: f1(movie.tmdbRating.score),
        suffix: '/ 10',
        sub: `${movie.tmdbRating.votes.toLocaleString()} votes`,
        href: `https://www.themoviedb.org/movie/${movie.id}`,
      });
    }
    if (movie.omdb?.imdb != null) {
      list.push({
        id: 'imdb',
        label: 'IMDb',
        value: f1(movie.omdb.imdb),
        suffix: '/ 10',
        sub: movie.omdb.imdbVotes ? `${movie.omdb.imdbVotes.toLocaleString()} votes` : null,
        href: movie.imdbId ? `https://www.imdb.com/title/${movie.imdbId}/` : null,
      });
    } else if (movie.imdbId) {
      list.push({ id: 'imdb', label: 'IMDb', value: '↗', suffix: '', sub: 'no score cached', href: `https://www.imdb.com/title/${movie.imdbId}/` });
    }
    if (movie.omdb?.metacritic != null) {
      list.push({ id: 'metacritic', label: 'Metacritic', value: String(movie.omdb.metacritic), suffix: '/ 100' });
    }
    if (movie.omdb?.rottenTomatoes != null) {
      list.push({ id: 'rt', label: 'Rotten Tomatoes', value: `${movie.omdb.rottenTomatoes}%`, suffix: '' });
    }
    if (visitorTotals) {
      list.push({ id: 'you', label: 'Your score', value: f1(visitorTotals.overall), suffix: '/ 10' });
    }
    return list;
  });
</script>

<div class="panel ratings-report" data-testid="ratings-report">
  <div class="report-head">
    <h3 style="margin:0;">Ratings report</h3>
    {#if !movie.myRating}
      <span class="status-badge">Not yet rated by me</span>
    {/if}
  </div>
  <div class="report-row">
    {#each sources as s (s.id)}
      <div class="report-source" data-testid={`src-${s.id}`}>
        <div class="faint small" style="display:flex; align-items:center; gap:6px;">
          {#if s.id === 'tmdb'}
            <img
              src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg"
              alt="" style="height:9px; width:auto;" loading="lazy"
            />
          {:else if s.id === 'imdb'}
            <span style="background:#f5c518; color:#0d0d0d; font-weight:700; font-size:9px; line-height:1; padding:2.5px 4px; border-radius:3px;" aria-hidden="true">IMDb</span>
          {:else if s.id === 'metacritic'}
            <span style="display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px; border-radius:50%; background:#0e0e0e; color:#ffcc33; font-weight:700; font-size:11px; line-height:1; border:1px solid var(--border-strong);" aria-hidden="true">m</span>
          {:else if s.id === 'rt'}
            <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="8" cy="9.6" r="5.9" fill="#fa320a" />
              <path d="M8 4.2 C 6.8 2.2, 4.4 2.4, 3.6 3.6 C 5.2 4.1, 6.4 3.8, 8 4.2 C 9.6 3.8, 10.8 4.1, 12.4 3.6 C 11.6 2.4, 9.2 2.2, 8 4.2 Z" fill="#00912d" />
            </svg>
          {/if}
          {s.label}
        </div>
        <div class="score-badge" style={s.accent ? '' : 'color: var(--ink);'}>
          {#if s.href}
            <a href={s.href} target="_blank" rel="noopener" style="color:inherit; text-decoration:none;">{s.value}</a>
          {:else}
            {s.value}
          {/if}
          {#if s.suffix}<small>{s.suffix}</small>{/if}
        </div>
        {#if s.sub}
          <div class="faint small">{s.sub}</div>
        {/if}
      </div>
    {/each}
  </div>
</div>

<script>
  // Taste match (top of Your ratings): the visitor's local ratings against
  // Dr. X's on the films both rated. Figures, the two average profiles as
  // pentagons, closest / furthest films (or all of them as a table), and Dr. X's
  // highly rated films the visitor hasn't rated. `films` is loadRatedFilms().
  import { fmtScore } from '../../shared/rating-meta.mjs';
  import { tasteMatch, suggestions, criteriaList, MIN_SHARED, MIN_CORRELATION, BIAS_THRESHOLD } from '../lib/taste.js';
  import { loadPosters } from '../lib/archive.js';
  import { withBase } from '../lib/util.js';
  import Pentagon from './charts/Pentagon.svelte';
  import Dumbbells from './charts/Dumbbells.svelte';
  import FilmCard from './FilmCard.svelte';

  let { ratings, films } = $props();

  const drx = $derived(new Map(films.map((m) => [m.id, m])));
  const tm = $derived(tasteMatch(ratings, drx));
  const picks = $derived(suggestions(ratings, films, tm.ready ? tm.profile.you : null, 6));

  let tab = $state('closest');
  let posters = $state.raw(new Map());
  $effect(() => {
    const ids = [...picks.map((m) => m.id), ...(tm.ready ? [...tm.closest, ...tm.furthest].map((s) => s.film.id) : [])];
    const missing = ids.filter((id) => !posters.has(id));
    if (!missing.length) return;
    loadPosters(missing)
      .then((found) => (posters = new Map([...posters, ...found])))
      .catch(() => {});
  });

  const href = (m) => withBase(`/movie/${m.slug}`);
  const signed = (v) => (v > 0 ? `+${fmtScore(v)}` : fmtScore(v));
  const rows = (list) =>
    list.map((s) => ({ href: href(s.film), title: s.film.title, year: s.film.year, poster: posters.get(s.film.id) ?? null, drx: s.x.overall, other: s.you.overall }));
  const all = $derived(tm.ready ? [...tm.shared].sort((a, b) => b.diff - a.diff || a.film.title.localeCompare(b.film.title)) : []);
  const summary = $derived.by(() => {
    if (!tm.ready) return '';
    const { higher, lower } = tm;
    if (!higher.length && !lower.length) return `On every criterion your average is within ${BIAS_THRESHOLD} of Dr. X's.`;
    if (higher.length && lower.length) return `You score ${criteriaList(higher)} higher than Dr. X; ${criteriaList(lower)} lower.`;
    return `You score ${criteriaList(higher.length ? higher : lower)} ${higher.length ? 'higher' : 'lower'} than Dr. X.`;
  });
  const TABS = [
    ['closest', 'Closest'],
    ['furthest', 'Furthest apart'],
  ];
</script>

<section class="panel tm" id="taste-match" data-testid="taste-match">
  <div class="tm-head">
    <h2>Taste match</h2>
    <span class="small faint">
      {tm.n} {tm.n === 1 ? 'film' : 'films'} rated by both you and Dr. X ·
      <a href={withBase('/insights')}>How Dr. X rates overall: Insights</a>
    </span>
  </div>

  {#if !tm.ready}
    <p class="muted small intro" data-testid="taste-invite">
      {#if tm.n === 0}
        Taste match compares your scores with Dr. X's on films you have both rated. It starts at {MIN_SHARED} shared films.
      {:else}
        {MIN_SHARED - tm.n} more {MIN_SHARED - tm.n === 1 ? 'film' : 'films'} rated by both of you for a first comparison.
      {/if}
    </p>
    <div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax={MIN_SHARED} aria-valuenow={tm.n} aria-label="Shared films">
      <i style={`width:${(tm.n / MIN_SHARED) * 100}%`}></i>
    </div>
    <span class="small faint">{tm.n} of {MIN_SHARED}</span>
  {:else}
    <div class="figs" data-testid="taste-figures">
      <div><b>{signed(tm.meanDiff)}</b><span>average difference, you minus Dr. X (overall, out of 10)</span></div>
      <div class:locked={tm.correlation == null}>
        <b>{tm.correlation == null ? '–' : fmtScore(tm.correlation)}</b>
        <span>{tm.correlation == null ? `correlation from ${MIN_CORRELATION} shared films (${tm.n} so far)` : 'correlation of the two overall scores'}</span>
      </div>
      <div><b>{tm.withinOne} of {tm.n}</b><span>films within 1 point of Dr. X</span></div>
    </div>

    <div class="pents">
      <Pentagon side="content" solid={tm.profile.x} dashed={tm.profile.you} />
      <Pentagon side="form" solid={tm.profile.x} dashed={tm.profile.you} />
    </div>
    <p class="legend small faint">Averages over the shared films. Solid: Dr. X · dashed: you.</p>
    <p class="summary" data-testid="taste-summary">{summary}</p>

    <div class="seg tabs" role="tablist" aria-label="Shared films">
      {#each TABS as [id, label]}
        <button role="tab" aria-selected={tab === id} class:active={tab === id} onclick={() => (tab = id)}>{label}</button>
      {/each}
      <button role="tab" aria-selected={tab === 'all'} class:active={tab === 'all'} onclick={() => (tab = 'all')} data-testid="taste-tab-all">All {tm.n}</button>
    </div>
    <div role="tabpanel" data-testid="taste-list">
      {#if tab === 'all'}
        <div class="scroll-x">
        <table class="data-table" data-testid="taste-table">
          <thead><tr><th>Film</th><th class="num">Dr. X</th><th class="num">You</th><th class="num">Difference</th></tr></thead>
          <tbody>
            {#each all as s (s.film.id)}
              <tr>
                <td><a href={href(s.film)}>{s.film.title}</a> <span class="faint small">{s.film.year ?? ''}</span></td>
                <td class="num">{fmtScore(s.x.overall)}</td>
                <td class="num">{fmtScore(s.you.overall)}</td>
                <td class="num">{signed(s.diff)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
        </div>
      {:else}
        <Dumbbells rows={rows(tab === 'closest' ? tm.closest : tm.furthest)} other="You" />
      {/if}
    </div>
  {/if}

  {#if picks.length}
    <h3 class="h-sub">Dr. X rated these highly; you haven't rated them</h3>
    {#if tm.ready}<p class="small faint sub-note">Ordered by the criteria you score highest.</p>{/if}
    <div class="sugg">
      <div class="sugg-grid" data-testid="taste-suggestions">
        {#each picks as m (m.id)}
          <FilmCard film={{ ...m, poster: posters.get(m.id) ?? null }} rows={['my', 'imdb']} />
        {/each}
      </div>
    </div>
  {/if}
</section>

<style>
  .tm { scroll-margin-top: calc(var(--header-h) + 1rem); }
  .tm-head { display: flex; justify-content: space-between; align-items: baseline; gap: 0.4rem 1rem; flex-wrap: wrap; }
  .tm-head h2 { margin: 0; font-size: clamp(1.5rem, 3vw, 1.9rem); }
  .tm-head a { color: var(--accent); text-decoration: none; }
  .tm-head a:hover { text-decoration: underline; }
  .intro { margin: 0.8rem 0 0; max-width: 620px; }
  .meter { height: 4px; max-width: 320px; background: var(--border); border-radius: 2px; overflow: hidden; margin: 0.8rem 0 0.3rem; }
  .meter i { display: block; height: 100%; background: var(--accent); }
  .figs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg-raised); margin: 1.1rem 0 1.2rem; }
  .figs div { padding: 0.75rem 1rem; border-left: 1px solid var(--border); min-width: 0; }
  .figs div:first-child { border-left: 0; }
  .figs b { display: block; font: 600 1.8rem/1.1 var(--font-numeral); }
  .figs .locked b { color: var(--ink-faint); }
  .figs span { display: block; margin-top: 0.2rem; font-size: 0.76rem; line-height: 1.3; color: var(--ink-muted); }
  .pents { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; max-width: 720px; margin: 0 auto; }
  .legend { text-align: center; margin: 0.2rem 0 0; }
  .summary { text-align: center; margin: 0.6rem auto 1.4rem; max-width: 620px; }
  .tabs { margin-bottom: 0.8rem; }
  .scroll-x { overflow-x: auto; }
  .h-sub { font: 600 0.74rem/1.3 var(--font-ui); letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-muted); margin: 1.8rem 0 0.4rem; }
  .sub-note { margin: 0 0 0.8rem; }
  /* One full row of cards at any width: the column count follows the panel's
     width and cards past it are hidden. */
  .sugg { container-type: inline-size; margin-top: 0.8rem; }
  .sugg-grid { --cols: 3; display: grid; grid-template-columns: repeat(var(--cols), minmax(0, 1fr)); gap: 1rem; }
  .sugg-grid > :global(:nth-child(n + 4)) { display: none; }
  @container (min-width: 440px) { .sugg-grid { --cols: 4; } .sugg-grid > :global(:nth-child(4)) { display: block; } }
  @container (min-width: 640px) { .sugg-grid { --cols: 5; } .sugg-grid > :global(:nth-child(5)) { display: block; } }
  @container (min-width: 860px) { .sugg-grid { --cols: 6; } .sugg-grid > :global(:nth-child(6)) { display: block; } }
  @media (max-width: 640px) {
    .figs b { font-size: 1.35rem; }
    .figs div { padding: 0.6rem 0.65rem; }
    .pents { grid-template-columns: minmax(0, 1fr); max-width: 340px; }
    .sugg-grid { gap: 0.7rem; }
  }
</style>

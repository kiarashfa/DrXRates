<script>
  import { CONTENT_KEYS, FORM_KEYS, computeTotals, fmtScore } from '../../shared/rating-meta.mjs';
  import { getRating, setRating, removeRating, exportRatings, importRatingsFile } from '../lib/visitor.js';
  import Ledger from './charts/Ledger.svelte';
  import Pentagons from './charts/Pentagons.svelte';
  import Reel from './charts/Reel.svelte';

  let { movie } = $props();

  let mode = $state('ledger');
  let visitorScores = $state(null);
  let formOpen = $state(false);
  let notice = $state('');
  let draft = $state(Object.fromEntries([...CONTENT_KEYS, ...FORM_KEYS].map((k) => [k.key, 2.5])));

  $effect(() => {
    const saved = getRating(movie.id);
    if (saved?.scores) {
      visitorScores = saved.scores;
      draft = { ...saved.scores };
    }
  });

  const mine = $derived(movie.myRating?.scores ?? null);
  const draftTotals = $derived(computeTotals(draft));
  const hasAnyRating = $derived(!!mine || !!visitorScores);

  const modes = [
    { id: 'ledger', label: 'Ledger' },
    { id: 'pentagons', label: 'Pentagons' },
    { id: 'reel', label: 'Reel' },
  ];

  const f1 = fmtScore;

  function announceChange() {
    window.dispatchEvent(new CustomEvent('cinema:visitor-changed', { detail: { movieId: movie.id } }));
  }

  function saveVisitor() {
    setRating(movie.id, { ...draft }, movie.title);
    visitorScores = { ...draft };
    formOpen = false;
    notice = 'Saved to this browser.';
    announceChange();
    setTimeout(() => (notice = ''), 3500);
  }

  function deleteVisitor() {
    removeRating(movie.id);
    visitorScores = null;
    notice = 'Your rating was removed.';
    announceChange();
    setTimeout(() => (notice = ''), 3500);
  }

  let fileInput = $state(null);
  async function onImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { imported, skipped } = await importRatingsFile(file);
      const saved = getRating(movie.id);
      visitorScores = saved?.scores ?? visitorScores;
      if (saved?.scores) draft = { ...saved.scores };
      notice = `Imported ${imported} rating${imported === 1 ? '' : 's'}${skipped ? ` (${skipped} skipped)` : ''}.`;
      window.dispatchEvent(new CustomEvent('cinema:visitor-changed', { detail: null }));
    } catch (err) {
      notice = `Import failed: ${err.message}`;
    }
    e.target.value = '';
    setTimeout(() => (notice = ''), 6000);
  }
</script>

<div class="panel" data-testid="rating-panel">
  <h3 style="display:flex; align-items:baseline; gap:0.8em; flex-wrap:wrap;">
    The scorecard
    {#if movie.myRating}
      <span class="score-badge" data-testid="my-overall">{f1(movie.myRating.overall)} <small>/ 10</small></span>
    {/if}
  </h3>

  <div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center; margin-bottom:1rem;">
    {#if movie.myRating}
      <span class="pill content">Content {f1(movie.myRating.contentAvg)}</span>
      <span class="pill form">Form {f1(movie.myRating.formAvg)}</span>
    {:else}
      <span class="status-badge" data-testid="unrated-badge">Not yet rated</span>
    {/if}
    {#if visitorScores}
      <span class="pill" data-testid="visitor-pill">You {f1(computeTotals(visitorScores).overall)}</span>
    {/if}
  </div>

  {#if hasAnyRating}
    <div style="display:flex; justify-content:space-between; align-items:center; gap:1rem; flex-wrap:wrap; margin-bottom:0.5rem;">
      <div class="seg" role="group" aria-label="Chart style" data-testid="chart-toggle">
        {#each modes as m}
          <button class:active={mode === m.id} onclick={() => (mode = m.id)}>{m.label}</button>
        {/each}
      </div>
      {#if mine && visitorScores}
        <span class="small faint">solid — my score · outline — yours</span>
      {/if}
    </div>
    <div data-testid={`chart-${mode}`}>
      {#if mode === 'ledger'}
        <Ledger {mine} visitor={visitorScores} />
      {:else if mode === 'pentagons'}
        <Pentagons {mine} visitor={visitorScores} />
      {:else}
        <Reel {mine} visitor={visitorScores} />
      {/if}
    </div>
  {:else}
    <div style="border:1px dashed var(--border-strong); border-radius:var(--radius); padding:1.1rem 1.3rem; margin:0.5rem 0 1rem;" data-testid="invitation-card">
      <p style="margin:0 0 0.35rem; font-family:var(--font-display); font-size:1.08rem;">In the archive, not yet reviewed.</p>
      <p class="small muted" style="margin:0 0 0.8rem;">
        This film has its place on the shelf, but it hasn't been through the screening room.
        You can put it through the same ten-part system yourself below.
      </p>
      <button class="btn primary" onclick={() => (formOpen = true)} data-testid="invite-rate-btn">Rate it yourself</button>
    </div>
  {/if}

  <details bind:open={formOpen} style="margin-top:1.2rem; border-top:1px solid var(--border); padding-top:1rem;">
    <summary style="cursor:pointer; font-weight:600; font-size:0.92rem;" data-testid="rate-toggle">
      {visitorScores ? 'Edit your rating' : 'Rate it yourself'} <span class="faint small">— same ten-part system</span>
    </summary>
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:1.2rem 2rem; margin-top:1rem;">
      {#each [{ label: 'Content', keys: CONTENT_KEYS, cls: 'content', avg: draftTotals?.contentAvg }, { label: 'Form', keys: FORM_KEYS, cls: 'form', avg: draftTotals?.formAvg }] as half}
        <div>
          <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem;">
            <span class={`pill ${half.cls}`}>{half.label}</span>
            <span class="mono small">{half.avg != null ? f1(half.avg) : '—'} / 5</span>
          </div>
          {#each half.keys as k}
            <label style="display:grid; grid-template-columns:1fr 110px 30px; align-items:center; gap:0.6rem; font-size:0.82rem; padding:0.18rem 0;">
              <span class="muted">{k.label}</span>
              <input type="range" min="0" max="5" step="0.5" bind:value={draft[k.key]} data-testid={`slider-${k.key}`} />
              <span class="mono">{f1(draft[k.key])}</span>
            </label>
          {/each}
        </div>
      {/each}
    </div>
    <div style="display:flex; align-items:center; gap:0.9rem; margin-top:1rem; flex-wrap:wrap;">
      <span class="score-badge">{draftTotals ? f1(draftTotals.overall) : '—'} <small>/ 10</small></span>
      <button class="btn primary" onclick={saveVisitor} data-testid="save-rating">Save rating</button>
      {#if visitorScores}
        <button class="btn" onclick={deleteVisitor}>Remove my rating</button>
      {/if}
    </div>
  </details>

  <div style="border-top:1px solid var(--border); margin-top:1.2rem; padding-top:0.9rem; display:flex; gap:0.6rem; align-items:center; flex-wrap:wrap;">
    <button class="btn" onclick={exportRatings} data-testid="export-btn">Export my ratings</button>
    <button class="btn" onclick={() => fileInput?.click()} data-testid="import-btn">Import ratings</button>
    <input type="file" accept=".json,application/json" style="display:none" bind:this={fileInput} onchange={onImportFile} data-testid="import-input" />
    {#if notice}<span class="small" style="color:var(--accent);" data-testid="notice">{notice}</span>{/if}
    <p class="small faint" style="flex-basis:100%; margin:0.3rem 0 0;">
      Your ratings are stored only in this browser — nothing is sent to a server, and there is no shared visitor average.
      Export a JSON backup to move them between browsers.
    </p>
  </div>
</div>

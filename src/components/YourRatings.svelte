<script>
  import { computeTotals, fmtScore } from '../../shared/rating-meta.mjs';
  import { loadStore } from '../lib/visitor.js';
  import { exportBackup, importBackupFile } from '../lib/backup.js';
  import { loadArchive, loadRatedFilms } from '../lib/archive.js';
  import TasteMatch from './TasteMatch.svelte';

  let entries = $state(null);
  let ratings = $state.raw({});
  // Dr. X's films for Taste match; the page renders once they arrive (or fail)
  // so Taste match never pushes the table down after it has appeared.
  let ratedFilms = $state.raw(null);
  let ratedFailed = $state(false);
  let notice = $state('');
  let fileInput = $state(null);

  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  const f1 = fmtScore;

  let catalogById = $state(null);
  $effect(() => {
    refresh();
    loadRatedFilms()
      .then((f) => (ratedFilms = f))
      .catch(() => (ratedFailed = true));
  });

  // Slugs for the table's links come from the archive (~1MB): only fetched
  // once there is something to link, including after an import.
  let archiveAsked = false;
  // (Takes the count rather than reading entries, so the effect that calls
  // refresh() doesn't start depending on entries.)
  function linkTitles(count) {
    if (archiveAsked || !count) return;
    archiveAsked = true;
    loadArchive()
      .then(({ list }) => (catalogById = new Map(list.map((m) => [String(m.id), m]))))
      .catch(() => (catalogById = new Map()));
  }

  // The page renders in the browser, so a link to #taste-match can only
  // scroll there once the section exists.
  let scrolled = false;
  $effect(() => {
    if (scrolled || ratedFilms == null || location.hash !== '#taste-match') return;
    scrolled = true;
    requestAnimationFrame(() => document.getElementById('taste-match')?.scrollIntoView());
  });

  function refresh() {
    const store = loadStore();
    ratings = store.ratings;
    entries = Object.entries(store.ratings)
      .map(([id, e]) => ({ id, title: e.title ?? `#${id}`, updatedAt: e.updatedAt, totals: computeTotals(e.scores) }))
      .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
    linkTitles(Object.keys(store.ratings).length);
  }

  async function onImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { ratings, watchlist, knockout } = (await importBackupFile(file)).sections;
      refresh();
      const part = (r, one, many) => (r?.imported || r?.skipped) && `${r.imported} ${r.imported === 1 ? one : many}${r.skipped ? ` (${r.skipped} skipped)` : ''}`;
      const parts = [part(ratings, 'rating', 'ratings'), part(watchlist, 'watchlist film', 'watchlist films'), part(knockout, 'Knockout bracket', 'Knockout brackets')].filter(Boolean);
      notice = `Imported ${parts.join(' and ') || '0 ratings'}.`;
    } catch (err) {
      notice = `Import failed: ${err.message}`;
    }
    e.target.value = '';
    setTimeout(() => (notice = ''), 6000);
  }
</script>

{#if entries == null || (ratedFilms == null && !ratedFailed)}
  <div class="panel"><p class="muted">Loading…</p></div>
{:else}
<div class="panel-stack">
{#if ratedFilms}<TasteMatch {ratings} films={ratedFilms} />{/if}
<div class="panel">
  <div style="display:flex; gap:0.6rem; align-items:center; flex-wrap:wrap; margin-bottom:1rem;">
    <button class="btn" onclick={exportBackup} data-testid="export-btn">Export my data</button>
    <button class="btn" onclick={() => fileInput?.click()} data-testid="import-btn">Import data</button>
    <input type="file" accept=".json,application/json" style="display:none" bind:this={fileInput} onchange={onImportFile} />
    {#if notice}<span class="small" style="color:var(--accent);" data-testid="notice">{notice}</span>{/if}
  </div>

  {#if entries.length === 0}
    <p class="muted" data-testid="empty-state">
      You haven't rated anything yet. Open any film and use "Rate it yourself"; your scores stay in this browser.
    </p>
  {:else}
    <!-- Five columns don't fit a phone: the table scrolls inside its panel. -->
    <div style="overflow-x:auto;">
    <table class="data-table" data-testid="ratings-table">
      <thead>
        <tr><th>Film</th><th>Content</th><th>Form</th><th>Overall</th><th>Rated on</th></tr>
      </thead>
      <tbody>
        {#each entries as e (e.id)}
          <tr>
            <td>
              {#if catalogById?.get(e.id)}
                <a href={`${base}/movie/${catalogById.get(e.id).slug}`}>{e.title}</a>
              {:else}
                {e.title}
              {/if}
            </td>
            <td class="num" style="color:var(--content-c);">{e.totals ? f1(e.totals.contentAvg) : '–'}</td>
            <td class="num" style="color:var(--form-c);">{e.totals ? f1(e.totals.formAvg) : '–'}</td>
            <td class="num">{e.totals ? f1(e.totals.overall) : '–'}</td>
            <td class="num faint">{e.updatedAt ? e.updatedAt.slice(0, 10) : '–'}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    </div>
  {/if}
  <p class="small faint" style="margin-top:1rem;">
    These ratings live only in this browser's local storage. There's no account, and they're never uploaded,
    so export the JSON backup (it also holds your watchlist) before clearing your browser data or switching machines.
  </p>
</div>
</div>
{/if}

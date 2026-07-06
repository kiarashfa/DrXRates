<script>
  import { computeTotals, fmtScore } from '../../shared/rating-meta.mjs';
  import { loadStore, exportRatings, importRatingsFile } from '../lib/visitor.js';

  let entries = $state(null);
  let notice = $state('');
  let fileInput = $state(null);

  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  const f1 = fmtScore;

  let catalogById = $state(null);
  $effect(() => {
    refresh();
    fetch(`${base}/data/catalog.json`)
      .then((r) => r.json())
      .then((d) => (catalogById = new Map(d.map((m) => [String(m.id), m]))))
      .catch(() => (catalogById = new Map()));
  });

  function refresh() {
    const store = loadStore();
    entries = Object.entries(store.ratings)
      .map(([id, e]) => ({ id, title: e.title ?? `#${id}`, updatedAt: e.updatedAt, totals: computeTotals(e.scores) }))
      .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  }

  async function onImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { imported, skipped } = await importRatingsFile(file);
      refresh();
      notice = `Imported ${imported} rating${imported === 1 ? '' : 's'}${skipped ? ` (${skipped} skipped)` : ''}.`;
    } catch (err) {
      notice = `Import failed: ${err.message}`;
    }
    e.target.value = '';
    setTimeout(() => (notice = ''), 6000);
  }
</script>

<div class="panel">
  <div style="display:flex; gap:0.6rem; align-items:center; flex-wrap:wrap; margin-bottom:1rem;">
    <button class="btn" onclick={exportRatings} data-testid="export-btn">Export my ratings</button>
    <button class="btn" onclick={() => fileInput?.click()} data-testid="import-btn">Import ratings</button>
    <input type="file" accept=".json,application/json" style="display:none" bind:this={fileInput} onchange={onImportFile} />
    {#if notice}<span class="small" style="color:var(--accent);" data-testid="notice">{notice}</span>{/if}
  </div>

  {#if entries == null}
    <p class="muted">Loading…</p>
  {:else if entries.length === 0}
    <p class="muted" data-testid="empty-state">
      You haven't rated anything yet. Open any film and use "Rate it yourself" — your scores stay in this browser.
    </p>
  {:else}
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
            <td class="num" style="color:var(--content-c);">{e.totals ? f1(e.totals.contentAvg) : '—'}</td>
            <td class="num" style="color:var(--form-c);">{e.totals ? f1(e.totals.formAvg) : '—'}</td>
            <td class="num">{e.totals ? f1(e.totals.overall) : '—'}</td>
            <td class="num faint">{e.updatedAt ? e.updatedAt.slice(0, 10) : '—'}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
  <p class="small faint" style="margin-top:1rem;">
    These ratings live only in this browser's local storage. There's no account and no server —
    export the JSON backup before clearing your browser data or switching machines.
  </p>
</div>

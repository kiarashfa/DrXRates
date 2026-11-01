<script>
  // A closed-by-default drawer for picking several items from a list. The row
  // shows the picks (cut short with an ellipsis); opened, the box holds the
  // "Any of / All of" switch above the checkboxes.
  let { label, noun, items = [], picked = $bindable([]), match = $bindable('any'), anyText = 'Any', testid = null } = $props();

  const names = $derived(items.filter((i) => picked.includes(i.value)).map((i) => i.label));
  const hint = $derived(
    match === 'all' ? `All of: a film must match every ticked ${noun}.` : `Any of: a film in at least one ticked ${noun}.`
  );

  function toggle(value) {
    picked = picked.includes(value) ? picked.filter((v) => v !== value) : [...picked, value];
  }
</script>

<details class="pd" data-testid={testid}>
  <summary>
    <span class="pd-lbl">{label}</span>
    <span class="pd-val">{names.length ? names.join(', ') : anyText}</span>
  </summary>
  <div class="pd-box">
    <div class="pd-bar">
      <span class="pd-cap">{picked.length} picked</span>
      <span class="pd-seg" role="group" aria-label={`${label}: match`}>
        <button type="button" aria-pressed={match === 'any'} onclick={() => (match = 'any')}>Any of</button>
        <button type="button" aria-pressed={match === 'all'} onclick={() => (match = 'all')}>All of</button>
      </span>
    </div>
    <div class="pd-list">
      {#each items as item (item.value)}
        <label>
          <input type="checkbox" checked={picked.includes(item.value)} onchange={() => toggle(item.value)} />
          <span>{item.label}</span>
        </label>
      {/each}
    </div>
    <p class="pd-hint">{hint}</p>
  </div>
</details>

<style>
  .pd { min-width: 0; }
  .pd summary { cursor: pointer; list-style: none; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 0.7rem; padding: 0.5rem 0; }
  .pd summary::-webkit-details-marker { display: none; }
  .pd-lbl { font-size: 1rem; color: var(--ink); }
  .pd-val { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: right; font-size: 0.85rem; color: var(--accent); }
  .pd-box { border: 1px solid var(--border-strong); border-radius: var(--radius); background: var(--bg-raised); overflow: hidden; }
  .pd-bar { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.5rem 0.6rem; border-bottom: 1px solid var(--border); }
  .pd-cap { font-size: 0.78rem; color: var(--ink-muted); }
  .pd-seg { display: inline-flex; border: 1px solid var(--border-strong); border-radius: 7px; overflow: hidden; font-size: 0.8rem; }
  .pd-seg button { border: 0; padding: 0.25rem 0.6rem; background: transparent; color: var(--ink-muted); cursor: pointer; font: inherit; font-size: 0.8rem; }
  .pd-seg button[aria-pressed='true'] { background: var(--accent); color: #fff; }
  .pd-seg button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .pd-list { max-height: 200px; overflow: auto; }
  .pd-list label { display: flex; align-items: center; gap: 0.5rem; padding: 0.45rem 0.6rem; border-bottom: 1px solid var(--border); font-size: 0.9rem; color: var(--ink); cursor: pointer; }
  .pd-list label:last-child { border-bottom: 0; }
  .pd-list input { margin: 0; accent-color: var(--accent); }
  .pd-hint { font-size: 0.78rem; color: var(--ink-muted); margin: 0; padding: 0.45rem 0.6rem; border-top: 1px solid var(--border); }
</style>

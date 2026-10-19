<script>
  // One row per film: poster, title, a 0–max track with Dr. X's score filled
  // and the other score (IMDb, the visitor) hollow, joined by a line.
  // rows: [{ href?, title, year, poster, drx, other }]. Plain HTML, so it reads
  // the same server-rendered (Insights) and in an island (Taste match).
  import { fmtScore } from '../../../shared/rating-meta.mjs';
  import { tmdbImg } from '../../lib/util.js';

  let { rows, other = 'IMDb', max = 10 } = $props();
  const pct = (v) => `${(Math.max(0, Math.min(max, v)) / max) * 100}%`;
</script>

<div class="dbs">
  {#each rows as r (r.title + r.year)}
    <svelte:element this={r.href ? 'a' : 'div'} class="db" href={r.href} title={`${r.title}: Dr. X ${fmtScore(r.drx)} · ${other} ${fmtScore(r.other)}`}>
      {#if r.poster}
        <img src={tmdbImg(r.poster, 'w92')} alt="" loading="lazy" width="30" height="45" />
      {:else}
        <span class="ph"></span>
      {/if}
      <span class="t"><b>{r.title}</b><span>{r.year ?? '–'}</span></span>
      <span class="track" aria-hidden="true">
        <i class="line" style={`left:${pct(Math.min(r.drx, r.other))};width:calc(${pct(Math.max(r.drx, r.other))} - ${pct(Math.min(r.drx, r.other))})`}></i>
        <i class="dot other" style={`left:${pct(r.other)}`}></i>
        <i class="dot drx" style={`left:${pct(r.drx)}`}></i>
      </span>
      <span class="v">{fmtScore(r.drx)}<span class="o">{` · ${fmtScore(r.other)}`}</span></span>
    </svelte:element>
  {/each}
  <div class="key"><span><i class="dot drx"></i>Dr. X</span><span><i class="dot other"></i>{other}</span><span class="o">/ {max}</span></div>
</div>

<style>
  .dbs { display: grid; gap: 0.1rem; }
  .db { display: grid; grid-template-columns: 30px minmax(0, 1.2fr) minmax(60px, 1fr) auto; gap: 0.75rem; align-items: center; padding: 0.3rem; border-radius: 4px; text-decoration: none; color: inherit; }
  a.db:hover { background: var(--bg-raised); }
  img, .ph { width: 30px; height: 45px; object-fit: cover; border-radius: 2px; border: 1px solid var(--border); background: var(--bg-raised); display: block; }
  .t { min-width: 0; line-height: 1.25; }
  .t b { display: block; font-family: var(--font-display); font-weight: 560; font-size: 1rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .t span { font-size: 0.74rem; color: var(--ink-faint); }
  .track { position: relative; height: 12px; background: linear-gradient(var(--border), var(--border)) center / 100% 1px no-repeat; }
  .line { position: absolute; top: 5px; height: 2px; background: var(--ink-faint); }
  .dot { position: absolute; top: 1px; width: 10px; height: 10px; margin-left: -5px; border-radius: 50%; }
  .dot.other { border: 2px solid var(--ink-muted); background: var(--bg-panel); }
  .dot.drx { background: var(--accent); box-shadow: 0 0 0 2px var(--bg-panel); }
  .v { font-family: var(--font-mono); font-size: 0.8rem; white-space: nowrap; }
  .o { color: var(--ink-faint); }
  .key { display: flex; gap: 1rem; margin-top: 0.4rem; padding-left: 0.3rem; font-size: 0.76rem; color: var(--ink-muted); }
  .key span { display: inline-flex; align-items: center; gap: 0.4em; }
  .key .dot { position: static; margin: 0; display: inline-block; }
  @media (max-width: 640px) {
    .db { grid-template-columns: 30px minmax(0, 1fr) minmax(56px, 0.7fr) auto; gap: 0.55rem; }
  }
</style>

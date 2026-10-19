<script>
  // Horizontal bars as plain HTML rows (they reflow on phones, unlike SVG text).
  // rows: [{ label, value, n?, href?, side? }]; side 'content' / 'form' colours
  // the bar blue / red, anything else uses the accent. Rows with n below `thin`
  // are faded.
  import { fmtScore } from '../../../shared/rating-meta.mjs';

  let { rows, max, unit = '', thin = 0, label = '' } = $props();
</script>

<div class="hbars" role="list" aria-label={label || undefined}>
  {#each rows as r}
    <div class="hb" class:thin={r.n != null && r.n < thin} role="listitem" title={`${r.label}: ${fmtScore(r.value)}${unit}${r.n != null ? ` (${r.n} ${r.n === 1 ? 'film' : 'films'})` : ''}`}>
      <span class="k">{#if r.href}<a href={r.href}>{r.label}</a>{:else}{r.label}{/if}</span>
      <span class="track"><i class={r.side ?? ''} style={`width:${Math.max(0, Math.min(1, r.value / max)) * 100}%`}></i></span>
      <span class="v">{fmtScore(r.value)}{unit}</span>
      {#if r.n != null}<span class="n">{r.n}</span>{/if}
    </div>
  {/each}
</div>

<style>
  .hbars { display: grid; gap: 0.3rem; font-size: 0.84rem; }
  .hb { display: grid; grid-template-columns: minmax(0, 10rem) minmax(0, 1fr) 3rem 2rem; gap: 0.6rem; align-items: center; }
  .hb.thin { opacity: 0.5; }
  .k { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--ink-muted); }
  .k a { color: var(--accent); text-decoration: none; }
  .k a:hover { text-decoration: underline; }
  .track { height: 10px; }
  .track i { display: block; height: 100%; border-radius: 0 4px 4px 0; background: var(--accent); opacity: 0.85; }
  .track i.content { background: var(--content-c); opacity: 1; }
  .track i.form { background: var(--form-c); opacity: 1; }
  .v { text-align: right; font-family: var(--font-mono); font-size: 0.8rem; }
  .n { text-align: right; font-family: var(--font-mono); font-size: 0.72rem; color: var(--ink-faint); }
  @media (max-width: 640px) {
    .hb { grid-template-columns: minmax(0, 7.5rem) minmax(0, 1fr) 2.8rem 1.8rem; gap: 0.5rem; }
  }
</style>

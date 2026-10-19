<script>
  // Vertical columns from one baseline. rows: [{ label, value, n?, tip?, tick? }];
  // a row with n below `thin` is greyed, `values` prints each value on its cap,
  // `tick: false` leaves a column unlabelled (e.g. half-point histogram bins).
  import { fmtScore } from '../../../shared/rating-meta.mjs';

  let { rows, label, W = 640, H = 240, max = null, thin = 0, unit = '', values = true } = $props();

  const L = 30;
  const T = 18;
  const B = $derived(rows.some((r) => r.n != null) ? 44 : 28);
  const top = $derived(max ?? Math.max(...rows.map((r) => r.value)) * 1.08);
  const step = $derived([1, 2, 5, 10, 20, 25, 50, 100, 200].find((s) => top / s <= 5));
  const ticks = $derived(Array.from({ length: Math.floor(top / step) + 1 }, (_, i) => i * step));
  const band = $derived((W - L - 6) / rows.length);
  const bw = $derived(Math.min(24, band * 0.62));
  const y = (v) => T + (1 - v / top) * (H - T - B);
  // Square at the baseline, 4px rounded at the data end.
  const col = (cx, v) => {
    const top = Math.min(y(v), y(0) - 0.5);
    const r = Math.min(4, (y(0) - top) / 2, bw / 2);
    return `M${cx - bw / 2},${y(0)}V${top + r}q0,-${r} ${r},-${r}h${bw - 2 * r}q${r},0 ${r},${r}V${y(0)}z`;
  };
</script>

<svg viewBox={`0 0 ${W} ${H}`} class="chart" role="img" aria-label={label}>
  {#each ticks as t}
    <line x1={L} x2={W - 6} y1={y(t)} y2={y(t)} class="grid" />
    <text x={L - 6} y={y(t) + 4} text-anchor="end" class="tick">{t}</text>
  {/each}
  {#each rows as r, i}
    {@const cx = L + band * i + band / 2}
    {@const faint = r.n != null && r.n < thin}
    <g>
      <title>{r.tip ?? `${r.label}: ${fmtScore(r.value)}${unit}${r.n != null ? ` (${r.n} ${r.n === 1 ? 'film' : 'films'})` : ''}`}</title>
      <rect x={cx - band / 2} y={T} width={band} height={H - T - B} class="hit" />
      <path d={col(cx, r.value)} class={faint ? 'col thin' : 'col'} />
    </g>
    {#if values}<text x={cx} y={y(r.value) - 6} text-anchor="middle" class={faint ? 'val thin' : 'val'}>{fmtScore(r.value)}</text>{/if}
    {#if r.tick !== false}<text x={cx} y={H - B + 16} text-anchor="middle" class="tick">{r.label}</text>{/if}
    {#if r.n != null}<text x={cx} y={H - B + 31} text-anchor="middle" class="n">n {r.n}</text>{/if}
  {/each}
</svg>

<style>
  .chart { width: 100%; height: auto; display: block; overflow: visible; }
  .grid { stroke: var(--border); stroke-width: 1; }
  .tick { fill: var(--ink-faint); font: 11px var(--font-ui); }
  .n { fill: var(--ink-faint); font: 10px var(--font-mono); }
  .val { fill: var(--ink); font: 11px var(--font-mono); }
  .val.thin { fill: var(--ink-faint); }
  .hit { fill: transparent; }
  .col { fill: var(--accent); fill-opacity: 0.85; }
  .col.thin { fill: var(--ink-faint); fill-opacity: 0.45; }
  g:hover .col { fill-opacity: 1; }
</style>

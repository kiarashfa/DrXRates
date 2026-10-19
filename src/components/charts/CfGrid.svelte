<script>
  // Content average against form average: one circle per score pair, its area
  // proportional to the number of films there. The diagonal splits the films
  // where form leads (upper wash, red) from those where content leads (blue).
  import { fmtScore } from '../../../shared/rating-meta.mjs';

  let { cf, n } = $props();

  const L = 34;
  const T = 10;
  const S = 360;
  const W = L + S + 12;
  const H = T + S + 40;
  const x = (v) => L + (v / 5) * S;
  const y = (v) => T + (1 - v / 5) * S;
  const r = (count) => (1.6 + Math.sqrt(count) * 1.25).toFixed(1);
  const ticks = [0, 1, 2, 3, 4, 5];
</script>

<svg viewBox={`0 0 ${W} ${H}`} class="chart" role="img"
  aria-label={`Content average against form average for ${n} films; form leads on ${cf.formAhead}, content on ${cf.contentAhead}.`}>
  <polygon points={`${x(0)},${y(0)} ${x(0)},${y(5)} ${x(5)},${y(5)}`} class="wash form" />
  <polygon points={`${x(0)},${y(0)} ${x(5)},${y(0)} ${x(5)},${y(5)}`} class="wash content" />
  {#each ticks as t}
    <line x1={L} x2={L + S} y1={y(t)} y2={y(t)} class="grid" />
    <line x1={x(t)} x2={x(t)} y1={T} y2={T + S} class="grid" />
    <text x={L - 7} y={y(t) + 4} text-anchor="end" class="tick">{t}</text>
    <text x={x(t)} y={T + S + 17} text-anchor="middle" class="tick">{t}</text>
  {/each}
  <line x1={x(0)} y1={y(0)} x2={x(5)} y2={y(5)} class="diag" />
  {#each cf.cells as [c, f, count]}
    <circle cx={x(c).toFixed(1)} cy={y(f).toFixed(1)} r={r(count)} class="cell">
      <title>Content {fmtScore(c)}, form {fmtScore(f)}: {count} {count === 1 ? 'film' : 'films'}</title>
    </circle>
  {/each}
  <text x={x(0.2)} y={y(4.65)} class="label">Form ahead · {cf.formAhead.toLocaleString('en')}</text>
  <text x={x(4.8)} y={y(0.25)} text-anchor="end" class="label">Content ahead · {cf.contentAhead}</text>
  <text x={L + S} y={H - 2} text-anchor="end" class="axis">Content →</text>
  <text x={L} y={T} dx="4" dy="10" class="axis">↑ Form</text>
</svg>

<style>
  .chart { width: 100%; max-width: 470px; height: auto; display: block; overflow: visible; }
  .grid { stroke: var(--border); stroke-width: 1; }
  .diag { stroke: var(--ink-faint); stroke-width: 1; }
  .tick { fill: var(--ink-faint); font: 11px var(--font-ui); }
  .axis { fill: var(--ink-muted); font: 11.5px var(--font-ui); }
  .label { fill: var(--ink); font: 600 12px var(--font-ui); }
  .wash.content { fill: var(--content-c); fill-opacity: 0.08; }
  .wash.form { fill: var(--form-c); fill-opacity: 0.08; }
  .cell { fill: var(--ink-muted); fill-opacity: 0.6; stroke: var(--bg); stroke-width: 1; }
  .cell:hover { fill: var(--accent); fill-opacity: 1; }
</style>

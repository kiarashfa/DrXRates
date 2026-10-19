<script>
  // Dr. X's score against IMDb's: every film a faint dot (darker where films
  // coincide), the equal-percentile line, and the widest gaps ringed and named.
  // Rendered twice (wide and phone geometry) and switched in CSS, so labels
  // keep a readable size without any script.
  import { fmtScore } from '../../../shared/rating-meta.mjs';

  let { crowd, marks = 2 } = $props();

  const X0 = 3;
  const X1 = 9.5;
  const VARIANTS = [
    { cls: 'wide', W: 640, H: 420, L: 40, R: 16, T: 14, B: 40 },
    { cls: 'narrow', W: 360, H: 320, L: 30, R: 10, T: 12, B: 36 },
  ];

  function geometry(v) {
    const x = (s) => v.L + ((s - X0) / (X1 - X0)) * (v.W - v.L - v.R);
    const y = (s) => v.T + (1 - s / 10) * (v.H - v.T - v.B);
    const counts = new Map();
    for (const [imdb, my] of crowd.points) {
      const key = `${Math.round(x(imdb))} ${Math.round(y(my))}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const path = (keep) => [...counts].filter(([, n]) => keep(n)).map(([k]) => `M${k}h0`).join('');
    const hot = [...crowd.higher.slice(0, marks).map((f) => ({ ...f, up: true })), ...crowd.lower.slice(0, marks).map((f) => ({ ...f, up: false }))]
      .map((f) => ({ ...f, cx: x(f.imdb), cy: y(f.x), anchor: v.cls === 'wide' && f.up ? 'end' : 'start' }));
    // Keep labels on the same side at least one line apart.
    for (const side of ['end', 'start']) {
      const group = hot.filter((h) => h.anchor === side).sort((a, b) => a.cy - b.cy);
      group.forEach((h, i) => (h.ly = i && h.cy - group[i - 1].ly < 13 ? group[i - 1].ly + 13 : h.cy));
    }
    return {
      ...v,
      x,
      y,
      single: path((n) => n === 1),
      multi: path((n) => n > 1),
      hot,
      curve: crowd.curve.map(([i, m]) => `${x(i).toFixed(1)},${y(m).toFixed(1)}`).join(' '),
      start: crowd.curve[0],
      yTicks: [0, 2, 4, 6, 8, 10],
      xTicks: v.cls === 'wide' ? [3, 4, 5, 6, 7, 8, 9] : [3, 5, 7, 9],
    };
  }
  const variants = VARIANTS.map(geometry);
</script>

{#each variants as g}
  <svg viewBox={`0 0 ${g.W} ${g.H}`} class={`chart ${g.cls}`} role="img"
    aria-label={`Scatter plot of Dr. X's score against IMDb's for ${crowd.n} films; the line marks equal standing on both scales.`}>
    {#each g.yTicks as t}
      <line x1={g.L} x2={g.W - g.R} y1={g.y(t)} y2={g.y(t)} class="grid" />
      <text x={g.L - 7} y={g.y(t) + 4} text-anchor="end" class="tick">{t}</text>
    {/each}
    {#each g.xTicks as t}
      <line x1={g.x(t)} x2={g.x(t)} y1={g.T} y2={g.H - g.B} class="grid" />
      <text x={g.x(t)} y={g.H - g.B + 17} text-anchor="middle" class="tick">{t}</text>
    {/each}
    <text x={g.W - g.R} y={g.H - 3} text-anchor="end" class="axis">IMDb →</text>
    <text x={g.L} y={g.T - 2} class="axis" dx="4" dy="10">↑ Dr. X</text>
    <path d={g.single} class="dots" />
    <path d={g.multi} class="dots many" />
    <polyline points={g.curve} class="curve" />
    <text x={g.x(g.start[0]) + 8} y={g.y(g.start[1]) + 14} class="axis">equal standing</text>
    {#each g.hot as h}
      <g>
        <title>{h.title} ({h.year}): Dr. X {fmtScore(h.x)}, IMDb {fmtScore(h.imdb)}</title>
        <circle cx={h.cx} cy={h.cy} r="4.5" class="hot" />
        <text x={h.cx + (h.anchor === 'end' ? -9 : 9)} y={h.ly + 4} text-anchor={h.anchor} class="label">{h.title}</text>
      </g>
    {/each}
  </svg>
{/each}

<style>
  .chart { width: 100%; height: auto; display: block; overflow: visible; }
  .narrow { display: none; }
  @media (max-width: 640px) {
    .wide { display: none; }
    .narrow { display: block; }
  }
  .grid { stroke: var(--border); stroke-width: 1; }
  .tick { fill: var(--ink-faint); font: 11px var(--font-ui); }
  .axis { fill: var(--ink-muted); font: 11.5px var(--font-ui); }
  .dots { fill: none; stroke: var(--ink-muted); stroke-opacity: 0.3; stroke-width: 5; stroke-linecap: round; }
  .dots.many { stroke-opacity: 0.6; }
  .curve { fill: none; stroke: var(--accent); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
  .hot { fill: var(--accent); stroke: var(--bg); stroke-width: 2; }
  .label { fill: var(--ink); font: 600 11.5px var(--font-ui); paint-order: stroke; stroke: var(--bg); stroke-width: 3px; stroke-linejoin: round; }
  :global(:root[data-theme='matrix']) .curve { filter: drop-shadow(0 0 3px var(--accent)); }
</style>

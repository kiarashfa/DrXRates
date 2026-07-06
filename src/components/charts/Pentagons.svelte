<script>
  import { CONTENT_KEYS, FORM_KEYS, computeTotals, fmtScore } from '../../../shared/rating-meta.mjs';

  let { mine = null, visitor = null } = $props();

  const primary = $derived(mine ?? visitor);
  const overlay = $derived(mine && visitor ? visitor : null);
  const primaryTotals = $derived(primary ? computeTotals(primary) : null);

  const R = 88;
  const CY = 150;
  const C1 = 155;
  const C2 = 455;

  const f1 = fmtScore;

  function vertex(cx, cy, i, r) {
    const a = (-90 + i * 72) * (Math.PI / 180);
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  }
  function ring(cx, cy, frac) {
    return Array.from({ length: 5 }, (_, i) => vertex(cx, cy, i, R * frac).map((v) => v.toFixed(1)).join(',')).join(' ');
  }
  function shape(cx, cy, keys, scores) {
    return keys
      .map((k, i) => vertex(cx, cy, i, (Math.max(scores[k.key], 0.08) / 5) * R).map((v) => v.toFixed(1)).join(','))
      .join(' ');
  }
  function labelPos(cx, cy, i) {
    const [x, y] = vertex(cx, cy, i, R + 16);
    const anchor = i === 0 ? 'middle' : i === 1 || i === 2 ? 'start' : 'end';
    return { x: x.toFixed(1), y: (y + 4).toFixed(1), anchor };
  }
</script>

<svg viewBox="0 0 660 320" width="100%" role="img" aria-label="Rating breakdown as two radar pentagons, content and form">
  {#each [{ cx: C1, keys: CONTENT_KEYS, color: 'var(--content-c)', label: 'Content', avg: primaryTotals?.contentAvg }, { cx: C2, keys: FORM_KEYS, color: 'var(--form-c)', label: 'Form', avg: primaryTotals?.formAvg }] as p}
    {#each [1, 0.6, 0.2] as frac}
      <polygon points={ring(p.cx, CY, frac)} style={`fill: none; stroke: var(--border); stroke-width: ${frac === 1 ? 1.2 : 0.7};`} />
    {/each}
    {#each [0, 1, 2, 3, 4] as i}
      <line
        x1={p.cx} y1={CY}
        x2={vertex(p.cx, CY, i, R)[0].toFixed(1)} y2={vertex(p.cx, CY, i, R)[1].toFixed(1)}
        style="stroke: var(--border); stroke-width: 0.7;"
      />
      <text x={labelPos(p.cx, CY, i).x} y={labelPos(p.cx, CY, i).y} text-anchor={labelPos(p.cx, CY, i).anchor}
        style="fill: var(--ink-muted); font-family: var(--font-ui); font-size: 11.5px;">{p.keys[i].short}</text>
    {/each}
    {#if primary}
      <polygon points={shape(p.cx, CY, p.keys, primary)} style={`fill: ${p.color}; fill-opacity: 0.22; stroke: ${p.color}; stroke-width: 2;`} />
      {#each p.keys as k, i}
        <circle
          cx={vertex(p.cx, CY, i, (Math.max(primary[k.key], 0.08) / 5) * R)[0].toFixed(1)}
          cy={vertex(p.cx, CY, i, (Math.max(primary[k.key], 0.08) / 5) * R)[1].toFixed(1)}
          r="3" style={`fill: ${p.color};`}
        />
      {/each}
    {/if}
    {#if overlay}
      <polygon points={shape(p.cx, CY, p.keys, overlay)} style={`fill: none; stroke: ${p.color}; stroke-width: 1.4; stroke-dasharray: 4 3;`} />
    {/if}
    <text x={p.cx} y="290" text-anchor="middle" style="fill: var(--ink); font-family: var(--font-ui); font-size: 13px; font-weight: 600;">
      {p.label}{p.avg != null ? ` · ${f1(p.avg)}` : ''}
    </text>
  {/each}
  <text x="305" y="150" text-anchor="middle" style="fill: var(--ink); font-family: var(--font-numeral); font-size: 26px; font-weight: 600;">
    {primaryTotals ? f1(primaryTotals.overall) : '—'}
  </text>
  <text x="305" y="170" text-anchor="middle" style="fill: var(--ink-muted); font-family: var(--font-ui); font-size: 12px;">/ 10</text>
  {#if overlay}
    <text x="305" y="308" text-anchor="middle" style="fill: var(--ink-muted); font-family: var(--font-ui); font-size: 11.5px;">solid — my score · dashed — yours</text>
  {/if}
</svg>

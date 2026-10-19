<script>
  // One half of the ten-part system as a pentagon (same geometry as
  // Pentagons.svelte): `solid` filled, `dashed` outlined. Two of these side by
  // side, or stacked on phones, replace the joint Pentagons chart where the
  // halves need to wrap.
  import { CONTENT_KEYS, FORM_KEYS, fmtScore } from '../../../shared/rating-meta.mjs';

  let { side = 'content', solid, dashed = null, solidLabel = 'Dr. X', dashedLabel = 'You' } = $props();

  const keys = side === 'content' ? CONTENT_KEYS : FORM_KEYS;
  const color = side === 'content' ? 'var(--content-c)' : 'var(--form-c)';
  const R = 88;
  const C = 150;
  const vertex = (i, r) => {
    const a = (-90 + i * 72) * (Math.PI / 180);
    return [C + r * Math.cos(a), C - 12 + r * Math.sin(a)];
  };
  const pts = (vals) => keys.map((k, i) => vertex(i, (Math.max(vals[k.key], 0.08) / 5) * R).map((v) => v.toFixed(1)).join(',')).join(' ');
  const ring = (f) => keys.map((_, i) => vertex(i, R * f).map((v) => v.toFixed(1)).join(',')).join(' ');
  const avg = (vals) => keys.reduce((t, k) => t + vals[k.key], 0) / keys.length;
  const half = (vals) => fmtScore(Math.round(avg(vals) * 100) / 100);
  const caption = $derived(
    `${side === 'content' ? 'Content' : 'Form'} · ${solidLabel} ${half(solid)}${dashed ? ` · ${dashedLabel} ${half(dashed)}` : ''}`
  );
  const label = (i) => {
    const [x, y] = vertex(i, R + 15);
    return { x: x.toFixed(1), y: (y + 4).toFixed(1), anchor: i === 0 ? 'middle' : i < 3 ? 'start' : 'end' };
  };
</script>

<svg viewBox="0 0 300 290" class="chart" role="img"
  aria-label={`${side === 'content' ? 'Content' : 'Form'} criteria: ${solidLabel} average ${fmtScore(avg(solid))}${dashed ? `, ${dashedLabel} ${fmtScore(avg(dashed))}` : ''}`}>
  {#each [1, 0.6, 0.2] as f}
    <polygon points={ring(f)} class="ring" />
  {/each}
  {#each keys as k, i}
    {@const [x2, y2] = vertex(i, R)}
    {@const l = label(i)}
    <line x1={C} y1={C - 12} x2={x2.toFixed(1)} y2={y2.toFixed(1)} class="ring" />
    <text x={l.x} y={l.y} text-anchor={l.anchor} class="tick">{k.short}</text>
  {/each}
  <polygon points={pts(solid)} style={`fill:${color};fill-opacity:0.2;stroke:${color};stroke-width:2;`} />
  {#if dashed}<polygon points={pts(dashed)} style={`fill:none;stroke:${color};stroke-width:1.6;stroke-dasharray:4 3;`} />{/if}
  <text x={C} y="270" text-anchor="middle" class="cap">
    {caption}
  </text>
</svg>

<style>
  .chart { width: 100%; max-width: 320px; height: auto; display: block; margin: 0 auto; overflow: visible; }
  .ring { fill: none; stroke: var(--border); stroke-width: 0.8; }
  .tick { fill: var(--ink-muted); font: 11.5px var(--font-ui); }
  .cap { fill: var(--ink); font: 600 13px var(--font-ui); }
</style>

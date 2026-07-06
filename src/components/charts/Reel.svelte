<script>
  import { CONTENT_KEYS, FORM_KEYS, computeTotals, fmtScore } from '../../../shared/rating-meta.mjs';

  let { mine = null, visitor = null } = $props();

  const primary = $derived(mine ?? visitor);
  const overlay = $derived(mine && visitor ? visitor : null);
  const primaryTotals = $derived(primary ? computeTotals(primary) : null);

  const CX = 320;
  const CY = 168;
  const R0 = 42;
  const RMAX = 118;

  const f1 = fmtScore;

  // Content occupies the right half, form the left — 10 spokes, 36° apart.
  const spokes = $derived(
    [...CONTENT_KEYS.map((k, i) => ({ ...k, angle: -72 + i * 36, color: 'var(--content-c)' })),
     ...FORM_KEYS.map((k, i) => ({ ...k, angle: 108 + i * 36, color: 'var(--form-c)' }))]
  );

  function pt(angle, r) {
    const a = angle * (Math.PI / 180);
    return [(CX + r * Math.cos(a)).toFixed(1), (CY + r * Math.sin(a)).toFixed(1)];
  }
  function rFor(v) {
    return R0 + (Math.max(v, 0.15) / 5) * (RMAX - R0);
  }
</script>

<svg viewBox="0 0 640 336" width="100%" role="img" aria-label="Rating breakdown as a ten-segment reel dial">
  {#each spokes as s}
    <line x1={pt(s.angle, R0)[0]} y1={pt(s.angle, R0)[1]} x2={pt(s.angle, RMAX)[0]} y2={pt(s.angle, RMAX)[1]}
      style="stroke: var(--border); stroke-width: 13; stroke-linecap: round;" />
    {#if primary}
      <line x1={pt(s.angle, R0)[0]} y1={pt(s.angle, R0)[1]} x2={pt(s.angle, rFor(primary[s.key]))[0]} y2={pt(s.angle, rFor(primary[s.key]))[1]}
        style={`stroke: ${s.color}; stroke-width: 13; stroke-linecap: round;`} />
    {/if}
    {#if overlay}
      <circle cx={pt(s.angle, rFor(overlay[s.key]))[0]} cy={pt(s.angle, rFor(overlay[s.key]))[1]} r="4.5"
        style={`fill: var(--bg-panel); stroke: ${s.color}; stroke-width: 1.6;`} />
    {/if}
    <text x={pt(s.angle, RMAX + 18)[0]} y={Number(pt(s.angle, RMAX + 18)[1]) + 4}
      text-anchor={Math.cos(s.angle * Math.PI / 180) > 0.35 ? 'start' : Math.cos(s.angle * Math.PI / 180) < -0.35 ? 'end' : 'middle'}
      style="fill: var(--ink-muted); font-family: var(--font-ui); font-size: 11px;">{s.short}</text>
  {/each}

  <circle cx={CX} cy={CY} r="34" style="fill: var(--bg-raised); stroke: var(--border-strong);" />
  <text x={CX} y={CY + 1} text-anchor="middle" style="fill: var(--ink); font-family: var(--font-numeral); font-size: 20px; font-weight: 600;">
    {primaryTotals ? f1(primaryTotals.overall) : '—'}
  </text>
  <text x={CX} y={CY + 17} text-anchor="middle" style="fill: var(--ink-muted); font-family: var(--font-ui); font-size: 10.5px;">/ 10</text>

  <text x="626" y="326" text-anchor="end" style="fill: var(--content-c); font-family: var(--font-ui); font-size: 12px; font-weight: 600;">
    ● Content{primaryTotals ? ` ${f1(primaryTotals.contentAvg)}` : ''}
  </text>
  <text x="14" y="326" style="fill: var(--form-c); font-family: var(--font-ui); font-size: 12px; font-weight: 600;">
    ● Form{primaryTotals ? ` ${f1(primaryTotals.formAvg)}` : ''}
  </text>
  {#if overlay}
    <text x="320" y="326" text-anchor="middle" style="fill: var(--ink-muted); font-family: var(--font-ui); font-size: 11px;">○ your score</text>
  {/if}
</svg>

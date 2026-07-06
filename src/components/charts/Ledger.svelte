<script>
  import { CONTENT_KEYS, FORM_KEYS, computeTotals, fmtScore } from '../../../shared/rating-meta.mjs';

  let { mine = null, visitor = null } = $props();

  const primary = $derived(mine ?? visitor);
  const overlay = $derived(mine && visitor ? visitor : null);
  const primaryTotals = $derived(primary ? computeTotals(primary) : null);
  const overlayTotals = $derived(overlay ? computeTotals(overlay) : null);

  const LABEL_X = 148;
  const TRACK_X = 160;
  const TRACK_W = 380;
  const VAL_X = 552;
  const ROW_H = 26;

  const f1 = fmtScore;

  function rows(keys, startY) {
    return keys.map((k, i) => ({ ...k, y: startY + i * ROW_H }));
  }
  const contentRows = $derived(rows(CONTENT_KEYS, 56));
  const formRows = $derived(rows(FORM_KEYS, 56 + 5 * ROW_H + 46));
  const H = $derived(56 + 10 * ROW_H + 46 + 42);
</script>

<svg viewBox={`0 0 640 ${H}`} width="100%" role="img" aria-label="Rating breakdown as grouped bars">
  <text x="12" y="24" style="fill: var(--content-c); font-family: var(--font-ui); font-size: 13px; font-weight: 650; letter-spacing: 0.08em;">
    CONTENT {primaryTotals ? `· ${f1(primaryTotals.contentAvg)}` : ''}
    {overlayTotals ? ` (you: ${f1(overlayTotals.contentAvg)})` : ''}
  </text>
  {#each contentRows as r}
    <text x={LABEL_X} y={r.y + 4} text-anchor="end" style="fill: var(--ink-muted); font-family: var(--font-ui); font-size: 12px;">{r.short}</text>
    <rect x={TRACK_X} y={r.y - 5} width={TRACK_W} height="9" rx="4.5" style="fill: var(--border);" />
    {#if primary}
      <rect x={TRACK_X} y={r.y - 5} width={(primary[r.key] / 5) * TRACK_W} height="9" rx="4.5" style="fill: var(--content-c);" />
    {/if}
    {#if overlay}
      <rect x={TRACK_X} y={r.y + 6} width={(overlay[r.key] / 5) * TRACK_W} height="4" rx="2" style="fill: none; stroke: var(--content-c); stroke-width: 1;" />
    {/if}
    <text x={VAL_X} y={r.y + 4} style="fill: var(--ink); font-family: var(--font-mono); font-size: 12px;">
      {primary ? f1(primary[r.key]) : '—'}{overlay ? ` · ${f1(overlay[r.key])}` : ''}
    </text>
  {/each}

  <text x="12" y={formRows[0].y - 22} style="fill: var(--form-c); font-family: var(--font-ui); font-size: 13px; font-weight: 650; letter-spacing: 0.08em;">
    FORM {primaryTotals ? `· ${f1(primaryTotals.formAvg)}` : ''}
    {overlayTotals ? ` (you: ${f1(overlayTotals.formAvg)})` : ''}
  </text>
  {#each formRows as r}
    <text x={LABEL_X} y={r.y + 4} text-anchor="end" style="fill: var(--ink-muted); font-family: var(--font-ui); font-size: 12px;">{r.short}</text>
    <rect x={TRACK_X} y={r.y - 5} width={TRACK_W} height="9" rx="4.5" style="fill: var(--border);" />
    {#if primary}
      <rect x={TRACK_X} y={r.y - 5} width={(primary[r.key] / 5) * TRACK_W} height="9" rx="4.5" style="fill: var(--form-c);" />
    {/if}
    {#if overlay}
      <rect x={TRACK_X} y={r.y + 6} width={(overlay[r.key] / 5) * TRACK_W} height="4" rx="2" style="fill: none; stroke: var(--form-c); stroke-width: 1;" />
    {/if}
    <text x={VAL_X} y={r.y + 4} style="fill: var(--ink); font-family: var(--font-mono); font-size: 12px;">
      {primary ? f1(primary[r.key]) : '—'}{overlay ? ` · ${f1(overlay[r.key])}` : ''}
    </text>
  {/each}

  <line x1="12" y1={H - 36} x2="628" y2={H - 36} style="stroke: var(--border-strong);" />
  <text x="12" y={H - 12} style="fill: var(--ink-muted); font-family: var(--font-ui); font-size: 13px;">Overall</text>
  <text x="76" y={H - 10} style="fill: var(--ink); font-family: var(--font-numeral); font-size: 21px; font-weight: 600;">
    {primaryTotals ? `${f1(primaryTotals.overall)} / 10` : '—'}
  </text>
  {#if overlayTotals}
    <text x="200" y={H - 12} style="fill: var(--ink-muted); font-family: var(--font-ui); font-size: 13px;">your score: {f1(overlayTotals.overall)} / 10</text>
  {/if}
</svg>

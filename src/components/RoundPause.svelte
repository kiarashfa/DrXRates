<script>
  // The pause between knockout rounds: the field before and after, what the
  // round took, and the road to the title as a snake of stops (three per row)
  // with the stretch just covered drawn in gold. `stops` are the rounds in
  // order, `done` the index of the one just finished.
  let { name, entering, advancing, matches, ms, stops, done, nextName, nextMatches, oncontinue, onundo } = $props();

  const W = 360, MX = 54, GAP = 56, TOP = 22, COLS = 3;
  const total = $derived(stops.length + 1); // the rounds, then the crown
  const left = $derived(stops.length - done - 1);

  // Stops on rows that alternate direction, joined by half-circle turns. Each
  // stop carries its distance along the path so the gold can stop on it.
  const geo = $derived.by(() => {
    const step = (W - 2 * MX) / (COLS - 1);
    const rows = Math.ceil(total / COLS);
    const r = GAP / 2;
    let d = '';
    let len = 0;
    const nodes = [];
    for (let row = 0; row < rows; row++) {
      const y = TOP + row * GAP;
      const dir = row % 2 ? -1 : 1;
      const inRow = Math.min(COLS, total - row * COLS);
      const x0 = dir > 0 ? MX : W - MX;
      if (!row) d += `M${x0} ${y}`;
      for (let k = 0; k < inRow; k++) nodes.push({ x: x0 + dir * k * step, y, len: len + k * step });
      if (row < rows - 1) {
        const xe = x0 + dir * (COLS - 1) * step;
        d += ` L${xe} ${y} A${r} ${r} 0 0 ${dir > 0 ? 1 : 0} ${xe} ${y + GAP}`;
        len += (COLS - 1) * step + Math.PI * r;
      } else {
        d += ` L${x0 + dir * (inRow - 1) * step} ${y}`;
        len += (inRow - 1) * step;
      }
    }
    return { d, len, nodes, h: TOP + (rows - 1) * GAP + 40 };
  });

  const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  let shown = $state(0);
  let gold = $state(null);
  let button = $state(null);

  // Count the field down and grow the gold to the new stop.
  $effect(() => {
    const from = done > 0 ? geo.nodes[done - 1].len : 0;
    const to = geo.nodes[done].len;
    const path = gold;
    if (!path) return;
    if (reduced()) {
      shown = advancing;
      path.style.strokeDasharray = `${to} ${geo.len + 10}`;
      return;
    }
    shown = entering;
    path.style.transition = 'none';
    path.style.strokeDasharray = `${from} ${geo.len + 10}`;
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        path.style.transition = 'stroke-dasharray 1s 0.35s cubic-bezier(0.3, 0.8, 0.3, 1)';
        path.style.strokeDasharray = `${to} ${geo.len + 10}`;
      });
    });
    const t0 = performance.now();
    const tick = (t) => {
      const k = Math.max(0, Math.min(1, (t - t0 - 350) / 900));
      shown = Math.round(entering + (advancing - entering) * k * k);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });

  $effect(() => button?.focus({ preventScroll: true }));

  const clock = (t) => {
    const s = Math.round(t / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
</script>

<div class="rp" data-testid="ko-pause">
  <p class="rp-k">{name} complete</p>
  <div class="rp-num" aria-label={`${entering} films down to ${advancing}`}>
    <span class="was">{entering}</span><span class="arrow" aria-hidden="true">→</span><span class="now">{shown}</span>
  </div>
  <p class="rp-sub">films still in play</p>

  <svg class="rp-road" viewBox={`0 0 ${W} ${geo.h}`} role="img" aria-label={`${left} ${left === 1 ? 'round' : 'rounds'} to the title`}>
    <path class="base" d={geo.d} />
    <path class="gp" d={geo.d} bind:this={gold} />
    {#each geo.nodes as n, i}
      {#if i === stops.length}
        <g>
          <text class="crown" x={n.x} y={n.y}>♛</text>
          <text class="lb" x={n.x} y={n.y + 24}>title</text>
        </g>
      {:else}
        {@const st = i <= done ? 'done' : i === done + 1 ? 'next' : ''}
        <g class={st}>
          {#if st === 'next'}<circle class="halo" cx={n.x} cy={n.y} r="10" />{/if}
          <circle class="nd" cx={n.x} cy={n.y} r="10" />
          {#if st === 'done'}<text class="tk" x={n.x} y={n.y}>✓</text>{/if}
          <text class="lb" x={n.x} y={n.y + 24}>{stops[i].short}</text>
          <text class="lb2" x={n.x} y={n.y + 34}>{stops[i].left} left</text>
        </g>
      {/if}
    {/each}
  </svg>

  <p class="rp-cap"><b>{left}</b> {left === 1 ? 'round' : 'rounds'} to the title</p>
  <p class="rp-cap">Next: <b>{nextName}</b>, {nextMatches} {nextMatches === 1 ? 'match' : 'matches'}</p>

  <dl class="rp-stats">
    <div><dt>matches played</dt><dd>{matches}</dd></div>
    <div><dt>sent home</dt><dd>{matches}</dd></div>
    <div><dt>time on round</dt><dd>{clock(ms)}</dd></div>
  </dl>

  <button class="btn primary" bind:this={button} onclick={oncontinue} data-testid="ko-continue">Continue to {nextName} →</button>
  <p class="rp-hint"><span class="kbd">Enter</span> continue · <button class="rp-undo" onclick={onundo} data-testid="ko-pause-undo">Undo last pick</button></p>
</div>

<style>
  .rp { --gold: color-mix(in srgb, var(--accent) 62%, #fff); display: flex; flex-direction: column; align-items: center; text-align: center; padding: 0.6rem 0 0.2rem; animation: rp-in 0.35s var(--ease-out) both; }
  @keyframes rp-in { from { opacity: 0; transform: translateY(8px); } }
  .rp-k { margin: 0; font: 600 0.72rem/1.3 var(--font-ui); letter-spacing: 0.16em; text-transform: uppercase; color: var(--gold); }
  .rp-num { display: flex; align-items: center; gap: 1rem; margin-top: 0.3rem; font: italic 500 3.2rem/1 var(--font-display); }
  .rp-num .was { color: var(--ink-faint); text-decoration: line-through; text-decoration-thickness: 2px; text-decoration-color: var(--border); }
  .rp-num .arrow { font-size: 1.5rem; color: var(--gold); }
  .rp-num .now { min-width: 1.6ch; text-align: left; }
  .rp-sub { margin: 0.15rem 0 0; font: 0.72rem var(--font-mono); color: var(--ink-muted); }

  .rp-road { display: block; width: min(380px, 100%); height: auto; margin: 0.5rem 0 0.2rem; overflow: visible; }
  .rp-road .base, .rp-road .gp { fill: none; stroke-width: 4; }
  .rp-road .base { stroke: var(--border); stroke-linecap: round; }
  .rp-road .gp { stroke: var(--gold); }
  .rp-road .nd { fill: var(--bg-panel); stroke: var(--border-strong); stroke-width: 1.8; }
  .rp-road .done .nd { fill: var(--gold); stroke: var(--gold); }
  .rp-road .next .nd { stroke: var(--accent); stroke-width: 2.2; }
  .rp-road .halo { fill: none; stroke: color-mix(in srgb, var(--gold) 35%, transparent); stroke-width: 5; transform-box: fill-box; transform-origin: center; animation: rp-beat 1.4s ease-in-out infinite; }
  @keyframes rp-beat { 50% { transform: scale(1.35); opacity: 0.5; } }
  .rp-road .tk { fill: var(--bg); font: 700 9px var(--font-mono); text-anchor: middle; dominant-baseline: central; }
  .rp-road .lb { font: 9px var(--font-mono); fill: var(--ink-faint); text-anchor: middle; }
  .rp-road .lb2 { font: 8px var(--font-mono); fill: var(--ink-muted); text-anchor: middle; }
  .rp-road .done .lb { fill: var(--gold); }
  .rp-road .next .lb { fill: var(--ink); font-weight: 700; }
  .rp-road .crown { font: 22px var(--font-display); fill: var(--gold); text-anchor: middle; dominant-baseline: central; }

  .rp-cap { margin: 0; font: 0.74rem/1.5 var(--font-mono); color: var(--ink-muted); }
  .rp-cap b { color: var(--ink); font-weight: 600; }
  .rp-stats { display: flex; gap: 1.6rem; margin: 0.8rem 0 1rem; }
  .rp-stats div { display: flex; flex-direction: column-reverse; align-items: center; }
  .rp-stats dt { font: 0.66rem var(--font-mono); color: var(--ink-muted); }
  .rp-stats dd { margin: 0; font: 600 1.35rem var(--font-display); color: var(--ink); }
  .rp-hint { margin: 0.55rem 0 0; font: 0.7rem var(--font-mono); color: var(--ink-faint); }
  .rp-undo { background: none; border: none; padding: 0; font: inherit; color: inherit; text-decoration: underline; cursor: pointer; }
  .rp-undo:hover { color: var(--accent); }

  @media (max-width: 640px) {
    .rp-num { font-size: 2.7rem; }
    .rp-stats { gap: 1rem; }
  }
  @media (prefers-reduced-motion: reduce) {
    .rp, .rp-road .halo { animation: none; }
  }
</style>

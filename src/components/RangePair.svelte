<script>
  // A from–to range: two number fields plus a two-handle slider. Typing the
  // same value in both fields narrows to exactly that value. An end left at
  // its bound means "no limit" and is reported as null.
  let { label, min, max, step = 1, unit = '', lo = $bindable(null), hi = $bindable(null), anyText = 'Any', testid = null } = $props();

  let a = $state(lo ?? min);
  let b = $state(hi ?? max);

  function commit() {
    a = Math.min(Math.max(Math.round(Number(a) || min), min), max);
    b = Math.min(Math.max(Math.round(Number(b) || max), min), max);
    if (a > b) [a, b] = [b, a];
    lo = a > min ? a : null;
    hi = b < max ? b : null;
  }

  function slideA(e) {
    a = Math.min(Number(e.currentTarget.value), b);
    e.currentTarget.value = a;
    commit();
  }
  function slideB(e) {
    b = Math.max(Number(e.currentTarget.value), a);
    e.currentTarget.value = b;
    commit();
  }
  function reset() {
    a = min;
    b = max;
    commit();
  }

  const pct = (v) => ((v - min) / (max - min)) * 100;
  const summary = $derived(
    lo == null && hi == null
      ? anyText
      : lo != null && hi != null && lo === hi
        ? `Exactly ${lo}${unit}`
        : lo == null
          ? `Up to ${hi}${unit}`
          : hi == null
            ? `${lo}${unit} or more`
            : `${lo}–${hi}${unit}`
  );
</script>

<fieldset class="rp" data-testid={testid}>
  <legend class="rp-label">{label} <span class="rp-sum">{summary}</span></legend>
  <div class="rp-fields">
    <label><span class="visually-hidden">{label}: from</span>
      <input type="number" inputmode="numeric" {min} {max} {step} bind:value={a} onchange={commit} data-testid={testid && `${testid}-from`} />
    </label>
    <span class="rp-to">to</span>
    <label><span class="visually-hidden">{label}: to</span>
      <input type="number" inputmode="numeric" {min} {max} {step} bind:value={b} onchange={commit} data-testid={testid && `${testid}-to`} />
    </label>
    {#if unit}<span class="rp-unit">{unit.trim()}</span>{/if}
    {#if lo != null || hi != null}<button type="button" class="rp-reset" onclick={reset}>Any</button>{/if}
  </div>
  <div class="rp-track" style={`--a:${pct(a)}%; --b:${pct(b)}%;`}>
    <input type="range" {min} {max} {step} value={a} oninput={slideA} aria-label={`${label}: from`} tabindex="-1" />
    <input type="range" {min} {max} {step} value={b} oninput={slideB} aria-label={`${label}: to`} tabindex="-1" />
  </div>
</fieldset>

<style>
  .rp { border: 0; padding: 0; margin: 0; min-width: 0; }
  .rp-label { font-size: 0.68rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-faint); padding: 0; margin-bottom: 0.45rem; display: flex; gap: 0.6rem; align-items: baseline; width: 100%; }
  .rp-sum { text-transform: none; letter-spacing: 0; font-size: 0.8rem; color: var(--accent); }
  .rp-fields { display: flex; align-items: center; gap: 0.5rem; }
  .rp-fields input { width: 5.2em; font-family: var(--font-mono); font-size: 0.86rem; padding: 0.35em 0.5em; background: var(--bg-raised); color: var(--ink);
    border: 1px solid var(--border-strong); border-radius: var(--radius); }
  .rp-fields input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .rp-to, .rp-unit { font-size: 0.8rem; color: var(--ink-muted); }
  .rp-reset { margin-left: auto; background: none; border: 0; padding: 0; font-size: 0.78rem; color: var(--ink-muted); text-decoration: underline; text-underline-offset: 3px; }
  .rp-reset:hover { color: var(--accent); }
  /* Two range inputs stacked on one track; only their thumbs take pointer events. */
  .rp-track { position: relative; height: 22px; margin-top: 0.45rem; }
  .rp-track::before, .rp-track::after { content: ''; position: absolute; top: 50%; height: 3px; transform: translateY(-50%); border-radius: 2px; }
  .rp-track::before { left: 0; right: 0; background: var(--border-strong); }
  .rp-track::after { left: var(--a); right: calc(100% - var(--b)); background: var(--accent); }
  .rp-track input { position: absolute; inset: 0; width: 100%; margin: 0; background: none; pointer-events: none; appearance: none; -webkit-appearance: none; z-index: 1; }
  .rp-track input::-webkit-slider-runnable-track { background: none; height: 22px; }
  .rp-track input::-moz-range-track { background: none; }
  .rp-track input::-webkit-slider-thumb { -webkit-appearance: none; pointer-events: auto; width: 18px; height: 18px; margin-top: 2px; border-radius: 50%;
    background: var(--bg-raised); border: 2px solid var(--accent); cursor: grab; }
  .rp-track input::-moz-range-thumb { pointer-events: auto; width: 14px; height: 14px; border-radius: 50%; background: var(--bg-raised); border: 2px solid var(--accent); cursor: grab; }
</style>

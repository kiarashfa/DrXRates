<script>
  // The bracket as a table, read from the same rounds the matchup view plays.
  // Desktop: rounds as columns joined by connectors; draws over 32 split into
  // sections of 32 (Q1…) plus Finals. Phones: one round at a time as a list.
  // `compare` (another bracket's rounds on the same draw) marks the matches
  // where its pick differs.
  import { bracketViews } from '../lib/knockout.js';

  let { rounds, films, now = null, compare = null, compareLabel = 'You' } = $props();

  const views = $derived(bracketViews(rounds));
  const SHORT = { 2: 'Final', 4: 'SF', 8: 'QF' };
  const short = (entrants) => SHORT[entrants] ?? `R${entrants}`;

  // Open on the section / round in play.
  let view = $state(0);
  let round = $state(0);
  $effect(() => {
    const r = now?.round ?? 0;
    const i = now?.index ?? 0;
    round = now ? r : Math.max(0, rounds.length - 1);
    const sections = views.length - 1;
    if (views.length === 1 || !now) view = now ? 0 : views.length - 1;
    else if (r < views[0].rounds.length) view = Math.floor(i / (rounds[r].length / sections));
    else view = sections;
  });

  const isNow = (m) => now != null && m.round === now.round && m.index === now.index;
  function differs(m) {
    const o = compare?.[m.round]?.[m.index];
    if (!o || o.w == null || m.w == null || o.w === m.w) return null;
    const same = [o.a, o.b].sort().join() === [m.a, m.b].sort().join();
    return same ? o.w : null;
  }
  const title = (id) => films[id]?.title ?? '–';
</script>

{#snippet box(m)}
  {@const diff = differs(m)}
  <div class="bt-m" class:now={isNow(m)} class:diff={diff != null} title={diff != null ? `${compareLabel} picked ${title(diff)}` : null}>
    {#each [m.a, m.b] as id}
      {#if id == null}
        <div class="bt-row"><span class="s"></span><span class="t tbd">To be decided</span></div>
      {:else}
        <div class="bt-row" class:w={m.w === id} class:l={m.w != null && m.w !== id}>
          <span class="s">{films[id]?.seed ?? ''}</span><span class="t">{title(id)}</span>
          {#if m.w === id}<span class="tick" aria-label="won">✓</span>{/if}
        </div>
      {/if}
    {/each}
    {#if diff != null}<span class="visually-hidden">({compareLabel} picked {title(diff)})</span>{/if}
  </div>
{/snippet}

<div class="bt" data-testid="bracket-table">
  <div class="bt-desk">
    {#if views.length > 1}
      <div class="bt-tabs" role="tablist">
        {#each views as v, k}
          <button role="tab" aria-selected={view === k} class:on={view === k} onclick={() => (view = k)}>{v.label}</button>
        {/each}
      </div>
    {/if}
    <div class="bt-scroll">
      <div class="bt-cols" style={`--cols:${views[view]?.rounds.length ?? 1}`}>
        {#each views[view]?.rounds ?? [] as r, ri}
          {@const last = ri === views[view].rounds.length - 1}
          <div class="bt-col" class:last>
            <h4>{r.name}</h4>
            <div class="bt-ms">
              {#if r.matches.length === 1}
                <div class="bt-g"><div class="bt-slot" class:played={r.matches[0].w != null}>{@render box(r.matches[0])}</div></div>
              {:else}
                {#each { length: r.matches.length / 2 } as _, g}
                  {@const a = r.matches[2 * g]}
                  {@const b = r.matches[2 * g + 1]}
                  <div class="bt-g" class:played={a.w != null && b.w != null}>
                    <div class="bt-slot" class:played={a.w != null}>{@render box(a)}</div>
                    <div class="bt-slot" class:played={b.w != null}>{@render box(b)}</div>
                  </div>
                {/each}
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>
  </div>

  <div class="bt-phone">
    <div class="bt-tabs" role="tablist">
      {#each rounds as r, ri}
        <button role="tab" aria-selected={round === ri} class:on={round === ri} onclick={() => (round = ri)}>{short(r.length * 2)}</button>
      {/each}
    </div>
    <div class="bt-list">
      {#each rounds[round] ?? [] as m, i}
        {@render box({ ...m, round, index: i })}
      {/each}
    </div>
  </div>
</div>

<style>
  .bt-tabs { display: flex; border-bottom: 1px solid var(--border-strong); margin-bottom: 0.9rem; overflow-x: auto; scrollbar-width: none; }
  .bt-tabs button { background: none; border: 0; border-bottom: 2px solid transparent; margin-bottom: -1px; color: var(--ink-muted); padding: 0.5rem 0.85rem; font-size: 0.84rem; white-space: nowrap; }
  .bt-tabs button:hover { color: var(--ink); }
  .bt-tabs button.on { color: var(--accent); border-bottom-color: var(--accent); font-weight: 600; }
  .bt-scroll { overflow-x: auto; padding-bottom: 0.4rem; }
  .bt-cols { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 0 28px; align-items: stretch; min-width: calc(var(--cols) * 168px + (var(--cols) - 1) * 28px); }
  .bt-col { display: flex; flex-direction: column; min-width: 0; }
  .bt-col h4 { margin: 0 0 0.5rem; font: 600 0.68rem/1 var(--font-ui); letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-faint); }
  /* A column is a stack of groups, one per match in the next round; a group's
     two slots each centre a match. Columns share one height, so a group's
     middle meets the match it feeds. Connector: the slot stubs, the group's
     ::before (vertical, between the slot centres) and ::after (into the next
     column), drawn in the accent once both matches are decided. */
  .bt-ms { flex: 1; display: flex; flex-direction: column; }
  .bt-g { flex: 1; display: flex; flex-direction: column; position: relative; }
  .bt-slot { flex: 1; display: flex; flex-direction: column; justify-content: center; position: relative; }
  .bt-col:not(.last) .bt-slot::after { content: ''; position: absolute; right: -14px; top: 50%; width: 14px; border-top: 1px solid var(--border-strong); }
  .bt-col:not(.last) .bt-g::before { content: ''; position: absolute; right: -14px; top: 25%; bottom: 25%; border-right: 1px solid var(--border-strong); }
  .bt-col:not(.last) .bt-g::after { content: ''; position: absolute; right: -28px; top: 50%; width: 14px; border-top: 1px solid var(--border-strong); }
  .bt-col:not(.last) .bt-slot.played::after, .bt-col:not(.last) .bt-g.played::before, .bt-col:not(.last) .bt-g.played::after { border-color: var(--accent); }

  .bt-m { position: relative; border: 1px solid var(--border); border-radius: 4px; background: var(--bg-raised); font-size: 0.78rem; margin: 3px 0; min-width: 0; }
  .bt-row { display: flex; gap: 0.4rem; align-items: baseline; padding: 0.22rem 0.5rem; white-space: nowrap; min-width: 0; }
  .bt-row + .bt-row { border-top: 1px solid var(--border); }
  .s { font-family: var(--font-mono); font-size: 0.72rem; color: var(--ink-faint); min-width: 1.7em; text-align: right; flex-shrink: 0; }
  .t { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .tbd { color: var(--ink-faint); font-style: italic; }
  .w .t { font-weight: 600; color: var(--ink); }
  .tick { color: var(--accent); margin-left: auto; padding-left: 0.2rem; }
  .l .t { color: var(--ink-faint); text-decoration: line-through; text-decoration-color: color-mix(in srgb, var(--ink-faint) 60%, transparent); }
  .bt-m.now { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .bt-m.now::before { content: 'now'; position: absolute; right: -2px; top: -9px; font: 600 0.58rem/1 var(--font-mono); background: var(--accent); color: var(--bg); padding: 2px 4px; border-radius: 2px; }
  .bt-m.diff { border-style: dashed; }
  .bt-m.diff::after { content: ''; position: absolute; left: -4px; top: 50%; width: 7px; height: 7px; margin-top: -3.5px; border-radius: 50%; background: var(--ink-muted); }

  .bt-phone { display: none; }
  .bt-list .bt-m { margin: 0 0 6px; font-size: 0.86rem; }
  .bt-list .bt-row { padding: 0.42rem 0.6rem; }
  @media (max-width: 640px) {
    .bt-desk { display: none; }
    .bt-phone { display: block; }
  }
</style>

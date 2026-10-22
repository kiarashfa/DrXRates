<script>
  // A film-title field with suggestions from the whole archive (original
  // titles count), ranked by the site search. A guess is always a film picked
  // from the list: Enter takes the highlighted one.
  import { search } from '../lib/search.js';

  let { index = null, onpick, disabled = false, placeholder = 'Type a title…', autofocus = true, testid = 'title-input' } = $props();

  let query = $state('');
  let active = $state(0);
  let input = $state(null);
  const results = $derived(index && query.trim().length >= 2 ? (search(index, query, { films: 6, directors: 0, people: 0, places: 0 })?.films ?? []) : []);

  $effect(() => {
    if (autofocus && !disabled && input) input.focus({ preventScroll: true });
  });
  $effect(() => {
    query;
    active = 0;
  });

  function choose(film) {
    if (!film || disabled) return;
    query = '';
    onpick?.(film);
  }
  function keydown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      active = Math.min(active + 1, results.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      active = Math.max(active - 1, 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      choose(results[active]);
    }
  }
</script>

<div class="ti" data-testid={testid}>
  <input
    bind:this={input}
    bind:value={query}
    onkeydown={keydown}
    {disabled}
    placeholder={index ? placeholder : 'Loading titles…'}
    aria-label="Film title"
    autocomplete="off"
    spellcheck="false"
  />
  {#if results.length}
    <ul class="ti-list" role="listbox">
      {#each results as f, i (f.id)}
        <li role="option" aria-selected={i === active}>
          <button type="button" onmousedown={(e) => e.preventDefault()} onclick={() => choose(f)} onmouseenter={() => (active = i)}>
            <span class="ti-t">{f.title}</span><span class="ti-y">{f.year ?? '–'}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .ti { position: relative; }
  input { width: 100%; font: 1rem var(--font-display); padding: 0.6em 0.75em; border: 1px solid var(--accent); border-radius: var(--radius); background: var(--bg-raised); color: var(--ink); }
  input:disabled { opacity: 0.5; }
  .ti-list { position: absolute; z-index: 20; left: 0; right: 0; top: calc(100% + 4px); list-style: none; margin: 0; padding: 4px; border: 1px solid var(--border-strong); border-radius: var(--radius); background: var(--bg-raised); box-shadow: 0 12px 26px -12px rgb(0 0 0 / 0.55); }
  .ti-list button { display: flex; justify-content: space-between; gap: 0.8rem; width: 100%; text-align: left; padding: 0.4rem 0.55rem; border: 0; border-radius: 4px; background: transparent; color: var(--ink); font-size: 0.88rem; }
  [aria-selected='true'] button { background: color-mix(in srgb, var(--accent) 16%, transparent); }
  .ti-t { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ti-y { flex: none; font: 0.74rem var(--font-mono); color: var(--ink-faint); }
</style>

<script>
  // One bracket in play: the 1 v 1 matchup view and the bracket table, two
  // views of the same picks. ← / → pick, Z undoes, a tap or swipe picks on
  // touch screens. `pairsFrom` replays another bracket's exact matchups.
  // `onchange(picks)` fires after every pick or undo, `onfinish(championId)`
  // when the last match is decided; `done` renders under the champion,
  // whose screen is headed `champLabel`.
  import { bracketRounds, nextMatch, champion, roundName } from '../lib/knockout.js';
  import { loadPosters } from '../lib/archive.js';
  import { withBase } from '../lib/util.js';
  import FilmCard from './FilmCard.svelte';
  import BracketTable from './BracketTable.svelte';
  import ChampionReveal from './ChampionReveal.svelte';

  let {
    slots,
    picks = $bindable([]),
    films,
    pairsFrom = null,
    kicker = 'Knockout',
    champLabel = 'Champion',
    shareUrl = null,
    onchange = null,
    onfinish = null,
    done = null,
    compare = null,
    compareLabel = 'You',
  } = $props();

  const PICK_MS = 820; // the pick animation, see the .won / .lost styles

  let view = $state('match');
  let blind = $state(false);
  let picking = $state(null); // 0 or 1 while the pick animation runs
  let copied = $state(false);
  let posters = $state({});

  const size = $derived(slots.length);
  const rounds = $derived(bracketRounds(slots, picks, pairsFrom));
  const next = $derived(nextMatch(rounds));
  const winner = $derived(next ? null : champion(rounds));
  // The champion's run: whom it beat in each round.
  const road = $derived(
    winner == null
      ? []
      : rounds.map((r, ri) => {
          const m = r.find((x) => x.w === winner);
          return { round: roundName(size >> ri), film: film(m.a === winner ? m.b : m.a) };
        })
  );
  const film = (id) => {
    const f = films[id];
    return f && !f.poster && posters[id] ? { ...f, poster: posters[id] } : f;
  };

  // Posters for the match in play and the one after it, from the small
  // shards (cup entrants and stored brackets usually carry their own).
  $effect(() => {
    if (!next) return;
    const after = nextMatch(bracketRounds(slots, [...picks, next.a], pairsFrom));
    const want = [next.a, next.b, after?.a, after?.b].filter((id) => id != null && !films[id]?.poster && !(id in posters));
    if (!want.length) return;
    loadPosters(want)
      .then((m) => (posters = { ...posters, ...Object.fromEntries(m) }))
      .catch(() => {});
  });

  const entrants = (r) => size >> r;
  const through = (r) => {
    const n = entrants(r + 1);
    if (n === 1) return 'Champion';
    if (n === 2) return 'Through to the final';
    if (n === 4) return 'Through to the semis';
    if (n === 8) return 'Through to the QF';
    return `Through to R${n}`;
  };

  const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function choose(side) {
    if (picking != null || !next) return;
    const id = side ? next.b : next.a;
    const commit = () => {
      picking = null;
      picks = [...picks, id];
      onchange?.(picks);
      if (picks.length === size - 1) onfinish?.(id);
    };
    if (reduced()) return commit();
    picking = side;
    setTimeout(commit, PICK_MS);
  }

  function undo() {
    if (picking != null || !picks.length) return;
    picks = picks.slice(0, -1);
    onchange?.(picks);
  }

  $effect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input, select, textarea, [contenteditable]')) return;
      if (view === 'match' && e.key === 'ArrowLeft') choose(0);
      else if (view === 'match' && e.key === 'ArrowRight') choose(1);
      else if (e.key === 'z' || e.key === 'Z') undo();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Swipe towards the film you pick.
  let touch = null;
  const onTouchStart = (e) => (touch = { x: e.touches[0].clientX, y: e.touches[0].clientY });
  function onTouchEnd(e) {
    if (!touch) return;
    const dx = e.changedTouches[0].clientX - touch.x;
    const dy = e.changedTouches[0].clientY - touch.y;
    touch = null;
    if (Math.abs(dx) > 60 && Math.abs(dy) < 50) choose(dx < 0 ? 0 : 1);
  }

  async function copyLink() {
    const url = shareUrl?.(picks);
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
      setTimeout(() => (copied = false), 2500);
    } catch {
      prompt('Copy this link', url);
    }
  }

  const icon = (name) => `${withBase('/icons.svg')}#i-${name}`;
</script>

<div class="kp panel" data-testid="knockout-player">
  {#if next}
    <div class="kp-prog">
      <span>{kicker} · <b data-testid="ko-round">{roundName(entrants(next.round))}</b></span>
      <span data-testid="ko-match">match {next.index + 1} of {rounds[next.round].length}</span>
    </div>
    <div class="kp-bar" aria-hidden="true"><i style={`width:${(picks.length / (size - 1)) * 100}%`}></i></div>
  {/if}

  {#if next && view === 'match'}
    {#key next.play}
      <div class="kp-pair" class:picked={picking != null} ontouchstart={onTouchStart} ontouchend={onTouchEnd} data-testid="ko-pair">
        {#each [next.a, next.b] as id, side}
          {@const f = film(id)}
          <div class="kp-side" class:won={picking === side} class:lost={picking === 1 - side}>
            <FilmCard film={f} {blind} onpick={() => choose(side)} aria-label={`Pick ${f.title}`} data-testid={side ? 'ko-right' : 'ko-left'}>
              {#snippet overlay()}
                {#if f.seed != null && !blind}<span class="kp-seed">{f.seed}</span>{/if}
                <span class="kp-ribbon" aria-hidden="true">{through(next.round)}</span>
              {/snippet}
            </FilmCard>
          </div>
          {#if !side}
            <div class="kp-vs" aria-hidden="true"><div class="kp-clash"><i></i><i></i></div><div class="kp-medal"><span>VS</span></div></div>
          {/if}
        {/each}
      </div>
    {/key}
    <div class="kp-hint"><span><span class="kbd">←</span> <span class="kbd">→</span> pick</span><span><span class="kbd">Z</span> undo</span><span class="kp-touch">Tap a poster to pick</span></div>
  {:else if next}
    <BracketTable {rounds} {films} now={{ round: next.round, index: next.index }} {compare} {compareLabel} />
  {:else}
    <ChampionReveal film={film(winner)} path={road} label={champLabel}>{@render done?.()}</ChampionReveal>
    {#if view === 'bracket'}<BracketTable {rounds} {films} {compare} {compareLabel} />{/if}
  {/if}

  <div class="kp-tools">
    <div class="seg" role="group" aria-label="View">
      <button class:active={view === 'match'} aria-pressed={view === 'match'} onclick={() => (view = 'match')} data-testid="ko-view-match">{next ? 'Matchup' : 'Champion'}</button>
      <button class:active={view === 'bracket'} aria-pressed={view === 'bracket'} onclick={() => (view = 'bracket')} data-testid="ko-view-bracket">Bracket</button>
    </div>
    {#if next}
      <div class="seg" role="group" aria-label="Scores">
        <button class:active={!blind} aria-pressed={!blind} onclick={() => (blind = false)}>Scores</button>
        <button class:active={blind} aria-pressed={blind} onclick={() => (blind = true)} data-testid="ko-blind">Blind</button>
      </div>
    {/if}
    <button class="btn" onclick={undo} disabled={!picks.length || picking != null} data-testid="ko-undo">Undo</button>
    {#if next}
      <a class="btn" href={withBase(`/compare?a=${next.a}&b=${next.b}`)}><svg class="icon" aria-hidden="true"><use href={icon('compare')}></use></svg>Compare these two</a>
    {/if}
    {#if shareUrl}
      <button class="btn" onclick={copyLink} data-testid="ko-copy"><svg class="icon" aria-hidden="true"><use href={icon('link')}></use></svg>{copied ? 'Link copied' : 'Copy link'}</button>
    {/if}
  </div>
</div>

<style>
  .kp { padding: 1.3rem 1.6rem 1.4rem; }
  .kp-prog { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; max-width: 660px; margin: 0 auto; font: 600 0.72rem/1.3 var(--font-ui); letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-faint); }
  .kp-prog b { color: var(--ink); font-weight: 600; }
  .kp-bar { height: 3px; max-width: 660px; margin: 0.55rem auto 0; background: var(--border); border-radius: 2px; overflow: hidden; }
  .kp-bar i { display: block; height: 100%; background: var(--accent); transition: width 0.3s ease; }

  .kp-pair { display: grid; grid-template-columns: minmax(0, 1fr) 128px minmax(0, 1fr); align-items: start; max-width: 660px; margin: 1.3rem auto 0; touch-action: pan-y; }
  .kp-side { min-width: 0; position: relative; animation: kp-in-l 0.42s var(--ease-out) both; }
  .kp-side:last-child { animation-name: kp-in-r; animation-delay: 0.06s; }
  @keyframes kp-in-l { from { opacity: 0; transform: translateX(-28px); } }
  @keyframes kp-in-r { from { opacity: 0; transform: translateX(28px); } }
  .kp-side :global(.film-card:hover .fc-poster), .kp-side :global(.film-card:focus-visible .fc-poster) { box-shadow: 0 0 0 2px var(--accent), 0 10px 24px rgb(0 0 0 / 0.35); }
  .kp-side :global(.film-card:focus-visible) { outline: none; }
  .kp-seed { position: absolute; top: 6px; left: 6px; font: 600 0.68rem var(--font-mono); background: rgb(8 8 8 / 0.78); color: #e9e4d8; padding: 0.1em 0.45em; border-radius: 3px; }

  /* The pick: the winner springs up with an accent ring and its ribbon drops
     in; the loser is struck through, drained of colour and sinks away; the
     medallion folds. The next pair then slides in from both sides. */
  .kp-ribbon { position: absolute; left: 0; right: 0; bottom: 0; padding: 0.45rem 0.2rem; text-align: center; font: 700 0.7rem/1 var(--font-ui); letter-spacing: 0.16em; text-transform: uppercase;
    background: var(--accent); color: var(--bg); transform: translateY(105%); transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) 0.08s; pointer-events: none; }
  .kp-side :global(.fc-poster::after) { content: ''; position: absolute; left: -10%; right: -10%; top: 50%; height: 3px; background: var(--ink); box-shadow: 0 0 0 1px rgb(0 0 0 / 0.35);
    transform: rotate(-56deg) scaleX(0); transform-origin: left center; transition: transform 0.22s cubic-bezier(0.6, 0, 0.4, 1); pointer-events: none; }
  .won { z-index: 1; }
  .won :global(.fc-poster) { animation: kp-win 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both; box-shadow: 0 0 0 3px var(--accent), 0 16px 34px rgb(0 0 0 / 0.45); }
  .won .kp-ribbon { transform: none; }
  .won :global(.fc-title) { color: var(--accent); transition: color 0.2s; }
  @keyframes kp-win { 0% { transform: none; } 55% { transform: translateY(-12px) scale(1.06); } 100% { transform: translateY(-8px) scale(1.04); } }
  .lost :global(.fc-poster::after) { transform: rotate(-56deg) scaleX(1); }
  .lost :global(.fc-poster img) { filter: grayscale(1) brightness(0.55); transition: filter 0.25s ease; }
  .kp-side.lost { animation: kp-out 0.5s cubic-bezier(0.5, 0, 0.75, 0) 0.2s both; }
  .kp-side.lost:last-child { --tilt: 2deg; }
  @keyframes kp-out { from { opacity: 1; transform: none; } to { opacity: 0.18; transform: translateY(18px) scale(0.92) rotate(var(--tilt, -2deg)); } }

  /* The VS medallion: a diamond on the dividing rule, with a faint clash. */
  .kp-vs { position: relative; align-self: stretch; display: flex; align-items: center; justify-content: center; }
  .kp-vs::before { content: ''; position: absolute; top: 4%; bottom: 4%; left: 50%; width: 1px; background: linear-gradient(to bottom, transparent, var(--border-strong) 22%, var(--border-strong) 78%, transparent); }
  .kp-clash { position: absolute; width: 68px; height: 68px; top: 50%; left: 50%; transform: translate(-50%, -50%); }
  .kp-clash i { position: absolute; left: 50%; top: 50%; width: 1.5px; height: 60px; border-radius: 2px; background: linear-gradient(to bottom, transparent, var(--accent), transparent); opacity: 0.55; }
  .kp-clash i:nth-child(1) { transform: translate(-50%, -50%) rotate(28deg); }
  .kp-clash i:nth-child(2) { transform: translate(-50%, -50%) rotate(-28deg); }
  .kp-medal { position: relative; width: 39px; height: 39px; display: flex; align-items: center; justify-content: center; animation: kp-pop 0.42s var(--ease-out) both; transition: transform 0.25s ease, opacity 0.25s ease; }
  .kp-medal::before { content: ''; position: absolute; inset: 0; transform: rotate(45deg); border: 1.5px solid var(--accent); border-radius: 6px; background: var(--bg-raised);
    box-shadow: 0 0 0 4px var(--bg-panel), 0 0 0 5px color-mix(in srgb, var(--accent) 35%, transparent), 0 8px 24px rgb(0 0 0 / 0.35); }
  :global(:root[data-theme='matrix']) .kp-medal::before { box-shadow: 0 0 0 4px var(--bg-panel), 0 0 0 5px color-mix(in srgb, var(--accent) 45%, transparent), 0 0 18px color-mix(in srgb, var(--accent) 45%, transparent); }
  .kp-medal span { position: relative; font: italic 700 0.76rem/1 var(--font-display); letter-spacing: 0.06em; color: var(--accent); }
  .picked .kp-medal { transform: scale(0.5); opacity: 0; }
  .picked .kp-clash { opacity: 0; transition: opacity 0.2s ease; }
  @keyframes kp-pop { from { transform: scale(0.4); opacity: 0; } }

  .kp-hint { display: flex; justify-content: center; flex-wrap: wrap; gap: 1.1rem; margin-top: 1rem; font-size: 0.78rem; color: var(--ink-faint); }
  .kp-touch { display: none; }
  .kp-tools { display: flex; justify-content: center; flex-wrap: wrap; gap: 0.6rem; margin-top: 1rem; align-items: center; }
  .kp-tools .btn { display: inline-flex; align-items: center; gap: 0.45em; font-size: 0.82rem; text-decoration: none; }
  .kp-tools .btn .icon { width: 15px; height: 15px; }
  .kp-tools .btn:disabled { opacity: 0.5; cursor: default; }

  .kp :global(.bt) { margin-top: 1.2rem; }

  @media (prefers-reduced-motion: reduce) {
    .kp-side, .kp-medal, .won :global(.fc-poster) { animation: none; }
  }
  @media (hover: none) {
    .kp-hint > span:not(.kp-touch) { display: none; }
    .kp-touch { display: inline; }
  }
  @media (max-width: 640px) {
    .kp { padding: 0.9rem 0.7rem 1.1rem; }
    .kp-prog { font-size: 0.64rem; letter-spacing: 0.1em; }
    .kp-pair { grid-template-columns: minmax(0, 1fr) 56px minmax(0, 1fr); }
    .kp-clash { width: 40px; height: 40px; }
    .kp-clash i { height: 38px; }
    .kp-medal { width: 26px; height: 26px; }
    .kp-medal::before { border-radius: 4px; box-shadow: 0 0 0 3px var(--bg-panel); }
    .kp-medal span { font-size: 0.56rem; }
    .kp-pair :global(.fc-ledger) { font-size: 0.7rem; }
    .kp-pair :global(.fc-ledger .k) { max-width: 4.8em; overflow: hidden; text-overflow: ellipsis; }
    .kp-ribbon { font-size: 0.56rem; letter-spacing: 0.08em; }
    .kp-tools { gap: 0.45rem; }
    .kp-tools .btn { padding: 0.42em 0.7em; }
  }
</style>

<script>
  // /name-the-frame: the lobby (Play now, the Daily Reel, every mode and
  // option), then the game (FramePlayer), the Daily Reel (DailyReel) or a
  // run's end (FrameCredits) in its place. The lobby renders on the server;
  // the game's films load on first need (small), the archive's titles only
  // for typed answers. #daily opens today's reel, #c1.… a challenge.
  import { onMount, tick } from 'svelte';
  import { loadFrameFilms, loadArchive } from '../lib/archive.js';
  import { buildIndex } from '../lib/search.js';
  import { MODES, DEFAULT_OPTS, REVEALS, DIFFICULTIES, PARTY_KEYS, DAILY_FRAMES, filterPool, parseChallenge, frameKey } from '../lib/frame-game.js';
  import { frameStore, saveRun, recordFrames, savePrefs, dailyStreak } from '../lib/frame-store.js';
  import { loadStore } from '../lib/visitor.js';
  import { listWatchlist } from '../lib/watchlist.js';
  import { stillUrl } from '../lib/util.js';
  import RangePair from './RangePair.svelte';

  // The game's own components load when first needed, so the lobby's island
  // stays small.
  let FramePlayer = $state.raw(null);
  let FrameCredits = $state.raw(null);
  let DailyReel = $state.raw(null);
  const loadPlayer = async () => {
    [FramePlayer, FrameCredits] = (await Promise.all([import('./FramePlayer.svelte'), import('./FrameCredits.svelte')])).map((m) => m.default);
  };

  let { directors = [], collections = [], schedule = [], yearMin = 1920, yearMax = new Date().getFullYear(), filmCount = 0 } = $props();

  const MODE_ORDER = ['survival', 'sprint', 'cinephile', 'reverse', 'slow', 'party', 'practice'];
  const SOURCES = { drx: "Dr. X's films", yours: 'Films you rated', watchlist: 'Your watchlist', director: 'A director…', collection: 'A collection…' };

  let view = $state('lobby'); // lobby | loading | play | daily | credits
  let opts = $state({ ...DEFAULT_OPTS });
  let players = $state([{ name: 'Player 1', key: 'q' }, { name: 'Player 2', key: 'p' }]);
  let best = $state({});
  let films = $state.raw(null);
  let error = $state('');
  let run = $state.raw(null); // props for FramePlayer
  let runKey = $state(0);
  let result = $state.raw(null);
  let resultBest = $state({ best: 0, newBest: false });
  let incoming = $state.raw(null); // a challenge being answered
  let titleIndex = $state.raw(null);
  let archiveById = $state.raw(null);
  let today = $state(null);
  let streak = $state(0);
  let debug = $state(false);
  let top = $state(null);

  const todayEntry = $derived(today ? schedule.find((d) => d.date === today) ?? null : null);
  const dailyFilm = $derived(todayEntry && films ? films.find((f) => f.id === todayEntry.id) ?? null : null);
  const modeInfo = $derived(MODES[opts.mode]);
  const visitorIds = () => new Set(Object.keys(loadStore().ratings).map(Number));
  const watchIds = () => new Set(listWatchlist().map((i) => i.id));

  function idsFor(o) {
    if (o.source === 'yours') return visitorIds();
    if (o.source === 'watchlist') return watchIds();
    if (o.source === 'collection') return new Set(collections.find((c) => c.slug === o.collection)?.ids ?? []);
    return null;
  }
  const pool = $derived(films ? filterPool(films, opts, { ids: idsFor(opts) }) : null);
  const poolFrames = $derived(pool ? pool.reduce((n, f) => n + f.frames, 0) : 0);
  const needsChoice = $derived((opts.source === 'director' && !opts.director) || (opts.source === 'collection' && !opts.collection));

  function localDate(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  async function ensureFilms() {
    if (films) return films;
    films = await loadFrameFilms();
    return films;
  }
  async function ensureTitles() {
    if (titleIndex) return;
    const a = await loadArchive({ originalTitles: true, rated: true });
    titleIndex = buildIndex(a.list, null, []);
    archiveById = a.byId;
  }
  const typingFor = (o) => o.mode === 'cinephile' || (o.answer === 'typing' && MODES[o.mode].answer === 'choices' && o.mode !== 'party');

  async function scrollUp() {
    await tick();
    const y = (top?.getBoundingClientRect().top ?? 0) + window.scrollY - 80;
    if (window.scrollY > y) window.scrollTo({ top: Math.max(0, y) });
  }

  async function start(o = opts, { seed = (Math.random() * 2 ** 32) >>> 0, challenge = null } = {}) {
    error = '';
    view = 'loading';
    try {
      const all = await ensureFilms();
      const p = filterPool(all, o, { ids: idsFor(o) });
      if (!p.length) throw new Error('No films with frames match these options. Widen the years or the votes, or pick another source.');
      await Promise.all([FramePlayer ? null : loadPlayer(), typingFor(o) ? ensureTitles() : null]);
      const store = frameStore();
      if (!challenge) savePrefs({ opts: { ...o }, players: players.map((x) => ({ ...x })) });
      incoming = challenge;
      run = {
        films: all,
        pool: p,
        opts: { ...o },
        seed,
        challenge: !!challenge,
        players: o.mode === 'party' ? players.filter((x) => x.name.trim()).map((x) => ({ ...x, name: x.name.trim() })) : [],
        retakeList: o.retakes && !challenge ? store.missed.map(([id, n]) => [id, n]) : [],
        avoid: challenge ? null : new Set(store.recent),
      };
      runKey++;
      view = 'play';
      scrollUp();
    } catch (err) {
      error = err.message;
      view = 'lobby';
    }
  }

  function finished(res) {
    if (!res.players) {
      const prev = frameStore().best[res.mode] ?? 0;
      const newBest = saveRun(res.mode, res.score);
      resultBest = { best: Math.max(prev, res.score), newBest };
    }
    const shown = res.log.map((l) => frameKey(l.id, l.n));
    const missed = res.log.filter((l) => l.phase === 'wrong' || l.phase === 'timeout').map((l) => [l.id, l.n]);
    const named = res.log.filter((l) => l.phase === 'right').map((l) => frameKey(l.id, l.n));
    recordFrames(shown, missed, named);
    best = frameStore().best;
    result = res;
    view = 'credits';
    if (location.hash.startsWith('#c1.')) history.replaceState(null, '', location.pathname);
    scrollUp();
  }

  async function openDaily() {
    error = '';
    view = 'loading';
    try {
      await Promise.all([ensureFilms(), ensureTitles(), DailyReel ? null : import('./DailyReel.svelte').then((m) => (DailyReel = m.default))]);
      if (!todayEntry || !dailyFilm) throw new Error("Today's reel isn't ready yet. Try again later.");
      view = 'daily';
      scrollUp();
    } catch (err) {
      error = err.message;
      view = 'lobby';
    }
  }

  function toLobby() {
    view = 'lobby';
    incoming = null;
    best = frameStore().best;
    streak = today ? dailyStreak(frameStore().daily, today) : 0;
    if (location.hash) history.replaceState(null, '', location.pathname);
    scrollUp();
  }

  function setMode(m) {
    opts.mode = m;
  }
  function addPlayer() {
    if (players.length >= 4) return;
    const key = PARTY_KEYS.find((k) => !players.some((p) => p.key === k));
    players = [...players, { name: `Player ${players.length + 1}`, key }];
  }
  function removePlayer(i) {
    if (players.length <= 2) return;
    players = players.filter((_, j) => j !== i);
  }

  onMount(() => {
    const store = frameStore();
    best = store.best;
    if (store.prefs?.opts) opts = { ...DEFAULT_OPTS, ...store.prefs.opts };
    if (Array.isArray(store.prefs?.players) && store.prefs.players.length >= 2) players = store.prefs.players.slice(0, 4);
    today = localDate();
    streak = dailyStreak(store.daily, today);
    debug = new URLSearchParams(location.search).has('debug');
    // Counts for the options panel: the films file is small, fetched once the
    // page is idle so it never competes with the first paint.
    const idle = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 1200));
    idle(() => ensureFilms().catch(() => {}));
    const c = parseChallenge(location.hash);
    if (c) {
      incoming = c;
    } else if (location.hash === '#daily') openDaily();
  });

  const fmt = (n) => (n ?? 0).toLocaleString('en-US');
  const bestLabel = (m) => (m === 'sprint' || m === 'practice' ? 'named' : 'best');
</script>

<div class="ntf" bind:this={top} data-view={view}>
  {#if view === 'lobby' || view === 'loading'}
    {#if incoming}
      <div class="challenge" data-testid="challenge-banner">
        <div>
          <p class="eyebrow">A challenge · {MODES[incoming.opts.mode].label}</p>
          <p class="ch-line">Someone scored <b>{fmt(incoming.score)}</b>{incoming.opts.mode === 'sprint' ? ' frames' : ' points'} ({incoming.named} frames named). You get the very same frames.</p>
        </div>
        <button class="btn primary" onclick={() => start(incoming.opts, { seed: incoming.seed, challenge: incoming })} disabled={view === 'loading'}>Take it on</button>
      </div>
    {/if}

    <div class="hero">
      <div class="card start">
        <div class="bg" aria-hidden="true"></div>
        <div class="bulbrow" aria-hidden="true"></div>
        <p class="eyebrow">Play</p>
        <h1>Name the Frame</h1>
        <p class="lede">A frame from one of Dr. X's films. Name it before the lights go out.</p>
        <div class="go">
          <button class="big" onclick={() => start({ ...DEFAULT_OPTS })} disabled={view === 'loading'} data-testid="play-now">Play now</button>
          <small>Survival · 5 tickets · 10 s a frame · starts easy</small>
        </div>
      </div>
      <div class="card daily">
        <div class="bg" aria-hidden="true">{#if todayEntry}<img src={stillUrl(todayEntry.id, todayEntry.frames[0], 'thumb')} alt="" width="640" height="320" />{/if}</div>
        <div class="bulbrow" aria-hidden="true"></div>
        <p class="eyebrow">Daily{todayEntry ? ` · Reel #${todayEntry.number}` : ''}</p>
        <h2 class="h1">The Daily Reel</h2>
        <p class="lede">One film, {DAILY_FRAMES} frames, hardest first. The same film for everyone today.</p>
        <div class="go">
          <button class="big" onclick={openDaily} disabled={view === 'loading'} data-testid="play-daily">Play today's reel</button>
          <small>{streak ? `Streak ${streak} ${streak === 1 ? 'day' : 'days'}` : 'Start a streak'}</small>
        </div>
      </div>
    </div>

    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if view === 'loading'}<p class="faint loading">Loading…</p>{/if}

    <div class="two">
      <div>
        <div class="col-h"><h2>More ways to play</h2><span class="faint">your best on the right</span></div>
        <ul class="modes">
          {#each MODE_ORDER as m}
            <li>
              <button aria-pressed={opts.mode === m} onclick={() => setMode(m)} data-testid={`mode-${m}`}>
                <span class="tag">{MODES[m].tag}</span>
                <span class="mt">{MODES[m].label}</span>
                <span class="md">{MODES[m].blurb}</span>
                <span class="rec">{#if m !== 'party' && best[m] != null}{bestLabel(m)}<b>{fmt(best[m])}</b>{/if}</span>
              </button>
            </li>
          {/each}
        </ul>
      </div>

      <form class="card opts" onsubmit={(e) => { e.preventDefault(); start(); }}>
        <div class="col-h"><h2>Options</h2><span class="faint">{modeInfo.label}</span></div>
        <div class="grid">
          <label class="field full">Mode
            <select bind:value={opts.mode}>{#each MODE_ORDER as m}<option value={m}>{MODES[m].label}</option>{/each}</select>
          </label>
          <label class="field full">Frames from
            <select bind:value={opts.source}>{#each Object.entries(SOURCES) as [v, l]}<option value={v}>{l}</option>{/each}</select>
          </label>
          {#if opts.source === 'director'}
            <label class="field full">Director
              <select bind:value={opts.director}><option value="">Pick a director</option>{#each directors as d}<option value={d}>{d}</option>{/each}</select>
            </label>
          {:else if opts.source === 'collection'}
            <label class="field full">Collection
              <select bind:value={opts.collection}><option value="">Pick a collection</option>{#each collections as c}<option value={c.slug}>{c.title}</option>{/each}</select>
            </label>
          {/if}
          <div class="field full"><RangePair label="Years" min={yearMin} max={yearMax} anyText="Any year" bind:lo={opts.yearFrom} bind:hi={opts.yearTo} testid="ntf-years" /></div>
          <label class="field">Min. IMDb votes<input type="number" min="0" step="1000" inputmode="numeric" bind:value={opts.minVotes} /></label>
          {#if modeInfo.clock === 'frame'}
            <label class="field">Seconds a frame<input type="number" min="3" max="60" inputmode="numeric" bind:value={opts.seconds} /></label>
          {:else}
            <span class="field"></span>
          {/if}
          <label class="field">Difficulty
            <select bind:value={opts.difficulty}>{#each Object.entries(DIFFICULTIES) as [v, l]}<option value={v}>{l}</option>{/each}</select>
          </label>
          <span class="field"></span>
          {#if modeInfo.answer === 'choices' && opts.mode !== 'party'}
            <div class="field full">Answer by
              <div class="seg">
                <button type="button" class:active={opts.answer !== 'typing'} onclick={() => (opts.answer = 'choices')}>Four choices</button>
                <button type="button" class:active={opts.answer === 'typing'} onclick={() => (opts.answer = 'typing')}>Typing (any of {fmt(filmCount)} titles)</button>
              </div>
            </div>
          {/if}
          {#if modeInfo.answer !== 'frames' && !modeInfo.reveal}
            <div class="field full">Reveal
              <div class="seg">{#each Object.entries(REVEALS) as [v, l]}<button type="button" class:active={opts.reveal === v} onclick={() => (opts.reveal = v)}>{l}</button>{/each}</div>
            </div>
          {/if}
          {#if opts.mode === 'party'}
            <div class="field full">Players
              <ul class="players">
                {#each players as p, i}
                  <li>
                    <span class="kbd">{p.key.toUpperCase()}</span>
                    <input bind:value={p.name} maxlength="20" aria-label={`Player ${i + 1} name`} />
                    {#if players.length > 2}<button type="button" class="linkish" onclick={() => removePlayer(i)}>Remove</button>{/if}
                  </li>
                {/each}
              </ul>
              {#if players.length < 4}<button type="button" class="linkish add" onclick={addPlayer}>+ Add a player</button>{/if}
            </div>
          {/if}
          <label class="check full"><input type="checkbox" bind:checked={opts.retakes} /><span><b>Bring back frames I missed</b><small>About one frame in five is a retake from earlier runs.</small></span></label>
          <label class="check full"><input type="checkbox" bind:checked={opts.bonus} /><span><b>Bonus round</b><small>After a right answer, guess Dr. X's score; within 0.5 doubles the points.</small></span></label>
          <div class="submit full">
            <span class="faint">{pool ? (needsChoice ? 'Pick one above.' : `${fmt(pool.length)} films, ${fmt(poolFrames)} frames match.`) : ' '}</span>
            <button class="btn primary" type="submit" disabled={view === 'loading' || needsChoice || (pool != null && !pool.length)} data-testid="start">Start</button>
          </div>
        </div>
      </form>
    </div>
  {:else if view === 'play' && run && FramePlayer}
    {#key runKey}
      <FramePlayer {...run} {titleIndex} {debug} onfinish={finished} onquit={toLobby} />
    {/key}
  {:else if view === 'credits' && result && FrameCredits}
    <FrameCredits {result} best={resultBest.best} newBest={resultBest.newBest} {incoming} onagain={() => start(result.opts)} onlobby={toLobby} />
  {:else if view === 'daily' && todayEntry && dailyFilm && DailyReel}
    <DailyReel entry={todayEntry} film={dailyFilm} {titleIndex} {archiveById} onlobby={toLobby} />
  {/if}
</div>

<style>
  .ntf { min-height: 70vh; }
  .eyebrow { font: 600 0.66rem/1.3 var(--font-ui); letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-faint); margin: 0; }
  .challenge { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; padding: 0.9rem 1.1rem; margin-bottom: 1.2rem; border: 1px solid var(--accent); border-radius: 8px; background: color-mix(in srgb, var(--accent) 8%, var(--bg-panel)); }
  .ch-line { margin: 0.2rem 0 0; }
  .error { color: var(--form-c); margin: 1rem 0 0; }
  .loading { margin: 1rem 0 0; }

  /* The two hero cards share one look: the marquee body, a row of bulbs. */
  .hero { display: grid; grid-template-columns: 1fr; gap: 1.6rem; }
  @media (min-width: 860px) { .hero { grid-template-columns: 1fr 1fr; } }
  .card.start, .card.daily { position: relative; overflow: hidden; border-radius: 10px; padding: 1.5rem 1.6rem 1.4rem; display: flex; flex-direction: column; gap: 0.7rem; min-height: 250px;
    background: linear-gradient(160deg, #3b1d1a, #1d0d0c); color: #f4efe4; }
  :global(:root[data-theme='light']) .card.start, :global(:root[data-theme='light']) .card.daily { background: linear-gradient(160deg, #f6eedc, #e8dab9); color: #2a2118; box-shadow: inset 0 0 0 1px #c9b083; }
  :global(:root[data-theme='matrix']) .card.start, :global(:root[data-theme='matrix']) .card.daily { background: #010603; color: var(--ink); box-shadow: inset 0 0 0 1px var(--border-strong); }
  .bg { position: absolute; inset: 0; pointer-events: none; }
  .bg img { width: 100%; height: 100%; object-fit: cover; filter: blur(14px) saturate(0.8); transform: scale(1.15); opacity: 0.3; }
  :global(:root[data-theme='light']) .bg img { opacity: 0.14; }
  .card > *:not(.bg) { position: relative; }
  .card .eyebrow { color: inherit; opacity: 0.72; }
  .bulbrow { height: 6px; margin: -0.4rem -0.3rem 0.1rem; background: radial-gradient(circle, #fff1c9 0 2px, rgb(255 200 110 / 0.5) 2.5px, transparent 4px) 0 50% / 16px 6px repeat-x; }
  :global(:root[data-theme='light']) .bulbrow { background-image: radial-gradient(circle, #e0a43a 0 2px, rgb(224 164 58 / 0.4) 2.5px, transparent 4px); }
  :global(:root[data-theme='matrix']) .bulbrow { background-image: radial-gradient(circle, var(--accent) 0 2px, rgb(58 255 143 / 0.4) 2.5px, transparent 4px); }
  h1, .h1 { font-size: clamp(2.3rem, 5vw, 3.4rem); font-style: italic; margin: 0; color: inherit; font-weight: 500; line-height: 1.1; }
  .lede { margin: 0; max-width: 32rem; opacity: 0.85; }
  .go { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; margin-top: auto; }
  .go small { font-size: 0.78rem; opacity: 0.75; }
  .big { font: 600 1.05rem var(--font-ui); padding: 0.7em 1.5em; border: 0; border-radius: var(--radius); background: #f6c76a; color: #1d0d0c; box-shadow: 0 0 22px -4px rgb(246 199 106 / 0.7); cursor: pointer; }
  :global(:root[data-theme='light']) .big { background: #a8812f; color: #fffaf0; box-shadow: 0 6px 18px -8px rgb(168 129 47 / 0.8); }
  :global(:root[data-theme='matrix']) .big { background: var(--accent); color: #000; box-shadow: 0 0 22px -4px var(--accent); }
  .big:disabled { opacity: 0.6; cursor: default; }

  /* Modes left, options right, as wide as the cards above. */
  .two { display: grid; grid-template-columns: 1fr; gap: 1.6rem; margin-top: 1.6rem; align-items: start; }
  @media (min-width: 860px) { .two { grid-template-columns: 1fr 1fr; } }
  .col-h { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid var(--ink); padding-bottom: 0.4rem; margin-bottom: 0.2rem; }
  .col-h h2 { margin: 0; font-size: 1.4rem; }
  .col-h .faint { font-size: 0.8rem; }
  .modes { list-style: none; margin: 0; padding: 0; }
  .modes button { display: grid; grid-template-columns: 5.6rem 1fr auto; grid-template-areas: 'tag t rec' 'tag d rec'; gap: 0.1rem 0.9rem; align-items: center; width: 100%; text-align: left; padding: 0.75rem 0.4rem; border: 0; border-bottom: 1px solid var(--border); background: transparent; color: var(--ink); cursor: pointer; }
  .modes button[aria-pressed='true'] { background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 12%, transparent), transparent 75%); }
  .modes button:hover .mt { text-decoration: underline; text-underline-offset: 4px; text-decoration-thickness: 1px; }
  .modes .tag { grid-area: tag; font: 600 0.66rem var(--font-mono); color: var(--accent); letter-spacing: 0.04em; text-transform: uppercase; }
  .modes .mt { grid-area: t; font: 500 1.2rem var(--font-display); }
  .modes .md { grid-area: d; font-size: 0.82rem; color: var(--ink-muted); }
  .modes .rec { grid-area: rec; text-align: right; font-size: 0.7rem; color: var(--ink-faint); min-width: 3rem; }
  .modes .rec b { display: block; font: 600 1rem var(--font-mono); color: var(--ink); }
  @media (max-width: 520px) {
    .modes button { grid-template-columns: 1fr auto; grid-template-areas: 'tag rec' 't rec' 'd d'; }
  }
  .card.opts { border: 1px solid var(--border); background: var(--bg-panel); border-radius: 10px; padding: 1.1rem 1.2rem 1.2rem; }
  .card.opts .col-h { border-bottom-width: 1px; margin-bottom: 0.8rem; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; }
  .full { grid-column: 1 / -1; }
  .field { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.76rem; color: var(--ink-muted); }
  .field input, .field select { font: 0.9rem var(--font-ui); color: var(--ink); background: var(--bg-raised); border: 1px solid var(--border-strong); border-radius: var(--radius); padding: 0.4em 0.55em; width: 100%; }
  .seg { flex-wrap: wrap; }
  .seg button { font-size: 0.78rem; padding: 0.38em 0.75em; }
  .check { display: flex; gap: 0.6rem; align-items: flex-start; font-size: 0.84rem; color: var(--ink); cursor: pointer; }
  .check input { margin-top: 0.2rem; accent-color: var(--accent); }
  .check b { display: block; font-weight: 600; }
  .check small { display: block; font-size: 0.74rem; color: var(--ink-faint); }
  .players { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.35rem; }
  .players li { display: grid; grid-template-columns: auto 1fr auto; gap: 0.5rem; align-items: center; }
  .kbd { font: 0.68rem var(--font-mono); border: 1px solid var(--border-strong); border-bottom-width: 2px; border-radius: 4px; padding: 0 0.4em; color: var(--ink-muted); }
  .linkish { background: none; border: 0; padding: 0; color: var(--ink-muted); text-decoration: underline; text-underline-offset: 3px; font-size: 0.78rem; cursor: pointer; justify-self: start; }
  .add { margin-top: 0.3rem; }
  .submit { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; border-top: 1px dashed var(--border-strong); padding-top: 0.8rem; font-size: 0.78rem; }
</style>

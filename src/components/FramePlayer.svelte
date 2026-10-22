<script>
  // Name the Frame's play screen: the frame in the Crown marquee (its bulbs
  // are the clock), the answers and hints in the panel on the right. Runs
  // every mode in frame-game.js's MODES; questions come from the seeded
  // engine, so a run with the same seed and rules shows the same frames.
  import { onMount, onDestroy, tick } from 'svelte';
  import {
    MODES, HINTS, SPRINT_SECONDS, SPRINT_PENALTY, PARTY_ROUNDS, TIERS,
    mulberry32, makeQuestion, points, textClue, bonusHit, frameKey, easeFormula,
  } from '../lib/frame-game.js';
  import { confetti, splat, snow, pixelate } from '../lib/frame-fx.js';
  import { stillUrl, withBase, fmt1 } from '../lib/util.js';
  import { movieSlug } from '../../shared/slug.mjs';
  import { inWatchlist, toggleWatchlist } from '../lib/watchlist.js';
  import TitleInput from './TitleInput.svelte';

  let {
    films, pool, opts, seed, challenge = false, players: playerList = [], titleIndex = null,
    retakeList = [], avoid = null, debug = false, onfinish, onquit,
  } = $props();

  const mode = MODES[opts.mode];
  const kind = mode.answer === 'frames' ? 'frames' : opts.mode === 'cinephile' || (opts.answer === 'typing' && opts.mode !== 'party') ? 'typing' : 'choices';
  const reveal = kind === 'frames' ? 'full' : (mode.reveal ?? opts.reveal);
  const seconds = opts.seconds;
  const party = opts.mode === 'party';
  const r = mulberry32(seed);
  const used = new Set();
  const poolIds = new Set(pool.map((f) => f.id));

  let root = $state(null);
  let narrow = $state(false);
  let round = $state(0);
  let lives = $state(mode.lives);
  let score = $state(0);
  let shown = $state(0);
  let streak = 0;
  let bestStreak = $state(0);
  let named = $state(0);
  let q = $state.raw(null);
  let nextQ = null;
  let phase = $state('load'); // load | ask | paused | answered | bonus | ending
  let left = $state(seconds);
  let runLeft = $state(SPRINT_SECONDS);
  let revealP = $state(0);
  let hints = $state({ ...HINTS });
  let removed = $state.raw(new Set());
  let extra = $state(null);
  let clueText = $state('');
  let hinted = false;
  let picked = $state(null); // film id (choices, typing) or choice index (frames)
  let typedWrong = $state(null);
  let res = $state.raw(null); // { kind, pts, bonus? }
  let fx = $state('');
  let lifeFresh = $state(-1);
  let bonusGuess = $state('');
  let watch = $state(false);
  let players = $state(playerList.map((p) => ({ ...p, score: 0 })));
  let buzzer = $state(-1);
  let locked = $state.raw(new Set());
  let ended = $state(false);
  const log = [];

  // ---------- questions ----------
  function build(roundNo) {
    let retake = null;
    if (!challenge && opts.retakes && retakeList.length && Math.random() < 0.2) {
      const cands = retakeList.filter(([id]) => !used.has(id) && poolIds.has(id));
      if (cands.length) retake = cands[Math.floor(Math.random() * cands.length)];
    }
    return makeQuestion(r, { pool, all: films, round: roundNo, difficulty: opts.difficulty, used: new Set(used), avoid: challenge ? null : avoid, retake, answer: kind });
  }

  const smallImages = () => window.innerWidth < 700;
  const frameSrc = (id, n, thumb = smallImages()) => stillUrl(id, n, thumb ? 'thumb' : 'full');

  async function next() {
    if (party && round >= PARTY_ROUNDS) return ending();
    const nq = nextQ ?? build(round + 1);
    if (!nq) return ending();
    round++;
    q = nq;
    used.add(q.film.id);
    removed = new Set();
    extra = null;
    clueText = '';
    hinted = false;
    picked = null;
    typedWrong = null;
    res = null;
    fx = '';
    lifeFresh = -1;
    bonusGuess = '';
    buzzer = -1;
    locked = new Set();
    left = seconds;
    revealP = 0;
    pixLevel = 0;
    phase = 'load';
    nextQ = build(round + 1);
    if (nextQ) preload(nextQ);
    await tick();
    await imagesReady();
    if (phase !== 'load') return;
    enterAsk();
  }

  function preload(nq) {
    if (kind === 'frames') nq.choices.forEach((c) => (new Image().src = frameSrc(c.film.id, c.n, true)));
    else new Image().src = frameSrc(nq.film.id, nq.n);
  }

  // The clock starts once the frame(s) have loaded and decoded, so a slow
  // connection never costs time.
  async function imagesReady() {
    const imgs = [...(root?.querySelectorAll('img.main, img.choice') ?? [])];
    await Promise.all(
      imgs.map((img) => {
        const loaded = img.complete && img.naturalWidth
          ? Promise.resolve()
          : new Promise((ok) => {
              img.addEventListener('load', ok, { once: true });
              img.addEventListener('error', ok, { once: true });
            });
        return loaded.then(() => Promise.race([img.decode?.().catch(() => {}), new Promise((ok) => setTimeout(ok, 250))]));
      })
    );
  }

  // ---------- clock ----------
  let raf = 0;
  let t0 = 0;
  let runSpent = 0;
  let penalty = 0;
  function enterAsk() {
    phase = 'ask';
    t0 = performance.now();
    raf = requestAnimationFrame(loop);
  }
  function leaveAsk() {
    cancelAnimationFrame(raf);
    if (mode.clock === 'run' && phase === 'ask') runSpent += (performance.now() - t0) / 1000;
  }
  const PIX = [40, 28, 20, 14, 10, 7, 5, 4, 3, 2];
  let pixLevel = 0;
  function loop(now) {
    if (phase !== 'ask') return;
    const el = (now - t0) / 1000;
    revealP = Math.min(1, el / seconds);
    if (party && buzzer >= 0) {
      if (now - t0Buzz > BUZZ_MS) partyMiss();
      raf = requestAnimationFrame(loop);
      return;
    }
    if (mode.clock === 'frame') {
      left = Math.max(0, seconds - el);
      if (left <= 0) return settle('timeout');
    }
    if (mode.clock === 'run') {
      runLeft = Math.max(0, SPRINT_SECONDS - runSpent - el - penalty);
      if (runLeft <= 0) return runOver();
    }
    if (reveal === 'pix') {
      const block = PIX[Math.min(PIX.length - 1, Math.floor(revealP * PIX.length))];
      if (block !== pixLevel) {
        pixLevel = block;
        pixelate(root?.querySelector('canvas.pix'), root?.querySelector('img.main'), block);
      }
    }
    raf = requestAnimationFrame(loop);
  }
  function runOver() {
    leaveAsk();
    phase = 'answered';
    ending();
  }

  // ---------- answering ----------
  function chooseFilm(film) {
    if (phase !== 'ask' || (party && buzzer < 0)) return;
    if (kind === 'choices' && removed.has(film.id)) return;
    picked = film.id;
    if (film.id === q.film.id) return settle('right');
    if (kind === 'typing') typedWrong = film;
    if (party) return partyMiss();
    settle('wrong');
  }
  function chooseFrame(i) {
    if (phase !== 'ask' || (party && buzzer < 0)) return;
    const c = q.choices[i];
    if (removed.has(c.film.id)) return;
    picked = i;
    if (c.film.id === q.film.id) return settle('right');
    settle('wrong');
  }

  function settle(outcome) {
    leaveAsk();
    let pts = 0;
    if (outcome === 'right') {
      streak++;
      named++;
      bestStreak = Math.max(bestStreak, streak);
      if (mode.clock === 'run' || !mode.clock) pts = 1;
      else pts = points({ left, seconds, hinted, streak, clock: true });
      if (party) players[buzzer].score += pts;
      else score += pts;
    } else if (outcome !== 'skip') {
      streak = 0;
      if (mode.lives) {
        lives--;
        lifeFresh = lives;
      }
      if (mode.clock === 'run' && outcome === 'wrong') penalty += SPRINT_PENALTY;
    }
    res = { kind: outcome, pts };
    log.push({ id: q.film.id, n: q.n, title: q.film.title, year: q.film.year, phase: outcome, retake: q.retake, buzzer: party ? buzzer : -1 });
    fx = outcome === 'right' ? 'right' : outcome === 'wrong' ? 'wrong' : outcome === 'timeout' ? 'time' : '';
    watch = inWatchlist(q.film.id);
    phase = outcome === 'right' && opts.bonus && !party && q.film.my != null && mode.clock !== 'run' ? 'bonus' : 'answered';
    if (pts && !party) countUp(score - pts, score);
    tick().then(effects);
  }

  function effects() {
    if (fx === 'right') confetti(root?.querySelector(kind === 'frames' ? '.choice-btn.right' : '.opt.right') ?? root?.querySelector('.ti'));
    if (fx === 'wrong') splat(root?.querySelector(kind === 'frames' ? '.choice-btn.wrong .blood' : '.opt.wrong .blood'));
    if (fx === 'time') snow(root?.querySelector('.fxl'));
  }

  // Party: the buzzing player answers; a miss costs 50 points and locks them
  // out of this frame, and the clock runs on for the others.
  function buzz(i) {
    if (phase !== 'ask' || buzzer >= 0 || locked.has(i)) return;
    buzzer = i;
    t0Buzz = performance.now();
  }
  let t0Buzz = 0;
  const BUZZ_MS = 5000;
  function partyMiss() {
    t0 += performance.now() - t0Buzz; // the buzz didn't use the frame's time
    players[buzzer].score -= 50;
    locked = new Set([...locked, buzzer]);
    buzzer = -1;
    picked = null;
    if (locked.size >= players.length) settle('wrong');
  }

  function useHint(h) {
    if (phase !== 'ask' || party || !hints[h]) return;
    if (h === 'frame' && (kind === 'frames' || q.film.frames < 2 || extra)) return;
    if (h === 'clue' && (clueText || (kind !== 'typing' && !q.clue))) return;
    hints[h]--;
    if (h === 'skip') return settle('skip');
    hinted = true;
    if (h === 'clue') {
      if (kind === 'typing') clueText = textClue(q.film, Math.random) ?? '';
      else {
        clueText = q.clue.text;
        const keep = new Set(q.clue.keep);
        removed = new Set(q.options.filter((f) => !keep.has(f.id)).map((f) => f.id));
      }
    }
    if (h === 'frame') {
      const rest = Array.from({ length: q.film.frames }, (_, i) => i + 1).filter((n) => n !== q.n);
      extra = rest[Math.floor(Math.random() * rest.length)];
    }
  }

  function lockBonus(skip = false) {
    if (phase !== 'bonus') return;
    const guess = skip ? null : Number(String(bonusGuess).replace(',', '.'));
    const hit = !skip && bonusHit(guess, q.film.my);
    if (hit) {
      score += res.pts;
      countUp(score - res.pts, score);
    }
    res = { ...res, bonus: skip ? null : { guess, hit } };
    phase = 'answered';
  }

  function advance() {
    if (phase !== 'answered' || ended) return;
    fx = '';
    if (mode.lives && lives <= 0) return ending();
    if (party && round >= PARTY_ROUNDS) return ending();
    next();
  }

  // Last ticket (or the run's end): the lights go out one by one, the
  // picture fades to black and The End comes up.
  async function ending() {
    if (ended) return;
    ended = true;
    leaveAsk();
    fx = 'end';
    phase = 'ending';
    await new Promise((ok) => setTimeout(ok, matchMedia('(prefers-reduced-motion: reduce)').matches ? 600 : 4200));
    finish();
  }
  function finish() {
    onfinish?.({
      mode: opts.mode,
      opts,
      seed,
      challenge,
      score: mode.clock === 'run' || !mode.clock ? named : score,
      named,
      total: log.length,
      log: [...log],
      bestStreak,
      players: party ? players.map((p) => ({ ...p })) : null,
    });
  }

  function countUp(from, to) {
    const start = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - start) / 700);
      shown = Math.round(from + (to - from) * (1 - (1 - k) ** 3));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ---------- keys ----------
  function keydown(e) {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    const typing = e.target.closest?.('input, select, textarea');
    if (e.key === 'Enter' && !typing) {
      if (phase === 'answered') {
        e.preventDefault();
        advance();
      }
      return;
    }
    if (typing) return;
    const k = e.key.toLowerCase();
    if (party && phase === 'ask' && buzzer < 0) {
      const i = players.findIndex((p) => p.key === k);
      if (i >= 0) return buzz(i);
    }
    if (phase === 'ask' && /^[1-4]$/.test(e.key) && kind !== 'typing') {
      const i = Number(e.key) - 1;
      if (kind === 'frames') chooseFrame(i);
      else chooseFilm(q.options[i]);
    } else if (!party && k === 'c') useHint('clue');
    else if (!party && k === 'f') useHint('frame');
    else if (!party && k === 's') useHint('skip');
  }

  function visibility() {
    if (phase !== 'ask') return;
    if (document.hidden && buzzer < 0) {
      pausedEl = performance.now() - t0;
      leaveAsk();
      phase = 'paused';
    }
  }
  // Picks the clock up where it stopped (Sprint's run clock already banked
  // the time in leaveAsk).
  let pausedEl = 0;
  function resume() {
    if (phase !== 'paused') return;
    t0 = performance.now() - (mode.clock === 'run' ? 0 : pausedEl);
    phase = 'ask';
    raf = requestAnimationFrame(loop);
  }

  // ---------- the sign on the crown ----------
  // "Frame N" while the clock runs (the title itself in Find the frame); the
  // film's title once answered. A title that doesn't fit shrinks a little;
  // past that it scrolls along the sign like a running marquee.
  let signEl = $state(null);
  let crownEl = $state(null);
  let labelEl = $state(null);
  let signRun = $state(false);
  let signScale = $state(1);
  let runW = $state(0);
  const answered = $derived(['answered', 'bonus', 'ending'].includes(phase) && res != null);
  const signText = $derived(
    !q ? '' : answered || kind === 'frames' ? q.film.title : party ? `Frame ${round} of ${PARTY_ROUNDS}` : `Frame ${round}`
  );
  const signYear = $derived(q && (answered || kind === 'frames') ? q.film.year : null);
  $effect(() => {
    signText;
    signRun = false;
    signScale = 1;
    tick().then(fitSign);
  });
  function fitSign() {
    if (!signEl || !crownEl) return;
    const span = signEl.firstElementChild;
    const cs = getComputedStyle(crownEl);
    const room = crownEl.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      - (labelEl?.offsetWidth ? labelEl.offsetWidth + parseFloat(cs.columnGap || 0) : 0)
      - parseFloat(getComputedStyle(signEl).paddingLeft) * 2 - 2;
    let s = 1;
    while (span.scrollWidth * (s / signScale) > room && s > 0.78) s -= 0.04;
    signScale = s;
    tick().then(() => {
      if (span.scrollWidth > room) {
        signScale = 0.86;
        signRun = true;
        tick().then(() => (runW = signEl.firstElementChild?.offsetWidth ?? 0));
      }
    });
  }

  // ---------- derived view ----------
  const BULBS = $derived(narrow ? [12, 4] : [18, 7]);
  const bulbs = $derived.by(() => {
    const [nt, nr] = BULBS;
    const pos = [];
    for (let i = 0; i < nt; i++) pos.push([`calc(var(--bi) + (100% - var(--bi) * 2) * ${i / (nt - 1)})`, 'var(--bi)']);
    for (let i = 1; i <= nr; i++) pos.push(['calc(100% - var(--bi))', `calc(var(--bi) + (100% - var(--bi) * 2) * ${i / (nr + 1)})`]);
    for (let i = nt - 1; i >= 0; i--) pos.push([`calc(var(--bi) + (100% - var(--bi) * 2) * ${i / (nt - 1)})`, 'calc(100% - var(--bi))']);
    for (let i = nr; i >= 1; i--) pos.push(['var(--bi)', `calc(var(--bi) + (100% - var(--bi) * 2) * ${i / (nr + 1)})`]);
    return pos;
  });
  const clockP = $derived(mode.clock === 'frame' ? 1 - left / seconds : mode.clock === 'run' ? 1 - runLeft / SPRINT_SECONDS : 0);
  const lit = $derived(fx === 'end' ? bulbs.length : Math.ceil((1 - clockP) * bulbs.length));
  const hurry = $derived(phase === 'ask' && ((mode.clock === 'frame' && left <= 3) || (mode.clock === 'run' && runLeft <= 10)));
  const dupTitles = $derived(q ? new Set(q.options.map((f) => f.title).filter((t, i, a) => a.indexOf(t) !== i)) : new Set());
  const showYear = (f) => q.tier === 0 || dupTitles.has(f.title);
  const filmHref = (f) => withBase(`/movie/${movieSlug(f.title, f.year, f.id)}`);
  const ICON = isMatrixAtStart() ? 'pill' : 'ticket';
  function isMatrixAtStart() {
    return typeof document !== 'undefined' && document.documentElement.dataset.theme === 'matrix';
  }
  const ease = $derived(q && debug ? easeFormula(q.film, q.n) : null);

  onMount(() => {
    const ro = new ResizeObserver(() => (narrow = (root?.clientWidth ?? 1000) < 760));
    ro.observe(root);
    document.addEventListener('visibilitychange', visibility);
    next();
    return () => {
      ro.disconnect();
      document.removeEventListener('visibilitychange', visibility);
    };
  });
  onDestroy(() => cancelAnimationFrame(raf));
</script>

<svelte:window onkeydown={keydown} />

<div
  class="ff rv-{reveal}"
  class:done={answered}
  class:hurry
  class:fx-right={fx === 'right'}
  class:fx-wrong={fx === 'wrong'}
  class:fx-time={fx === 'time'}
  class:fx-end={fx === 'end'}
  class:life-lost={lifeFresh >= 0}
  bind:this={root}
  style:--p={revealP}
  style:--fx={q ? `${q.focus[0]}%` : '50%'}
  style:--fy={q ? `${q.focus[1]}%` : '50%'}
  style:--sx={`${50 + 34 * Math.sin(revealP * seconds * 0.85)}%`}
  style:--sy={`${50 + 28 * Math.sin(revealP * seconds * 1.3 + 1)}%`}
  data-testid="frame-player"
  data-phase={phase}
  data-answer={debug && q ? q.film.id : null}
>
  <div class="ff-main">
    <div class="ff-left">
      <div class="mq">
        <div class="crown" bind:this={crownEl} class:titled={answered || kind === 'frames'}>
          <span class="cr-l" bind:this={labelEl}>Now showing</span>
          <span class="cr-b">
            {#key signText}
              <b class="cr-t" class:run={signRun} bind:this={signEl} style:--fs={signScale} style:--run={`${runW}px`} style:--dur={`${Math.max(5, runW / 45)}s`} data-testid="crown-sign">
                <span>{signText}{#if signYear}<small>{signYear}</small>{/if}{#if signRun}<em>·</em>{/if}</span>
                {#if signRun}<span aria-hidden="true">{signText}{#if signYear}<small>{signYear}</small>{/if}<em>·</em></span>{/if}
              </b>
            {/key}
          </span>
        </div>
        <div class="stage" class:grid={kind === 'frames'}>
          {#if q && kind === 'frames'}
            {#each q.choices as c, i (c.film.id)}
              <button
                class="choice-btn"
                class:gone={removed.has(c.film.id)}
                class:right={answered && c.film.id === q.film.id}
                class:wrong={answered && picked === i && c.film.id !== q.film.id}
                disabled={phase !== 'ask' || removed.has(c.film.id)}
                onclick={() => chooseFrame(i)}
                aria-label={`Frame ${i + 1}`}
              >
                <img class="choice" src={frameSrc(c.film.id, c.n, true)} alt="" width="640" height="320" draggable="false" />
                <span class="k">{i + 1}</span>
                {#if answered}<span class="cap">{c.film.title}</span>{/if}
                <span class="mark" aria-hidden="true"></span>
                <span class="blood" aria-hidden="true"></span>
              </button>
            {/each}
          {:else if q}
            {#key `${q.film.id}:${q.n}`}
              <img class="main" src={frameSrc(q.film.id, q.n)} alt="A frame from the film to name" width="1920" height="960" draggable="false" />
            {/key}
            <canvas class="pix" aria-hidden="true"></canvas>
            {#if extra}<img class="inset" src={frameSrc(q.film.id, extra, true)} alt="Another frame from the same film" />{/if}
          {/if}
          <div class="fxl" aria-hidden="true">
            {#if fx === 'end'}<div class="the-end"><span>The End</span></div>{/if}
          </div>
          {#if phase === 'paused'}<button class="paused" onclick={resume}>Paused · press to carry on</button>{/if}
        </div>
        <div class="bulbs" aria-hidden="true">
          {#each bulbs as [x, y], i}<i class:on={i < lit} style="left:{x};top:{y};--i:{i};--n:{bulbs.length}"></i>{/each}
        </div>
      </div>
    </div>

    <div class="ff-side">
      <div class="side-top">
        <div class="st-row">
          <p class="eyebrow">{mode.label}{q && !party && mode.clock !== 'run' && mode.clock ? ` · ${TIERS[q.tier]}` : ''}{challenge ? ' · challenge' : ''}</p>
          {#if !party}
            <div class="score"><span class="lbl">{mode.clock === 'run' || !mode.clock ? 'Named' : 'Score'}</span><span class="digits" data-testid="score">{#each String(mode.clock === 'run' || !mode.clock ? named : shown).split('') as d}<i>{d}</i>{/each}</span></div>
          {/if}
        </div>
        {#if party}
          <ul class="players">
            {#each players as p, i}
              <li>
                <button class="player" class:on={buzzer === i} class:out={locked.has(i)} disabled={phase !== 'ask' || buzzer >= 0 || locked.has(i)} onclick={() => buzz(i)}>
                  <span class="kbd">{p.key.toUpperCase()}</span><span class="nm">{p.name}</span><span class="sc">{p.score}</span>
                </button>
              </li>
            {/each}
          </ul>
        {:else if mode.lives}
          <div class="hud" title={`${lives} of ${mode.lives} tickets left`}>
            {#each Array(mode.lives) as _, i}
              <span class="slot" class:lost={i >= lives} class:fresh={i === lifeFresh}>
                <svg class="life" aria-hidden="true"><use href={withBase(`/icons.svg#i-${ICON}`)} /></svg>
                {#if i === lifeFresh}
                  <svg class="half hl" aria-hidden="true"><use href={withBase(`/icons.svg#i-${ICON}`)} /></svg>
                  <svg class="half hr" aria-hidden="true"><use href={withBase(`/icons.svg#i-${ICON}`)} /></svg>
                {/if}
              </span>
            {/each}
            <span class="lives-n" class:tick={lifeFresh >= 0} data-testid="lives"><b>{lives}</b>/{mode.lives}</span>
          </div>
        {:else if mode.clock === 'run'}
          <div class="hud run"><span class="run-clock" class:low={runLeft <= 10}>{Math.ceil(runLeft)} s</span><span class="faint">left{penalty ? ` · −${penalty} s for misses` : ''}</span></div>
        {:else}
          <div class="hud run"><span class="faint">No clock, no tickets.</span></div>
        {/if}
      </div>

      <div class="ask-wrap">
        <h2 class="ask">{kind === 'frames' ? 'Which frame is from this film?' : party && phase === 'ask' && buzzer < 0 ? 'Buzz to answer' : party && buzzer >= 0 ? `${players[buzzer].name}, which film?` : 'Which film is this?'}</h2>
        {#if kind === 'frames' && q}<p class="q-title">{q.film.title} <span>{q.film.year ?? ''}</span></p>{/if}
        <p class="clue">{#if clueText}<span>Clue</span> {clueText}{/if}</p>
      </div>

      {#if q && kind === 'choices'}
        <div class="opts">
          {#each q.options as f, i (f.id)}
            <button
              class="opt"
              class:long={f.title.length > 34}
              class:gone={removed.has(f.id)}
              class:right={answered && f.id === q.film.id}
              class:wrong={answered && picked === f.id && f.id !== q.film.id}
              disabled={phase !== 'ask' || removed.has(f.id) || (party && buzzer < 0)}
              onclick={() => chooseFilm(f)}
              data-testid="option"
              data-film={f.id}
            >
              <span class="k">{i + 1}</span><span class="t">{f.title}</span>{#if showYear(f)}<span class="yr">{f.year ?? '–'}</span>{/if}
              <span class="mark" aria-hidden="true"></span><span class="blood" aria-hidden="true"></span>
            </button>
          {/each}
        </div>
      {:else if q && kind === 'typing'}
        <div class="typing">
          <TitleInput index={titleIndex} disabled={phase !== 'ask'} onpick={chooseFilm} />
          {#if typedWrong}<p class="typed-wrong"><span>✗</span> {typedWrong.title} <span class="faint">{typedWrong.year ?? ''}</span></p>{/if}
          {#if answered && res?.kind === 'right'}<p class="typed-right"><span>✓</span> {q.film.title}</p>{/if}
        </div>
      {/if}

      <div class="play-foot">
        {#if phase === 'bonus'}
          <form class="card bonus" onsubmit={(e) => { e.preventDefault(); lockBonus(); }}>
            <p class="eyebrow">Bonus · within 0.5 doubles the +{res.pts}</p>
            <p class="b-q">What did Dr. X give it?</p>
            <div class="b-in">
              <input type="number" min="0" max="10" step="0.1" inputmode="decimal" bind:value={bonusGuess} aria-label="Dr. X's score out of 10" autofocus />
              <button class="next-btn small" type="submit">Lock it in</button>
              <button class="linkish" type="button" onclick={() => lockBonus(true)}>No bonus</button>
            </div>
          </form>
        {:else if answered && res && phase !== 'ending'}
          <div class="card reveal" data-testid="result">
            <div class="rv-head">
              {#if res.kind === 'right'}<b class="ok">✓ Right</b><span class="pts">{mode.clock === 'run' || !mode.clock ? 'named' : `+${res.pts}`}{res.bonus?.hit ? ` · bonus +${res.pts}` : ''}{streak > 1 ? ` · streak ${streak}` : ''}</span>
              {:else if res.kind === 'wrong'}<b class="no">✗ Not this one</b><span class="pts">{mode.lives ? 'a ticket lost' : mode.clock === 'run' ? `−${SPRINT_PENALTY} s` : party ? 'nobody named it' : ''}</span>
              {:else if res.kind === 'timeout'}<b class="no">Time's up</b><span class="pts">{mode.lives ? 'a ticket lost' : ''}</span>
              {:else}<b>Skipped</b><span class="pts">{mode.lives ? 'no ticket lost' : ''}</span>{/if}
            </div>
            <div class="rv-film"><a class="rv-t" href={filmHref(q.film)}>{q.film.title}</a> <span class="rv-y">{q.film.year ?? ''}</span></div>
            <div class="rv-m">{q.film.directors.join(', ')} · Dr. X <b>{fmt1(q.film.my)}</b>{#if res.bonus} · you said <b>{fmt1(res.bonus.guess)}</b>{/if}</div>
            <div class="rv-links">
              {#if q.film.frames > 1}<a href={`${filmHref(q.film)}#stills`}>{q.film.frames} stills</a>{:else}<a href={filmHref(q.film)}>Film page</a>{/if}
              <button class="linkish" onclick={() => (watch = toggleWatchlist(q.film.id, q.film.title))}>{watch ? '✓ On your watchlist' : '+ Watchlist'}</button>
            </div>
            <button class="next-btn" onclick={advance} data-testid="next">
              <span>{(mode.lives && lives <= 0) || (party && round >= PARTY_ROUNDS) ? 'Roll the credits' : 'Next frame'}</span><span class="kbd">Enter</span>
              <i class="bar" style:animation-duration={mode.clock === 'run' ? '1.2s' : '3s'} onanimationend={advance}></i>
            </button>
          </div>
        {:else if phase === 'ending'}
          <span></span>
        {:else if !party}
          <div class="tools">
            <button class="tool" disabled={phase !== 'ask' || !hints.clue || !!clueText || (kind !== 'typing' && !q?.clue)} onclick={() => useHint('clue')} data-testid="hint-clue">
              <span class="ic"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.6" /><path d="M10.4 10.4 14 14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg></span>
              <span class="tl"><b>Clue</b><small>{clueText ? 'used on this frame' : kind === 'typing' ? 'one fact about it' : 'leaves two answers'}</small></span><span class="left">{hints.clue} left</span><span class="kbd">C</span>
            </button>
            {#if kind !== 'frames'}
              <button class="tool" disabled={phase !== 'ask' || !hints.frame || !!extra || (q?.film.frames ?? 0) < 2} onclick={() => useHint('frame')}>
                <span class="ic"><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="3" width="9" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="1.4" /><rect x="5.5" y="7" width="9" height="6" rx="1" fill="currentColor" opacity=".55" /></svg></span>
                <span class="tl"><b>Another frame</b><small>{(q?.film.frames ?? 0) < 2 ? 'this film has only one' : extra ? 'shown' : 'a second look'}</small></span><span class="left">{hints.frame} left</span><span class="kbd">F</span>
              </button>
            {/if}
            <button class="tool" disabled={phase !== 'ask' || !hints.skip} onclick={() => useHint('skip')}>
              <span class="ic"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3.5 8 8l-6 4.5zM8 3.5 14 8l-6 4.5z" fill="currentColor" /></svg></span>
              <span class="tl"><b>Skip</b><small>{mode.lives ? 'keeps your ticket' : 'on to the next'}</small></span><span class="left">{hints.skip} left</span><span class="kbd">S</span>
            </button>
            {#if !mode.clock}<button class="tool end" onclick={ending}><span class="tl"><b>End practice</b><small>see how you did</small></span></button>{/if}
          </div>
        {:else}
          <p class="party-help faint">Buzz with your key ({players.map((p) => p.key.toUpperCase()).join(' / ')}) or tap your name, then answer with 1–4. A miss costs 50 and passes the frame on.</p>
        {/if}
      </div>
    </div>
  </div>
  <div class="ff-foot">
    {#if ease}
      <p class="ease-line">Debug · ease <b>{ease.total.toFixed(2)}</b> = votes {ease.votes.toFixed(2)} × .40 + IMDb {ease.imdb.toFixed(2)} × .10 + star {ease.star.toFixed(2)} × .15 + director {ease.dir.toFixed(2)} × .10 + frame {ease.frame} × .25 · {TIERS[q.tier]}{q.retake ? ' · retake' : ''} · film {q.film.id} frame {q.n}</p>
    {/if}
    <button class="quit linkish" onclick={() => onquit?.()}>Leave the game</button>
  </div>
</div>

<style>
  /* Name the Frame: the Crown marquee. Colours per theme; the boards are
     cinema letter boards. */
  .ff {
    container-type: inline-size;
    max-width: min(100%, calc((100svh - var(--header-h) - 150px) * 2 + 380px));
    margin: 0 auto;
    --ok: #3fcf72; --no: #e5484d; --ok-on: #b9ffcf; --ok-glow: rgb(80 240 130 / 0.85); --no-on: #ffb3a8; --no-glow: rgb(255 70 60 / 0.85);
    --mq-body: linear-gradient(160deg, #26161f, #120a10); --mq-edge: #4a2a3a; --rays-a: #3a2030; --rays-b: #2a1622; --trim: #d9b46a; --bezel: #0a0508;
    --board: #f6f2e7; --board-ink: #141210; --board-line: rgb(0 0 0 / 0.13); --board-edge: 0 0 0 2px #2b211b; --board-faint: #6b6355;
    --b-off: #3b2a2f; --b-on: #fff1c9; --b-glow: 0 0 5px 2px rgb(255 211 120 / 0.85), 0 0 14px 2px rgb(255 170 60 / 0.4);
    --ticket: #d9b46a;
  }
  :global(:root[data-theme='light']) .ff {
    --ok: #1f9d55; --no: #c8323a;
    --mq-body: linear-gradient(160deg, #f6eedc, #e8dab9); --mq-edge: #c9b083; --rays-a: #f1e5c8; --rays-b: #e4d2a8; --trim: #a8812f; --bezel: #3b2f22;
    --board-edge: 0 0 0 1px #b8ac91, 0 3px 8px -4px rgb(60 40 10 / 0.3);
    --b-off: #d9c9a5; --b-on: #ffcf6b; --b-glow: 0 0 4px 2px rgb(240 170 50 / 0.85), 0 0 12px 2px rgb(240 170 50 / 0.35);
    --ticket: #a8812f;
  }
  :global(:root[data-theme='matrix']) .ff {
    --ok: #eafff2; --ok-on: #ffffff; --ok-glow: rgb(220 255 235 / 0.9);
    --mq-body: #010603; --mq-edge: var(--border-strong); --rays-a: #06200f; --rays-b: #031408; --trim: var(--accent); --bezel: #000;
    --board: #010603; --board-ink: var(--accent); --board-line: rgb(58 255 143 / 0.12); --board-edge: 0 0 0 1px var(--border-strong); --board-faint: var(--ink-faint);
    --b-off: #06200f; --b-on: var(--accent); --b-glow: 0 0 6px 1px var(--accent);
    --ticket: var(--form-c);
  }
  .ff-main { display: grid; grid-template-columns: minmax(0, 1fr) 290px; gap: 1.5rem; align-items: stretch; }
  .ff-left { min-width: 0; }
  .ff-side { display: flex; flex-direction: column; gap: 0.6rem; min-width: 0; }
  @container (max-width: 759px) {
    .ff-main { display: flex; flex-direction: column; gap: 0.8rem; }
    .ff-side { display: contents; }
    .side-top { order: -1; }
  }
  .eyebrow { font: 600 0.64rem/1.3 var(--font-ui); letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-faint); margin: 0; }
  .side-top { padding-bottom: 0.65rem; border-bottom: 1px solid var(--border); }
  .st-row { display: flex; align-items: center; justify-content: space-between; gap: 0.8rem; margin-bottom: 0.45rem; }
  .hud { display: flex; align-items: center; justify-content: center; gap: 0.25rem; color: var(--ticket); }
  .hud.run { gap: 0.5rem; font-size: 0.82rem; color: var(--ink-muted); }
  .run-clock { font: 600 1.1rem var(--font-mono); color: var(--ink); }
  .run-clock.low { color: var(--no); }
  .slot { position: relative; display: inline-grid; }
  .life, .half { width: 26px; height: 17px; fill: currentColor; }
  :global(:root[data-theme='matrix']) .life, :global(:root[data-theme='matrix']) .half { width: 24px; height: 12px; }
  .slot.lost .life { opacity: 0.18; }
  .half { position: absolute; inset: 0; }
  .lives-n { margin-left: 0.45rem; font: 600 0.9rem var(--font-mono); color: var(--ink); white-space: nowrap; }
  .lives-n b { display: inline-block; }
  .lives-n.tick b { animation: tickn 0.5s ease-out; }
  @keyframes tickn { from { transform: translateY(-70%); opacity: 0; } }
  .score { display: flex; align-items: center; gap: 0.45rem; }
  .score .lbl { font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.12em; color: var(--ink-faint); }
  .digits { display: inline-flex; gap: 2px; }
  .digits i { font: 600 0.92rem/1 var(--font-mono); font-style: normal; min-width: 1.15em; text-align: center; padding: 0.28em 0.18em; background: #1a1612; color: #fff1c9; border-radius: 3px; }
  :global(:root[data-theme='light']) .digits i { background: #2a221a; }
  :global(:root[data-theme='matrix']) .digits i { background: #03140a; color: var(--accent); }
  .players { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.3rem; }
  .player { display: grid; grid-template-columns: auto 1fr auto; gap: 0.5rem; align-items: center; width: 100%; padding: 0.3rem 0.5rem; border: 1px solid var(--border); border-radius: 6px; background: var(--bg-panel); color: var(--ink); text-align: left; }
  .player.on { border-color: #e3b45a; box-shadow: 0 0 12px -3px rgb(255 190 80 / 0.6); }
  .player.out { opacity: 0.45; }
  .player .nm { font: 500 0.98rem var(--font-display); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .player .sc { font: 600 0.9rem var(--font-mono); }
  .player:disabled { cursor: default; }

  /* the marquee */
  .mq { position: relative; margin-top: 46px; padding: 24px; border-radius: 0 0 10px 10px; background: var(--mq-body); box-shadow: inset 0 0 0 1px var(--mq-edge), 0 12px 28px -16px rgb(0 0 0 / 0.5); --bi: 12px; --bs: 9px; }
  .crown { position: absolute; left: 12%; right: 12%; top: -46px; height: 46px; display: flex; align-items: center; justify-content: center; gap: 0.8rem; padding: 0 12%;
    clip-path: polygon(0 100%, 4% 40%, 11% 40%, 13% 0, 87% 0, 89% 40%, 96% 40%, 100% 100%);
    background: repeating-conic-gradient(from -90deg at 50% 100%, var(--rays-a) 0 6deg, var(--rays-b) 6deg 12deg); border-bottom: 2px solid var(--trim); }
  .cr-l { flex: none; font: 600 0.58rem var(--font-ui); letter-spacing: 0.3em; text-transform: uppercase; color: var(--trim); }
  .cr-b { flex: 0 1 auto; min-width: 0; display: flex; }
  .cr-t { display: flex; overflow: hidden; white-space: nowrap; max-width: 100%; font: 700 calc(0.8rem * var(--fs, 1)) / 1.6 var(--font-ui); letter-spacing: 0.16em; text-transform: uppercase;
    color: var(--board-ink); background: var(--board) repeating-linear-gradient(transparent 0 calc(1.6em - 1px), var(--board-line) calc(1.6em - 1px) 1.6em); padding: 0.05em 0.7em; border-radius: 2px; animation: flipx 0.55s ease-in-out; }
  :global(:root[data-theme='light']) .cr-t { box-shadow: 0 0 0 1px var(--trim); }
  :global(:root[data-theme='matrix']) .cr-t { box-shadow: 0 0 0 1px var(--accent); }
  .cr-t > span { flex: none; }
  .cr-t small { font: 600 0.82em var(--font-mono); letter-spacing: 0; margin-left: 0.6em; color: var(--board-faint); }
  .cr-t em { font-style: normal; margin: 0 1.1em; color: var(--board-faint); }
  .cr-t.run > span { animation: run var(--dur, 8s) linear infinite; }
  @keyframes run { to { transform: translateX(calc(-1 * var(--run))); } }
  @keyframes flipx { 50% { transform: rotateX(90deg); } }
  .stage { position: relative; aspect-ratio: 2 / 1; overflow: hidden; background: #0a0a0a; z-index: 1; box-shadow: 0 0 0 3px var(--bezel); }
  .stage img.main { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; user-select: none; }
  .stage img.inset { position: absolute; left: 3%; bottom: 6%; width: 32%; height: auto; aspect-ratio: 2 / 1; object-fit: cover; border: 2px solid #f4efe4; box-shadow: 0 6px 20px rgb(0 0 0 / 0.55); z-index: 3; animation: pop 0.25s ease-out; }
  @keyframes pop { from { transform: scale(0.85); opacity: 0; } }
  .stage.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; background: var(--bezel); }
  .choice-btn { position: relative; padding: 0; border: 0; overflow: hidden; background: #111; cursor: pointer; }
  .choice-btn img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .choice-btn .k { position: absolute; left: 8px; top: 8px; font: 0.68rem/1.5 var(--font-mono); padding: 0 0.4em; border-radius: 4px; background: rgb(0 0 0 / 0.6); color: #fff; }
  .choice-btn .cap { position: absolute; left: 0; right: 0; bottom: 0; padding: 0.25rem 0.5rem; font-size: 0.72rem; color: #fff; background: linear-gradient(transparent, rgb(0 0 0 / 0.75)); text-align: left; }
  .choice-btn:hover:not(:disabled) { outline: 2px solid #e3b45a; outline-offset: -2px; }
  .choice-btn:disabled { cursor: default; }
  .choice-btn.gone { opacity: 0.15; }
  .done .choice-btn:not(.right):not(.wrong) img { filter: grayscale(0.8) brightness(0.5); }
  .choice-btn .mark { position: absolute; right: 8px; top: 6px; font: 700 1.3rem var(--font-ui); z-index: 4; text-shadow: 0 1px 3px #000; }
  .choice-btn.right .mark::before { content: '✓'; color: var(--ok); }
  .choice-btn.wrong .mark::before { content: '✗'; color: var(--no); }
  .fxl { position: absolute; inset: 0; pointer-events: none; z-index: 4; }
  .paused { position: absolute; inset: 0; z-index: 5; border: 0; background: rgb(0 0 0 / 0.72); color: #fff; font: 600 1rem var(--font-ui); }
  .bulbs { position: absolute; inset: 0; pointer-events: none; z-index: 2; }
  .bulbs i { position: absolute; width: var(--bs); height: var(--bs); margin: calc(var(--bs) / -2) 0 0 calc(var(--bs) / -2); border-radius: 50%; background-color: var(--b-off); transition: background-color 0.25s, box-shadow 0.25s; }
  .bulbs i.on { background-color: var(--b-on); box-shadow: var(--b-glow); }
  .hurry .bulbs i.on { animation: blink 0.45s steps(2) infinite; }
  @keyframes blink { 50% { opacity: 0.35; } }
  :global(:root[data-theme='matrix']) .stage::after { content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 2; background: repeating-linear-gradient(transparent 0 2px, rgb(0 0 0 / 0.16) 2px 3px); }
  @container (max-width: 759px) {
    .mq { margin-top: 34px; padding: 16px; --bi: 8px; --bs: 6px; }
    .crown { top: -34px; height: 34px; left: 5%; right: 5%; padding: 0 9%; }
    .cr-l { display: none; }
  }
  .ease-line { margin: 0; font: 0.68rem/1.5 var(--font-mono); color: var(--ink-muted); border: 1px dashed var(--border-strong); padding: 0.4rem 0.6rem; border-radius: 4px; }

  /* the panel */
  .ask-wrap { min-height: 3.1rem; }
  .ask { font: 700 0.72rem var(--font-ui); letter-spacing: 0.28em; text-transform: uppercase; color: var(--ink-muted); margin: 0.1rem 0 0.15rem; }
  .q-title { margin: 0.2rem 0 0.3rem; font: 500 1.35rem/1.2 var(--font-display); }
  .q-title span { font: 0.8rem var(--font-mono); color: var(--ink-faint); }
  .clue { margin: 0; font: italic 1rem/1.3 var(--font-display); color: var(--ink); }
  .clue span { font: 600 0.62rem var(--font-ui); letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent); font-style: normal; margin-right: 0.4em; }
  .opts { display: grid; gap: 0.5rem; }
  .opt { position: relative; display: flex; align-items: center; justify-content: center; text-align: center; padding: 0.35rem 2.1rem; min-height: 2.85rem; border-radius: 3px; border: 0;
    background: var(--board) repeating-linear-gradient(transparent 0 calc(1.6em - 1px), var(--board-line) calc(1.6em - 1px) 1.6em);
    color: var(--board-ink); font: 700 0.8rem/1.6 var(--font-ui); letter-spacing: 0.08em; text-transform: uppercase; box-shadow: var(--board-edge), 0 4px 10px -5px rgb(0 0 0 / 0.5); transition: box-shadow 0.2s, opacity 0.3s; }
  .opt.long { font-size: 0.68rem; letter-spacing: 0.05em; line-height: 1.5; }
  .opt .t { position: relative; z-index: 2; }
  .opt .k { position: absolute; left: 0.55rem; top: 50%; transform: translateY(-50%); z-index: 2; font: 0.64rem/1.5 var(--font-mono); letter-spacing: 0; border: 1px solid #c9c0ad; border-bottom-width: 2px; border-radius: 4px; padding: 0 0.36em; color: var(--board-faint); }
  :global(:root[data-theme='matrix']) .opt .k { border-color: var(--border-strong); }
  .opt .yr { position: absolute; right: 0.55rem; top: 50%; transform: translateY(-50%); z-index: 2; font: 0.64rem var(--font-mono); color: var(--board-faint); letter-spacing: 0; }
  .opt:hover:not(:disabled) { box-shadow: 0 0 0 2px #e3b45a, 0 0 16px -2px rgb(255 190 80 / 0.6); }
  :global(:root[data-theme='matrix']) .opt:hover:not(:disabled) { box-shadow: 0 0 0 1px var(--accent), 0 0 14px -2px var(--accent); }
  .opt:disabled { cursor: default; }
  .opt.gone { opacity: 0.2; text-decoration: line-through; }
  .done .opt:not(.right):not(.wrong) { opacity: 0.32; }
  /* No coloured rings: the right board keeps a tick, a wrong pick a cross. */
  .opt .mark { position: absolute; right: 0.6rem; top: 50%; transform: translateY(-50%); font: 700 1.05rem var(--font-ui); z-index: 4; }
  .opt.right .mark::before { content: '✓'; color: var(--ok); }
  .opt.wrong .mark::before { content: '✗'; color: var(--no); }
  .opt.right .yr, .opt.wrong .yr { display: none; }
  .opt.wrong .t { text-decoration: line-through; text-decoration-thickness: 2px; }
  /* The blood sits above the board's text and may spill past its edges. */
  .blood { position: absolute; inset: 0; pointer-events: none; z-index: 3; }
  .typing { display: grid; gap: 0.4rem; }
  .typed-wrong, .typed-right { margin: 0; font-size: 0.86rem; }
  .typed-wrong span { color: var(--no); font-weight: 700; }
  .typed-right span { color: var(--ok); font-weight: 700; }
  .play-foot { margin-top: auto; }
  .tools { display: grid; gap: 0.4rem; }
  .tool { display: grid; grid-template-columns: 30px 1fr auto auto; gap: 0.6rem; align-items: center; text-align: left; width: 100%; padding: 0.42rem 0.55rem 0.42rem 0.45rem; border: 1px solid var(--border); border-radius: 6px; background: var(--bg-panel); color: var(--ink); transition: border-color 0.15s, background 0.15s; }
  .tool .ic { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); }
  .tool .ic svg { width: 14px; height: 14px; }
  .tool .tl b { display: block; font-size: 0.84rem; font-weight: 600; line-height: 1.2; }
  .tool .tl small { display: block; font-size: 0.68rem; color: var(--ink-faint); line-height: 1.3; }
  .tool .left { font: 0.64rem var(--font-mono); color: var(--ink-muted); }
  .tool .kbd { font: 0.6rem var(--font-mono); border: 1px solid var(--border-strong); border-bottom-width: 2px; border-radius: 4px; padding: 0 0.4em; color: var(--ink-muted); }
  .tool.end { grid-template-columns: 1fr; }
  .tool:hover:not(:disabled) { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 6%, var(--bg-panel)); }
  .tool:disabled { opacity: 0.42; cursor: default; }
  .party-help { font-size: 0.78rem; margin: 0; }
  .card { display: grid; gap: 0.08rem; padding: 0.5rem 0.75rem 0.6rem; border: 1px solid var(--border); border-radius: 6px; background: var(--bg-panel); animation: rise 0.25s ease-out; }
  @keyframes rise { from { opacity: 0; transform: translateY(6px); } }
  .rv-head { display: flex; justify-content: space-between; align-items: baseline; gap: 0.6rem; }
  .rv-head b { font-size: 0.92rem; }
  .rv-head .ok { color: var(--ok); }
  .rv-head .no { color: var(--no); }
  .rv-head .pts { font: 0.72rem var(--font-mono); color: var(--ink-muted); }
  .rv-film { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rv-t { font: 500 1.08rem/1.25 var(--font-display); text-decoration: none; color: var(--ink); }
  .rv-t:hover { text-decoration: underline; }
  .rv-y { font: 0.74rem var(--font-mono); color: var(--ink-faint); }
  .rv-m { font-size: 0.74rem; color: var(--ink-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rv-m b { font-family: var(--font-mono); color: var(--ink); }
  .rv-links { display: flex; gap: 1rem; font-size: 0.74rem; margin-bottom: 0.3rem; }
  .rv-links a { color: var(--ink-muted); }
  .linkish { background: none; border: 0; padding: 0; color: var(--ink-muted); text-decoration: underline; text-underline-offset: 3px; font-size: inherit; cursor: pointer; }
  .next-btn { position: relative; overflow: hidden; display: flex; justify-content: center; align-items: center; gap: 0.6em; padding: 0.48em 1.1em; border: 0; border-radius: var(--radius); background: var(--accent); color: var(--bg); font-weight: 600; font-size: 0.86rem; cursor: pointer; }
  .next-btn.small { padding: 0.4em 0.8em; font-size: 0.8rem; }
  .next-btn > span { position: relative; z-index: 1; }
  .next-btn .kbd { font: 0.6rem var(--font-mono); border: 1px solid currentColor; border-radius: 4px; padding: 0 0.4em; opacity: 0.75; }
  .next-btn .bar { position: absolute; inset: 0; background: rgb(255 255 255 / 0.22); transform-origin: left; animation: fill 3s linear forwards; }
  :global(:root[data-theme='light']) .next-btn .bar { background: rgb(0 0 0 / 0.16); }
  @keyframes fill { from { transform: scaleX(0); } }
  .reveal:hover .next-btn .bar, .reveal:focus-within .next-btn .bar { animation-play-state: paused; }
  .bonus .b-q { margin: 0.1rem 0 0.35rem; font: 500 1.02rem var(--font-display); }
  .b-in { display: flex; gap: 0.5rem; align-items: center; }
  .b-in input { width: 4.5em; font: 600 1.05rem var(--font-mono); text-align: center; padding: 0.25em; border: 1px solid var(--accent); border-radius: var(--radius); background: var(--bg-raised); color: var(--ink); }
  .ff-foot { display: flex; gap: 1rem; align-items: flex-start; justify-content: space-between; margin-top: 0.7rem; }
  .quit { margin-left: auto; font-size: 0.72rem; white-space: nowrap; }

  /* reveal styles */
  .stage canvas.pix { display: none; position: absolute; inset: 0; width: 100%; height: 100%; image-rendering: pixelated; }
  .rv-pix:not(.done) .stage canvas.pix { display: block; }
  .rv-zoom:not(.done) .stage img.main { transform-origin: var(--fx) var(--fy); transform: scale(calc(1 + 2.4 * (1 - min(1, var(--p) / 0.75)))); }
  .rv-key:not(.done) .stage img.main { clip-path: circle(calc(9% + 60% * var(--p)) at var(--fx) var(--fy)); }
  .rv-spot:not(.done) .stage img.main { clip-path: circle(calc(13% + 12% * var(--p)) at var(--sx) var(--sy)); }
  .done .stage img.main { transition: transform 0.6s ease-out, clip-path 0.6s ease-out, filter 0.5s; }

  /* effects */
  .fx-right .bulbs i { background-color: var(--ok-on); box-shadow: 0 0 6px 2px var(--ok-glow); animation: chase 0.55s calc(var(--i) / var(--n) * 700ms) 2 ease-out; }
  @keyframes chase { 30% { transform: scale(1.6); filter: brightness(1.8); } }
  .fx-wrong .bulbs i { background-color: var(--no-on); box-shadow: 0 0 6px 2px var(--no-glow); animation: flicker 1.1s steps(1) both; }
  .fx-wrong .bulbs i:nth-child(3n) { animation-delay: 0.12s; }
  .fx-wrong .bulbs i:nth-child(3n + 1) { animation-delay: 0.05s; }
  @keyframes flicker { 0% { opacity: 1; } 10% { opacity: 0.15; } 18% { opacity: 1; } 30% { opacity: 0.2; } 45% { opacity: 1; } 60% { opacity: 0.3; } 72% { opacity: 1; } }
  .fx-wrong .opt.wrong { animation: jolt 0.22s ease-out; }
  @keyframes jolt { 30% { transform: translate(-3px, 2px); } 65% { transform: translate(2px, -1px); } }
  .fx-time .bulbs i { background-color: var(--b-off); box-shadow: none; animation: popout 0.3s; }
  @keyframes popout { 0% { background-color: #fff; box-shadow: 0 0 14px 6px #fff; } }
  .fx-time .stage img.main { animation: powerdown 1.8s forwards; }
  @keyframes powerdown { 0%, 60% { filter: brightness(0); } 100% { filter: brightness(0.6) grayscale(0.5); } }
  .life-lost .slot.fresh .life { animation: ghost 0.9s both; }
  @keyframes ghost { from { opacity: 0; } to { opacity: 0.18; } }
  .hl { clip-path: polygon(0 0, 52% 0, 46% 30%, 54% 55%, 47% 100%, 0 100%); animation: tearL 0.9s ease-in both; }
  .hr { clip-path: polygon(52% 0, 100% 0, 100% 100%, 47% 100%, 54% 55%, 46% 30%); animation: tearR 0.9s ease-in both; }
  @keyframes tearL { 20% { transform: translate(-2px, 0) rotate(-6deg); } to { transform: translate(-8px, 22px) rotate(-35deg); opacity: 0; } }
  @keyframes tearR { 20% { transform: translate(2px, 0) rotate(6deg); } to { transform: translate(8px, 26px) rotate(40deg); opacity: 0; } }
  .fx-end .bulbs i { animation: out 0.15s calc((var(--n) - var(--i)) / var(--n) * 1400ms) forwards; }
  @keyframes out { to { background-color: var(--b-off); box-shadow: none; } }
  .fx-end .stage img, .fx-end .stage canvas.pix { filter: brightness(0); transition: filter 1s 1.1s; }
  .the-end { position: absolute; inset: 0; display: grid; place-items: center; background: radial-gradient(ellipse at center, transparent 30%, rgb(0 0 0 / 0.6)); }
  .the-end::after { content: ''; position: absolute; inset: -20%; opacity: 0.16; pointer-events: none; animation: grain 0.4s steps(3) infinite;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); }
  @keyframes grain { 33% { transform: translate(-3%, 2%); } 66% { transform: translate(2%, -3%); } }
  .the-end span { font: 400 clamp(2rem, 7cqi, 4.2rem)/1 'Limelight', var(--font-display); letter-spacing: 0.08em; color: #f4efe4; text-shadow: 0 0 18px rgb(255 240 210 / 0.35); opacity: 0; animation: endin 1.2s 2.1s ease-out forwards, flick 0.18s 3.3s steps(2) infinite; }
  :global(:root[data-theme='matrix']) .the-end span { color: var(--accent); text-shadow: 0 0 18px rgb(58 255 143 / 0.45); }
  @keyframes endin { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: none; } }
  @keyframes flick { 50% { opacity: 0.88; } }

  /* effects drawn by frame-fx.js */
  :global(.fx-confetti) { position: absolute; z-index: 60; pointer-events: none; }
  :global(.fx-confetti i) { position: absolute; width: 7px; height: 11px; background: #e3b45a; border-radius: 1px; animation: ff-conf 1.3s var(--d) cubic-bezier(0.2, 0.7, 0.3, 1) both; }
  :global(.fx-confetti i:nth-child(3n)) { background: #fff1c9; }
  :global(.fx-confetti i:nth-child(4n)) { background: #3fcf72; width: 5px; height: 5px; border-radius: 50%; }
  :global(:root[data-theme='matrix'] .fx-confetti i) { background: var(--accent); }
  @keyframes -global-ff-conf { from { transform: none; opacity: 1; } to { transform: translate(var(--x), calc(var(--y) + 80px)) rotate(var(--r)); opacity: 0; } }
  :global(.fx-splat) { position: absolute; top: 50%; overflow: visible; pointer-events: none; fill: #7c040a; }
  :global(.fx-splat circle), :global(.fx-splat ellipse) { transform-box: fill-box; transform-origin: center; }
  :global(.fx-splat .fx-mist) { fill: #8a070d; opacity: 0.9; }
  :global(:root[data-theme='light'] .fx-splat) { fill: #74030a; }
  :global(:root[data-theme='matrix'] .fx-splat) { fill: #a10c14; }
  :global(.fx-snow) { position: absolute; inset: 0; width: 100%; height: 100%; animation: ff-snowoff 1.1s forwards; }
  @keyframes -global-ff-snowoff { 0%, 72% { opacity: 0.96; transform: none; filter: none; } 88% { transform: scaleY(0.012); opacity: 1; filter: brightness(3); } 100% { transform: scale(0, 0.012); opacity: 0; } }
  @media (prefers-reduced-motion: reduce) {
    .ff *, .ff *::before, .ff *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition: none !important; }
    .next-btn .bar { animation-duration: 3s !important; }
  }
</style>

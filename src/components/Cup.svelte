<script>
  // A published Dr. X's Cup (/knockout/cup/<slug>): the visitor replays the
  // same draw (free, or Dr. X's exact matchups) and then sees how often they
  // agreed. Dr. X's champion and bracket stay hidden until the visitor
  // finishes or asks to see them. Server-rendered in its "not started" state;
  // the visitor's play (cinema.knockout.v1 → cups[slug]) loads on mount.
  import { onMount } from 'svelte';
  import { bracketRounds, champion, agreement, encodeShare, parseShare, decodePicks, isComplete, roundName } from '../lib/knockout.js';
  import { cupPlay, saveCupPlay, addHistory } from '../lib/knockout-store.js';
  import { tmdbImg, withBase } from '../lib/util.js';
  import FilmCard from './FilmCard.svelte';
  import KnockoutPlayer from './KnockoutPlayer.svelte';
  import BracketTable from './BracketTable.svelte';

  let { cup } = $props();

  const slots = cup.entrants.map((e) => e.id);
  const films = Object.fromEntries(cup.entrants.map((e) => [e.id, e]));
  const ref = bracketRounds(slots, cup.picks);
  const drxChamp = champion(ref);
  const cupDate = new Date(`${cup.date}T12:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  let play = $state(null); // { picks, mode, startedAt, finishedAt? }
  let revealed = $state(false);
  let pendingShared = $state(null);
  let notice = $state('');
  let copied = $state(false);
  let justFinished = $state(false); // keep the champion screen up after finishing here

  const pairsFrom = $derived(play?.mode === 'path' ? cup.picks : null);
  const finished = $derived(play != null && isComplete(slots, play.picks, pairsFrom));
  const mine = $derived(play ? bracketRounds(slots, play.picks, pairsFrom) : null);
  const agree = $derived(finished ? agreement(ref, mine) : null);
  const pct = $derived(agree?.both ? Math.round((agree.same / agree.both) * 100) : 0);
  const showDrx = $derived(finished || revealed);

  // Dr. X's champion, round by round: whom it beat.
  const path = ref.map((r, ri) => {
    const m = r.find((x) => x.w === drxChamp);
    return { round: roundName(slots.length >> ri), opp: films[m.a === drxChamp ? m.b : m.a] };
  });

  function start(mode) {
    justFinished = false;
    play = { picks: [], mode, startedAt: new Date().toISOString() };
    persist();
    requestAnimationFrame(() => document.getElementById('cup-play')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
  function persist() {
    saveCupPlay(cup.slug, play ? $state.snapshot(play) : null);
  }
  function onchange(picks) {
    play.picks = picks;
    delete play.finishedAt;
    persist();
  }
  function onfinish(id) {
    justFinished = true;
    play.finishedAt = new Date().toISOString();
    persist();
    const f = films[id];
    addHistory({ champion: { id, title: f.title, year: f.year, poster: f.poster }, size: cup.size, label: `Dr. X's Cup: ${cup.title}`, cup: cup.slug, finishedAt: play.finishedAt });
  }
  const shareUrl = (picks) => `${location.origin}${withBase(`/knockout/cup/${cup.slug}`)}#${encodeShare({ slots, picks, cup: cup.slug, pairsFrom })}`;
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl(play.picks));
      copied = true;
      setTimeout(() => (copied = false), 2500);
    } catch {
      prompt('Copy this link', shareUrl(play.picks));
    }
  }

  onMount(() => {
    play = cupPlay(cup.slug);
    const share = parseShare(location.hash);
    if (share?.kind === 'c' && share.cup === cup.slug) {
      const sharedPairs = share.path ? cup.picks : null;
      const picks = decodePicks(slots, share.code, sharedPairs);
      if (!picks) notice = "This link's picks don't fit this cup.";
      else {
        const shared = { picks, mode: share.path ? 'path' : 'free', startedAt: new Date().toISOString() };
        if (isComplete(slots, picks, sharedPairs)) shared.finishedAt = shared.startedAt;
        if (play && play.picks.length) pendingShared = shared;
        else {
          play = shared;
          persist();
        }
      }
      history.replaceState(null, '', location.pathname + location.search);
    } else if (new URLSearchParams(location.search).has('play') && !play) {
      start('free');
    }
  });
</script>

<div class="cup-hero">
  <div>
    <span class="cup-kicker">Dr. X's Cup</span>
    <h1>{cup.title}</h1>
    {#if cup.description}<p class="cup-desc">{cup.description}</p>{/if}
    <div class="small faint cup-meta">{cup.size} films · {cup.seeding === 'random' ? 'random draw' : 'seeded'} · played {cupDate}</div>
    <div class="cup-acts" data-testid="cup-actions">
      {#if !play}
        <button class="btn primary" onclick={() => start('free')} data-testid="cup-play">Play this cup</button>
        <button class="btn" onclick={() => start('path')} data-testid="cup-path">Replay Dr. X's matchups</button>
      {:else if finished}
        <button class="btn primary" onclick={() => start('free')} data-testid="cup-again">Play again</button>
        <button class="btn" onclick={() => start('path')}>Replay Dr. X's matchups</button>
        <button class="btn" onclick={copyLink}>{copied ? 'Link copied' : 'Copy link to your bracket'}</button>
      {:else}
        <button class="btn" onclick={() => ((play = null), persist())} data-testid="cup-restart">Start over</button>
      {/if}
    </div>
    <p class="small faint cup-how">
      {play?.mode === 'path'
        ? "You're replaying Dr. X's exact matchups, so every pick can be compared with his."
        : 'Free replay: the same draw, your own path. Agreement counts the matchups you both played, plus the champion.'}
    </p>
  </div>
  <div class="cup-trophy" data-testid="cup-trophy">
    <span class="cup-lbl">Dr. X's champion</span>
    {#if showDrx}
      <FilmCard film={films[drxChamp]} />
    {:else}
      <div class="cup-hidden">
        <span>Revealed when you finish your bracket</span>
        <button class="btn" onclick={() => (revealed = true)} data-testid="cup-reveal">Reveal now</button>
      </div>
    {/if}
  </div>
</div>

{#if pendingShared}
  <div class="panel cup-banner">
    <span>This link holds someone's bracket for this cup. Opening it replaces yours.</span>
    <button class="btn primary" onclick={() => ((play = pendingShared), (pendingShared = null), persist())}>Open it</button>
    <button class="btn" onclick={() => (pendingShared = null)}>Keep mine</button>
  </div>
{/if}
{#if notice}<p class="muted small">{notice}</p>{/if}

<div id="cup-play">
  {#if play && (!finished || justFinished)}
    <KnockoutPlayer {slots} bind:picks={play.picks} {films} {pairsFrom} kicker="Dr. X's Cup" champLabel="Your champion" {shareUrl} {onchange} {onfinish} />
  {/if}
</div>

{#if finished}
  <div class="cup-row">
    <div class="panel cup-agree" data-testid="cup-agreement" style={`--p:${pct}`}>
      <div class="cup-ring"><b>{pct}%</b></div>
      <div>
        <h3>You agreed on {agree.same} of {agree.both}</h3>
        <p class="small muted">
          matchups you both played. Your champion: <b>{films[champion(mine)]?.title}</b>.
          {agree.champion ? 'The same as Dr. X.' : `Dr. X's: ${films[drxChamp]?.title}.`}
        </p>
      </div>
    </div>
    <div class="panel">
      <span class="cup-lbl">Dr. X's champion, round by round</span>
      <div class="cup-path">
        {#each path as step}
          <div class="cup-step">
            <span class="cup-r">{step.round}</span>
            {#if step.opp.poster}<img src={tmdbImg(step.opp.poster, 'w185')} alt="" width="185" height="278" loading="lazy" />{:else}<span class="cup-noimg"></span>{/if}
            <span class="cup-t">beat {step.opp.title}</span>
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}



{#if showDrx}
  <section class="cup-bracket">
    <h2>Dr. X's bracket</h2>
    {#if finished}<p class="small muted">Matches marked with a dot went the other way in your bracket.</p>{/if}
    <div class="panel"><BracketTable rounds={ref} {films} compare={finished ? mine : null} /></div>
  </section>
{/if}

<style>
  .cup-hero { display: grid; grid-template-columns: minmax(0, 1fr) 240px; gap: 2rem; align-items: center; }
  .cup-kicker, .cup-lbl { font: 600 0.7rem/1 var(--font-ui); letter-spacing: 0.16em; text-transform: uppercase; color: var(--accent); }
  .cup-lbl { display: block; margin-bottom: 0.6rem; }
  .cup-hero h1 { font-size: clamp(2.2rem, 5vw, 3.4rem); margin: 0.4rem 0; }
  .cup-desc { margin: 0; max-width: 560px; color: var(--ink-muted); }
  .cup-meta { margin-top: 0.5rem; }
  .cup-acts { display: flex; flex-wrap: wrap; gap: 0.6rem; margin-top: 1.1rem; min-height: 2.3rem; }
  .cup-how { margin: 0.8rem 0 0; max-width: 560px; }
  .cup-trophy { text-align: center; }
  .cup-trophy :global(.film-card) { text-align: left; }
  .cup-trophy :global(.fc-poster) { box-shadow: 0 0 0 3px var(--accent), 0 14px 34px rgb(0 0 0 / 0.4); }
  .cup-hidden { aspect-ratio: 2 / 3; border: 1px dashed var(--border-strong); border-radius: 4px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.9rem; padding: 1rem; background: var(--bg-panel); }
  .cup-hidden span { font-family: var(--font-display); font-size: 1.05rem; color: var(--ink-muted); }
  .cup-banner { display: flex; flex-wrap: wrap; gap: 0.8rem; align-items: center; margin-top: 1.4rem; }
  .cup-banner span { flex: 1 1 260px; }

  .cup-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); gap: 1.5rem; margin-top: 2rem; }
  .cup-agree { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 1.2rem; align-items: center; }
  .cup-ring { width: 92px; height: 92px; border-radius: 50%; background: conic-gradient(var(--accent) calc(var(--p) * 1%), var(--border) 0); display: grid; place-items: center; }
  .cup-ring b { width: 74px; height: 74px; border-radius: 50%; background: var(--bg-panel); display: grid; place-items: center; font: 600 1.25rem var(--font-mono); }
  .cup-agree h3 { font-size: 1.35rem; margin: 0 0 0.2rem; }
  .cup-agree p { margin: 0; }
  .cup-path { display: grid; grid-template-columns: repeat(auto-fit, minmax(64px, 1fr)); gap: 0.7rem; }
  .cup-step { font-size: 0.74rem; min-width: 0; }
  .cup-r { display: block; font: 600 0.6rem/1.2 var(--font-ui); letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-faint); margin-bottom: 0.3rem; min-height: 1.5em; }
  .cup-step img, .cup-noimg { display: block; width: 100%; height: auto; aspect-ratio: 2 / 3; object-fit: cover; border-radius: 3px; border: 1px solid var(--border); opacity: 0.6; filter: grayscale(0.6); background: var(--bg-raised); }
  .cup-t { display: block; margin-top: 0.3rem; line-height: 1.25; color: var(--ink-muted); }

  #cup-play { margin-top: 2rem; scroll-margin-top: 5rem; }
  #cup-play:empty { display: none; }
  .cup-bracket { margin-top: 2.4rem; }
  .cup-bracket h2 { font-size: 1.6rem; margin-bottom: 0.3rem; }

  @media (max-width: 760px) {
    .cup-hero { grid-template-columns: 1fr; }
    .cup-trophy { max-width: 200px; margin: 0 auto; }
    .cup-row { grid-template-columns: 1fr; }
    .cup-path { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  }
</style>

<script>
  // Name the Frame's Daily Reel: one film for everyone today, six of its
  // frames shown one at a time (the lead frame last). Each wrong or skipped
  // guess opens the next frame. Progress is kept per day, so a reload
  // resumes; the result shares as plain text.
  import { onMount } from 'svelte';
  import { DAILY_FRAMES, nearMiss, dailyShareText } from '../lib/frame-game.js';
  import { frameStore, saveDaily, dailyStreak } from '../lib/frame-store.js';
  import { stillUrl, withBase, fmt1 } from '../lib/util.js';
  import { movieSlug } from '../../shared/slug.mjs';
  import TitleInput from './TitleInput.svelte';

  let { entry, film, titleIndex = null, archiveById = null, onlobby } = $props();

  const saved = frameStore().daily[entry.date];
  let guesses = $state(saved?.id === entry.id ? [...saved.guesses] : []);
  let solved = $state(saved?.id === entry.id ? saved.solved : 0);
  const done = $derived(solved > 0 || guesses.length >= DAILY_FRAMES);
  let view = $state(null); // frame index being looked at (after the game, or an earlier one)
  const current = $derived(view ?? Math.min(done ? (solved || DAILY_FRAMES) - 1 : guesses.length, DAILY_FRAMES - 1));
  let streak = $state(0);
  let copied = $state(false);
  let countdown = $state('');

  function persist() {
    saveDaily(entry.date, { id: entry.id, guesses: [...guesses], solved });
    streak = dailyStreak(frameStore().daily, entry.date);
  }
  function guess(f) {
    if (done) return;
    guesses = [...guesses, f.id];
    if (f.id === entry.id) solved = guesses.length;
    view = null;
    persist();
  }
  function skip() {
    if (done) return;
    guesses = [...guesses, 0];
    view = null;
    persist();
  }

  const href = withBase(`/movie/${movieSlug(film.title, film.year, film.id)}`);
  const pageUrl = typeof location !== 'undefined' ? `${location.origin}${withBase('/name-the-frame')}` : '';
  const share = $derived(dailyShareText({ number: entry.number, solvedAt: solved, guesses: guesses.length, url: pageUrl.replace(/^https?:\/\//, '') }));
  async function copy() {
    try {
      await navigator.clipboard.writeText(share);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {}
  }

  onMount(() => {
    streak = dailyStreak(frameStore().daily, entry.date);
    const tickDown = () => {
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const s = Math.max(0, Math.floor((next - now) / 1000));
      countdown = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0')).join(':');
    };
    tickDown();
    const t = setInterval(tickDown, 1000);
    return () => clearInterval(t);
  });
</script>

<div class="dr" data-testid="daily">
  <div class="dr-left">
    <div class="sign"><span>Daily Reel</span><b>#{entry.number}</b><span class="date">{entry.date}</span></div>
    <div class="stage">
      {#key current}
        <img src={stillUrl(entry.id, entry.frames[current], window.innerWidth < 700 ? 'thumb' : 'full')} alt={done ? `${film.title}, frame ${current + 1} of the reel` : `Frame ${current + 1} of today's reel`} width="1920" height="960" />
      {/key}
    </div>
    <div class="thumbs">
      {#each entry.frames as n, i}
        {@const open = done || i <= guesses.length}
        <button class:cur={i === current} class:miss={i < guesses.length && i !== solved - 1} class:hit={i === solved - 1} disabled={!open} onclick={() => (view = i)} aria-label={`Frame ${i + 1}`}>
          {#if open}<img src={stillUrl(entry.id, n, 'thumb')} alt="" width="160" height="80" loading="lazy" />{/if}
          <span>{i + 1}</span>
        </button>
      {/each}
    </div>
  </div>

  <div class="dr-side">
    <p class="eyebrow">The Daily Reel · frame {Math.min(guesses.length + 1, DAILY_FRAMES)} of {DAILY_FRAMES}{streak ? ` · streak ${streak}` : ''}</p>
    {#if !done}
      <h2>Which film is this?</h2>
      <p class="faint small">One film, six frames. A wrong or skipped guess shows the next frame.</p>
    {/if}
    <ol class="guesses">
      {#each guesses as id, i}
        {@const g = id ? archiveById?.get(id) : null}
        {@const near = g && id !== entry.id ? nearMiss(g, film) : null}
        <li class:ok={id === entry.id} class:no={id !== entry.id}>
          <span class="n">{i + 1}</span>
          <span class="g">{id === 0 ? 'Skipped' : g ? g.title : 'A film'}{#if g?.year}<small>{g.year}</small>{/if}</span>
          {#if id === entry.id}<span class="tag ok">✓</span>{:else if near}<span class="tag near">{near}</span>{:else}<span class="tag">✗</span>{/if}
        </li>
      {/each}
    </ol>

    {#if !done}
      <TitleInput index={titleIndex} onpick={guess} placeholder="Type a title…" testid="daily-input" />
      <div class="row"><button class="btn" onclick={skip}>Skip to the next frame</button><span class="faint small">{DAILY_FRAMES - guesses.length} guesses left</span></div>
    {:else}
      <div class="result">
        <p class="eyebrow">{solved ? `Named on frame ${solved}` : 'Not named this time'}</p>
        <p class="film"><a href={href}>{film.title}</a> <span class="yr">{film.year ?? ''}</span></p>
        <p class="faint small">{film.directors.join(', ')} · Dr. X <b class="mono">{fmt1(film.my)}</b> · <a href={`${href}#stills`}>all {film.frames} stills</a></p>
        <pre class="share">{share}</pre>
        <div class="row">
          <button class="btn primary" onclick={copy}>{copied ? 'Copied' : 'Copy result'}</button>
          <span class="faint small">Next reel in <span class="mono">{countdown}</span></span>
        </div>
      </div>
    {/if}
    <button class="linkish back" onclick={() => onlobby?.()}>Back to the lobby</button>
  </div>
</div>

<style>
  .dr { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 1.6rem; align-items: start; max-width: min(100%, calc((100svh - var(--header-h) - 190px) * 2 + 400px)); margin: 0 auto; container-type: inline-size; }
  @media (max-width: 760px) { .dr { grid-template-columns: 1fr; } }
  .sign { display: flex; align-items: center; justify-content: center; gap: 0.7rem; margin-bottom: 0.6rem; font: 600 0.62rem var(--font-ui); letter-spacing: 0.28em; text-transform: uppercase; color: var(--accent); }
  .sign b { font: 700 0.85rem/1.6 var(--font-ui); letter-spacing: 0.14em; color: #141210; background: #f6f2e7; padding: 0 0.6em; border-radius: 2px; }
  :global(:root[data-theme='matrix']) .sign b { background: #010603; color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .sign .date { color: var(--ink-faint); letter-spacing: 0.1em; }
  .stage { aspect-ratio: 2 / 1; overflow: hidden; background: #0a0a0a; border-radius: 4px; box-shadow: 0 0 0 3px #0a0508; }
  .stage img { width: 100%; height: 100%; object-fit: cover; display: block; animation: fade 0.35s ease-out; }
  @keyframes fade { from { opacity: 0; } }
  .thumbs { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; margin-top: 8px; }
  .thumbs button { position: relative; aspect-ratio: 2 / 1; padding: 0; overflow: hidden; border: 1px solid var(--border-strong); border-radius: 3px; background: repeating-linear-gradient(135deg, var(--bg-raised) 0 6px, var(--bg-panel) 6px 12px); color: var(--ink-faint); font: 600 0.8rem var(--font-mono); cursor: pointer; }
  .thumbs button:disabled { cursor: default; }
  .thumbs img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .thumbs span { position: absolute; left: 4px; top: 2px; font-size: 0.66rem; color: #fff; text-shadow: 0 1px 2px #000; }
  .thumbs button:disabled span { position: static; color: var(--ink-faint); text-shadow: none; }
  .thumbs .cur { outline: 2px solid var(--accent); outline-offset: 1px; }
  .thumbs .miss img { filter: grayscale(0.7) brightness(0.6); }
  .thumbs .hit { box-shadow: 0 0 0 2px var(--accent); }
  .dr-side { display: flex; flex-direction: column; gap: 0.7rem; }
  .eyebrow { font: 600 0.64rem/1.3 var(--font-ui); letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-faint); margin: 0; }
  h2 { font-size: 1.5rem; margin: 0; }
  .small { font-size: 0.8rem; margin: 0; }
  .guesses { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.35rem; }
  .guesses li { display: grid; grid-template-columns: 1.2rem 1fr auto; gap: 0.5rem; align-items: center; padding: 0.4rem 0.6rem; border: 1px solid var(--border); border-radius: var(--radius); font-size: 0.88rem; }
  .guesses .n { font: 0.7rem var(--font-mono); color: var(--ink-faint); }
  .guesses .g { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .guesses small { font: 0.7rem var(--font-mono); color: var(--ink-faint); margin-left: 0.4em; }
  .guesses li.no .g { color: var(--ink-muted); text-decoration: line-through; text-decoration-color: var(--ink-faint); }
  .guesses li.ok { border-color: var(--accent); }
  .tag { font-size: 0.72rem; color: var(--ink-muted); }
  .tag.ok { color: var(--accent); font-weight: 700; }
  .tag.near { color: var(--accent); }
  .row { display: flex; gap: 0.8rem; align-items: center; flex-wrap: wrap; }
  .result { display: grid; gap: 0.4rem; padding: 0.8rem 0.9rem; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-panel); }
  .result .film { margin: 0; font: 500 1.25rem var(--font-display); }
  .result .film a { color: var(--ink); text-decoration: none; }
  .result .yr { font: 0.78rem var(--font-mono); color: var(--ink-faint); }
  .share { margin: 0.2rem 0; padding: 0.6rem 0.8rem; border: 1px dashed var(--border-strong); border-radius: var(--radius); font: 0.76rem/1.6 var(--font-mono); color: var(--ink-muted); white-space: pre-wrap; }
  .linkish { background: none; border: 0; padding: 0; color: var(--ink-muted); text-decoration: underline; text-underline-offset: 3px; font-size: 0.78rem; cursor: pointer; }
  .back { align-self: flex-start; }
</style>

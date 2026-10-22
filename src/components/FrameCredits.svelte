<script>
  // Name the Frame: the end of a run. Figures, every frame played as a
  // strip, the films that got away (with watchlist buttons), a plain share
  // text and, for pools anyone can rebuild, a challenge link with the same
  // frames.
  import { MODES, SHAREABLE_SOURCES, shareText, encodeChallenge } from '../lib/frame-game.js';
  import { stillUrl, withBase } from '../lib/util.js';
  import { movieSlug } from '../../shared/slug.mjs';
  import { inWatchlist, toggleWatchlist } from '../lib/watchlist.js';

  let { result, best = 0, newBest = false, incoming = null, onagain, onlobby } = $props();

  const mode = MODES[result.mode];
  const counts = result.mode === 'sprint' || result.mode === 'practice';
  const missed = result.log.filter((l) => l.phase === 'wrong' || l.phase === 'timeout');
  const marks = result.log.map((l) => (l.phase === 'right' ? '✓' : l.phase === 'skip' ? '·' : '✗')).join(' ');
  const pageUrl = typeof location !== 'undefined' ? `${location.origin}${withBase('/name-the-frame')}` : '';
  const shareable = !result.players && result.mode !== 'practice' && SHAREABLE_SOURCES.includes(result.opts.source);
  const challengeUrl = shareable ? `${pageUrl}#${encodeChallenge({ opts: result.opts, seed: result.seed, score: result.score, named: result.named })}` : null;
  const text = shareText({ mode: result.mode, score: result.score, named: result.named, total: result.total, marks, url: pageUrl.replace(/^https?:\/\//, '') });
  const ranking = result.players ? [...result.players].sort((a, b) => b.score - a.score) : null;
  const href = (l) => withBase(`/movie/${movieSlug(l.title, l.year, l.id)}`);

  let watch = $state(Object.fromEntries(missed.map((l) => [l.id, inWatchlist(l.id)])));
  let copied = $state('');
  async function copy(what, value) {
    try {
      await navigator.clipboard.writeText(value);
      copied = what;
    } catch {
      copied = 'failed';
    }
    setTimeout(() => (copied = ''), 2000);
  }
  const fmt = (n) => n.toLocaleString('en-US');
</script>

<div class="credits" data-testid="credits">
  <p class="eyebrow">Name the Frame · {mode.label} · {result.challenge ? 'challenge' : 'run over'}</p>
  <h2 class="cr-title">{typeof document !== 'undefined' && document.documentElement.dataset.theme === 'matrix' ? 'Wake up.' : 'The End'}</h2>

  {#if ranking}
    <ol class="ranking">
      {#each ranking as p, i}
        <li class:first={i === 0}><span class="pos">{i + 1}</span><span class="nm">{p.name}</span><span class="sc">{fmt(p.score)}</span></li>
      {/each}
    </ol>
  {:else}
    <div class="figs">
      <div><b data-testid="final-score">{fmt(result.score)}</b><span>{counts ? 'frames named' : 'points'}{newBest ? ' · new best' : ''}</span></div>
      <div><b>{result.named} / {result.total}</b><span>frames named</span></div>
      <div><b>{result.bestStreak}</b><span>longest streak</span></div>
      <div><b>{fmt(Math.max(best, result.score))}</b><span>your best</span></div>
    </div>
    {#if incoming}
      <p class="versus">
        {#if result.score > incoming.score}You beat the challenge: {fmt(result.score)} against {fmt(incoming.score)}.
        {:else if result.score === incoming.score}A tie: {fmt(result.score)} each.
        {:else}The challenge stands: {fmt(incoming.score)} against your {fmt(result.score)}.{/if}
      </p>
    {/if}
  {/if}

  {#if result.log.length}
    <div class="strip">
      {#each result.log as l}
        <figure class={l.phase}>
          <img src={stillUrl(l.id, l.n, 'thumb')} alt="" width="120" height="60" loading="lazy" />
          <figcaption title={l.title}>{l.title}</figcaption>
        </figure>
      {/each}
    </div>
  {/if}

  {#if missed.length}
    <h3 class="cr-h">The ones that got away</h3>
    <ul class="missed">
      {#each missed as l (l.id)}
        <li>
          <span><a href={href(l)}>{l.title}</a> <span class="yr">{l.year ?? ''}</span></span>
          <button class="linkish" onclick={() => (watch[l.id] = toggleWatchlist(l.id, l.title))}>{watch[l.id] ? '✓ On your watchlist' : '+ Watchlist'}</button>
          <a class="quiet" href={`${href(l)}#stills`}>Stills</a>
        </li>
      {/each}
    </ul>
  {/if}

  {#if !ranking}<pre class="share">{text}</pre>{/if}
  <div class="actions">
    <button class="btn primary" onclick={() => onagain?.()} data-testid="again">Play again</button>
    {#if !ranking}<button class="btn" onclick={() => copy('result', text)}>{copied === 'result' ? 'Copied' : 'Copy result'}</button>{/if}
    {#if challengeUrl}<button class="btn" onclick={() => copy('link', challengeUrl)} data-testid="challenge">{copied === 'link' ? 'Link copied' : 'Challenge link (same frames)'}</button>{/if}
    <button class="btn" onclick={() => onlobby?.()}>Back to the lobby</button>
  </div>
  {#if copied === 'failed'}<p class="faint small">Couldn't reach the clipboard; select the text above instead.</p>{/if}
</div>

<style>
  .credits { max-width: 860px; margin: 0 auto; text-align: center; container-type: inline-size; }
  .eyebrow { font: 600 0.66rem/1.3 var(--font-ui); letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-faint); margin: 0; }
  .cr-title { font: 400 clamp(2.4rem, 7cqi, 3.8rem)/1.1 'Limelight', var(--font-display); letter-spacing: 0.08em; margin: 0.2rem 0 1.4rem; }
  .figs { display: grid; grid-template-columns: repeat(4, 1fr); border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
  .figs div { padding: 0.9rem 0.5rem; display: flex; flex-direction: column; }
  .figs div + div { border-left: 1px solid var(--border); }
  .figs b { font: 600 1.6rem var(--font-mono); }
  .figs span { font-size: 0.75rem; color: var(--ink-muted); }
  @container (max-width: 520px) {
    .figs { grid-template-columns: 1fr 1fr; }
    .figs div:nth-child(3) { border-left: 0; }
    .figs div:nth-child(n + 3) { border-top: 1px solid var(--border); }
  }
  .versus { margin: 0.9rem 0 0; font: italic 1.1rem var(--font-display); }
  .ranking { list-style: none; margin: 0 auto; padding: 0; max-width: 420px; text-align: left; }
  .ranking li { display: grid; grid-template-columns: 2rem 1fr auto; gap: 0.6rem; align-items: baseline; padding: 0.5rem 0.2rem; border-bottom: 1px solid var(--border); }
  .ranking .pos { font: 600 0.9rem var(--font-mono); color: var(--ink-faint); }
  .ranking .nm { font: 500 1.2rem var(--font-display); }
  .ranking .sc { font: 600 1.1rem var(--font-mono); }
  .ranking .first .nm::after { content: ' · wins'; font: 0.8rem var(--font-ui); color: var(--accent); }
  /* Fixed cells: a long title is cut, not allowed to widen its frame. */
  .strip { display: grid; grid-template-columns: repeat(auto-fill, 120px); gap: 10px 6px; justify-content: center; padding: 1.2rem 0 0.6rem; }
  .strip figure { margin: 0; width: 120px; min-width: 0; position: relative; }
  .strip img { display: block; width: 120px; height: 60px; object-fit: cover; background: var(--bg-raised); }
  .strip figcaption { font-size: 0.68rem; color: var(--ink-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: left; }
  .strip figure::after { position: absolute; top: 4px; right: 4px; width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; font: 700 12px var(--font-ui); }
  .strip .right::after { content: '✓'; background: var(--accent); color: var(--bg); }
  .strip .skip::after { content: '·'; background: var(--bg); color: var(--ink-muted); }
  .strip .wrong img, .strip .timeout img { filter: grayscale(1) brightness(0.6); }
  .strip .wrong::after, .strip .timeout::after { content: '✗'; background: var(--bg); color: var(--ink-muted); }
  .cr-h { font-size: 1.2rem; margin: 1.4rem 0 0.4rem; }
  .missed { list-style: none; margin: 0 auto; padding: 0; max-width: 560px; text-align: left; }
  .missed li { display: flex; gap: 1rem; align-items: baseline; padding: 0.45rem 0; border-bottom: 1px dotted var(--border-strong); font-size: 0.85rem; }
  .missed li > span { flex: 1; font-family: var(--font-display); font-size: 1.05rem; }
  .missed li > span a { color: var(--ink); text-decoration: none; }
  .missed .yr { font: 0.74rem var(--font-mono); color: var(--ink-faint); }
  .quiet { color: var(--ink-muted); }
  .linkish { background: none; border: 0; padding: 0; color: var(--ink-muted); text-decoration: underline; text-underline-offset: 3px; font-size: inherit; cursor: pointer; }
  .share { display: inline-block; text-align: left; margin: 1.4rem auto 0.8rem; padding: 0.8rem 1.1rem; border: 1px dashed var(--border-strong); border-radius: var(--radius); font: 0.8rem/1.6 var(--font-mono); color: var(--ink-muted); white-space: pre-wrap; max-width: 100%; }
  .actions { display: flex; gap: 0.6rem; justify-content: center; flex-wrap: wrap; margin-top: 0.4rem; }
</style>

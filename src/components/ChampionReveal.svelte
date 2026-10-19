<script>
  // The end of a bracket: a soft spotlight (blurred glows only, no edges)
  // breathes over the champion's poster in a gallery mat; the title in gold
  // foil under a crowned ornament; a few gold motes drift up; then the road to
  // the title (whom it beat, round by round). Gold comes from the theme
  // accent. Reduced motion shows the end state.
  import { tmdbImg, withBase } from '../lib/util.js';

  let { film, path = [], label = 'Champion', children = null } = $props();

  // Motes, fixed per mount: position, drift, timing.
  const motes = Array.from({ length: 22 }, (_, i) => ({
    left: 18 + ((i * 37) % 64),
    drift: ((i * 53) % 60) - 30,
    dur: 7 + (i % 5) * 1.6,
    delay: 1.6 + (i % 11) * 0.55,
  }));
  const short = (name) => ({ Quarterfinals: 'QF', Semifinals: 'SF', Final: 'Final' })[name] ?? name.replace('Round of ', 'R');
  const ordinal = (n) => n + (n % 100 > 10 && n % 100 < 14 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] ?? 'th');
  const directors = $derived((film.directors ?? []).slice(0, 2).map((d) => (typeof d === 'string' ? d : d.name)).join(', '));
  const plate = $derived(
    [path.length ? `Knockout of ${2 ** path.length}` : null, `${path.length} ${path.length === 1 ? 'victory' : 'victories'}`, film.seed != null ? `seeded ${ordinal(film.seed)}` : null]
      .filter(Boolean)
  );
</script>

<div class="cr" data-testid="ko-champion" data-id={film.id}>
  <div class="cr-light" aria-hidden="true"><i class="wash"></i><i class="core"></i><i class="floor"></i></div>
  <div class="cr-motes" aria-hidden="true">
    {#each motes as m}<i style={`left:${m.left}%; --sx:${m.drift}px; animation-duration:${m.dur}s; animation-delay:${m.delay}s`}></i>{/each}
  </div>

  <div class="cr-eyebrow">{label}</div>
  <div class="cr-ornament" aria-hidden="true">
    <svg viewBox="0 0 28 20"><path d="M3 16 L1.5 5 L8 10 L14 2 L20 10 L26.5 5 L25 16 Z" /><path d="M3.5 18.5 H24.5" /></svg>
  </div>
  <h2 class="cr-title">{#if film.slug}<a href={withBase(`/movie/${film.slug}`)}>{film.title}</a>{:else}{film.title}{/if}</h2>
  <div class="cr-credit">{[film.year, directors].filter(Boolean).join(' · ')}</div>

  <div class="cr-mat">
    {#if film.poster}<img src={tmdbImg(film.poster, 'w500')} alt={`${film.title} poster`} width="500" height="750" />{:else}<span class="no-poster">{film.title}</span>{/if}
  </div>
  <div class="cr-plate">
    {#each plate as part, i}{#if i}{' · '}{/if}{#if i === 1}<b>{part}</b>{:else}{part}{/if}{/each}
  </div>

  {#if path.length}
    <div class="cr-road" style={`--n:${path.length}`}>
      {#each path as step, i}
        <div style={`--i:${i}`} class:final={i === path.length - 1}>
          <b>{short(step.round)}</b>
          {#if step.film.poster}<img src={tmdbImg(step.film.poster, 'w185')} alt="" width="185" height="278" loading="lazy" />{:else}<span class="cr-noimg"></span>{/if}
          <span>{step.film.title}</span>
        </div>
      {/each}
    </div>
  {/if}
  {@render children?.()}
</div>

<style>
  .cr { --gold: color-mix(in srgb, var(--accent) 62%, #fff); --gold-deep: color-mix(in srgb, var(--accent) 70%, #000); --slow: cubic-bezier(0.16, 1, 0.3, 1);
    position: relative; overflow: hidden; isolation: isolate; text-align: center; padding: 1.6rem 0.4rem 1rem; margin: -0.4rem -0.6rem 0; }

  /* The spotlight is only blurred radial glows: a wide wash, a warmer core
     and a pool under the poster. */
  .cr-light { position: absolute; inset: 0; z-index: -1; pointer-events: none; animation: cr-fade 1.8s ease-out both; }
  .cr-light i { position: absolute; left: 50%; border-radius: 50%; filter: blur(40px); }
  .cr-light .wash { top: -320px; width: 1100px; height: 1100px; margin-left: -550px; background: radial-gradient(closest-side, color-mix(in srgb, var(--accent) 20%, transparent), color-mix(in srgb, var(--accent) 7%, transparent) 55%, transparent);
    animation: cr-breathe 7s ease-in-out 1.8s infinite alternate; }
  .cr-light .core { top: 60px; width: 520px; height: 700px; margin-left: -260px; background: radial-gradient(closest-side, color-mix(in srgb, var(--gold) 18%, transparent), transparent); }
  .cr-light .floor { top: 690px; width: 560px; height: 120px; margin-left: -280px; filter: blur(22px); background: radial-gradient(closest-side, color-mix(in srgb, var(--accent) 26%, transparent), transparent); }
  @keyframes cr-breathe { from { opacity: 0.8; transform: scale(1); } to { opacity: 1; transform: scale(1.05); } }
  .cr-motes { position: absolute; inset: 0; z-index: -1; pointer-events: none; }
  .cr-motes i { position: absolute; bottom: 30%; width: 3px; height: 3px; border-radius: 50%; background: var(--gold); box-shadow: 0 0 6px var(--gold); opacity: 0; animation: cr-mote linear infinite; }
  @keyframes cr-mote { 0% { opacity: 0; transform: translate(0, 0); } 15% { opacity: 0.7; } 85% { opacity: 0.5; } 100% { opacity: 0; transform: translate(var(--sx), -520px); } }

  .cr-eyebrow { font: 600 0.78rem/1 var(--font-ui); letter-spacing: 0.5em; text-indent: 0.5em; text-transform: uppercase; color: var(--accent); animation: cr-fade 1.2s ease 0.4s both; }
  .cr-ornament { display: flex; align-items: center; justify-content: center; gap: 0.8rem; margin-top: 0.8rem; animation: cr-fade 1.2s ease 0.6s both; }
  .cr-ornament::before, .cr-ornament::after { content: ''; width: 76px; height: 1px; background: linear-gradient(to right, transparent, var(--accent)); }
  .cr-ornament::after { background: linear-gradient(to left, transparent, var(--accent)); }
  .cr-ornament svg { width: 22px; height: 16px; overflow: visible; }
  .cr-ornament path { fill: color-mix(in srgb, var(--accent) 22%, transparent); stroke: var(--accent); stroke-width: 1.2; stroke-linejoin: round; stroke-linecap: round; }

  .cr-title { font: italic 500 clamp(2.4rem, 5.6vw, 3.6rem)/1.05 var(--font-display); margin: 0.9rem 0 0.4rem; letter-spacing: 0.01em;
    background: linear-gradient(100deg, var(--gold-deep) 0%, var(--accent) 25%, var(--gold) 45%, var(--accent) 60%, var(--gold-deep) 100%); background-size: 250% 100%; background-position: 0 0;
    -webkit-background-clip: text; background-clip: text; color: transparent;
    animation: cr-settle 1.4s var(--slow) 0.7s both, cr-foil 2.6s ease-in-out 1.6s both; }
  .cr-title a { color: inherit; text-decoration: none; }
  @keyframes cr-settle { from { opacity: 0; letter-spacing: 0.12em; filter: blur(4px); } to { opacity: 1; letter-spacing: 0.01em; filter: none; } }
  @keyframes cr-foil { from { background-position: 100% 0; } to { background-position: 0 0; } }
  .cr-credit, .cr-plate { font-family: var(--font-display); font-variant: small-caps; letter-spacing: 0.08em; color: var(--ink-muted); }
  .cr-credit { font-size: 1.02rem; animation: cr-fade 1.2s ease 1s both; }

  /* The poster in a gallery mat: a hairline frame, a mat, an inner hairline. */
  .cr-mat { position: relative; width: 300px; margin: 2.2rem auto 0; padding: 16px; background: color-mix(in srgb, var(--bg-raised) 88%, var(--ink)); border: 1px solid color-mix(in srgb, var(--accent) 55%, transparent);
    box-shadow: 0 1px 0 color-mix(in srgb, var(--gold) 30%, transparent) inset, 0 40px 80px -20px rgb(0 0 0 / 0.65), 0 0 60px color-mix(in srgb, var(--accent) 12%, transparent);
    animation: cr-reveal 1.6s var(--slow) 0.3s both; }
  .cr-mat::after { content: ''; position: absolute; inset: 8px; border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent); pointer-events: none; }
  .cr-mat img, .cr-mat .no-poster { display: block; width: 100%; height: auto; aspect-ratio: 2 / 3; object-fit: cover; }
  .cr-mat .no-poster { display: flex; align-items: center; justify-content: center; padding: 1rem; font-family: var(--font-display); color: var(--ink-muted); background: var(--bg-raised); }
  @keyframes cr-reveal { from { opacity: 0; transform: translateY(26px) scale(0.97); filter: blur(8px) brightness(0.6); } to { opacity: 1; transform: none; filter: none; } }
  .cr-plate { margin-top: 1.6rem; font-size: 1.05rem; animation: cr-fade 1.2s ease 1.3s both; }
  .cr-plate b { color: var(--ink); font-weight: 500; }

  /* The road to the title: the beaten films' posters, the final one framed. */
  .cr-road { display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: 0.9rem; max-width: min(100%, calc(var(--n) * 108px)); margin: 2.2rem auto 1.4rem; }
  .cr-road div { min-width: 0; animation: cr-up 0.9s var(--slow) both; animation-delay: calc(1.6s + var(--i) * 0.12s); }
  .cr-road b { display: block; font: 600 0.58rem/1 var(--font-ui); letter-spacing: 0.24em; text-indent: 0.24em; text-transform: uppercase; color: var(--ink-faint); margin-bottom: 0.5rem; }
  .cr-road img, .cr-noimg { display: block; width: 100%; height: auto; aspect-ratio: 2 / 3; object-fit: cover; padding: 3px; background: var(--bg-raised);
    border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent); filter: grayscale(0.75) brightness(0.8); }
  .cr-road .final img, .cr-road .final .cr-noimg { border-color: var(--accent); filter: grayscale(0.4) brightness(0.9); }
  .cr-road span { display: block; margin-top: 0.4rem; font: italic 0.86rem/1.25 var(--font-display); color: var(--ink-muted); }

  @keyframes cr-up { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
  @keyframes cr-fade { from { opacity: 0; } to { opacity: 1; } }

  @media (prefers-reduced-motion: reduce) {
    .cr *, .cr *::after { animation: none !important; }
    .cr-motes { display: none; }
  }
  @media (max-width: 640px) {
    .cr { padding-top: 1rem; margin: -0.2rem -0.2rem 0; }
    .cr-mat { width: 230px; padding: 12px; }
    .cr-light .floor { top: 560px; }
    .cr-road { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.7rem; }
  }
</style>

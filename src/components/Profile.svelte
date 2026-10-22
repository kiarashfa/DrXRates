<script>
  // /user: the visitor's profile. A cover (the backdrop of their highest-rated
  // film behind their picture and name, their numbers as a credits line), one
  // card per page of theirs, then their save (CloudSave). With nothing saved
  // in this browser yet it welcomes them instead: start a profile, or bring a
  // save. Everything comes from this browser's stores; films' posters,
  // backdrops and directors from the small data shards.
  import { onMount } from 'svelte';
  import { fmtScore } from '../../shared/rating-meta.mjs';
  import { loadStore } from '../lib/visitor.js';
  import { listWatchlist } from '../lib/watchlist.js';
  import { knockoutStore } from '../lib/knockout-store.js';
  import { frameStore, dailyStreak } from '../lib/frame-store.js';
  import { loadProfile, updateProfile, onProfileChange, NAME_MAX } from '../lib/profile.js';
  import { ratingStats, peopleStats, memberSince, hasAnything } from '../lib/profile-stats.js';
  import { tasteMatch, MIN_SHARED, MIN_CORRELATION } from '../lib/taste.js';
  import { loadRatedFilms, loadPosters, loadBackdrops, loadFilms, loadArchive } from '../lib/archive.js';
  import { CHANGED_EVENT } from '../lib/store.js';
  import { withBase, tmdbImg, stillUrl } from '../lib/util.js';
  import Avatar from './Avatar.svelte';
  import CloudSave from './CloudSave.svelte';

  // A visitor with this many rated films or fewer gets them from the card
  // shards; past it the archive file is the smaller download.
  const SHARD_LIMIT = 30;

  let stores = $state.raw(read());
  function read() {
    return {
      ratings: loadStore().ratings,
      watchlist: listWatchlist(),
      knockout: knockoutStore(),
      frames: frameStore(),
      profile: loadProfile(),
    };
  }

  const profile = $derived(stores.profile);
  const rs = $derived(ratingStats(stores.ratings));
  const since = $derived(
    memberSince({ ...stores, watchlist: Object.fromEntries(stores.watchlist.map((w) => [w.id, w])) })
  );
  const any = $derived(hasAnything({ ...stores, watchlist: stores.watchlist.length ? { x: 1 } : {} }));
  const today = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const streak = $derived(dailyStreak(stores.frames.daily, today));
  const solved = $derived(Object.values(stores.frames.daily).filter((d) => d.solved).length);
  const history = $derived(stores.knockout.history);
  const cupsPlayed = $derived(Object.values(stores.knockout.cups).filter((c) => c.finishedAt).length);

  // Dr. X's films (Taste match) and the visitor's films (posters, directors).
  let drx = $state.raw(null);
  let films = $state.raw(new Map());
  let posters = $state.raw(new Map());
  let backdrop = $state(null);
  let backdropReady = $state(false);
  const tm = $derived(drx ? tasteMatch(stores.ratings, drx) : null);
  const people = $derived(rs.n ? peopleStats(rs.list, films) : { director: null, decade: null });
  const top = $derived(rs.top ? (films.get(rs.top.id) ?? null) : null);

  $effect(() => {
    loadRatedFilms()
      .then((list) => (drx = new Map(list.map((m) => [m.id, m]))))
      .catch(() => (drx = new Map()));
  });

  // Films for the rated list, posters for what the cards show.
  let filmsAsked = '';
  $effect(() => {
    const ids = rs.list.map((r) => r.id);
    const key = ids.join(',');
    if (!ids.length || key === filmsAsked) return;
    filmsAsked = key;
    const load = ids.length <= SHARD_LIMIT ? loadFilms(ids) : loadArchive().then((a) => a.byId);
    load.then((map) => (films = map)).catch(() => {});
  });
  $effect(() => {
    const ids = [...rs.list.slice(0, 5).map((r) => r.id), ...stores.watchlist.slice(0, 7).map((w) => w.id)];
    const missing = ids.filter((id) => !posters.has(id));
    if (!missing.length) return;
    loadPosters(missing)
      .then((found) => (posters = new Map([...posters, ...found])))
      .catch(() => {});
  });
  // The cover: the highest-rated film's backdrop, else the frame the picture
  // came from.
  $effect(() => {
    const id = rs.top?.id;
    const source = profile?.source;
    if (id) {
      loadBackdrops([id])
        .then((m) => (backdrop = tmdbImg(m.get(id), 'w1280')))
        .catch(() => {});
    } else backdrop = source?.kind === 'frame' ? stillUrl(source.film, source.frame) : null;
  });

  const poster = (id, size = 'w154') => tmdbImg(posters.get(id), size);
  const filmHref = (id) => (films.get(id)?.slug ? withBase(`/movie/${films.get(id).slug}`) : null);
  const monthYear = (iso) => new Date(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const count = (n, one, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

  // The name, edited in place.
  let editing = $state(false);
  let draft = $state('');
  let nameInput = $state(null);
  function editName() {
    draft = profile?.name ?? '';
    editing = true;
    requestAnimationFrame(() => nameInput?.select());
  }
  function saveName(e) {
    e?.preventDefault();
    if (!editing) return;
    editing = false;
    if (draft.trim() !== (profile?.name ?? '')) updateProfile({ name: draft });
  }
  function nameKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      editing = false;
    }
  }

  // The picture picker loads on first open.
  let Picker = $state(null);
  let picking = $state(false);
  async function openPicker() {
    Picker ??= (await import('./PicturePicker.svelte')).default;
    picking = true;
  }

  onMount(() => {
    let timer;
    const reread = () => {
      clearTimeout(timer);
      timer = setTimeout(() => (stores = read()), 50);
    };
    window.addEventListener(CHANGED_EVENT, reread);
    const off = onProfileChange(reread);
    const onStorage = (e) => (e.key == null || e.key.startsWith('cinema.')) && reread();
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(CHANGED_EVENT, reread);
      window.removeEventListener('storage', onStorage);
      off();
    };
  });

  const icon = (name) => withBase(`/icons.svg#i-${name}`);
</script>

{#snippet pencil(label, onclick)}
  <button type="button" class="pencil" aria-label={label} title={label} {onclick}>
    <svg class="icon" aria-hidden="true"><use href={icon('edit')} /></svg>
  </button>
{/snippet}

{#snippet picture(size)}
  <span class="pic">
    <Avatar {profile} {size} class="pic-av" />
    <button type="button" class="pic-edit" aria-label="Change your picture" title="Change your picture" onclick={openPicker} data-testid="edit-picture">
      <svg class="icon" aria-hidden="true"><use href={icon('edit')} /></svg>
    </button>
  </span>
{/snippet}

{#if !any}
  <section class="cover welcome" data-testid="profile-welcome">
    <div class="cover-in wrap">
      {@render picture(120)}
      <h1 class="name">Your corner of the ledger</h1>
      <p class="lede muted">
        No accounts and no passwords: your ratings, watchlist and game scores live in this browser. Give them a face and a name, or
        bring your save from another device.
      </p>
    </div>
  </section>
  <div class="wrap body">
    <div class="doors">
      <div class="panel door">
        <h2><svg class="icon" aria-hidden="true"><use href={icon('user')} /></svg>Start here</h2>
        <p class="small muted">Pick a picture from Dr. X's frames or upload your own, and choose a name. Both are optional.</p>
        <button type="button" class="btn primary" onclick={openPicker} data-testid="start-profile">Set up your profile</button>
      </div>
      <div class="panel door">
        <h2><svg class="icon" aria-hidden="true"><use href={icon('key')} /></svg>Bring your save</h2>
        <p class="small muted">Your save is your key. Open it from where you keep it; it merges with anything already in this browser.</p>
        <CloudSave variant="doors" />
      </div>
    </div>
  </div>
{:else}
  <section class="cover" data-testid="profile-cover">
    {#if backdrop}
      <img class="bd" class:ready={backdropReady} src={backdrop} alt="" width="1280" height="720" decoding="async" onload={() => (backdropReady = true)} />
    {/if}
    <div class="fade" aria-hidden="true"></div>
    <div class="cover-in wrap">
      {@render picture(140)}
      {#if editing}
        <form class="name-form" onsubmit={saveName}>
          <input
            class="name name-input"
            bind:this={nameInput}
            bind:value={draft}
            maxlength={NAME_MAX}
            placeholder="Your name"
            aria-label="Your name"
            autocomplete="nickname"
            onblur={saveName}
            onkeydown={nameKey}
            data-testid="name-input"
          />
        </form>
      {:else}
        <h1 class="name" data-testid="profile-name">
          {#if profile?.name}{profile.name}{:else}<span class="unnamed">Your profile</span>{/if}
          {@render pencil(profile?.name ? 'Edit your name' : 'Add your name', editName)}
        </h1>
      {/if}
      <p class="since">{since ? `Keeping the ledger since ${monthYear(since)}` : ' '}</p>
      <dl class="credits" data-testid="profile-credits">
        <div><dt>Rated</dt><dd>{rs.n.toLocaleString('en-US')}</dd></div>
        <div><dt>Average</dt><dd>{fmtScore(rs.avg)}</dd></div>
        <div><dt>To see</dt><dd>{stores.watchlist.length.toLocaleString('en-US')}</dd></div>
        <div><dt>Match</dt><dd>{fmtScore(tm?.correlation)}</dd></div>
        <div><dt>Brackets</dt><dd>{history.length}</dd></div>
        <div><dt>Day streak</dt><dd>{streak}</dd></div>
      </dl>
      <p class="behind">
        {#if rs.top && top}
          Behind you: {#if filmHref(rs.top.id)}<a href={filmHref(rs.top.id)}>{top.title}</a>{:else}{top.title}{/if}{top.year ? ` (${top.year})` : ''}, your highest score
        {:else if !rs.top && profile?.source?.kind === 'frame'}
          Behind you: the frame your picture comes from
        {:else}&nbsp;{/if}
      </p>
    </div>
  </section>

  <div class="wrap body">
    <div class="rooms">
      <article class="panel room">
        <div class="room-h">
          <svg class="icon" aria-hidden="true"><use href={icon('star')} /></svg>
          <h2><a class="room-link" href={withBase('/your-ratings')}>Your ratings</a></h2>
          <span class="go">{rs.n ? `All ${rs.n} →` : 'Open →'}</span>
        </div>
        {#if rs.n}
          <div class="posters">
            {#each rs.list.slice(0, 5) as r (r.id)}
              <span class="poster">
                {#if poster(r.id)}<img src={poster(r.id)} alt="" width="54" height="81" loading="lazy" decoding="async" />{/if}
                <span class="tag">{fmtScore(r.totals.overall)}</span>
              </span>
            {/each}
          </div>
          <div>
            <div class="cf" aria-hidden="true"><i style={`width:${(rs.avgC / (rs.avgC + rs.avgF || 1)) * 100}%`}></i></div>
            <div class="cf-l small"><span class="c">Content {fmtScore(rs.avgC)}</span><span class="f">Form {fmtScore(rs.avgF)}</span></div>
          </div>
          <p class="foot">Your highest: {rs.top.title ?? films.get(rs.top.id)?.title ?? '–'} ({fmtScore(rs.top.totals.overall)})</p>
        {:else}
          <p class="small muted">Rate any film with the same ten parts as Dr. X: open a film and use "Rate it yourself".</p>
        {/if}
      </article>

      <article class="panel room">
        <div class="room-h">
          <svg class="icon" aria-hidden="true"><use href={icon('bookmark')} /></svg>
          <h2><a class="room-link" href={withBase('/watchlist')}>Watchlist</a></h2>
          <span class="go">{stores.watchlist.length ? `${count(stores.watchlist.length, 'film')} →` : 'Open →'}</span>
        </div>
        {#if stores.watchlist.length}
          <div class="stack">
            {#each stores.watchlist.slice(0, 7) as w (w.id)}
              <span class="poster">{#if poster(w.id)}<img src={poster(w.id)} alt="" width="46" height="69" loading="lazy" decoding="async" />{/if}</span>
            {/each}
          </div>
          <p class="foot">
            Added lately: {stores.watchlist.slice(0, 2).map((w) => w.title).filter(Boolean).join(', ') || '–'}.
            <a class="sub" href={withBase('/tonight?src=watchlist')}>Pick one for tonight</a>
          </p>
        {:else}
          <p class="small muted">Bookmark films on any card or film page and they gather here.</p>
        {/if}
      </article>

      <article class="panel room">
        <div class="room-h">
          <svg class="icon" aria-hidden="true"><use href={icon('match')} /></svg>
          <h2><a class="room-link" href={withBase('/your-ratings#taste-match')}>Taste match</a></h2>
          <span class="go">Open →</span>
        </div>
        {#if !tm}
          <p class="small muted">&nbsp;</p>
        {:else if !tm.ready}
          <p class="small muted">Rate {MIN_SHARED} of Dr. X's films to compare your taste with Dr. X's ({tm.n} so far).</p>
        {:else}
          <p class="big-n">
            {#if tm.correlation == null}
              <b>{tm.withinOne}</b> <span class="small muted">of {tm.n} shared films within a point of Dr. X</span>
            {:else}
              <b>{fmtScore(tm.correlation)}</b> <span class="small muted">across {tm.n} shared films</span>
            {/if}
          </p>
          {#if tm.correlation != null}
            <div class="gauge" aria-hidden="true"><b style={`left:${(tm.correlation + 1) * 50}%`}></b></div>
            <div class="gauge-l"><span>opposite</span><span>unrelated</span><span>same taste</span></div>
          {/if}
          <p class="foot">
            {tm.meanDiff === 0 ? 'You and Dr. X score the same on average.' : `You score ${fmtScore(Math.abs(tm.meanDiff))} ${tm.meanDiff > 0 ? 'higher' : 'lower'} than Dr. X on average.`}
            {tm.correlation == null ? ` The correlation shows from ${MIN_CORRELATION} films.` : ''}
          </p>
        {/if}
      </article>

      <article class="panel room">
        <div class="room-h">
          <svg class="icon" aria-hidden="true"><use href={icon('trophy')} /></svg>
          <h2><a class="room-link" href={withBase('/knockout')}>Knockout</a></h2>
          <span class="go">Play →</span>
        </div>
        {#if history.length}
          {@const last = history[0]}
          <div class="champ">
            <span class="poster">{#if last.champion.poster}<img src={tmdbImg(last.champion.poster, 'w154')} alt="" width="54" height="81" loading="lazy" decoding="async" />{/if}</span>
            <span><span class="eyebrow">Last champion</span><span class="champ-t">{last.champion.title}</span><span class="small faint">{last.label ?? `${last.size} films`}</span></span>
          </div>
          <p class="foot">{count(history.length, 'bracket')} finished{cupsPlayed ? ` · ${count(cupsPlayed, "of Dr. X's Cups", "of Dr. X's Cups")} played` : ''}</p>
        {:else}
          <p class="small muted">Head-to-head brackets of up to 256 films, and Dr. X's Cup to play against his picks.</p>
          {#if stores.knockout.current}<p class="foot">A bracket is waiting where you left it.</p>{/if}
        {/if}
      </article>

      <article class="panel room">
        <div class="room-h">
          <svg class="icon" aria-hidden="true"><use href={icon('stills')} /></svg>
          <h2><a class="room-link" href={withBase('/name-the-frame')}>Name the Frame</a></h2>
          <span class="go">Play →</span>
        </div>
        <div class="lrows">
          <div class="lrow"><span class="k">Survival best</span><span class="dots"></span><span class="v">{stores.frames.best.survival?.toLocaleString('en-US') ?? '–'}</span></div>
          <div class="lrow"><span class="k">Sprint best</span><span class="dots"></span><span class="v">{stores.frames.best.sprint != null ? count(stores.frames.best.sprint, 'frame') : '–'}</span></div>
          <div class="lrow"><span class="k">Daily Reel</span><span class="dots"></span><span class="v">{solved ? `${solved} solved · streak ${streak}` : '–'}</span></div>
        </div>
      </article>

      <article class="panel room">
        <div class="room-h">
          <svg class="icon" aria-hidden="true"><use href={icon('net')} /></svg>
          <h2>
            <a class="room-link" href={withBase(people.director ? `/net?focus=p${people.director.id}` : '/net')}>Your people</a>
          </h2>
          <span class="go">In Dr. X Net →</span>
        </div>
        {#if people.director || people.decade}
          <div class="lrows">
            <div class="lrow"><span class="k">Most rated director</span><span class="dots"></span><span class="v">{people.director ? `${people.director.name} · ${people.director.n}` : '–'}</span></div>
            <div class="lrow"><span class="k">Most rated decade</span><span class="dots"></span><span class="v">{people.decade ? `${people.decade.name} · ${people.decade.n}` : '–'}</span></div>
            <div class="lrow"><span class="k">Your average there</span><span class="dots"></span><span class="v">{people.decade ? fmtScore(people.decade.avg) : '–'}</span></div>
          </div>
        {:else}
          <p class="small muted">Rate a few films and the director and the decade you keep coming back to show here.</p>
        {/if}
      </article>
    </div>

    <CloudSave />
  </div>
{/if}

{#if picking && Picker}
  <Picker {profile} onclose={() => (picking = false)} />
{/if}

<style>
  .cover { position: relative; overflow: hidden; min-height: 470px; padding: 3rem 0 1.8rem; background: var(--hero-bg); color: var(--hero-ink, var(--ink)); text-align: center; }
  .cover.welcome { min-height: 0; padding-bottom: 0.4rem; background: transparent; }
  .bd { position: absolute; inset: -12px; width: calc(100% + 24px); height: calc(100% + 24px); object-fit: cover; object-position: center 30%; opacity: 0; filter: blur(2px) saturate(0.85); transition: opacity 0.6s ease; }
  .bd.ready { opacity: 0.32; }
  :global(:root[data-theme='light']) .bd.ready { opacity: 0.22; }
  .fade { position: absolute; inset: 0; background: radial-gradient(70% 90% at 50% 35%, transparent, var(--hero-bg) 85%), linear-gradient(transparent 55%, var(--hero-bg)); }
  .cover-in { position: relative; display: flex; flex-direction: column; align-items: center; }
  .pic { position: relative; display: inline-block; }
  .pic :global(.pic-av) { box-shadow: 0 0 0 3px var(--hero-bg), 0 0 0 4px var(--accent), 0 14px 34px -12px rgb(0 0 0 / 0.6); }
  .welcome .pic :global(.pic-av) { box-shadow: 0 0 0 3px var(--bg), 0 0 0 4px var(--accent); }
  :global(:root[data-theme='matrix']) .pic :global(.pic-av) { box-shadow: 0 0 0 3px var(--hero-bg), 0 0 0 4px var(--accent), 0 0 22px rgb(58 255 143 / 0.35); }
  .pic-edit, .pencil { display: grid; place-items: center; padding: 0; color: var(--ink); }
  .pic-edit { position: absolute; right: 2px; bottom: 2px; width: 34px; height: 34px; border: 1px solid var(--border-strong); border-radius: 50%; background: var(--bg-raised); }
  .pic-edit:hover, .pencil:hover { color: var(--accent); border-color: var(--accent); }
  .pic-edit .icon { width: 15px; height: 15px; }
  .name { display: flex; align-items: center; justify-content: center; gap: 0.5rem; max-width: 100%; margin: 1.1rem 0 0; font: italic 560 clamp(2.1rem, 5vw, 3rem) / 1.1 var(--font-display); overflow-wrap: anywhere; }
  :global(:root[data-theme='matrix']) .name { font-style: normal; font-size: clamp(1.7rem, 4vw, 2.4rem); }
  .welcome .name { font-style: normal; }
  .unnamed { color: var(--hero-ink-muted, var(--ink-muted)); }
  .pencil { width: 30px; height: 30px; flex: none; border: 0; border-radius: 50%; background: none; color: var(--ink-faint); }
  .pencil .icon { width: 17px; height: 17px; }
  .name-form { margin: 1.1rem 0 0; width: min(34rem, 100%); }
  .name-input { width: 100%; margin: 0; padding: 0 0.3em; border: 0; border-bottom: 1px solid var(--accent); background: transparent; color: inherit; text-align: center; outline: none; }
  .since { min-height: 1.4em; margin: 0.35rem 0 0; color: var(--hero-ink-muted, var(--ink-muted)); font-size: 0.86rem; }
  .lede { max-width: 38rem; margin: 0.8rem auto 0; }
  .credits { display: flex; flex-wrap: wrap; justify-content: center; margin: 1.6rem 0 0; }
  .credits div { display: flex; flex-direction: column-reverse; padding: 0 1.4rem; border-left: 1px solid var(--border-strong); }
  .credits div:first-child { border-left: 0; }
  .credits dd { margin: 0; font: 560 1.8rem / 1.15 var(--font-numeral); }
  :global(:root[data-theme='matrix']) .credits dd { font-size: 1.45rem; }
  .credits dt { color: var(--ink-faint); font-size: 0.64rem; letter-spacing: 0.16em; text-transform: uppercase; }
  .behind { min-height: 1.3em; margin: 1.4rem 0 0; color: var(--ink-faint); font-size: 0.74rem; }
  .behind a { color: var(--hero-ink-muted, var(--ink-muted)); }
  .behind a:hover { color: var(--accent); }

  .body { display: flex; flex-direction: column; gap: 1.6rem; padding-top: 1.6rem; }
  .rooms { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1.2rem; }
  .room { position: relative; display: flex; flex-direction: column; gap: 0.85rem; transition: border-color 0.15s ease; }
  .room:hover, .room:focus-within { border-color: var(--accent); }
  .room-h { display: flex; align-items: center; gap: 0.6rem; }
  .room-h .icon { color: var(--accent); }
  .room-h h2 { margin: 0; font-size: 1.3rem; }
  .room-link { text-decoration: none; }
  .room-link::after { content: ''; position: absolute; inset: 0; border-radius: inherit; }
  .room-link:focus-visible { outline: none; }
  .room:has(.room-link:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }
  .go { margin-left: auto; color: var(--accent); font-size: 0.82rem; white-space: nowrap; }
  .sub { position: relative; z-index: 1; color: var(--accent); }
  .foot { margin: auto 0 0; color: var(--ink-muted); font-size: 0.8rem; }
  .posters { display: flex; gap: 0.5rem; }
  .poster { position: relative; display: block; width: 54px; aspect-ratio: 2 / 3; flex: none; overflow: hidden; border: 1px solid var(--border); border-radius: 3px; background: var(--bg-raised); }
  .poster img { width: 100%; height: 100%; object-fit: cover; }
  .tag { position: absolute; top: 3px; right: 3px; padding: 0 0.3em; border-radius: 2px; background: rgb(8 8 8 / 0.78); color: #f3d99a; font: 600 0.62rem var(--font-mono); }
  :global(:root[data-theme='matrix']) .tag { color: var(--accent); }
  .stack { display: flex; }
  .stack .poster { width: 46px; border-color: var(--bg-panel); box-shadow: 0 2px 6px rgb(0 0 0 / 0.35); }
  .stack .poster + .poster { margin-left: -18px; }
  .cf { display: flex; height: 6px; overflow: hidden; border-radius: 3px; background: var(--form-c); }
  .cf i { display: block; background: var(--content-c); }
  .cf-l, .gauge-l { display: flex; justify-content: space-between; margin-top: 0.35rem; }
  .cf-l .c { color: var(--content-c); }
  .cf-l .f { color: var(--form-c); }
  .big-n { margin: 0; }
  .big-n b { font: 560 2.4rem / 1 var(--font-numeral); }
  :global(:root[data-theme='matrix']) .big-n b { font-size: 2rem; }
  .gauge { position: relative; height: 8px; border-radius: 4px; background: linear-gradient(90deg, var(--form-c), var(--border-strong) 50%, var(--content-c)); }
  .gauge b { position: absolute; top: -5px; width: 3px; height: 18px; border-radius: 2px; background: var(--ink); transform: translateX(-50%); }
  .gauge-l { color: var(--ink-faint); font-size: 0.68rem; }
  .champ { display: flex; align-items: center; gap: 0.9rem; }
  .champ > span:last-child { display: flex; flex-direction: column; min-width: 0; }
  .champ-t { font: 1.15rem / 1.2 var(--font-display); }
  .eyebrow { color: var(--ink-faint); font-size: 0.64rem; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; }
  .lrows { display: grid; gap: 0.15rem; }
  .lrow { display: flex; align-items: baseline; gap: 0.4rem; font-size: 0.9rem; }
  .lrow .k { color: var(--ink-muted); white-space: nowrap; }
  .lrow .dots { flex: 1; min-width: 1rem; border-bottom: 1px dotted var(--border-strong); transform: translateY(-4px); }
  .lrow .v { font-family: var(--font-mono); font-size: 0.84rem; text-align: right; }

  .doors { display: grid; grid-template-columns: 1fr 1fr; gap: 1.2rem; max-width: 760px; width: 100%; margin: 0 auto; }
  .door { display: flex; flex-direction: column; gap: 0.7rem; }
  .door h2 { display: flex; align-items: center; gap: 0.5rem; margin: 0; font-size: 1.35rem; }
  .door h2 .icon { color: var(--accent); }
  .door p { margin: 0; }
  .door > .btn { justify-content: center; margin-top: auto; }

  @media (max-width: 980px) {
    .rooms { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (max-width: 640px) {
    .cover { min-height: 520px; padding-top: 2rem; }
    .credits { display: grid; grid-template-columns: repeat(3, 1fr); row-gap: 1rem; }
    .credits div { padding: 0 0.6rem; }
    .credits div:nth-child(4) { border-left: 0; }
    .credits dd { font-size: 1.5rem; }
    .rooms, .doors { grid-template-columns: 1fr; }
  }
</style>

<script>
  // Two films side by side, from /compare?a=<id>&b=<id>. Film A is drawn
  // solid and film B dashed throughout (badges, bars, pentagons), so blue and
  // red stay reserved for content and form.
  import { computeTotals, fmtScore } from '../../shared/rating-meta.mjs';
  import { tmdbImg, withBase, fmtRuntime } from '../lib/util.js';
  import { loadArchive, loadPosters, loadCredits, loadPeople, loadFilms } from '../lib/archive.js';
  import { buildIndex, search } from '../lib/search.js';
  import { getRating } from '../lib/visitor.js';
  import Pentagons from './charts/Pentagons.svelte';

  const params = new URLSearchParams(location.search);
  const idParam = (k) => (/^\d+$/.test(params.get(k) ?? '') ? Number(params.get(k)) : null);

  let ids = $state({ a: idParam('a'), b: idParam('b') });
  let archive = $state.raw(null); // raw: the whole archive, no deep proxies
  let loadError = $state('');
  let posters = $state(new Map());
  let editing = $state(null); // 'a' | 'b' while its picker is open
  let query = $state('');
  let mode = $state('drx'); // pentagons: Dr. X's scores or the visitor's
  let shared = $state(null); // [{ id, name, profile, roles: { a: [codes], b: [codes] } }]
  let roleNames = $state({});

  let index = null;

  // The two films come from the small card shards; the whole archive (for
  // the picker's search and suggestions) loads only once a picker opens.
  let films = $state.raw(new Map()); // id → film object, or null if unknown
  $effect(() => {
    const missing = [ids.a, ids.b].filter((id) => id != null && !films.has(id));
    if (!missing.length) return;
    loadFilms(missing)
      .then((m) => (films = new Map([...films, ...m])))
      .catch((err) => (loadError = err.message));
  });
  const known = (key) => ids[key] == null || films.has(ids[key]);
  const film = (key) => (ids[key] != null ? (films.get(ids[key]) ?? null) : null);
  const settled = $derived(known('a') && known('b'));
  const A = $derived(film('a'));
  const B = $derived(film('b'));
  const open = $derived(editing ?? (settled && !A ? 'a' : settled && !B ? 'b' : null));

  $effect(() => {
    if (!open || archive) return;
    loadArchive({ scores: true, rated: true, originalTitles: true })
      .then((a) => (archive = a))
      .catch((err) => (loadError = err.message));
  });

  function needPosters(list) {
    const missing = list.filter((id) => id != null && !posters.has(id));
    if (missing.length) loadPosters(missing).then((m) => (posters = new Map([...posters, ...m]))).catch(() => {});
  }

  // Keep the address shareable without adding history entries.
  $effect(() => {
    const url = new URL(location.href);
    for (const k of ['a', 'b']) ids[k] != null ? url.searchParams.set(k, ids[k]) : url.searchParams.delete(k);
    history.replaceState(null, '', url);
  });

  // People in both films, with their roles in each.
  $effect(() => {
    const a = ids.a;
    const b = ids.b;
    shared = null;
    if (a == null || b == null || a === b) return;
    loadCredits([a, b])
      .then(async ({ roles, byId }) => {
        roleNames = roles;
        const rolesOf = (credits) => {
          const map = new Map();
          for (const [code, people] of Object.entries(credits ?? {})) for (const p of people) map.set(p, [...(map.get(p) ?? []), code]);
          return map;
        };
        const ra = rolesOf(byId.get(a));
        const rb = rolesOf(byId.get(b));
        const both = [...ra.keys()].filter((p) => rb.has(p));
        const people = await loadPeople(both);
        if (ids.a !== a || ids.b !== b) return;
        const order = Object.keys(roles);
        const rank = (p) => Math.min(...[...ra.get(p), ...rb.get(p)].map((c) => order.indexOf(c)));
        shared = both
          .map((p) => ({ id: p, name: people.get(p)?.name ?? '', profile: people.get(p)?.profile ?? null, roles: { a: ra.get(p), b: rb.get(p) } }))
          .sort((x, y) => rank(x.id) - rank(y.id));
      })
      .catch(() => (shared = []));
  });

  const results = $derived.by(() => {
    if (!archive || !open) return [];
    if (!index) index = buildIndex(archive.list, null, []);
    const other = open === 'a' ? ids.b : ids.a;
    return (search(index, query, { films: 8, directors: 0, places: 0 })?.films ?? []).filter((f) => f.id !== other);
  });

  // Suggestions while the query is empty: other films by the set film's director.
  const suggestions = $derived.by(() => {
    if (!archive || !open) return null;
    const base = open === 'a' ? B : A;
    const director = base?.directors[0];
    if (!director) return null;
    const list = archive.list
      .filter((m) => m.id !== base.id && m.directors.some((d) => d.id === director.id))
      .sort((x, y) => (y.my ?? -1) - (x.my ?? -1) || (y.pop ?? 0) - (x.pop ?? 0))
      .slice(0, 6);
    return list.length ? { label: `Also by ${director.name}`, films: list } : null;
  });

  $effect(() => needPosters([...results, ...(suggestions?.films ?? [])].map((f) => f.id)));

  function choose(f) {
    films = new Map(films).set(f.id, f);
    ids = { ...ids, [open]: f.id };
    editing = null;
    query = '';
  }
  function edit(key) {
    editing = key;
    query = '';
  }
  function swap() {
    ids = { a: ids.b, b: ids.a };
  }

  // Visitor's scores for a film, or null.
  const visitorScores = (f) => (f ? (getRating(f.id)?.scores ?? null) : null);
  const visitorTotal = (f) => {
    const s = visitorScores(f);
    return s ? (computeTotals(s)?.overall ?? null) : null;
  };

  const both = $derived(A && B);
  const yours = $derived(both ? { a: visitorTotal(A), b: visitorTotal(B) } : { a: null, b: null });

  // Numeric rows of the tape: [label, a, b, max, { cls, unit, judge }].
  const rows = $derived.by(() => {
    if (!both) return [];
    const list = [
      ['Dr. X', A.my, B.my, 10],
      ['Content', A.myRating?.contentAvg, B.myRating?.contentAvg, 5, { cls: 'c' }],
      ['Form', A.myRating?.formAvg, B.myRating?.formAvg, 5, { cls: 'f' }],
    ];
    if (yours.a != null || yours.b != null) list.push(['Your score', yours.a, yours.b, 10]);
    list.push(
      ['IMDb', A.imdb, B.imdb, 10],
      ['TMDB', A.tmdb, B.tmdb, 10],
      ['Rotten Tomatoes', A.rt, B.rt, 100, { unit: '%' }],
      ['Metacritic', A.metacritic, B.metacritic, 100],
      ['Length', A.runtime, B.runtime, Math.max(A.runtime ?? 0, B.runtime ?? 0, 1), { fmt: fmtRuntime, judge: false }]
    );
    return list.map(([label, a, b, max, o = {}]) => {
      const judge = o.judge !== false && a != null && b != null && a !== b;
      const show = (v) => (v == null ? '–' : o.fmt ? o.fmt(v) : `${fmtScore(v)}${o.unit ?? ''}`);
      return { label, cls: o.cls ?? '', a: show(a), b: show(b), wa: a == null ? 0 : (a / max) * 100, wb: b == null ? 0 : (b / max) * 100, winA: judge && a > b, winB: judge && b > a };
    });
  });

  const textRows = $derived(
    both
      ? [
          ['Year', A.year ?? '–', B.year ?? '–'],
          ['Genres', A.genres.join(', ') || '–', B.genres.join(', ') || '–'],
          ['Directed by', A.directors.map((d) => d.name).join(', ') || '–', B.directors.map((d) => d.name).join(', ') || '–'],
        ]
      : []
  );

  const pent = $derived.by(() => {
    if (!both) return null;
    const a = mode === 'drx' ? (A.myRating?.scores ?? null) : visitorScores(A);
    const b = mode === 'drx' ? (B.myRating?.scores ?? null) : visitorScores(B);
    return { a, b };
  });
  const canYou = $derived(both && (visitorScores(A) || visitorScores(B)));

  const roleText = (codes) => codes.map((c) => roleNames[c] ?? c).join(', ');
  const initials = (name) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('');
  const directorNames = (f) => f.directors.slice(0, 2).map((d) => d.name).join(', ');
  const icon = (name) => `${withBase('/icons.svg')}#i-${name}`;
</script>

{#snippet filmSlot(key, f)}
  <div class="cp-film" class:r={key === 'b'} data-testid={`compare-${key}`}>
    <a class="cp-poster" href={withBase(`/movie/${f.slug}`)} tabindex="-1" aria-hidden="true">
      {#if f.poster ?? posters.get(f.id)}<img src={tmdbImg(f.poster ?? posters.get(f.id), 'w342')} alt="" width="342" height="513" />{:else}<span class="no-poster">{f.title}</span>{/if}
    </a>
    <div class="cp-id">
      <span class="ab" class:b={key === 'b'}>{key.toUpperCase()}</span>
      <h2><a href={withBase(`/movie/${f.slug}`)}>{f.title}</a></h2>
      <div class="cp-sub">{[f.year, directorNames(f), fmtRuntime(f.runtime)].filter(Boolean).join(' · ')}</div>
      <button class="cp-change" onclick={() => edit(key)} data-testid={`change-${key}`}>Change</button>
    </div>
  </div>
{/snippet}

{#snippet picker(key)}
  <div class="cp-pick" data-testid="compare-picker">
    <div class="cp-pick-h">
      <span class="ab" class:b={key === 'b'}>{key.toUpperCase()}</span>
      <span class="small muted">{key === 'a' ? 'Pick the first film' : 'Pick a film to compare'}</span>
      {#if editing && film(key)}<button class="cp-change" onclick={() => (editing = null)}>Cancel</button>{/if}
    </div>
    <!-- svelte-ignore a11y_autofocus -->
    {#if !archive}<p class="small faint">Loading the archive…</p>{/if}
    <input type="search" placeholder="Search films by title or year" bind:value={query} autofocus aria-label="Search films" data-testid="compare-search" />
    {#if query.trim().length >= 2}
      <div class="cp-res">
        {#each results as f (f.id)}
          <button onclick={() => choose(f)} data-testid="compare-result">
            {#if posters.get(f.id)}<img src={tmdbImg(posters.get(f.id), 'w92')} alt="" width="34" height="51" />{:else}<span class="cp-thumb"></span>{/if}
            <span class="cp-rt"><b>{f.title}</b><span>{[f.year, directorNames(f)].filter(Boolean).join(' · ')}</span></span>
            <span class="cp-m">{f.my != null ? fmtScore(f.my) : ''}</span>
          </button>
        {:else}
          <p class="small faint">No film matches.</p>
        {/each}
      </div>
    {:else if suggestions}
      <span class="cp-kicker">{suggestions.label}</span>
      <div class="cp-res">
        {#each suggestions.films as f (f.id)}
          <button onclick={() => choose(f)} data-testid="compare-suggestion">
            {#if posters.get(f.id)}<img src={tmdbImg(posters.get(f.id), 'w92')} alt="" width="34" height="51" />{:else}<span class="cp-thumb"></span>{/if}
            <span class="cp-rt"><b>{f.title}</b><span>{f.year ?? ''}</span></span>
            <span class="cp-m">{f.my != null ? fmtScore(f.my) : ''}</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>
{/snippet}

<div class="cp" data-testid="compare">
  {#if loadError}
    <p class="muted">{loadError}</p>
  {:else if !settled}
    <div class="cp-wait" aria-hidden="true"></div>
  {:else}
    <div class="cp-top">
      {#if open === 'a'}{@render picker('a')}{:else if A}{@render filmSlot('a', A)}{/if}
      <button class="cp-swap" onclick={swap} title="Swap A and B" aria-label="Swap A and B" disabled={!A && !B} data-testid="compare-swap">
        <svg class="icon" aria-hidden="true"><use href={icon('swap')}></use></svg>
      </button>
      {#if open === 'b'}{@render picker('b')}{:else if B}{@render filmSlot('b', B)}{/if}
    </div>

    {#if both}
      <div class="cp-tape" data-testid="compare-tape">
        <div class="cp-row cp-head" aria-hidden="true"><span class="cp-side a"><span class="ab">A</span></span><span class="cp-lab"></span><span class="cp-side b"><span class="ab b">B</span></span></div>
        {#each rows as r}
          <div class={`cp-row ${r.cls}`}>
            <span class="cp-side a" class:win={r.winA}><span class="v">{r.a}</span><span class="bar" style={`width:${r.wa * 0.7}%`}></span></span>
            <span class="cp-lab">{r.label}</span>
            <span class="cp-side b" class:win={r.winB}><span class="v">{r.b}</span><span class="bar" style={`width:${r.wb * 0.7}%`}></span></span>
          </div>
        {/each}
        {#each textRows as [label, a, b]}
          <div class="cp-row txt">
            <span class="cp-side a">{a}</span><span class="cp-lab">{label}</span><span class="cp-side b">{b}</span>
          </div>
        {/each}
      </div>

      <div class="panel-stack cp-panels">
        <div class="panel">
          <div class="cp-pent-h">
            <h3>Ten criteria</h3>
            <div class="cp-legend">
              <span><i></i>A · {A.title}</span><span><i class="d"></i>B · {B.title}</span>
              {#if canYou}
                <div class="seg" role="group" aria-label="Whose scores">
                  <button class:active={mode === 'drx'} aria-pressed={mode === 'drx'} onclick={() => (mode = 'drx')}>Dr. X</button>
                  <button class:active={mode === 'you'} aria-pressed={mode === 'you'} onclick={() => (mode = 'you')}>You</button>
                </div>
              {/if}
            </div>
          </div>
          {#if pent.a && pent.b}
            <div class="cp-chart"><Pentagons mine={pent.a} visitor={pent.b} pair={{ a: 'A', b: 'B' }} legend={null} /></div>
          {:else if pent.a || pent.b}
            <div class="cp-chart"><Pentagons mine={pent.a ?? pent.b} /></div>
            <p class="small faint cp-note">
              Only {(pent.a ? A : B).title} has {mode === 'drx' ? "Dr. X's" : 'your'} ten scores{mode === 'you' ? '; rate the other on its film page to overlay them' : ''}.
            </p>
          {:else}
            <p class="muted small cp-note" data-testid="compare-no-criteria">
              {mode === 'drx' ? "Dr. X hasn't rated either film yet." : "You haven't rated either film yet."}
            </p>
          {/if}
        </div>

        <div class="panel" data-testid="compare-shared">
          <h3>In both films {#if shared}<span class="small faint cp-count">{shared.length} {shared.length === 1 ? 'person' : 'people'}</span>{/if}</h3>
          {#if shared == null}
            <p class="small faint">Looking for shared cast and crew…</p>
          {:else if shared.length === 0}
            <p class="small muted">No one in the top-billed cast or the key crew worked on both.</p>
          {:else}
            <div class="cp-people">
              {#each shared as p (p.id)}
                <div class="cp-person" data-testid="shared-person">
                  {#if p.profile}<img src={tmdbImg(p.profile, 'w185')} alt="" width="46" height="46" loading="lazy" />{:else}<span class="cp-ph">{initials(p.name)}</span>{/if}
                  <div>
                    <a class="cp-pn" href={withBase(`/net?focus=p${p.id}`)}>{p.name}</a>
                    <div class="cp-pr">
                      {roleText(p.roles.a) === roleText(p.roles.b) ? `${roleText(p.roles.a)} in both` : `${roleText(p.roles.a)} in A · ${roleText(p.roles.b)} in B`}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
          <p class="small cp-net"><a href={withBase(`/net?from=f${A.id}&to=f${B.id}`)}>Connect them in Dr. X Net</a></p>
        </div>
      </div>
    {:else if A || B}
      <p class="muted small cp-note">Pick a second film to see them side by side.</p>
    {/if}
  {/if}
</div>

<style>
  .cp-wait { min-height: 340px; }
  .ab { display: inline-flex; align-items: center; justify-content: center; width: 1.5em; height: 1.5em; border-radius: 50%; font: 700 0.7rem/1 var(--font-ui);
    border: 1.5px solid var(--ink); color: var(--ink); flex-shrink: 0; }
  .ab.b { border-style: dashed; }

  .cp-top { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); gap: 1.4rem; align-items: center; }
  .cp-film { display: grid; grid-template-columns: 104px minmax(0, 1fr); gap: 1rem; align-items: center; }
  .cp-film.r { grid-template-columns: minmax(0, 1fr) 104px; text-align: right; }
  .cp-film.r .cp-poster { order: 2; }
  .cp-poster { display: block; position: relative; aspect-ratio: 2 / 3; border-radius: 4px; overflow: hidden; border: 1px solid var(--border); background: var(--bg-raised); box-shadow: 0 6px 18px rgb(0 0 0 / 0.35); }
  .cp-poster img { width: 100%; height: 100%; object-fit: cover; }
  .cp-poster .no-poster { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 0.5rem; text-align: center; font-family: var(--font-display); font-size: 0.85rem; color: var(--ink-muted); }
  .cp-id { min-width: 0; }
  .cp-id h2 { font-size: clamp(1.4rem, 3vw, 2rem); margin: 0.35rem 0 0.1rem; }
  .cp-id h2 a { text-decoration: none; }
  .cp-id h2 a:hover { color: var(--accent); }
  .cp-sub { font-size: 0.8rem; color: var(--ink-faint); }
  .cp-change { background: none; border: 0; padding: 0; margin-top: 0.4rem; font-size: 0.8rem; color: var(--ink-muted); text-decoration: underline; text-underline-offset: 3px; }
  .cp-change:hover { color: var(--accent); }
  .cp-swap { width: 42px; height: 42px; border-radius: 50%; border: 1px solid var(--border-strong); background: var(--bg-raised); color: var(--ink); display: flex; align-items: center; justify-content: center; padding: 0; }
  .cp-swap:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
  .cp-swap:disabled { opacity: 0.4; cursor: default; }

  .cp-pick { border: 1px dashed var(--border-strong); border-radius: 8px; padding: 1rem; display: flex; flex-direction: column; gap: 0.7rem; background: color-mix(in srgb, var(--bg-panel) 60%, transparent); min-width: 0; }
  .cp-pick-h { display: flex; align-items: center; gap: 0.55rem; }
  .cp-pick-h .cp-change { margin: 0 0 0 auto; }
  .cp-pick input { width: 100%; font-size: 1rem; padding: 0.55em 0.85em; }
  .cp-kicker { font: 600 0.68rem/1 var(--font-ui); letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-faint); margin-top: 0.2rem; }
  .cp-res { display: flex; flex-direction: column; gap: 0.15rem; max-height: 340px; overflow-y: auto; }
  .cp-res button { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; gap: 0.7rem; align-items: center; padding: 0.35rem 0.4rem; border-radius: 5px; border: 0; background: none; color: var(--ink); text-align: left; }
  .cp-res button:hover, .cp-res button:focus-visible { background: var(--bg-raised); }
  .cp-res img, .cp-thumb { width: 34px; height: 51px; object-fit: cover; border-radius: 3px; background: var(--bg-raised); }
  .cp-rt { min-width: 0; display: flex; flex-direction: column; }
  .cp-rt b { font-family: var(--font-display); font-weight: 500; font-size: 1.02rem; line-height: 1.15; }
  .cp-rt span { font-size: 0.74rem; color: var(--ink-faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cp-m { font: 600 0.74rem var(--font-mono); color: var(--accent); }

  /* The tape: a centre spine of labels, bars growing outwards. */
  .cp-tape { margin-top: 1.8rem; }
  .cp-row { display: grid; grid-template-columns: minmax(0, 1fr) 150px minmax(0, 1fr); gap: 0.9rem; align-items: center; padding: 0.42rem 0; border-bottom: 1px solid var(--border); }
  .cp-head { border-bottom-color: var(--border-strong); padding-top: 0; }
  .cp-head .cp-side { font-size: 0.8rem; }
  .cp-lab { text-align: center; font-size: 0.72rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-faint); }
  .cp-row.c .cp-lab { color: var(--content-c); }
  .cp-row.f .cp-lab { color: var(--form-c); }
  .cp-side { display: flex; align-items: center; gap: 0.6rem; min-width: 0; }
  .cp-side.a { flex-direction: row-reverse; text-align: right; }
  .cp-side .v { font-family: var(--font-mono); font-size: 0.92rem; min-width: 3.6em; }
  .cp-side.a .v { text-align: right; }
  .cp-side .bar { height: 8px; border-radius: 4px; background: var(--ink-muted); opacity: 0.5; }
  .cp-side.b .bar { background: repeating-linear-gradient(90deg, var(--ink-muted) 0 6px, transparent 6px 9px); }
  .cp-side.win .v { color: var(--accent); font-weight: 600; }
  .cp-side.win .bar { background: var(--accent); opacity: 1; }
  .cp-side.b.win .bar { background: repeating-linear-gradient(90deg, var(--accent) 0 6px, transparent 6px 9px); }
  .cp-row.txt .cp-side { font-size: 0.88rem; color: var(--ink); display: block; }

  .cp-panels { margin-top: 1.8rem; }
  .cp-pent-h { display: flex; flex-wrap: wrap; gap: 0.6rem 1.4rem; align-items: center; justify-content: space-between; margin-bottom: 0.4rem; }
  .cp-pent-h h3 { margin: 0; }
  .cp-legend { display: flex; gap: 0.6rem 1.2rem; font-size: 0.82rem; color: var(--ink-muted); align-items: center; flex-wrap: wrap; }
  .cp-legend i { display: inline-block; width: 26px; border-top: 2px solid var(--ink-muted); vertical-align: middle; margin-right: 0.4rem; }
  .cp-legend i.d { border-top-style: dashed; }
  .cp-chart { max-width: 660px; margin: 0 auto; }
  .cp-note { margin: 0.4rem 0 0; }
  .cp-count { font-family: var(--font-ui); font-weight: 400; }
  .cp-people { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 0.9rem; }
  .cp-person { display: grid; grid-template-columns: 46px minmax(0, 1fr); gap: 0.7rem; align-items: center; }
  .cp-person img, .cp-ph { width: 46px; height: 46px; border-radius: 50%; object-fit: cover; border: 1px solid var(--border); background: var(--bg-raised); }
  .cp-ph { display: flex; align-items: center; justify-content: center; font: 600 0.9rem var(--font-display); color: var(--ink-faint); }
  .cp-pn { display: block; font-family: var(--font-display); font-size: 1.05rem; line-height: 1.15; color: var(--ink); text-decoration: none; }
  .cp-pn:hover { color: var(--accent); text-decoration: underline; text-underline-offset: 3px; }
  .cp-net { margin: 0.9rem 0 0; }
  .cp-net a { color: var(--accent); }
  .cp-pr { font-size: 0.75rem; color: var(--ink-faint); }

  @media (max-width: 760px) {
    .cp-top:has(.cp-pick) { grid-template-columns: 1fr; }
    .cp-top:has(.cp-pick) .cp-swap { display: none; }
  }
  /* Phones: the tape becomes a plain A | B table, labels first. */
  @media (max-width: 640px) {
    .cp-top { grid-template-columns: 1fr 1fr; gap: 0.8rem; align-items: start; }
    .cp-top .cp-swap { display: none; }
    .cp-film, .cp-film.r { grid-template-columns: 1fr; text-align: left; }
    .cp-film.r .cp-poster { order: 0; }
    .cp-poster { width: 88px; }
    .cp-row { grid-template-columns: 30% minmax(0, 1fr) minmax(0, 1fr); gap: 0.6rem; padding: 0.5rem 0; align-items: baseline; }
    .cp-lab { order: -1; text-align: left; letter-spacing: 0.04em; font-size: 0.66rem; }
    .cp-side, .cp-side.a { flex-direction: row; text-align: left; }
    .cp-side.a .v { text-align: left; }
    .cp-side .bar { display: none; }
    .cp-side .v { font-size: 0.84rem; min-width: 0; }
    .cp-side.win .v::after { content: ' ●'; font-size: 0.6em; vertical-align: 0.25em; }
    .cp-row.txt .cp-side { font-size: 0.8rem; }
  }
</style>

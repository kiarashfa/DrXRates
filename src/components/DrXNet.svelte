<script>
  // Dr. X Net: one neighbourhood of the film/people graph at a time, drawn
  // as an orrery by src/lib/net-orbit.js, plus six degrees between any two
  // nodes, drawn into the same picture. Deep links: ?focus=f<id>|p<id>,
  // ?from=…&to=… (a path ending at the centre), &u=all for the whole archive.
  // The chrome, the centre's caption and the six-degrees ends render on the
  // server from props, so nothing shifts when the graph arrives.
  import { onMount } from 'svelte';
  import { fmtScore } from '../../shared/rating-meta.mjs';
  import { movieSlug } from '../../shared/slug.mjs';
  import { tmdbImg, withBase } from '../lib/util.js';
  import { loadNet, loadNetFaces, loadNetArchive, loadRated, loadPosters, loadPeople, loadCredits, loadFilms } from '../lib/archive.js';
  import { buildNet, ego, findPath, hasNode, isFilm, keyId, searchNet, pathSteps, DEFAULT_LINKS, ROLES } from '../lib/net.js';
  import { Orbit, linkClass } from '../lib/net-orbit.js';

  // start/bacon: { key, label, year?, img } for the first centre and the
  // default six-degrees start; directorPages: { personId: slug }.
  let { start, bacon, directorPages = {} } = $props();

  const NOUN = { d: 'Director', w: 'Writer', a: 'Actor', c: 'Cinematographer', m: 'Composer', e: 'Editor', p: 'Production designer' };
  const VERB = { d: 'directed', w: 'wrote', a: 'acted in', c: 'shot', m: 'scored', e: 'edited', p: 'designed' };
  const LINK_NAME = { a: 'cast', d: 'directors', w: 'writers', c: 'photography', m: 'music', e: 'editing', p: 'design' };
  const ROLE_WORD = { d: 'director', w: 'writer', a: 'cast', c: 'cinematography', m: 'music', e: 'editing', p: 'design' };
  const TOGGLES = [['a', 'Cast'], ['d', 'Directors'], ['w', 'Writers'], ['c', 'Photography'], ['m', 'Music'], ['e', 'Editing'], ['p', 'Design']];

  let universe = $state('rated'); // 'rated' | 'all'
  let graph = $state.raw(null);
  let status = $state('Loading the network…');
  let focus = $state(start.key);
  let trail = $state([]);
  let hoverKey = $state(null);
  let hoverShown = $state(false);
  let version = $state(0); // bumps when names, posters or faces arrive
  let capTop = $state(null); // px from the stage top; CSS places it until then

  // Six degrees.
  let from = $state(bacon.key);
  let toPinned = $state(null); // a key the visitor picked; null = the centre
  let links = $state([...DEFAULT_LINKS]);
  let active = $state(false); // a path is wanted
  let path = $state.raw(null);
  let picking = $state(null); // 'from' | 'to' while its field is open
  let pickQuery = $state('');
  let query = $state('');

  let stage;
  let orbit = null;
  const graphs = {};
  let rated = new Map(); // film id → Dr. X's rating
  const faces = new Map(); // person id → profile path
  const posters = new Map(); // film id → poster path (archive films)
  const names = new Map(); // person id → name, for people outside the graph
  const fullCredits = new Map(); // film id → { code: [personId] } (archive)
  const imdbOf = new Map(); // film id → IMDb score (archive films, on hover)
  let showAll = null; // a person whose every film is shown

  const to = $derived(toPinned ?? focus);

  // ---------- node details ----------
  function fIdx(id) { return graph?.fIdx.get(id); }
  function pIdx(id) { return graph?.pIdx.get(id); }
  function info(key) {
    version; // re-read when data arrives
    const id = keyId(key);
    if (key === start.key && !graph) return start;
    if (key === bacon.key && !graph) return bacon;
    if (isFilm(key)) {
      const i = fIdx(id);
      if (i == null) return { label: '…' };
      return { label: graph.films.title[i], year: graph.films.year[i], img: graph.films.poster?.[i] ?? posters.get(id) ?? null };
    }
    const j = pIdx(id);
    return { label: j != null ? graph.people.name[j] : (names.get(id) ?? '…'), img: faces.get(id) ?? null };
  }
  const resolve = (key) => info(key);

  // ---------- loading ----------
  async function useUniverse(u) {
    status = u === 'all' ? 'Loading the whole archive (about 1.6 MB)…' : 'Loading the network…';
    if (!graphs[u]) {
      const data = u === 'all' ? await loadNetArchive() : await loadNet();
      graphs[u] = buildNet(data);
    }
    universe = u;
    graph = graphs[u];
    status = '';
  }

  // Posters and faces the current picture lacks (the archive's films and
  // people come from the small shards; Dr. X's films carry their posters).
  function fetchImages(keys) {
    const films = keys.filter((k) => isFilm(k) && !info(k).img && !posters.has(keyId(k))).map(keyId);
    const people = keys.filter((k) => !isFilm(k) && !faces.has(keyId(k))).map(keyId);
    if (films.length) {
      loadPosters(films).then((m) => {
        for (const [id, p] of m) posters.set(id, p);
        version++;
        orbit?.refreshImages();
      }).catch(() => {});
    }
    if (people.length && universe === 'all') {
      loadPeople(people).then((m) => {
        for (const [id, p] of m) {
          faces.set(id, p?.profile ?? null);
          if (p && !names.has(id)) names.set(id, p.name);
        }
        version++;
        orbit?.refreshImages();
      }).catch(() => {});
    }
  }

  // ---------- drawing ----------
  async function draw() {
    if (!graph || !orbit) return;
    if (!hasNode(graph, focus)) focus = start.key;
    const key = focus;
    // An archive film's one-film people aren't in the graph: take its full
    // credits from the credit shards (names from the people shards).
    let full = null;
    if (universe === 'all' && isFilm(key)) {
      const id = keyId(key);
      if (!fullCredits.has(id)) {
        const { byId } = await loadCredits([id]).catch(() => ({ byId: new Map() }));
        fullCredits.set(id, byId.get(id) ?? null);
        const missing = Object.values(byId.get(id) ?? {}).flat().filter((p) => pIdx(p) == null && !names.has(p));
        if (missing.length) {
          const m = await loadPeople(missing).catch(() => new Map());
          for (const [pid, p] of m) {
            names.set(pid, p?.name ?? '…');
            faces.set(pid, p?.profile ?? null);
          }
        }
      }
      full = fullCredits.get(id);
      if (key !== focus) return; // moved on while loading
    }
    const narrow = stage.clientWidth < 560;
    const view = ego(graph, key, {
      cap: narrow ? 12 : 24,
      cap1: showAll === key ? 9999 : narrow ? 20 : 36,
      cap2: narrow ? 10 : 18,
      full,
    });
    if (narrow && view.ring1.length > 22 && isFilm(key)) view.ring1 = view.ring1.slice(0, 22);
    path = active ? findPath(graph, from, key, links) : null;
    const keys = [view.focus, ...view.ring1.map((m) => m.key), ...view.ring2.map((m) => m.key), ...(path ?? []).map(([k]) => k)];
    fetchImages(keys);
    orbit.show(view, path);
    syncUrl();
  }

  function select(key, opts = {}) {
    if (opts.all) showAll = key;
    if (key !== focus) {
      trail = [...trail, focus].slice(-20);
      focus = key;
    }
    if (toPinned === key) toPinned = null;
    draw();
  }
  function back() {
    const k = trail.at(-1);
    if (!k) return;
    trail = trail.slice(0, -1);
    focus = k;
    draw();
  }

  // ---------- six degrees ----------
  function run() {
    if (!graph || !from) return;
    active = true;
    if (toPinned && toPinned !== focus) {
      // The path always ends at the centre, so a picked "To" becomes it.
      trail = [...trail, focus].slice(-20);
      focus = toPinned;
    }
    toPinned = null;
    draw();
    if (stage.clientWidth < 560) stage.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
  }
  function clearPath() {
    active = false;
    draw();
  }
  function toggleLink(r) {
    links = links.includes(r) ? links.filter((x) => x !== r) : [...links, r];
    if (active) draw();
  }
  function swap() {
    const a = from;
    from = to;
    toPinned = a === focus ? null : a;
  }
  function pick(which, key) {
    if (which === 'from') from = key;
    else toPinned = key === focus ? null : key;
    picking = null;
    pickQuery = '';
  }
  function bacon6() {
    from = bacon.key;
    run();
  }

  // ---------- search (graph box and the two ends) ----------
  const hits = (q) => (graph && q.trim().length >= 2 ? searchNet(graph, q, 8) : []);
  const searchHits = $derived(hits(query));
  const pickHits = $derived(hits(pickQuery));
  let sel = $state(0);
  function keyNav(e, list, onPick, onEscape) {
    if (e.key === 'ArrowDown') { sel = Math.min(list.length - 1, sel + 1); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); e.preventDefault(); }
    else if (e.key === 'Enter' && list[sel]) { onPick(list[sel]); e.preventDefault(); }
    else if (e.key === 'Escape') onEscape();
  }

  // ---------- details ----------
  let hoverTimer;
  function onHover(key) {
    clearTimeout(hoverTimer);
    if (key) {
      hoverKey = key;
      hoverShown = true;
      if (isFilm(key) && universe === 'all' && fIdx(keyId(key)) != null && graph.films.imdb == null && !imdbOf.has(keyId(key))) {
        const id = keyId(key);
        imdbOf.set(id, null);
        loadFilms([id]).then((m) => { imdbOf.set(id, m.get(id)?.imdb ?? null); version++; }).catch(() => {});
      }
    } else hoverTimer = setTimeout(() => (hoverShown = false), 220);
  }
  function details(key) {
    version;
    if (!key || !graph) return null;
    const n = info(key);
    const id = keyId(key);
    if (isFilm(key)) {
      const i = fIdx(id);
      const dirs = (graph.credits[i]?.[0] ?? []).slice(0, 2).map((j) => graph.people.name[j]).join(', ');
      const imdb = graph.films.imdb ? graph.films.imdb[i] : imdbOf.get(id);
      return { film: true, ...n, dirs, my: rated.get(id)?.overall ?? null, imdb };
    }
    const j = pIdx(id);
    if (j == null) return { film: false, ...n, roles: '', count: '', avg: '' };
    const pf = graph.pFilms[j];
    const roleCount = {};
    const films = new Set();
    for (let k = 0; k < pf.length; k += 2) {
      films.add(pf[k]);
      const code = ROLES[pf[k + 1]];
      roleCount[code] = (roleCount[code] ?? 0) + 1;
    }
    const roles = Object.entries(roleCount).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([r]) => NOUN[r]).join(', ');
    const scores = [...films].map((f) => rated.get(graph.films.id[f])?.overall).filter((v) => v != null);
    // One decimal, like the averages on the director pages.
    const mean = scores.length ? Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 10) / 10 : null;
    const count = universe === 'rated' ? `${films.size} of Dr. X's films` : `${films.size} films in the archive`;
    const avg = mean == null ? '' : universe === 'rated' ? `average ${fmtScore(mean)}` : `Dr. X's average ${fmtScore(mean)} over ${scores.length}`;
    return { film: false, ...n, roles, count, avg };
  }
  const box = $derived(details(hoverKey));
  const centre = $derived.by(() => {
    version;
    const n = info(focus);
    const id = keyId(focus);
    if (isFilm(focus)) return { ...n, href: n.label !== '…' ? withBase(`/movie/${movieSlug(n.label, n.year, id)}`) : null, linkText: 'Film page' };
    const slug = directorPages[id];
    return { ...n, href: slug ? withBase(`/director/${slug}`) : null, linkText: 'Director page' };
  });

  // ---------- chain ----------
  const chain = $derived.by(() => {
    version;
    if (!path || path.length < 2) return null;
    let film = 0;
    const steps = path.map(([k], i) => {
      const n = info(k);
      const rel = i ? VERB[path[i][1]] : null;
      if (!isFilm(k)) return { key: k, film: false, ...n, rel };
      film++;
      const near = [i - 1, i + 1].filter((x) => x >= 0 && x < path.length).map((x) => ({ name: info(path[x][0]).label, r: path[x > i ? x : i][1] }));
      const who = near.length === 2 && near[0].r === near[1].r ? `${near[0].name} and ${near[1].name}, ${ROLE_WORD[near[0].r]}` : near.map((x) => `${x.name}, ${ROLE_WORD[x.r]}`).join('; ');
      return { key: k, film: true, ...n, rel, num: film, who };
    });
    const via = [...new Set(path.slice(1).map(([, r]) => r))].map((r) => LINK_NAME[r]).join(' and ');
    return { steps, n: pathSteps(path), via, a: info(path[0][0]).label, b: info(path.at(-1)[0]).label };
  });
  const noPath = $derived(active && graph && !path && from !== focus);

  // ---------- address ----------
  function syncUrl() {
    const url = new URL(location.href);
    for (const k of ['focus', 'from', 'to', 'u']) url.searchParams.delete(k);
    if (active) { url.searchParams.set('from', from); url.searchParams.set('to', focus); }
    else if (focus !== start.key) url.searchParams.set('focus', focus);
    if (universe === 'all') url.searchParams.set('u', 'all');
    history.replaceState(null, '', url);
  }

  async function switchUniverse(u) {
    if (u === universe || status) return;
    try {
      await useUniverse(u);
      orbit.resize();
      draw();
    } catch (err) {
      status = `Couldn't load the network: ${err.message}`;
    }
  }

  onMount(() => {
    const q = new URLSearchParams(location.search);
    const valid = (k) => (/^[fp]\d+$/.test(k ?? '') ? k : null);
    const wantFrom = valid(q.get('from'));
    const wantTo = valid(q.get('to'));
    const wantFocus = valid(q.get('focus'));
    let ro;
    (async () => {
      try {
        const ratedP = loadRated();
        await useUniverse('rated');
        // A link to something outside Dr. X's films opens the whole archive.
        const outside = [wantFocus, wantFrom, wantTo].some((k) => k && !hasNode(graphs.rated, k));
        if (q.get('u') === 'all' || outside) await useUniverse('all');
        rated = await ratedP;
        if (wantFrom && wantTo && hasNode(graph, wantFrom) && hasNode(graph, wantTo)) {
          from = wantFrom;
          focus = wantTo;
          active = true;
        } else if (wantFocus && hasNode(graph, wantFocus)) focus = wantFocus;
        orbit = new Orbit(stage, { resolve, onSelect: select, onHover, onLayout: (y) => (capTop = y + 8), uid: 'drxnet' });
        draw();
        ro = new ResizeObserver(() => requestAnimationFrame(() => orbit.resize()));
        ro.observe(stage);
        loadNetFaces().then((m) => {
          for (const [id, p] of m) faces.set(id, p);
          version++;
          orbit.refreshImages();
        }).catch(() => {});
      } catch (err) {
        status = `Couldn't load the network: ${err.message}`;
      }
    })();
    return () => ro?.disconnect();
  });

  const face = (n, size = 'w185') => (n.img ? tmdbImg(n.img, size) : null);
  const initials = (s) => String(s).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('');
</script>

<section class="panel net-panel" data-testid="net-graph">
  <div class="net-bar">
    <div class="net-search">
      <input type="search" placeholder="Find a film or person" aria-label="Find a film or person" autocomplete="off" bind:value={query}
        oninput={() => (sel = 0)} onkeydown={(e) => keyNav(e, searchHits, (k) => { select(k); query = ''; }, () => (query = ''))} />
      {#if searchHits.length}
        <ul class="net-ac" role="listbox">
          {#each searchHits as k, i (k)}
            {@const n = info(k)}
            <li role="option" aria-selected={i === sel}>
              <button type="button" onmousedown={(e) => { e.preventDefault(); select(k); query = ''; }}>
                {#if face(n, isFilm(k) ? 'w92' : 'w185')}<img class:po={isFilm(k)} src={face(n, isFilm(k) ? 'w92' : 'w185')} alt="" />{:else}<span class="ph" class:po={isFilm(k)}></span>{/if}
                <span>{n.label}</span><i>{isFilm(k) ? (n.year ?? '') : 'Person'}</i>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
    <div class="seg" role="group" aria-label="Which films">
      <button type="button" class:active={universe === 'rated'} aria-pressed={universe === 'rated'} onclick={() => switchUniverse('rated')}>Dr. X's films</button>
      <button type="button" class:active={universe === 'all'} aria-pressed={universe === 'all'} onclick={() => switchUniverse('all')}>Whole archive</button>
    </div>
    <nav class="net-trail" aria-label="Recently centred">
      {#if trail.length}<button type="button" class="back" aria-label="Back" onclick={back}>←</button>{/if}
      {#each [...trail.slice(-3), focus] as k, i (i + k)}
        {#if i}<i aria-hidden="true">›</i>{/if}<span class:here={k === focus}>{info(k).label}</span>
      {/each}
    </nav>
  </div>

  <div class="net-stage" bind:this={stage} data-testid="net-stage">
    {#if status}<p class="net-status" role="status">{status}</p>{/if}
    <div class="net-centre" data-testid="net-centre" style:top={capTop == null ? null : `${capTop}px`}>
      <b>{centre.label}</b>
      {#if centre.year}<span class="yr">{centre.year}</span>{/if}
      {#if centre.href}<a href={centre.href}>{centre.linkText}</a>{/if}
    </div>
    <div class="net-box" class:on={hoverShown && box} aria-live="polite">
      {#if box}
        <div class="nb-in">
          {#if face(box, box.film ? 'w154' : 'w185')}<img class:face={!box.film} src={face(box, box.film ? 'w154' : 'w185')} width="58" height={box.film ? 87 : 58} alt="" />
          {:else}<span class="ph" class:face={!box.film}>{box.film ? '' : initials(box.label)}</span>{/if}
          <div>
            <span class="kind">{box.film ? 'Film' : 'Person'}</span>
            <b>{box.label}</b>
            {#if box.film}
              <span>{box.year ?? '–'}{box.dirs ? ` · ${box.dirs}` : ''}</span>
              <span class="sc"><em>Dr. X</em> {fmtScore(box.my)} <em>IMDb</em> {fmtScore(box.imdb)}</span>
            {:else}
              {#if box.roles}<span>{box.roles}</span>{/if}
              {#if box.count}<span>{box.count}</span>{/if}
              {#if box.avg}<span class="sc">{box.avg}</span>{/if}
            {/if}
          </div>
        </div>
      {/if}
    </div>
  </div>

  <div class="net-legend">
    <span><i class="sw film"></i>Film</span><span><i class="sw person"></i>Person</span>
    <span><i class="ln l-cast"></i>Cast</span><span><i class="ln l-dir"></i>Director</span>
    <span><i class="ln l-content"></i>Writer</span><span><i class="ln l-form"></i>Crew</span>
    <span class="tip">Click to centre · hover for details</span>
  </div>
</section>

<section class="panel six" data-testid="net-six">
  <div class="six-top">
    <h2>Six degrees</h2>
    <span class="muted small">Connect any two films or people within {universe === 'rated' ? "Dr. X's films" : 'the whole archive'}.</span>
    <button type="button" class="link-btn" onclick={bacon6}>Six degrees of Kevin Bacon</button>
  </div>
  <div class="ends">
    {#each [['from', from], ['to', to]] as [which, key] (which)}
      <div class="end">
        <span class="k">{which === 'from' ? 'From' : 'To'}{#if which === 'to' && !toPinned}<span class="note"> · the centre of the graph</span>{/if}</span>
        <div class="slot">
          {#if picking === which}
            <!-- svelte-ignore a11y_autofocus -->
            <input type="search" placeholder="Film or person" aria-label={which === 'from' ? 'Start' : 'End'} autocomplete="off" autofocus bind:value={pickQuery}
              oninput={() => (sel = 0)} onblur={() => setTimeout(() => (picking = null), 150)}
              onkeydown={(e) => keyNav(e, pickHits, (k) => pick(which, k), () => (picking = null))} />
            {#if pickHits.length}
              <ul class="net-ac" role="listbox">
                {#each pickHits as k, i (k)}
                  {@const n = info(k)}
                  <li role="option" aria-selected={i === sel}>
                    <button type="button" onmousedown={(e) => { e.preventDefault(); pick(which, k); }}>
                      {#if face(n, isFilm(k) ? 'w92' : 'w185')}<img class:po={isFilm(k)} src={face(n, isFilm(k) ? 'w92' : 'w185')} alt="" />{:else}<span class="ph" class:po={isFilm(k)}></span>{/if}
                      <span>{n.label}</span><i>{isFilm(k) ? (n.year ?? '') : 'Person'}</i>
                    </button>
                  </li>
                {/each}
              </ul>
            {/if}
          {:else}
            {@const n = info(key)}
            <button type="button" class="chip" onclick={() => { picking = which; pickQuery = ''; sel = 0; }} aria-label={`${which === 'from' ? 'Start' : 'End'}: ${n.label}. Change`}>
              {#if face(n, isFilm(key) ? 'w92' : 'w185')}<img class:po={isFilm(key)} src={face(n, isFilm(key) ? 'w92' : 'w185')} alt="" />{:else}<span class="ph" class:po={isFilm(key)}></span>{/if}
              <span class="nm">{n.label}{#if n.year}<i> {n.year}</i>{/if}</span>
              <span class="x" aria-hidden="true">×</span>
            </button>
          {/if}
        </div>
      </div>
      {#if which === 'from'}<button type="button" class="swap" aria-label="Swap the two ends" onclick={swap}>⇄</button>{/if}
    {/each}
    <button type="button" class="btn primary find" onclick={run} disabled={!graph}>Find the path</button>
  </div>
  <div class="links" role="group" aria-label="Links through">
    <span class="k">Links through</span>
    {#each TOGGLES as [r, label] (r)}
      <label class="tog {linkClass(r)}"><input type="checkbox" checked={links.includes(r)} onchange={() => toggleLink(r)} /><span>{label}</span></label>
    {/each}
  </div>
  <p class="fine">Within the Cinema Ledger: the top 12 billed actors and the directors of each film; writers and crew (photography, music, editing, design) when switched on.</p>

  {#if chain}
    <div class="result" data-testid="net-chain">
      <div class="chain-top">
        <p><b>{chain.a}</b> to <b>{chain.b}</b> in <b>{chain.n} {chain.n === 1 ? 'step' : 'steps'}</b> <span class="faint">· via {chain.via}</span></p>
        <button type="button" class="link-btn" onclick={clearPath}>Clear the path</button>
      </div>
      <ol class="chain">
        {#each chain.steps as s (s.key)}
          {#if s.rel}<li class="rel" aria-hidden="true"><span>{s.rel}</span></li>{/if}
          <li class="step" class:film={s.film}>
            <button type="button" onclick={() => select(s.key)} onmouseenter={() => orbit?.hover(s.key)} onmouseleave={() => orbit?.hover(null)} onfocus={() => orbit?.hover(s.key)} onblur={() => orbit?.hover(null)}>
              {#if s.film}
                <span class="po-wrap">
                  {#if face(s, 'w154')}<img src={face(s, 'w154')} width="56" height="84" alt="" />{:else}<span class="po-ph"></span>{/if}
                  <span class="num">{s.num}</span>
                </span>
                <span class="nm">{s.label} <i>{s.year ?? ''}</i></span>
                <span class="who">{s.who}</span>
              {:else}
                {#if face(s)}<img class="face" src={face(s)} width="56" height="56" alt="" />{:else}<span class="face ini">{initials(s.label)}</span>{/if}
                <span class="nm">{s.label}</span>
              {/if}
            </button>
          </li>
        {/each}
      </ol>
    </div>
  {:else if noPath}
    <p class="result none">No connection between <b>{info(from).label}</b> and <b>{info(focus).label}</b> through the chosen links. Try adding writers or crew{universe === 'rated' ? ', or the whole archive' : ''}.</p>
  {:else if active && from === focus}
    <p class="result none"><b>{info(from).label}</b> is already in the centre. Pick another start, or centre something else.</p>
  {/if}
</section>

<style>
  .net-panel { padding: 1rem 1.1rem 0.8rem; container-type: inline-size; }
  .net-bar { display: flex; gap: 0.7rem; align-items: center; flex-wrap: wrap; margin-bottom: 0.4rem; }
  .net-search { position: relative; flex: 0 1 320px; min-width: 200px; }
  .net-search input, .slot input { width: 100%; height: 2.4rem; background: var(--bg-raised); color: var(--ink); border: 1px solid var(--border-strong); border-radius: var(--radius); padding: 0 0.75em; font: inherit; font-size: 0.88rem; }
  .net-trail { margin-left: auto; display: flex; align-items: center; gap: 0.35rem; font-size: 0.8rem; color: var(--ink-faint); min-width: 0; flex-wrap: wrap; }
  .net-trail i { font-style: normal; opacity: 0.6; }
  .net-trail .here { color: var(--ink); font-weight: 500; }
  .net-trail .back { background: none; border: 1px solid var(--border); border-radius: 50%; width: 26px; height: 26px; color: var(--ink-muted); padding: 0; }
  .net-trail .back:hover { color: var(--accent); border-color: var(--accent); }
  .net-ac { position: absolute; z-index: 20; left: 0; right: 0; top: calc(100% + 4px); min-width: 260px; list-style: none; margin: 0; padding: 0.25rem; background: var(--bg-raised); border: 1px solid var(--border-strong); border-radius: var(--radius); box-shadow: 0 12px 28px rgb(0 0 0 / 0.3); }
  .net-ac button { display: flex; align-items: center; gap: 0.55rem; width: 100%; padding: 0.3rem 0.45rem; border: 0; border-radius: 4px; background: none; color: var(--ink); font-size: 0.86rem; text-align: left; }
  .net-ac li[aria-selected='true'] button, .net-ac button:hover { background: color-mix(in srgb, var(--accent) 16%, transparent); }
  .net-ac img, .net-ac .ph { width: 26px; height: 26px; border-radius: 50%; object-fit: cover; flex: none; background: var(--border); }
  .net-ac .po { width: 20px; height: 30px; border-radius: 2px; }
  .net-ac i { margin-left: auto; font-style: normal; font-size: 0.74rem; color: var(--ink-faint); white-space: nowrap; }

  .net-stage { position: relative; height: clamp(560px, 62cqw, 760px); }
  .net-status { position: absolute; left: 0; right: 0; top: 30%; margin: 0; text-align: center; color: var(--ink-faint); font-size: 0.9rem; }
  .net-centre { position: absolute; left: 50%; top: calc(50% + 6px + 52.5px + 8px); transform: translateX(-50%); z-index: 2; text-align: center; white-space: nowrap; font-size: 0.78rem; line-height: 1.35; pointer-events: none; }
  .net-centre b { display: block; font: 600 1.3rem/1.15 var(--font-display); text-shadow: 0 0 6px var(--bg-panel), 0 0 12px var(--bg-panel); }
  .net-centre .yr { display: block; color: var(--ink-faint); font-family: var(--font-mono); font-size: 0.74rem; }
  .net-centre a { pointer-events: auto; color: var(--accent); text-decoration: underline; text-underline-offset: 3px; }
  .net-box { position: absolute; left: 0.2rem; bottom: 0.2rem; z-index: 3; width: 270px; pointer-events: none; opacity: 0; transform: translateY(8px); transition: opacity 0.22s ease, transform 0.22s var(--ease-out); }
  .net-box.on { opacity: 1; transform: none; }
  .nb-in { display: flex; gap: 0.7rem; align-items: flex-start; padding: 0.6rem; background: color-mix(in srgb, var(--bg-raised) 94%, transparent); border: 1px solid var(--border-strong); border-radius: var(--radius); box-shadow: 0 10px 26px rgb(0 0 0 / 0.25); font-size: 0.78rem; line-height: 1.35; }
  .nb-in img, .nb-in .ph { width: 58px; height: 87px; border-radius: 3px; object-fit: cover; flex: none; background: var(--border); }
  .nb-in .face { width: 58px; height: 58px; border-radius: 50%; display: grid; place-items: center; color: var(--ink-muted); font-family: var(--font-display); }
  .nb-in .kind { display: block; font: 600 0.6rem var(--font-ui); letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink-faint); }
  .nb-in b { display: block; font: 560 1.08rem/1.15 var(--font-display); margin: 0.05rem 0 0.15rem; }
  .nb-in span { display: block; color: var(--ink-muted); }
  .nb-in .sc { font-family: var(--font-mono); color: var(--ink); margin-top: 0.15rem; }
  .nb-in .sc em { font-style: normal; font-family: var(--font-ui); color: var(--ink-faint); margin-left: 0.3em; }
  .nb-in .sc em:first-child { margin-left: 0; }

  .net-legend { display: flex; flex-wrap: wrap; gap: 0.3rem 1rem; font-size: 0.74rem; color: var(--ink-muted); margin-top: 0.3rem; }
  .net-legend span { display: inline-flex; align-items: center; gap: 0.4em; }
  .net-legend .sw { width: 9px; height: 13px; border: 1px solid var(--ink-muted); border-radius: 1.5px; background: var(--bg-raised); }
  .net-legend .sw.person { width: 11px; height: 11px; border-radius: 50%; }
  .net-legend .ln { width: 18px; border-top: 1.5px solid var(--ink-faint); }
  .net-legend .ln.l-dir { border-top: 2.5px solid var(--ink-muted); }
  .net-legend .ln.l-content { border-top-color: var(--content-c); }
  .net-legend .ln.l-form { border-top: 1.5px dashed var(--form-c); }
  .net-legend .tip { margin-left: auto; color: var(--ink-faint); }

  /* The orrery (drawn by net-orbit.js) */
  .net-stage :global(.orrery) { display: block; width: 100%; height: 100%; overflow: visible; user-select: none; -webkit-user-select: none; }
  .net-stage :global(.o-links), .net-stage :global(.o-deco), .net-stage :global(.o-path), .net-stage :global(.o-badges) { transition: opacity 0.18s; }
  .net-stage :global(.out) { opacity: 0; transition-duration: 0.12s; }
  .net-stage :global(.o-link) { fill: none; stroke: var(--ink-faint); stroke-width: 1; opacity: 0.42; transition: opacity 0.2s; }
  .net-stage :global(.o-link.l-dir) { stroke: var(--ink-muted); stroke-width: 1.7; opacity: 0.7; }
  .net-stage :global(.o-link.l-content) { stroke: var(--content-c); stroke-width: 1.3; opacity: 0.75; }
  .net-stage :global(.o-link.l-form) { stroke: var(--form-c); stroke-width: 1.2; opacity: 0.6; stroke-dasharray: 3 3; }
  .net-stage :global(.o-path .o-link) { stroke: var(--accent); stroke-width: 3; opacity: 1; stroke-dasharray: none; stroke-linecap: round; }
  .net-stage :global(.o-path.drawing .o-link) { stroke-dasharray: 1400; animation: net-draw 0.5s ease-out both; }
  .net-stage :global(.o-node) { cursor: pointer; outline: none; }
  .net-stage :global(.o-node.centre) { cursor: default; }
  .net-stage :global(.o-bg) { fill: var(--bg-raised); }
  .net-stage :global(.o-ring) { fill: none; stroke: var(--border-strong); stroke-width: 1; }
  .net-stage :global(.o-node image) { transition: opacity 0.3s; }
  .net-stage :global(.o-node.person.has-img .o-ini) { display: none; }
  .net-stage :global(.o-ini) { fill: var(--ink-muted); text-anchor: middle; font-family: var(--font-ui); font-weight: 600; }
  .net-stage :global(.o-node.centre .o-ring), .net-stage :global(.o-node.on-path .o-ring), .net-stage :global(.o-node:hover .o-ring), .net-stage :global(.o-node:focus-visible .o-ring) { stroke: var(--accent); stroke-width: 2.5; }
  .net-stage :global(.o-lbl) { font: 500 10.5px var(--font-ui); fill: var(--ink-muted); text-anchor: middle; paint-order: stroke; stroke: var(--bg-panel); stroke-width: 3.5px; stroke-linejoin: round; pointer-events: none; opacity: 0; transition: opacity 0.2s; }
  .net-stage :global(.o-lbl.shown) { opacity: 1; }
  .net-stage :global(.film .o-lbl) { font-family: var(--font-display); font-size: 12.5px; fill: var(--ink); }
  .net-stage :global(.outer .o-lbl) { fill: var(--ink-faint); }
  .net-stage :global(.film.outer .o-lbl) { fill: var(--ink-muted); font-size: 11.5px; }
  .net-stage :global(.on-path:not(.centre) .o-lbl) { fill: var(--ink); font-weight: 600; opacity: 1; }
  .net-stage :global(.orrery.has-path .o-node:not(.on-path) .o-shape), .net-stage :global(.orrery.has-path .o-node:not(.on-path) .o-lbl.shown) { opacity: 0.32; transition: opacity 0.3s; }
  .net-stage :global(.orrery.has-path .o-links .o-link) { opacity: 0.12; }
  .net-stage :global(.orrery.has-path .o-deco) { opacity: 0.6; }
  .net-stage :global(.orrery.hovering .o-node:not(.hl)) { opacity: 0.2 !important; }
  .net-stage :global(.orrery.hovering .o-node.hl .o-shape), .net-stage :global(.orrery.hovering .o-node.hl .o-lbl) { opacity: 1; }
  .net-stage :global(.orrery.hovering .o-link:not(.hl)) { opacity: 0.05; }
  .net-stage :global(.orrery.hovering .o-link.hl) { opacity: 1; }
  .net-stage :global(.o-guide) { fill: none; stroke: var(--border); stroke-dasharray: 1 6; stroke-linecap: round; stroke-width: 1.5; }
  .net-stage :global(.o-group) { font: 600 9.5px var(--font-ui); letter-spacing: 0.15em; text-transform: uppercase; fill: var(--ink-faint); text-anchor: middle; }
  .net-stage :global(.o-year) { font: 500 10.5px var(--font-mono); fill: var(--ink-muted); text-anchor: middle; }
  .net-stage :global(.o-arc), .net-stage :global(.o-tick) { fill: none; stroke: var(--border-strong); stroke-width: 1; }
  .net-stage :global(.o-more) { font: 500 11.5px var(--font-ui); fill: var(--accent); text-anchor: middle; cursor: pointer; text-decoration: underline; }
  .net-stage :global(.o-badge circle) { fill: var(--accent); stroke: var(--bg-panel); stroke-width: 2; }
  .net-stage :global(.o-badge text) { font: 700 10.5px var(--font-mono); fill: var(--bg); text-anchor: middle; }
  .net-stage :global(.o-badges.drawing .o-badge > g) { animation: net-pop 0.3s cubic-bezier(0.2, 1.4, 0.4, 1) both; transform-box: fill-box; transform-origin: center; }
  :global(:root[data-theme='matrix']) .net-stage :global(.o-node.centre .o-ring), :global(:root[data-theme='matrix']) .net-stage :global(.o-path .o-link) { filter: drop-shadow(0 0 4px var(--accent)); }
  @keyframes -global-net-draw { from { stroke-dashoffset: 1400; } to { stroke-dashoffset: 0; } }
  @keyframes -global-net-pop { from { transform: scale(0); } to { transform: scale(1); } }

  /* Six degrees */
  .six { margin-top: 1.2rem; }
  .six-top { display: flex; align-items: baseline; gap: 0.6rem 1rem; flex-wrap: wrap; }
  .six-top h2 { font-size: 1.6rem; margin: 0; }
  .six-top .link-btn { margin-left: auto; }
  .link-btn { background: none; border: 0; padding: 0; color: var(--accent); font-size: 0.82rem; text-decoration: underline; text-underline-offset: 3px; }
  .ends { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto; gap: 0.6rem; align-items: end; margin: 0.9rem 0 0.7rem; }
  .end .k { display: block; font-size: 0.7rem; color: var(--ink-faint); letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 0.25rem; }
  .end .note { text-transform: none; letter-spacing: 0; }
  .slot { position: relative; }
  .slot input { height: 44px; }
  .chip { display: flex; align-items: center; gap: 0.55em; width: 100%; height: 44px; border: 1px solid var(--border-strong); background: var(--bg-raised); color: var(--ink); border-radius: var(--radius); padding: 0.3em 0.5em; font-size: 0.92rem; text-align: left; }
  .chip:hover, .chip:focus-visible { border-color: var(--accent); }
  .chip .nm { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .chip i { font-style: normal; color: var(--ink-faint); font-size: 0.8rem; }
  .chip img, .chip .ph { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; flex: none; background: var(--border); }
  .chip .po { width: 22px; height: 33px; border-radius: 2px; }
  .chip .x { margin-left: auto; color: var(--ink-faint); font-size: 1.1rem; padding: 0 0.2em; }
  .swap { background: none; border: 1px solid var(--border); border-radius: 50%; width: 34px; height: 34px; color: var(--ink-muted); margin-bottom: 5px; padding: 0; }
  .swap:hover { border-color: var(--accent); color: var(--accent); }
  .find { height: 44px; padding-inline: 1.4em; }
  .links { display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: center; }
  .links .k { font-size: 0.74rem; color: var(--ink-faint); margin-right: 0.3rem; }
  .tog { position: relative; }
  .tog input { position: absolute; opacity: 0; }
  .tog span { display: inline-block; font-size: 0.78rem; border: 1px solid var(--border); border-radius: 999px; padding: 0.15em 0.75em; color: var(--ink-faint); cursor: pointer; }
  .tog input:checked + span { border-color: var(--ink-muted); color: var(--ink); background: var(--bg-raised); }
  .tog.l-content input:checked + span { border-color: var(--content-c); color: var(--content-c); }
  .tog.l-form input:checked + span { border-color: var(--form-c); color: var(--form-c); }
  .tog input:focus-visible + span { outline: 2px solid var(--accent); outline-offset: 2px; }
  .fine { font-size: 0.74rem; color: var(--ink-faint); margin: 0.6rem 0 0; }
  .result { margin-top: 1.1rem; padding-top: 1rem; border-top: 1px solid var(--border); }
  .result.none { font-size: 0.92rem; margin-bottom: 0; }
  .chain-top { display: flex; align-items: baseline; gap: 1rem; flex-wrap: wrap; }
  .chain-top p { font-size: 0.95rem; margin: 0; }
  .chain-top .link-btn { margin-left: auto; }
  .chain { list-style: none; margin: 0.4rem 0 0; padding: 0.6rem 0; display: flex; align-items: flex-start; justify-content: center; overflow-x: auto; }
  .chain .step { flex: none; }
  .chain .step button { display: flex; flex-direction: column; align-items: center; text-align: center; width: 116px; padding: 0.4rem 0.2rem; border: 0; border-radius: var(--radius); background: none; color: var(--ink); font-size: 0.78rem; line-height: 1.25; transition: background-color 0.15s; }
  .chain .step button:hover, .chain .step button:focus-visible { background: color-mix(in srgb, var(--accent) 10%, transparent); outline: none; }
  .chain .face { width: 56px; height: 56px; border-radius: 50%; object-fit: cover; border: 1.5px solid var(--accent); margin: 14px 0 0.35rem; display: grid; place-items: center; color: var(--ink-muted); font-family: var(--font-display); }
  .chain .po-wrap { position: relative; margin-bottom: 0.35rem; }
  .chain .po-wrap img, .chain .po-ph { display: block; width: 56px; height: 84px; border-radius: 3px; object-fit: cover; border: 1.5px solid var(--accent); background: var(--bg-raised); }
  .chain .num { position: absolute; top: -8px; left: -8px; width: 20px; height: 20px; border-radius: 50%; background: var(--accent); color: var(--bg); font: 700 0.68rem/16px var(--font-mono); border: 2px solid var(--bg-panel); }
  .chain .film .nm { font: 560 0.95rem/1.15 var(--font-display); }
  .chain .nm i { font: normal 0.72rem var(--font-ui); color: var(--ink-faint); }
  .chain .who { display: block; color: var(--ink-muted); font-size: 0.72rem; margin-top: 0.2rem; }
  .chain .rel { flex: 0 1 64px; min-width: 40px; padding-top: 48px; font: italic 0.8rem var(--font-display); color: var(--accent); text-align: center; }
  .chain .rel span { display: block; border-bottom: 1.5px solid var(--accent); padding-bottom: 0.15rem; white-space: nowrap; }

  @media (max-width: 760px) {
    .net-panel { padding: 0.8rem 0.6rem 0.6rem; }
    .net-search { flex: 1 1 100%; }
    .net-trail { margin-left: 0; }
    .net-legend .tip { display: none; }
    .ends { grid-template-columns: minmax(0, 1fr); }
    .swap { justify-self: center; margin: 0; }
    .chain { justify-content: flex-start; }
    .net-box { width: auto; right: 0.2rem; }
  }
  @media (max-width: 600px) {
    .net-stage { height: 520px; }
    .net-centre { top: calc(50% + 39px + 8px); }
    .net-centre b { font-size: 1.1rem; }
  }
  @media (prefers-reduced-motion: reduce) {
    .net-box { transition: none; }
  }
</style>

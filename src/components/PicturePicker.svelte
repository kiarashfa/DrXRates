<script>
  // The profile picture picker (a modal dialog, loaded on first open): one of
  // Dr. X's still frames, an uploaded photo, or a monogram. Frames and photos
  // go through a circular cropper (drag to place; slider, wheel or +/− to
  // zoom; arrow keys to move) and are stored as one 256 px image, so the save
  // file grows by a few KB, not by the photo.
  import { onMount, untrack } from 'svelte';
  import { loadFrameFilms } from '../lib/archive.js';
  import { stillUrl, withBase } from '../lib/util.js';
  import { updateProfile, initials, MONO_COLORS, PICTURE_SIZE } from '../lib/profile.js';
  import Avatar from './Avatar.svelte';

  let { profile, onclose } = $props();
  // The dialog starts from the profile as it was when it opened.
  const initial = untrack(() => profile);

  const CROP = 220; // the cropper's diameter in CSS px
  const MAX_ZOOM = 4;

  let dialog = $state(null);
  let tab = $state(initial?.mono ? 'mono' : initial?.source?.kind === 'upload' ? 'upload' : 'frames');
  let error = $state('');

  // Frames: Dr. X's films with frames, most voted first; then one film's frames.
  let films = $state.raw(null);
  let query = $state('');
  let film = $state(null);
  let chosen = $state(null); // { film, frame } or { kind: 'upload' }
  const shown = $derived.by(() => {
    if (!films) return [];
    const q = query.trim().toLowerCase();
    return (q ? films.filter((f) => f.title.toLowerCase().includes(q)) : films).slice(0, 36);
  });

  // Cropper state: the image, its fit scale (cover), zoom and offset in px.
  let src = $state('');
  let cross = $state(false); // frames come from another site: ask for CORS so the canvas can read them
  let img = $state(null);
  let natural = $state(null); // { w, h }
  let zoom = $state(1);
  let x = $state(0);
  let y = $state(0);
  let preview = $state(null);
  let bytes = $state(0);

  const base = $derived(natural ? Math.max(CROP / natural.w, CROP / natural.h) : 1);
  function clamp() {
    if (!natural) return;
    const k = base * zoom;
    const mx = Math.max(0, (natural.w * k - CROP) / 2);
    const my = Math.max(0, (natural.h * k - CROP) / 2);
    x = Math.min(mx, Math.max(-mx, x));
    y = Math.min(my, Math.max(-my, y));
  }
  const transform = $derived(natural ? `translate(${x - (natural.w * base * zoom) / 2}px, ${y - (natural.h * base * zoom) / 2}px) scale(${base * zoom})` : '');

  // Mono
  let letters = $state(initial?.mono?.letters ?? (initials(initial?.name) || ''));
  let color = $state(initial?.mono?.color ?? 'accent');

  onMount(() => {
    dialog.showModal();
    loadFrameFilms()
      .then((list) => (films = [...list].sort((a, b) => b.votes - a.votes)))
      .catch(() => (error = "Dr. X's frames couldn't load. Check the connection and try again."));
    const source = initial?.source;
    if (source?.kind === 'frame') pickFrame(source.film, source.frame);
  });

  function close() {
    dialog?.close();
  }

  function openFilm(f) {
    film = f;
  }
  function pickFrame(id, frame) {
    error = '';
    chosen = { film: id, frame };
    load(stillUrl(id, frame), true);
  }
  function load(url, crossOrigin) {
    natural = null;
    preview = null;
    zoom = 1;
    x = y = 0;
    cross = crossOrigin;
    src = url;
  }
  function onLoad() {
    natural = { w: img.naturalWidth, h: img.naturalHeight };
    clamp();
    schedulePreview();
  }
  function onError() {
    natural = null;
    error = chosen?.kind === 'upload' ? "This browser can't read that file. Try a JPEG, PNG or WebP." : "That frame couldn't load.";
  }

  function onFile(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      error = 'That is not an image file.';
      return;
    }
    error = '';
    chosen = { kind: 'upload' };
    if (src.startsWith('blob:')) URL.revokeObjectURL(src);
    load(URL.createObjectURL(file), false);
  }

  // Dragging and zooming.
  let drag = null;
  function down(e) {
    if (!natural) return;
    drag = { x: e.clientX - x, y: e.clientY - y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e) {
    if (!drag) return;
    x = e.clientX - drag.x;
    y = e.clientY - drag.y;
    clamp();
  }
  function up() {
    if (!drag) return;
    drag = null;
    schedulePreview();
  }
  function setZoom(z) {
    zoom = Math.min(MAX_ZOOM, Math.max(1, z));
    clamp();
    schedulePreview();
  }
  function wheel(e) {
    if (!natural) return;
    e.preventDefault();
    setZoom(zoom * (e.deltaY < 0 ? 1.08 : 0.93));
  }
  function key(e) {
    if (!natural) return;
    const step = e.shiftKey ? 20 : 6;
    const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[e.key]) {
      e.preventDefault();
      x += moves[e.key][0];
      y += moves[e.key][1];
      clamp();
      schedulePreview();
    } else if (e.key === '+' || e.key === '=') setZoom(zoom * 1.1);
    else if (e.key === '-') setZoom(zoom / 1.1);
  }

  // The stored image: what the circle shows, at PICTURE_SIZE, as WebP where
  // the browser can encode it (else JPEG).
  function render() {
    const c = document.createElement('canvas');
    c.width = c.height = PICTURE_SIZE;
    const g = c.getContext('2d');
    const r = PICTURE_SIZE / CROP;
    const k = base * zoom * r;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, PICTURE_SIZE / 2 + x * r - (natural.w * k) / 2, PICTURE_SIZE / 2 + y * r - (natural.h * k) / 2, natural.w * k, natural.h * k);
    const webp = c.toDataURL('image/webp', 0.82);
    return webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/jpeg', 0.85);
  }
  let timer;
  function schedulePreview() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!natural) return;
      try {
        preview = render();
        bytes = Math.round((preview.length * 3) / 4 / 1024);
      } catch {
        preview = null;
        error = "This frame can't be cut here (its server doesn't allow it).";
      }
    }, 120);
  }

  const monoOk = $derived(letters.trim().length > 0);
  const previewProfile = $derived(
    tab === 'mono' ? (monoOk ? { mono: { letters: letters.trim().toUpperCase(), color } } : null) : preview ? { picture: preview } : null
  );
  const canSave = $derived(tab === 'mono' ? monoOk : !!preview);

  function save() {
    if (!canSave) return;
    if (tab === 'mono') updateProfile({ picture: null, mono: { letters: letters.trim().toUpperCase(), color }, source: null });
    else updateProfile({ picture: preview, mono: null, source: chosen?.kind === 'upload' ? { kind: 'upload' } : { kind: 'frame', ...chosen } });
    close();
  }
  function remove() {
    updateProfile({ picture: null, mono: null, source: null });
    close();
  }
</script>

<dialog class="pp" bind:this={dialog} onclose={() => onclose?.()} aria-labelledby="pp-title" data-testid="picture-picker">
  <header class="pp-h">
    <h2 id="pp-title">Your picture</h2>
    <div class="pp-tabs" role="tablist">
      {#each [['frames', "Dr. X's frames"], ['upload', 'Upload'], ['mono', 'Monogram']] as [id, label]}
        <button type="button" role="tab" aria-selected={tab === id} onclick={() => ((tab = id), (error = ''))}>{label}</button>
      {/each}
    </div>
    <button type="button" class="icon-btn pp-x" aria-label="Close" onclick={close}>
      <svg class="icon" aria-hidden="true"><use href={withBase('/icons.svg#i-close')} /></svg>
    </button>
  </header>

  <div class="pp-b">
    <div class="pp-l">
      {#if tab === 'frames'}
        <input type="search" class="pp-q" placeholder="Find a film with frames" aria-label="Find a film" bind:value={query} oninput={() => (film = null)} />
        {#if film}
          <p class="pp-crumb"><button type="button" onclick={() => (film = null)}>All films</button><span aria-hidden="true">/</span>{film.title}{film.year ? ` (${film.year})` : ''}</p>
          <div class="pp-grid">
            {#each Array.from({ length: film.frames }, (_, i) => i + 1) as n (n)}
              <button type="button" aria-label={`Frame ${n}`} aria-pressed={chosen?.film === film.id && chosen?.frame === n} onclick={() => pickFrame(film.id, n)}>
                <img src={stillUrl(film.id, n, 'thumb')} alt="" loading="lazy" decoding="async" width="320" height="180" />
              </button>
            {/each}
          </div>
        {:else if films}
          <div class="pp-grid">
            {#each shown as f (f.id)}
              <button type="button" onclick={() => openFilm(f)}>
                <img src={stillUrl(f.id, 1, 'thumb')} alt="" loading="lazy" decoding="async" width="320" height="180" />
                <span>{f.title} · {f.frames}</span>
              </button>
            {:else}
              <p class="muted small">No film with frames matches “{query.trim()}”.</p>
            {/each}
          </div>
        {:else if !error}
          <p class="muted small">Loading Dr. X's frames…</p>
        {/if}
      {:else if tab === 'upload'}
        <label class="pp-drop" ondragover={(e) => e.preventDefault()} ondrop={(e) => (e.preventDefault(), onFile(e.dataTransfer?.files?.[0]))}>
          <svg class="icon" aria-hidden="true"><use href={withBase('/icons.svg#i-upload')} /></svg>
          <span>Drop a photo here, or <b>choose a file</b></span>
          <span class="small faint">It is cut to a circle and shrunk to {PICTURE_SIZE} px, so it stays small in your save file. It never leaves this browser unless you save to your own cloud.</span>
          <input type="file" accept="image/*" class="visually-hidden" onchange={(e) => onFile(e.currentTarget.files?.[0])} />
        </label>
      {:else}
        <label class="pp-field">Letters
          <input type="text" maxlength="2" bind:value={letters} class="pp-letters" autocomplete="off" spellcheck="false" />
        </label>
        <p class="pp-field" id="pp-colour">Colour</p>
        <div class="pp-swatches" role="radiogroup" aria-labelledby="pp-colour">
          {#each MONO_COLORS as c}
            <button type="button" role="radio" aria-checked={color === c} aria-label={c} onclick={() => (color = c)}>
              <span class="avatar" data-kind="mono" data-mono={c} style="--av:32px"></span>
            </button>
          {/each}
        </div>
      {/if}
      {#if error}<p class="pp-error" role="alert">{error}</p>{/if}
    </div>

    <div class="pp-r">
      {#if tab === 'mono'}
        <Avatar profile={previewProfile} size={CROP} class="pp-big" />
      {:else}
        <div
          class="pp-crop"
          class:empty={!natural}
          style={`--d:${CROP}px`}
          role="slider"
          tabindex="0"
          aria-label="Picture position: drag, or use the arrow keys; + and − zoom"
          aria-valuemin="1"
          aria-valuemax={MAX_ZOOM}
          aria-valuenow={Math.round(zoom * 100) / 100}
          onpointerdown={down}
          onpointermove={move}
          onpointerup={up}
          onpointercancel={up}
          onwheel={wheel}
          onkeydown={key}
        >
          {#if src}{#key src}<img bind:this={img} crossorigin={cross ? 'anonymous' : undefined} {src} alt="" style={`transform:${transform}`} onload={onLoad} onerror={onError} draggable="false" />{/key}{/if}
          {#if !natural}<span class="pp-hint">{tab === 'upload' ? 'Your photo appears here' : 'Pick a frame'}</span>{/if}
        </div>
        <label class="pp-zoom"><span aria-hidden="true">−</span>
          <input type="range" min="1" max={MAX_ZOOM} step="0.01" value={zoom} oninput={(e) => setZoom(Number(e.currentTarget.value))} aria-label="Zoom" disabled={!natural} />
          <span aria-hidden="true">+</span></label>
      {/if}
      <div class="pp-previews">
        <Avatar profile={previewProfile} size={34} />
        <Avatar profile={previewProfile} size={23} />
        <span class="small faint">{tab === 'mono' ? 'no image stored' : preview ? `${bytes} KB` : ''}</span>
      </div>
    </div>
  </div>

  <footer class="pp-f">
    <span class="small faint pp-note">Kept in this browser and in your save file.</span>
    {#if profile?.picture || profile?.mono}<button type="button" class="btn" onclick={remove}>Remove picture</button>{/if}
    <button type="button" class="btn primary" disabled={!canSave} onclick={save} data-testid="use-picture">Use this picture</button>
  </footer>
</dialog>

<style>
  .pp { width: min(780px, calc(100vw - 2rem)); max-height: calc(100dvh - 2rem); padding: 0; overflow: hidden; display: flex; flex-direction: column;
    background: var(--bg-panel); color: var(--ink); border: 1px solid var(--border-strong); border-radius: 10px; box-shadow: 0 30px 70px -20px rgb(0 0 0 / 0.65); }
  .pp:not([open]) { display: none; }
  .pp::backdrop { background: rgb(0 0 0 / 0.55); }
  .pp-h { display: flex; flex-wrap: wrap; align-items: center; gap: 0.8rem 1rem; padding: 1rem 1.2rem 0.8rem; border-bottom: 1px solid var(--border); }
  .pp-h h2 { margin: 0; font-size: 1.35rem; }
  .pp-x { margin-left: auto; }
  .pp-tabs { display: inline-flex; padding: 2px; border: 1px solid var(--border-strong); border-radius: 999px; }
  .pp-tabs button { padding: 0.3em 0.95em; border: 0; border-radius: 999px; background: none; color: var(--ink-muted); font-size: 0.82rem; }
  .pp-tabs button[aria-selected='true'] { background: var(--accent); color: var(--bg); font-weight: 600; }
  .pp-b { display: grid; grid-template-columns: minmax(0, 1fr) 270px; min-height: 0; flex: 1; }
  .pp-l { padding: 1rem 1.2rem; overflow: auto; min-height: 360px; max-height: 480px; border-right: 1px solid var(--border); }
  .pp-r { display: flex; flex-direction: column; align-items: center; gap: 0.9rem; padding: 1.3rem 1rem; background: color-mix(in srgb, var(--bg) 40%, var(--bg-panel)); }
  .pp-q, .pp-letters { width: 100%; padding: 0.45em 0.75em; border: 1px solid var(--border-strong); border-radius: var(--radius); background: var(--bg-raised); color: var(--ink); font: inherit; font-size: 0.88rem; }
  .pp-letters { width: 5em; margin-top: 0.3rem; font-family: var(--font-display); font-size: 1.25rem; font-style: italic; text-transform: uppercase; }
  .pp-crumb { display: flex; align-items: center; gap: 0.5rem; margin: 0.8rem 0 0; font-size: 0.84rem; }
  .pp-crumb button { padding: 0; border: 0; background: none; color: var(--accent); font-size: 0.84rem; }
  .pp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 0.55rem; margin-top: 0.8rem; }
  .pp-grid button { position: relative; aspect-ratio: 16 / 9; padding: 0; overflow: hidden; border: 1px solid var(--border); border-radius: 4px; background: var(--bg-raised); }
  .pp-grid img { width: 100%; height: 100%; object-fit: cover; }
  .pp-grid span { position: absolute; left: 0; right: 0; bottom: 0; padding: 0.9rem 0.4rem 0.25rem; overflow: hidden; color: #f2ede3; font-size: 0.68rem; text-align: left; text-overflow: ellipsis; white-space: nowrap; background: linear-gradient(transparent, rgb(0 0 0 / 0.82)); }
  .pp-grid button:hover, .pp-grid button:focus-visible, .pp-grid button[aria-pressed='true'] { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); outline: none; }
  .pp-drop { display: grid; place-items: center; gap: 0.6rem; padding: 2.4rem 1rem; text-align: center; border: 1.5px dashed var(--border-strong); border-radius: 8px; cursor: pointer; }
  .pp-drop:hover, .pp-drop:focus-within { border-color: var(--accent); }
  .pp-drop .icon { width: 30px; height: 30px; color: var(--ink-faint); }
  .pp-drop b { color: var(--accent); }
  .pp-field { display: block; margin: 0 0 0.4rem; color: var(--ink-muted); font-size: 0.84rem; }
  .pp-field + .pp-field { margin-top: 1.1rem; }
  .pp-swatches { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  .pp-swatches button { padding: 2px; border: 2px solid transparent; border-radius: 50%; background: none; }
  .pp-swatches button[aria-checked='true'] { border-color: var(--ink); }
  .pp-error { margin: 0.9rem 0 0; color: var(--form-c); font-size: 0.84rem; }
  .pp-crop { position: relative; width: var(--d); height: var(--d); flex: none; overflow: hidden; border-radius: 50%; background: #111; cursor: grab; touch-action: none;
    box-shadow: 0 0 0 3px var(--bg), 0 0 0 4px var(--accent); }
  .pp-crop:active { cursor: grabbing; }
  .pp-crop:focus-visible { outline: 2px solid var(--accent); outline-offset: 6px; }
  .pp-crop.empty { display: grid; place-items: center; cursor: default; background: var(--bg-raised); }
  .pp-crop img { position: absolute; left: 50%; top: 50%; max-width: none; transform-origin: 0 0; user-select: none; pointer-events: none; }
  .pp-hint { color: var(--ink-faint); font-size: 0.8rem; }
  .pp-r :global(.pp-big) { box-shadow: 0 0 0 3px var(--bg), 0 0 0 4px var(--accent); }
  .pp-zoom { display: flex; align-items: center; gap: 0.5rem; width: 100%; color: var(--ink-muted); font-size: 0.9rem; }
  .pp-zoom input { flex: 1; accent-color: var(--accent); }
  .pp-previews { display: flex; align-items: flex-end; gap: 0.7rem; min-height: 34px; }
  .pp-f { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 0.6rem; padding: 0.8rem 1.2rem; border-top: 1px solid var(--border); }
  .pp-note { margin-right: auto; }
  .btn:disabled { opacity: 0.5; cursor: default; }
  @media (max-width: 700px) {
    .pp-b { grid-template-columns: 1fr; overflow: auto; }
    .pp-l { min-height: 0; max-height: none; border-right: 0; border-bottom: 1px solid var(--border); }
    .pp-l:has(.pp-grid) { max-height: 34dvh; }
    .pp-r { order: -1; padding: 1rem; }
  }
</style>

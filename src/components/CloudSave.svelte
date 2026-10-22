<script module>
  // Finishing a Dropbox round trip and the first quiet sync happen once per
  // page view, whichever variant mounts first.
  let booted = false;
</script>

<script>
  // "Your save" on the profile page: the visitor's own cloud copy (Dropbox or
  // Google Drive, see cloud.js), the save file, and signing out of this
  // browser. variant 'doors' is the welcome screen's short version: open a
  // save from either cloud or from a file.
  import { onMount } from 'svelte';
  import { exportBackup, importBackupFile, clearBackupData } from '../lib/backup.js';
  import { AVAILABLE, connectGoogle, connectDropbox, finishDropbox, disconnect, sync, loadGoogle, cloudStatus } from '../lib/cloud.js';
  import { CLOUD_EVENT, CLOUD_KEY, PROVIDERS, cloudState, unsaved, ago } from '../lib/cloud-state.js';
  import { CHANGED_EVENT } from '../lib/store.js';
  import { withBase } from '../lib/util.js';

  let { variant = 'panel' } = $props();

  let cloud = $state(cloudState());
  let status = $state(cloudStatus());
  let pending = $state(unsaved());
  let notice = $state('');
  let noticeKind = $state('');
  let busy = $state(null); // provider id being connected
  let confirming = $state(false);
  let fileInput = $state(null);
  let now = $state(Date.now());

  const icon = (name) => withBase(`/icons.svg#i-${name}`);
  const order = ['dropbox', 'google'].filter((p) => AVAILABLE[p]);

  function refresh(e) {
    cloud = cloudState();
    pending = unsaved(cloud);
    if (e?.detail) status = e.detail;
    now = Date.now();
  }
  function say(text, kind = '') {
    notice = text;
    noticeKind = kind;
  }

  // "Brought in 42 ratings, 17 watchlist films and your picture."
  function summary(sections, from) {
    const n = (r) => r?.imported ?? 0;
    const plural = (k, one, many) => `${k} ${k === 1 ? one : many}`;
    const parts = [
      n(sections.ratings) && plural(n(sections.ratings), 'rating', 'ratings'),
      n(sections.watchlist) && plural(n(sections.watchlist), 'watchlist film', 'watchlist films'),
      n(sections.knockout) && plural(n(sections.knockout), 'Knockout result', 'Knockout results'),
      n(sections.frames) && plural(n(sections.frames), 'Name the Frame result', 'Name the Frame results'),
      n(sections.profile) && 'your profile',
    ].filter(Boolean);
    if (!parts.length) return `Everything from ${from} was already here.`;
    const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0];
    return `Brought in ${list} from ${from}.`;
  }

  async function run(provider, task) {
    busy = provider;
    say('');
    try {
      const result = await task();
      const s = cloudState();
      if (result?.imported) say(summary(result.imported, PROVIDERS[s?.provider ?? provider]));
      else if (s) say(`Saved to ${PROVIDERS[s.provider]}.`);
    } catch (err) {
      say(err.message ?? 'That did not work. Try again.', 'error');
    } finally {
      busy = null;
      refresh();
    }
  }

  function connect(provider) {
    if (provider === 'google') return run('google', connectGoogle);
    busy = 'dropbox';
    say('Opening Dropbox…');
    connectDropbox().catch((err) => {
      busy = null;
      say(err.message, 'error');
    });
  }
  const saveNow = () => run(cloud.provider, () => sync({ interactive: true }));
  async function unlink() {
    const label = PROVIDERS[cloud.provider];
    await disconnect();
    refresh();
    say(`Disconnected from ${label}. Your save there stays until you delete it.`);
  }

  async function onImport(e) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    try {
      say(summary((await importBackupFile(file)).sections, 'the file'));
    } catch (err) {
      say(`Import failed: ${err.message}`, 'error');
    }
  }

  async function signOut() {
    if (cloud && unsaved(cloud)) {
      try {
        await sync({ interactive: true });
      } catch (err) {
        confirming = false;
        return say(`Couldn't save to ${PROVIDERS[cloud.provider]} first, so nothing was removed: ${err.message}`, 'error');
      }
    }
    await disconnect();
    clearBackupData();
    location.reload();
  }

  const warmGoogle = () => AVAILABLE.google && loadGoogle().catch(() => {});

  onMount(() => {
    window.addEventListener(CLOUD_EVENT, refresh);
    window.addEventListener(CHANGED_EVENT, refresh);
    const onStorage = (e) => (e.key === CLOUD_KEY || e.key == null) && refresh();
    window.addEventListener('storage', onStorage);
    const tick = setInterval(() => (now = Date.now()), 30_000);
    if (!booted) {
      booted = true;
      const back = new URLSearchParams(location.search).has('state');
      if (back) run('dropbox', finishDropbox);
      // A save from another device shows up when this page opens.
      else if (cloud) sync().then((r) => r?.imported && say(summary(r.imported, PROVIDERS[cloud.provider])), () => {});
    }
    return () => {
      window.removeEventListener(CLOUD_EVENT, refresh);
      window.removeEventListener(CHANGED_EVENT, refresh);
      window.removeEventListener('storage', onStorage);
      clearInterval(tick);
    };
  });

  function stateLine(s) {
    if (status.state === 'saving') return { kind: 'pending', text: 'Saving…' };
    if (status.state === 'error') return { kind: 'error', text: status.message ?? "Couldn't save" };
    if (status.state === 'auth') return { kind: 'pending', text: `${status.message ?? 'Sign in again to save.'}` };
    if (pending) return { kind: 'pending', text: 'Changes not saved yet' };
    return { kind: '', text: s.savedAt ? `Saved ${ago(s.savedAt, now)}` : 'Connected' };
  }
</script>

{#snippet logo(p)}
  {#if p === 'dropbox'}
    <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#0061fe" d="M7 3 2 6.2l5 3.2 5-3.2zm10 0-5 3.2 5 3.2 5-3.2zM2 12.6l5 3.2 5-3.2-5-3.2zm15-3.2-5 3.2 5 3.2 5-3.2zM7 17l5 3.2 5-3.2-5-3.2z" /></svg>
  {:else}
    <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#0f9d58" d="M8.2 3h7.6l6.2 10.6h-7.6z" /><path fill="#ffcd40" d="M8.2 3 2 13.6l3.8 6.6L12 9.6z" /><path fill="#4285f4" d="M22 13.6H9.6l-3.8 6.6h12.4z" /></svg>
  {/if}
{/snippet}

<input type="file" accept=".json,application/json" class="visually-hidden" tabindex="-1" bind:this={fileInput} onchange={onImport} data-testid="import-input" />

{#if variant === 'doors'}
  <div class="doors-acts">
    {#each order as p}
      <button type="button" class="btn" disabled={busy != null} onpointerenter={p === 'google' ? warmGoogle : undefined} onfocus={p === 'google' ? warmGoogle : undefined} onclick={() => connect(p)}>
        <span class="mark">{@render logo(p)}</span>{busy === p ? 'Opening…' : `Open from ${PROVIDERS[p]}`}
      </button>
    {/each}
    <button type="button" class="btn" onclick={() => fileInput?.click()} data-testid="import-btn">
      <svg class="icon" aria-hidden="true"><use href={icon('upload')} /></svg>Import a save file
    </button>
  </div>
  {#if notice}<p class="notice small" class:error={noticeKind === 'error'} role="status">{notice}</p>{/if}
{:else}
  <section class="panel save" id="save" aria-labelledby="save-h" data-testid="cloud-save">
    <div class="save-h">
      <svg class="icon" aria-hidden="true"><use href={icon('cloud')} /></svg>
      <h2 id="save-h">Your save</h2>
    </div>
    <p class="small muted intro">
      Everything on this page lives in this browser. Keep a copy in your own Dropbox or Google Drive, or as a file, and open it on any
      other device to carry on where you left off. It goes straight from this browser to your account, nowhere else.
    </p>

    <div class="rows">
      {#each order as p}
        {@const on = cloud?.provider === p}
        <div class="row" class:on data-testid={`cloud-${p}`}>
          <span class="mark big">{@render logo(p)}</span>
          <span class="what">
            <span class="t">{PROVIDERS[p]}{#if on && cloud.account?.email}<span class="faint small"> · {cloud.account.email}</span>{/if}</span>
            {#if on}
              {@const line = stateLine(cloud)}
              <span class="cloud-state small" data-state={line.kind || undefined}>{line.text}</span>
            {:else}
              <span class="d">{p === 'google' ? "One file in Drive's hidden app folder, which only this site can open" : 'One file in the app’s own folder in your Dropbox'}</span>
            {/if}
          </span>
          <span class="acts">
            {#if on}
              <button type="button" class="btn" disabled={busy != null || status.state === 'saving'} onpointerenter={p === 'google' ? warmGoogle : undefined} onclick={saveNow} data-testid="save-now">Save now</button>
              <button type="button" class="btn quiet" disabled={busy != null} onclick={unlink}>Disconnect</button>
            {:else}
              <button type="button" class="btn" disabled={busy != null} onpointerenter={p === 'google' ? warmGoogle : undefined} onfocus={p === 'google' ? warmGoogle : undefined} onclick={() => connect(p)}>
                {busy === p ? 'Connecting…' : cloud ? 'Use instead' : 'Connect'}
              </button>
            {/if}
          </span>
        </div>
      {/each}
      <div class="row">
        <span class="mark big"><svg class="icon" aria-hidden="true"><use href={icon('key')} /></svg></span>
        <span class="what"><span class="t">Save file</span><span class="d">One JSON file with everything, your picture included</span></span>
        <span class="acts">
          <button type="button" class="btn" onclick={exportBackup} data-testid="export-btn"><svg class="icon" aria-hidden="true"><use href={icon('download')} /></svg>Export</button>
          <button type="button" class="btn" onclick={() => fileInput?.click()} data-testid="import-btn"><svg class="icon" aria-hidden="true"><use href={icon('upload')} /></svg>Import</button>
        </span>
      </div>
    </div>

    <p class="notice small" class:error={noticeKind === 'error'} role="status" aria-live="polite">{notice}</p>

    {#if confirming}
      <div class="confirm" role="alertdialog" aria-labelledby="so-h">
        <p id="so-h" class="small">
          This removes your ratings, watchlist, game results and profile from this browser.
          {cloud ? `Your save in ${PROVIDERS[cloud.provider]} stays; open it here again any time.` : 'Export your save file first if you want to keep them.'}
        </p>
        <span class="acts">
          <button type="button" class="btn danger" onclick={signOut} data-testid="sign-out-confirm">Remove from this browser</button>
          <button type="button" class="btn quiet" onclick={() => (confirming = false)}>Cancel</button>
        </span>
      </div>
    {:else}
      <p class="small faint out">
        Leaving a shared computer?
        <button type="button" class="link" onclick={() => (confirming = true)} data-testid="sign-out">Sign out of this browser</button>
        removes your data from it.
      </p>
    {/if}
  </section>
{/if}

<style>
  .save-h { display: flex; align-items: center; gap: 0.6rem; }
  .save-h .icon { color: var(--accent); }
  .save-h h2 { margin: 0; font-size: 1.35rem; }
  .intro { margin: 0.6rem 0 1rem; max-width: 46rem; }
  .rows { display: grid; gap: 0.6rem; }
  .row { display: grid; grid-template-columns: 38px minmax(0, 1fr) auto; gap: 0.85rem; align-items: center; padding: 0.7rem 0.8rem; border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg-raised); }
  .row.on { border-color: color-mix(in srgb, var(--accent) 55%, var(--border)); }
  .mark { display: inline-grid; place-items: center; width: 18px; height: 18px; flex: none; }
  .mark svg { width: 100%; height: 100%; }
  .mark.big { width: 38px; height: 38px; padding: 8px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-panel); color: var(--accent); }
  .what { display: flex; flex-direction: column; min-width: 0; }
  .t { font-size: 0.94rem; overflow-wrap: anywhere; }
  .d { color: var(--ink-muted); font-size: 0.78rem; }
  .acts { display: flex; flex-wrap: wrap; gap: 0.4rem; justify-content: flex-end; }
  .btn .icon { width: 15px; height: 15px; }
  .btn.quiet { background: transparent; }
  .btn.danger { border-color: var(--form-c); color: var(--form-c); }
  .btn:disabled { opacity: 0.55; cursor: default; }
  .notice { min-height: 1.4em; margin: 0.9rem 0 0; color: var(--accent); }
  .notice.error { color: var(--form-c); }
  .out { margin: 0.4rem 0 0; }
  .link { padding: 0; border: 0; background: none; color: var(--accent); font-size: inherit; text-decoration: underline; text-underline-offset: 2px; }
  .confirm { display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem 1rem; margin-top: 0.6rem; padding: 0.8rem 0.9rem; border: 1px solid color-mix(in srgb, var(--form-c) 45%, var(--border)); border-radius: var(--radius); background: var(--form-bg); }
  .confirm p { flex: 1 1 20rem; margin: 0; }
  .doors-acts { display: grid; gap: 0.5rem; margin-top: auto; }
  .doors-acts .btn { justify-content: center; }
  @media (max-width: 640px) {
    .row { grid-template-columns: 38px minmax(0, 1fr); }
    .row .acts { grid-column: 1 / -1; justify-content: flex-start; }
  }
</style>

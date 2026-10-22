<script>
  // The visitor's picture as Svelte renders it (same markup and CSS as the
  // header's [data-avatar] circles): a photo, a monogram, or the placeholder.
  import { withBase } from '../lib/util.js';

  let { profile = null, size = 34, class: cls = '' } = $props();
  const kind = $derived(profile?.picture ? 'picture' : profile?.mono ? 'mono' : undefined);
</script>

<span class={`avatar ${cls}`} style={`--av:${size}px`} data-kind={kind} data-mono={kind === 'mono' ? profile.mono.color : undefined}>
  <svg class="avatar-icon" aria-hidden="true"><use href={withBase('/icons.svg#i-user')} /></svg>
  {#if kind === 'picture'}
    <img class="avatar-img" src={profile.picture} alt="" width={size} height={size} />
  {:else if kind === 'mono'}
    <span class="avatar-mono">{profile.mono.letters}</span>
  {/if}
</span>

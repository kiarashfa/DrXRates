<script>
  let theme = $state('dark');

  $effect(() => {
    theme = document.documentElement.dataset.theme || 'dark';
  });

  const themes = [
    { id: 'light', label: 'Light' },
    { id: 'dark', label: 'Dark' },
    { id: 'matrix', label: 'Matrix' },
  ];

  function setTheme(id) {
    theme = id;
    document.documentElement.dataset.theme = id;
    window.__setFavicon?.(id);
    try {
      localStorage.setItem('cinema.theme', id);
    } catch {}
  }
</script>

<div class="seg" role="group" aria-label="Theme">
  {#each themes as t}
    <button class:active={theme === t.id} onclick={() => setTheme(t.id)} title={`${t.label} theme`}>
      {t.label}
    </button>
  {/each}
</div>

(() => {
  const key = 'where-is-my-time.theme.v1';
  const root = document.documentElement;
  const themeColor = document.querySelector('meta[name="theme-color"]');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  let transition;
  let toggle;

  function applyTheme(next) {
    root.dataset.theme = next;
    const dark = next === 'dark';
    themeColor.content = dark ? '#111214' : '#f7f8f5';
    if (toggle) toggle.setAttribute('aria-label', dark ? '切换浅色模式' : '切换深色模式');
  }

  function rememberTheme() {
    try { localStorage.setItem(key, theme); } catch {}
  }

  try {
    const saved = localStorage.getItem(key);
    if (saved === 'dark' || saved === 'light') theme = saved;
    else rememberTheme();
  } catch {}
  applyTheme(theme);

  document.addEventListener('DOMContentLoaded', () => {
    toggle = document.getElementById('themeToggle');
    applyTheme(theme);
    toggle.addEventListener('click', () => {
      theme = theme === 'dark' ? 'light' : 'dark';
      rememberTheme();

      if (transition) transition.skipTransition();
      if (!document.startViewTransition || reducedMotion.matches) {
        applyTheme(theme);
        return;
      }

      root.classList.add('theme-transition');

      const active = document.startViewTransition(() => applyTheme(theme));
      transition = active;
      const cleanUp = () => {
        if (transition !== active) return;
        transition = null;
        root.classList.remove('theme-transition');
      };
      active.ready.catch(() => {});
      active.finished.then(cleanUp, cleanUp);
    });
  }, {once:true});
})();

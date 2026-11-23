const siteMenu = (() => {
  const panel = byId('site-menu');
  const toggle = byId('site-menu-toggle');
  let returnFocus = true;

  function close(restore = true) {
    if (!panel.open) return;
    returnFocus = restore;
    panel.close();
    toggle.setAttribute('aria-expanded', 'false');
  }

  toggle.addEventListener('click', () => {
    if (panel.open) { close(); return; }
    returnFocus = true;
    panel.showModal();
    toggle.setAttribute('aria-expanded', 'true');
    (panel.querySelector('a[aria-current="page"]') ?? byId('site-menu-close')).focus();
  });
  byId('site-menu-close').addEventListener('click', () => close());
  panel.addEventListener('cancel', event => { event.preventDefault(); close(); });
  panel.addEventListener('close', () => {
    if (panel.open) return;
    toggle.setAttribute('aria-expanded', 'false');
    if (returnFocus) toggle.focus({ preventScroll: true });
  });
  let backdropDown = false;
  panel.addEventListener('pointerdown', event => { backdropDown = event.target === panel; });
  panel.addEventListener('click', event => {
    if (event.target === panel && backdropDown) close();
    backdropDown = false;
  });

  function mark(route) {
    const path = route.path;
    const current = route.reviewId ? 'review'
      : route.game ? 'game-review'
      : route.practice || path === 'memorize' ? 'memorize'
      : route.opening ? 'openings'
      : route.lesson || path === 'intro-summary' ? 'intro'
      : path === 'result' || (route.mode && route.mode !== 'opening') ? 'mode'
      : path === 'opening-result' ? 'opening-quiz'
      : path === 'daily' ? 'dashboard'
      : ['learn', 'beginner', 'improve', 'journal'].includes(path) ? 'home' : path;
    for (const link of panel.querySelectorAll('a')) {
      if (link.hash === '#' + current) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
  }

  return { close, mark, contains: node => panel.contains(node) };
})();

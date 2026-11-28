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
    panel.scrollTop = 0;
    byId('site-menu-close').focus({ preventScroll: true });
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
    const current = route.termId ? 'glossary'
      : (route.cpuOpening || route.cpuSetup) ? 'cpu'
      : route.personalId ? 'personal'
      : route.reviewId ? 'review'
      : route.game ? 'game-review'
      : route.practice || path === 'memorize' ? 'memorize'
      : route.opening ? 'openings'
      : route.lesson || path === 'intro-summary' ? 'intro'
      : path === 'result' || (route.mode && route.mode !== 'opening') ? 'mode'
      : path === 'opening-result' ? 'opening-quiz'
      : ['beginner', 'improve', 'journal'].includes(path) ? 'learn' : path;
    for (const link of panel.querySelectorAll('a')) {
      if (link.hash === '#' + current) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
  }

  function markTab(screen, path) {
    const tab = path === 'home' || !path ? 'home'
      : ['cpu', 'play'].includes(screen) ? 'play'
      : screen === 'dashboard' || path === 'welcome' ? 'home'
      : path.startsWith('diagnosis/') || ['growth', 'profile', 'goals', 'progress', 'your-style', 'game-player', 'game-review', 'game-library', 'pgn-import', 'journal'].includes(screen) ? 'growth'
      : ['daily', 'review', 'personal', 'personal-play', 'general', 'general-play'].includes(screen) ? 'learn'
      : ['learn', 'beginner', 'improve', 'intro', 'intro-lesson', 'intro-summary', 'openings',
        'opening-study', 'opening-practice'].includes(screen) || path === 'learn' ? 'learn'
      : 'discover';
    for (const link of document.querySelectorAll('.app-tabs a')) {
      if (link.hash === '#' + tab) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
  }

  return { close, mark, markTab };
})();

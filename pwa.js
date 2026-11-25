(() => {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  const help = document.getElementById('rookori-install');
  const button = document.getElementById('install-button');
  const notice = document.getElementById('rookori-update');
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  const android = /Android/.test(navigator.userAgent);
  document.getElementById('install-ios').hidden = !ios;
  document.getElementById('install-android').hidden = !android;
  if (!standalone && (ios || android)) help.hidden = false;

  let install;
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    if (standalone) return;
    install = event;
    button.hidden = help.hidden = false;
  });
  button.addEventListener('click', async () => {
    const prompt = install;
    install = null;
    button.hidden = true;
    if (!prompt) return;
    try {
      await prompt.prompt();
      if ((await prompt.userChoice).outcome === 'accepted') help.hidden = true;
    } catch { /* The browser menu remains available. */ }
  });
  window.addEventListener('appinstalled', () => { help.hidden = true; install = null; });

  // Let the browser activate the new version when the last old tab is closed.
  // This avoids reloading or replacing scripts in active games in any tab.
  const worker = new URL('sw.js', document.currentScript.src);
  navigator.serviceWorker.register(worker, { updateViaCache: 'none' }).then(registration => {
    const show = () => { notice.hidden = !registration.waiting || !navigator.serviceWorker.controller; };
    const watch = () => registration.installing?.addEventListener('statechange', show);
    watch();
    show();
    registration.addEventListener('updatefound', watch);
    navigator.serviceWorker.addEventListener('controllerchange', show);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) registration.update().catch(() => {});
    });
  }).catch(() => { /* The site can still run without an offline shell. */ });
})();

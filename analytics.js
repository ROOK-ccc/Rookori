function createRookoriAnalytics(win, doc) {
  const noop = { screen() {}, event() {} };
  const address = doc.querySelector('meta[name="rookori-ga4-site-url"]')?.content
    || doc.querySelector('link[rel="canonical"]')?.href;
  const id = doc.querySelector('meta[name="rookori-ga4-measurement-id"]')?.content;
  if (!address || !/^G-[A-Z0-9]+$/.test(id ?? '')) return noop;
  const site = new URL(address);
  // A locally opened file, staging copy or already-tagged page must not start this tag.
  if (win.location.origin !== site.origin
    || ![site.pathname, site.pathname + 'index.html'].includes(win.location.pathname)
    || typeof win.gtag === 'function'
    || doc.querySelector('script[src*="googletagmanager.com/gtag/js"], script[src*="googletagmanager.com/gtm.js"]')) return noop;

  const titles = {
    roadmap: 'Rookoriのこれまでと、これから', updates: 'アップデート履歴',
    home: 'ホーム', beginner: '初心者ガイド', improve: '学習ガイド', journal: 'チェス日記帳',
    openings: 'オープニング一覧', memorize: 'オープニング暗記一覧', 'opening-study': 'オープニング学習',
    'opening-practice': '暗記練習', mode: '診断の種類', quiz: '16タイプ診断',
    'opening-quiz': 'オープニング診断', result: '16タイプ診断の結果', 'opening-result': 'オープニング診断の結果',
    intro: 'はじめてのチェス', 'intro-lesson': '入門レッスン', 'intro-summary': '入門の結果',
    dashboard: '今日の学習', daily: '今日の練習問題', review: '復習', progress: '上達記録',
    'game-review': '対局の取り込み', 'game-player': '対局再生', 'game-library': '対局履歴',
    external: '外部サイトとの連携', 'pgn-import': '棋譜の一括取り込み',
    personal: '個別練習問題', 'personal-play': '個別練習問題を解く', 'your-style': 'あなたの棋風',
    cpu: 'コンピューター対戦',
    backup: 'バックアップ', about: 'サイトについて', glossary: 'チェス用語集',
    privacy: 'アクセス解析とプライバシー', error: 'リンクのエラー', discover: '探す', 'learning-guide': '学習ガイド',
    general: '一般練習', 'general-play': '一般練習問題を解く',
  };
  const eventNames = new Set(['chess_type_start', 'chess_type_complete', 'opening_quiz_complete',
    'opening_view', 'opening_practice_start', 'opening_practice_complete', 'review_complete', 'dashboard_view', 'share',
    'personal_practice_generated', 'personal_practice_start', 'personal_practice_complete', 'personal_review_complete',
    'general_practice_start', 'general_practice_complete', 'daily_practice_complete', 'practice_recommendation_start',
    'game_review_complete']);
  const screenEvents = { quiz: 'chess_type_start', 'opening-study': 'opening_view', dashboard: 'dashboard_view' };
  const staticKind = doc.getElementById('static-learning')?.dataset?.kind;
  const campaign = {};
  const campaignOptions = {
    source: ['instagram', 'x', 'youtube', 'discord', 'newsletter'],
    medium: ['social', 'referral', 'email'],
    name: ['rookori', 'rookori_launch', 'opening_learning'],
  };
  const query = new URL(win.location.href || address).searchParams;
  for (const [field, values] of Object.entries(campaignOptions)) {
    const value = query.get('utm_' + (field === 'name' ? 'campaign' : field));
    if (values.includes(value)) campaign['campaign_' + field] = value;
  }
  const consentKey = 'rookori.analytics-consent.v1';
  const disableKey = `ga-disable-${id}`;
  const notice = doc.getElementById('analytics-notice');
  const settings = doc.getElementById('analytics-settings');
  const status = doc.getElementById('analytics-status');
  const buttons = doc.querySelectorAll('[data-analytics-choice]');
  let choice = null;
  try { choice = win.localStorage.getItem(consentKey); } catch { /* The choice can still last for this visit. */ }
  if (choice !== 'granted' && choice !== 'denied') choice = null;
  let gtag;
  let current;
  let last;

  const consentOptions = value => ({
    analytics_storage: value, ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
  });

  function updateControls() {
    notice.hidden = choice !== null;
    settings.hidden = false;
    status.textContent = choice === 'granted' ? 'アクセス解析に同意しています。'
      : choice === 'denied' ? 'アクセス解析に同意していません。' : 'アクセス解析は同意するまで無効です。';
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.analyticsChoice === choice));
  }

  function start() {
    win[disableKey] = false;
    if (gtag) {
      gtag('consent', 'update', consentOptions('granted'));
      return;
    }
    win.dataLayer ??= [];
    gtag = win.gtag = function () { win.dataLayer.push(arguments); };
    gtag('consent', 'default', consentOptions('granted'));
    gtag('js', new Date());
    gtag('config', id, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_domain: 'none',
      cookie_path: staticKind ? '/' : site.pathname,
      page_location: site.href,
      page_referrer: site.href,
      page_title: 'Rookori',
      ...campaign,
    });
    const tag = doc.createElement('script');
    tag.async = true;
    tag.referrerPolicy = 'no-referrer';
    tag.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    doc.head.append(tag);
  }

  function event(name) {
    if (choice !== 'granted' || !current || !eventNames.has(name)) return;
    gtag('event', name, { page_location: current.location, page_title: current.title,
      page_referrer: current.referrer, send_to: id });
  }

  function track() {
    if (choice !== 'granted' || !current || current.key === last?.key) return;
    // Only fixed screen names reach Google. The routing key is used for local deduplication.
    current.referrer = last?.location ?? site.href;
    const context = {
      page_location: current.location,
      page_referrer: current.referrer,
      page_title: current.title,
    };
    gtag('set', context);
    gtag('event', 'page_view', { ...context, send_to: id });
    last = current;
    if (Object.hasOwn(screenEvents, current.name)) event(screenEvents[current.name]);
  }

  function changeChoice(value) {
    if (value === choice) return;
    choice = value;
    if (choice === 'granted') {
      start();
      track();
    } else {
      win[disableKey] = true;
      gtag?.('consent', 'update', consentOptions('denied'));
      last = null;
    }
    updateControls();
  }

  for (const button of buttons) {
    button.addEventListener('click', () => {
      const value = button.dataset.analyticsChoice;
      try { win.localStorage.setItem(consentKey, value); } catch { /* Keep the choice in memory. */ }
      changeChoice(value);
    });
  }
  win.addEventListener('storage', event => {
    if (event.key === consentKey || event.key === null) {
      changeChoice(event.newValue === 'granted' || event.newValue === 'denied' ? event.newValue : null);
    }
  });
  if (choice === 'granted') start();
  updateControls();

  const api = {
    screen(id, route) {
      const name = id === 'roadmap' && route === 'updates' ? 'updates'
        : id === 'quiz' && route === 'opening-quiz' ? 'opening-quiz'
        : id === 'openings' && route === 'memorize' ? 'memorize' : id;
      if (!Object.hasOwn(titles, name)) return;
      const next = {
        name,
        key: id === 'home' ? 'home' : `${name}:${route ?? ''}`,
        location: staticKind || name === 'home' ? site.href : new URL(`#${name}`, site).href,
        title: `Rookori | ${titles[name]}`,
      };
      if (next.key === current?.key) return;
      current = next;
      track();
    },
    event,
  };
  if (staticKind) api.screen(staticKind === 'opening' ? 'opening-study' : 'learning-guide', '');
  return api;
}

const rookoriAnalytics = createRookoriAnalytics(window, document);

function preserveRookoriCampaign(from, to) {
  const source = new URL(from);
  for (const field of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_id', 'utm_content', 'utm_term']) {
    const value = source.searchParams.get(field);
    if (value && !to.searchParams.has(field)) to.searchParams.set(field, value);
  }
  return to;
}

if (document.getElementById('static-learning')?.dataset?.kind) {
  for (const link of document.querySelectorAll('a[href^="/"]')) {
    const target = new URL(link.href);
    if (target.origin === window.location.origin) link.href = preserveRookoriCampaign(window.location.href, target).href;
  }
}

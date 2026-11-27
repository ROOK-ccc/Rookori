const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

const source = readFileSync(join(__dirname, 'analytics.js'), 'utf8');
const site = 'https://rook-ccc.github.io/Rookori/';
const id = 'G-TEST000000';
const consentKey = 'rookori.analytics-consent.v1';

test('練習イベントは同意後だけ送り、問題ID・棋譜・盤面を送らない', () => {
  const { analytics, window, choose } = setup();
  const names = ['personal_practice_generated', 'personal_practice_start', 'personal_practice_complete', 'personal_review_complete',
    'general_practice_start', 'general_practice_complete', 'daily_practice_complete', 'practice_recommendation_start', 'game_review_complete'];
  analytics.screen('general-play', 'general/ABC12/daily');
  for (const name of names) analytics.event(name);
  assert.equal(window.dataLayer, undefined);
  choose('granted');
  for (const name of names) analytics.event(name, { fen: 'example-private-fen', gameId: 'private-game' });
  const sent = window.dataLayer.filter(row => row[0] === 'event' && row[1] !== 'page_view');
  assert.deepEqual(Array.from(sent, row => row[1]), names);
  assert.doesNotMatch(JSON.stringify(window.dataLayer), /ABC12|example-private-fen|private-game/);
  choose('denied');
  analytics.event('game_review_complete');
  assert.equal(window.dataLayer.filter(row => row[0] === 'event').length, names.length + 1);
});

function setup({ idValue = id, url = site, hasTag = false, consent = null, canonical = site, analyticsAddress } = {}) {
  const scripts = [];
  const nodes = new Map();
  const handlers = {};
  const storage = new Map([['chesspath.learning.v1', 'existing']]);
  if (consent) storage.set(consentKey, consent);
  const window = {
    location: new URL(url),
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    addEventListener: (event, listener) => { handlers[event] = listener; },
  };
  const choices = new Map(['granted', 'denied'].map(choice => {
    const button = {
      dataset: { analyticsChoice: choice }, setAttribute() {},
      addEventListener: (event, listener) => { button[event] = listener; },
    };
    return [choice, button];
  }));
  const document = {
    querySelector: selector => selector.includes('canonical') ? { href: canonical }
      : selector.includes('rookori-ga4-site-url') ? { content: analyticsAddress }
      : selector.startsWith('meta') ? { content: idValue } : hasTag ? {} : null,
    querySelectorAll: () => choices.values(),
    getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, { hidden: true });
      return nodes.get(id);
    },
    createElement: () => ({}),
    head: { append: script => scripts.push(script) },
  };
  const analytics = runInNewContext(source + '\nrookoriAnalytics', { window, document, URL });
  return { analytics, scripts, window, storage, nodes,
    events: () => (window.dataLayer ?? []).filter(entry => entry[0] === 'event' && entry[1] === 'page_view').map(entry => entry[2]),
    choose: value => choices.get(value).click(),
    sync: value => handlers.storage({ key: consentKey, newValue: value }),
  };
}

test('学習イベントは同意後のみ送り、許可したキャンペーンと固定画面名だけを使う', () => {
  const { analytics, window, choose } = setup({
    url: site + '?utm_source=instagram&utm_medium=social&utm_campaign=person%40example.test',
  });
  analytics.screen('quiz', 'quiz-beginner');
  analytics.event('chess_type_complete');
  assert.equal(window.dataLayer, undefined);
  choose('granted');
  analytics.screen('quiz', 'quiz-beginner');
  analytics.event('chess_type_complete', { answer: 'secret' });
  analytics.event('person@example.test');
  assert.deepEqual(Array.from(window.dataLayer.filter(row => row[0] === 'event'), row => row[1]),
    ['page_view', 'chess_type_start', 'chess_type_complete']);
  const settings = window.dataLayer.find(row => row[0] === 'config')[2];
  assert.equal(settings.campaign_source, 'instagram');
  assert.equal(settings.campaign_medium, 'social');
  assert.equal(settings.campaign_name, undefined);
  assert.doesNotMatch(JSON.stringify(window.dataLayer), /secret|person(?:%40|@)example/);
});

test('移転元の計測は新canonicalと分け、同意した場合だけ旧サイトの固定URLを送る', () => {
  const { analytics, scripts, events, choose } = setup({ canonical: 'https://rookrori.com/', analyticsAddress: site });
  analytics.screen('backup', 'backup');
  assert.equal(scripts.length, 0);
  choose('granted');
  assert.equal(scripts.length, 1);
  assert.equal(events()[0].page_location, site + '#backup');
});

test('ロードマップと更新履歴を同意後に固定URLで各1回計測する', () => {
  const { analytics, events, choose } = setup();
  analytics.screen('roadmap', 'roadmap');
  assert.equal(events().length, 0);
  choose('granted');
  analytics.screen('roadmap', 'updates');
  analytics.screen('roadmap', 'updates');
  assert.deepEqual(Array.from(events(), event => event.page_location), [site + '#roadmap', site + '#updates']);
});

test('設定・同意がない場合、プレビュー、既存タグがある場合は Google タグを追加しない', () => {
  for (const options of [
    { idValue: '' }, { url: 'http://localhost:8000/Rookori/' }, { hasTag: true },
    { url: 'https://rook-ccc.github.io/other-project/' }, { consent: 'denied' }, {},
  ]) {
    const { analytics, scripts, window } = setup(options);
    analytics.screen('home', 'home');
    assert.equal(scripts.length, 0);
    assert.equal(window.dataLayer, undefined);
  }
});

test('同意後だけ手動ページビューを送り、URL・診断結果・対局の詳細を送らない', () => {
  const { analytics, scripts, window, events, choose, storage } = setup({
    url: site + '?type=ATCI&contact=person%40example.test#game-review/private-id',
  });
  analytics.screen('result', 'result');
  choose('granted');
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].referrerPolicy, 'no-referrer');
  assert.equal(window.dataLayer.find(entry => entry[0] === 'config')[2].send_page_view, false);
  analytics.screen('quiz', 'quiz-beginner');
  analytics.screen('quiz', 'quiz-beginner');
  analytics.screen('intro-lesson', 'lesson/one');
  analytics.screen('intro-lesson', 'lesson/two');
  analytics.screen('game-player', 'game-review/private-id');
  analytics.screen('cpu', 'cpu');
  analytics.screen('cpu', 'cpu');
  analytics.screen('external', 'external/player-never-sent');
  analytics.screen('home', 'learn');
  analytics.screen('home', 'home');
  assert.deepEqual(Array.from(events(), event => event.page_location), [
    site + '#result', site + '#quiz', site + '#intro-lesson', site + '#intro-lesson', site + '#game-player', site + '#cpu',
    site + '#external', site,
  ]);
  assert.equal(events()[1].page_referrer, site + '#result');
  assert.doesNotMatch(JSON.stringify(window.dataLayer), /ATCI|person(?:%40|@)example|private-id|lesson\/one|lesson\/two|player-never-sent/);
  assert.equal(storage.get('chesspath.learning.v1'), 'existing');
});

test('取り消すと送信を止め、再同意や他タブの変更でもタグを二重に読み込まない', () => {
  const { analytics, scripts, window, events, choose, sync } = setup({ consent: 'granted' });
  analytics.screen('home', 'home');
  choose('denied');
  assert.equal(window[`ga-disable-${id}`], true);
  analytics.screen('about', 'about');
  assert.equal(events().length, 1);
  sync('granted');
  assert.equal(events().length, 2);
  assert.equal(window[`ga-disable-${id}`], false);
  assert.equal(scripts.length, 1);
});

test('一括取り込み・個別練習・棋風は固定のパスだけを送る', () => {
  const { analytics, events, window } = setup({ consent: 'granted' });
  for (const screen of ['pgn-import', 'personal', 'personal-play', 'your-style']) {
    analytics.screen(screen, screen + '/private-local-id');
    analytics.screen(screen, screen + '/private-local-id');
  }
  assert.deepEqual(Array.from(events(), event => event.page_location),
    ['pgn-import', 'personal', 'personal-play', 'your-style'].map(screen => site + '#' + screen));
  assert.doesNotMatch(JSON.stringify(window.dataLayer), /private-local-id/);
});

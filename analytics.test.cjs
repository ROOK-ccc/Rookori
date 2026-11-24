const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

const source = readFileSync(join(__dirname, 'analytics.js'), 'utf8');
const site = 'https://rook-ccc.github.io/Rookori/';
const id = 'G-TEST000000';
const consentKey = 'rookori.analytics-consent.v1';

function setup({ idValue = id, url = site, hasTag = false, consent = null } = {}) {
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
    querySelector: selector => selector.includes('canonical') ? { href: site }
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
    events: () => (window.dataLayer ?? []).filter(entry => entry[0] === 'event').map(entry => entry[2]),
    choose: value => choices.get(value).click(),
    sync: value => handlers.storage({ key: consentKey, newValue: value }),
  };
}

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
  analytics.screen('home', 'learn');
  analytics.screen('home', 'home');
  assert.deepEqual(Array.from(events(), event => event.page_location), [
    site + '#result', site + '#quiz', site + '#intro-lesson', site + '#intro-lesson', site + '#game-player', site + '#cpu', site,
  ]);
  assert.equal(events()[1].page_referrer, site + '#result');
  assert.doesNotMatch(JSON.stringify(window.dataLayer), /ATCI|person(?:%40|@)example|private-id|lesson\/one|lesson\/two/);
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

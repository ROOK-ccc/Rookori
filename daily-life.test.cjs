const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

const scripts = ['vendor/chess.js', 'game-review.js', 'game-study.js', 'play-style.js', 'pgn-batch.js', 'daily-life.js'];
const api = runInNewContext(scripts.map(file => readFileSync(join(__dirname, file), 'utf8')).join('\n')
  + '\n({ parseReviewGames, batchPgnRecords, batchGameKey, batchLocalId, batchPlayerColor, styleSide, dailyRecommendation, validLearningGoal })',
{ crypto: require('node:crypto').webcrypto, TextEncoder });

test('棋譜の一部が壊れても、コメント・別手順・別ルールを区別して正常な対局を取り出す', () => {
  const text = '[Event "A"]\n[White "Alice"]\n[Black "Bob"]\n1. e4 {0-1 [Event "x"]} e5 (1... c5) 1-0\n'
    + '[Event "壊れた一局"]\n1. ZZZ ( e5 0-1\n'
    + '[Event "変則ルール"]\n[Variant "Atomic"]\n1. e4 e5 1-0\n'
    + '[Event "B"]\n[Black "ALICE"]\n1. d4 d5 0-1\n1. Nf3 d5 *';
  const rows = [...api.batchPgnRecords(text)];
  assert.equal(rows.length, 5);
  assert.throws(() => api.parseReviewGames(rows[1]), /閉じていません/);
  assert.throws(() => api.parseReviewGames(rows[2]), /通常のチェス/);
  const [first, last, unfinished] = [rows[0], rows[3], rows[4]].map(row => api.parseReviewGames(row)[0]);
  assert.equal(api.batchPlayerColor(first, ' alice '), 'w');
  assert.equal(api.batchPlayerColor(last, 'Alice'), 'b');
  assert.equal(api.batchPlayerColor(unfinished, 'Alice'), '');
  assert.equal(api.styleSide({ ...first, id: 'one' }, { one: 'exclude' }), null);
  assert.equal(api.styleSide({ ...last, id: 'two' }, { two: 'b' }), 'b');
  const ambiguous = api.parseReviewGames('[White "Alice"]\n[Black "alice"]\n1. e4 e5 1-0')[0];
  assert.equal(api.batchPlayerColor(ambiguous, 'alice'), '');
});

test('空白・注釈の違いに依存しない棋譜IDを作り、別の日の対局を区別する', async () => {
  const parse = input => api.parseReviewGames(input)[0];
  const normal = '[White "A"]\n[Date "2026.11.25"]\n';
  const a = api.batchGameKey(parse(normal + '1. e4 e5 1-0'));
  const b = api.batchGameKey(parse(normal + '\n1. e4 {comment} e5\n1-0'));
  const c = api.batchGameKey(parse(normal.replace('25', '24') + '1. e4 e5 1-0'));
  assert.equal(await api.batchLocalId(a), await api.batchLocalId(b));
  assert.notEqual(await api.batchLocalId(a), await api.batchLocalId(c));
});

test('任意の目標を検証し、目標と既存の学習状況から次の操作を選ぶ', () => {
  assert.ok(api.validLearningGoal({ goal: 'review', minutes: '', days: '' }));
  assert.equal(api.validLearningGoal({ goal: 'review', minutes: '50', days: '' }), false);
  const suggest = (goal, state = {}) => api.dailyRecommendation(goal, state)[1];
  assert.equal(suggest('tactics', { personalDue: 2 }), '#personal');
  assert.equal(suggest('tactics'), '#daily');
  assert.equal(suggest('openings', { openingDue: 3 }), '#review');
  assert.equal(suggest('openings'), '#opening-quiz');
  assert.equal(suggest('openings', { learnedOpening: true }), '#openings');
  assert.equal(suggest('review', { game: 'x' }), '#game-review/x');
  assert.equal(suggest(undefined, { resume: '#lesson/board' }), '#lesson/board');
});

test('Service Workerは公開先ごとにキャッシュを分け、対応するシェルだけをオフラインで返す', async () => {
  const sw = readFileSync(join(__dirname, 'sw.js'), 'utf8');
  for (const pathname of ['/', '/Rookori/']) {
    const scope = 'https://example.test' + pathname;
    const listeners = {};
    const requests = [];
    const discarded = [];
    const own = `rookori-shell:${pathname}:old`;
    const unrelated = 'rookori-shell:/different-app/:old';
    let offline = false;
    let storageError = false;
    let redirected = false;
    const cache = { addAll: items => { requests.push(...items); },
      match: async address => ({ ok: true, url: address, redirected }) };
    const self = { registration: { scope }, clients: { claim() {} }, addEventListener: (type, fn) => { listeners[type] = fn; } };
    const caches = { open: async () => {
      if (storageError) throw new Error('storage unavailable');
      return cache;
    }, keys: async () => [own, unrelated, `rookori-shell:${pathname}:new`], delete: key => discarded.push(key) };
    runInNewContext('const build = { version: "new", assets: ["./", "app.js?v=abc"] };\n' + sw,
      { self, caches, URL, Request, Response, fetch: async ({ url }) => {
        if (offline) throw new TypeError('offline');
        return { url, network: true };
      } });
    for (const type of ['install', 'activate']) {
      let task;
      listeners[type]({ waitUntil: promise => { task = promise; } });
      await task;
    }
    assert.deepEqual(discarded, [own]);
    assert.deepEqual(requests.map(request => request.url), [scope, scope + 'app.js?v=abc']);
    assert.ok(requests.every(request => request.redirect === 'error'));
    const fetch = (url, mode = 'navigate') => {
      let response;
      listeners.fetch({ request: { url, mode, method: 'GET' }, respondWith: promise => { response = promise; } });
      return response;
    };
    const shared = scope + '?type=ATCI#result';
    assert.equal((await fetch(shared)).url, shared);
    assert.equal(fetch(scope + 'index.html'), undefined);
    assert.equal((await fetch(scope + 'app.js?v=abc', 'same-origin')).url, scope + 'app.js?v=abc');
    storageError = true;
    assert.equal((await fetch(shared)).network, true);
    assert.equal((await fetch(scope + 'app.js?v=abc', 'same-origin')).network, true);
    let installWithoutCache;
    listeners.install({ waitUntil: task => { installWithoutCache = task; } });
    await assert.doesNotReject(installWithoutCache);
    storageError = false;
    offline = true;
    assert.equal((await fetch(shared)).url, scope);
    redirected = true;
    assert.equal((await fetch(shared)).status, 503);
    storageError = true;
    assert.equal((await fetch(shared)).status, 503);
    assert.equal(fetch(scope + 'vendor/stockfish/test.wasm', 'same-origin'), undefined);
    assert.equal(fetch('https://lichess.org/'), undefined);
    assert.equal(fetch(scope + 'sitemap.xml'), undefined);
    assert.doesNotMatch(sw, /skipWaiting|localStorage|indexedDB/);
  }
});

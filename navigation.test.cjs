const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

const source = ['vendor/chess.js', 'data.js', 'result-links.js', 'opening-data.js', 'opening-expansion.js', 'opening-variations.js', 'intro-data.js', 'navigation.js']
  .map((file) => readFileSync(join(__dirname, file), 'utf8')).join('\n');
const { readSiteRoute, siteAddress } = runInNewContext(
  `${source}\n({ readSiteRoute, siteAddress })`, { URL },
);
const base = 'file:///C:/chesspath/index.html';
const answers = [0, 1, 2, 0, 1, 2, 0, 1];

test('バリエーションの解説・白黒の暗記・復習に直接アクセスできる', () => {
  assert.equal(readSiteRoute(`${base}#study/sicilian-najdorf`).opening.parentId, 'sicilian-defense');
  assert.equal(readSiteRoute(`${base}#practice/sicilian-alapin/w`).color, 'w');
  assert.equal(readSiteRoute(`${base}#practice/sicilian-alapin/b`).practice.id, 'sicilian-alapin');
  assert.equal(readSiteRoute(`${base}#practice/unknown/w`).path, 'openings');
  assert.equal(readSiteRoute(`${base}#review`).path, 'review');
  const item = encodeURIComponent('italian-game:main-v1|w|fen|e2e4');
  assert.equal(readSiteRoute(`${base}#review-item/${item}`).retry, false);
  const retry = readSiteRoute(`${base}#retry-item/${item}`);
  assert.equal(retry.retry, true);
  assert.equal(retry.reviewId, decodeURIComponent(item));
});

test('入門コースの各画面とレッスンに直接アクセスできる', () => {
  assert.equal(readSiteRoute(`${base}#intro`).path, 'intro');
  assert.equal(readSiteRoute(`${base}#intro-summary`).path, 'intro-summary');
  assert.equal(readSiteRoute(`${base}#lesson/stalemate`).lesson.chapterNumber, 4);
  assert.equal(readSiteRoute(`${base}#lesson/unknown`).path, 'intro');
});

test('既存の共有URLを開ける。無効な共有URLはエラー画面になる', () => {
  const url = `${base}?type=ATCI&mode=beginner`;
  const result = readSiteRoute(url);
  assert.equal(result.path, 'result');
  assert.equal(result.code, 'ATCI');
  assert.equal(result.mode, 'beginner');
  assert.equal(result.fromLink, true);
  assert.equal(readSiteRoute(url, { path: 'result', code: 'ATCI', mode: 'beginner' }).fromLink, false);
  assert.equal(readSiteRoute(`${base}?type=INVALID&mode=beginner`).path, 'error');
  assert.equal(readSiteRoute(`${url}#mode`).path, 'mode');
});

test('公開先のサブフォルダーを維持して内部リンクと共有結果URLを生成する', () => {
  const pages = 'https://rook-ccc.github.io/Rookori/';
  const shared = siteAddress(pages, 'result', { code: 'ATCI', mode: 'beginner' });
  assert.equal(shared, `${pages}?type=ATCI&mode=beginner`);
  assert.equal(readSiteRoute(shared).code, 'ATCI');
  const study = siteAddress(shared, 'study/italian-game', {});
  assert.equal(study, `${pages}#study/italian-game`);
  assert.equal(readSiteRoute(study).opening.id, 'italian-game');
  assert.equal(siteAddress(study, 'cpu', {}), `${pages}#cpu`);
  assert.equal(readSiteRoute(`${pages}#cpu`).path, 'cpu');
  assert.equal(siteAddress(study, 'home', {}), pages);
});

test('ローカルの検索パラメーターを変更できない場合でも学習案内と診断へ移動できる', () => {
  const url = `${base}?type=ATCI&mode=beginner`;
  assert.equal(siteAddress(url, 'home', {}, true), `${url}#home`);
  assert.equal(readSiteRoute(siteAddress(url, 'learn', {}, true)).path, 'learn');
  const destination = siteAddress(base, 'result', { code: 'SPLD', mode: 'experienced' }, true);
  assert.equal(destination, `${base}#result`);
  const entry = { path: 'result', code: 'SPLD', mode: 'experienced' };
  assert.equal(readSiteRoute(destination, entry).code, 'SPLD');
  assert.equal(siteAddress(base, 'result', entry), `${base}?type=SPLD&mode=experienced`);
});

test('オープニング結果を復元できる。回答がなければ診断に案内する', () => {
  const url = `${base}#opening-result`;
  assert.equal(readSiteRoute(url).path, 'opening-quiz');
  assert.equal(readSiteRoute(url, { path: 'opening-result', openingAnswers: [0] }).path, 'opening-quiz');
  assert.equal(readSiteRoute(url, { path: 'opening-result', openingAnswers: answers }).openingAnswers, answers);
  const quiz = readSiteRoute(`${base}#opening-quiz`, { path: 'opening-quiz', returnTo: 'beginner', questionIndex: 2 });
  assert.equal(quiz.mode, 'opening');
  assert.equal(quiz.returnTo, 'beginner');
  assert.equal(quiz.questionIndex, 2);
});

test('学習盤の直接リンクと、診断結果から開いた局面をそれぞれ復元する', () => {
  const path = 'study/italian-game';
  const url = `${base}#${path}`;
  assert.equal(readSiteRoute(url).opening.id, 'italian-game');
  assert.equal(readSiteRoute(url).recommended, false);
  const studyMoves = ['e2e4', 'e7e5'];
  const entry = { path, openingAnswers: answers, studyMoves };
  assert.equal(readSiteRoute(url, entry).recommended, true);
  assert.equal(readSiteRoute(url, entry).studyMoves, studyMoves);
  assert.equal(readSiteRoute(`${base}#study/scotch-game`, entry).studyMoves, undefined);
  assert.equal(readSiteRoute(`${base}#study/unknown`).path, 'openings');
});

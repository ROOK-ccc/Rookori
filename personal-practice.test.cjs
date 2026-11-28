const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { webcrypto } = require('node:crypto');
const { runInNewContext } = require('node:vm');
const scripts = ['vendor/chess.js', 'data.js', 'opening-data.js', 'navigation.js', 'cpu-game.js', 'intro-course.js',
  'opening-memory.js', 'learning.js', 'game-review.js', 'game-study.js', 'lichess-api.js', 'personal-practice.js', 'play-style.js', 'daily-life.js', 'diagnosis-history.js', 'migration.js'];
const api = runInNewContext(scripts.map(name => readFileSync(`${__dirname}/${name}`, 'utf8')).join('\n') + '\n({ personalSide, personalSource, personalCompare, personalEligibility, personalProgress, personalAnswerProgress, mergePersonalHistory, personalDue, personalPositionId, personalCandidates, verifyPersonalQuestion, parseReviewGames, validatePersonalBackup })',
  { TextEncoder, crypto: webcrypto, stockfishEngine: { version: '19' }, window: { addEventListener() {} } });

const line = (value, depth = 12, unit = 'cp', winner) => ({ move: 'g6h6', depth, score: { unit, value, winner } });

test('白黒の視点・複数正解・惜しい手・判定保留・メイトを区別する', () => {
  assert.equal(api.personalCompare(line(240), line(216), 'w').kind, 'good');
  assert.equal(api.personalCompare(line(-240), line(-216), 'b').kind, 'good');
  assert.equal(api.personalCompare(line(240), line(160), 'w').kind, 'close');
  assert.equal(api.personalCompare(line(240), line(30), 'w').kind, 'retry');
  assert.equal(api.personalCompare(line(240), line(216, 8), 'w').kind, 'hold');
  assert.equal(api.personalCompare(line(105), line(180), 'w').kind, 'hold');
  assert.equal(api.personalCompare(line(1, 12, 'mate', 'w'), line(3, 12, 'mate', 'w'), 'w').kind, 'good');
  assert.equal(api.personalCompare(line(1, 12, 'mate', 'b'), line(-900), 'b').kind, 'retry');
});

const matePgn = `[SetUp "1"]
[FEN "7k/8/5KQ1/8/8/8/8/8 w - - 0 1"]
[Result "1-0"]

1. Qh6+ 1-0`;

test('手動・CPU・Lichess棋譜を見分け、終了結果がないオンライン棋譜を対象外にする', () => {
  const [game] = api.parseReviewGames(matePgn);
  assert.equal(api.personalSide(game), null);
  assert.equal(api.personalEligibility(game), 'finished');
  assert.equal(api.personalSource(game), 'manual');
  assert.equal(api.personalSide({ ...game, cpu: { player: 'b' } }), 'b');
  assert.equal(api.personalSource({ ...game, cpu: { player: 'w', origin: {} } }), 'positioned');
  const opening = '1. e4 e5 *';
  const [online] = api.parseReviewGames('[Site "https://lichess.org/abcdefgh"]\n\n' + opening);
  assert.equal(api.personalEligibility(online), 'live');
  assert.equal(api.personalSide({ ...online, source: { color: 'white' } }), 'w');
  assert.equal(api.personalEligibility(api.parseReviewGames(opening)[0]), 'confirm');
});

test('再検証でメイトを問題にし、優れた別手を保持し、バックアップから合法性を復元検証する', async () => {
  const [game] = api.parseReviewGames(matePgn);
  const engine = { async search() { return { move: 'g6g7', lines: [
    { pv: ['g6g7'], depth: 14, score: { unit: 'mate', value: 1 } },
    { pv: ['g6h6', 'h8g8'], depth: 14, score: { unit: 'cp', value: 400 } },
  ] }; } };
  const question = await api.verifyPersonalQuestion(engine, game, 0, true);
  assert.equal(question.best, 'g6g7');
  assert.equal(question.actual, 'g6h6');
  assert.match(question.text, /チェックメイト/);
  const history = api.personalProgress(undefined, 'good', 0, new Date(2026, 10, 24, 12));
  assert.equal((await api.validatePersonalBackup([{ question, history }])).length, 1);
  const { actualLine, ...oldQuestion } = question;
  assert.equal(actualLine[0], question.actual);
  assert.equal((await api.validatePersonalBackup([{ question: oldQuestion, history }])).length, 1);
  await assert.rejects(api.validatePersonalBackup([{ question: { ...question, actualLine: [question.actual, 'a1a8'] }, history }]));
  await assert.rejects(api.validatePersonalBackup([{ question: { ...question, best: 'a1a8' }, history }]));
  assert.equal(await api.verifyPersonalQuestion(engine, game, 0, false, () => false), null);
  assert.equal(await api.personalPositionId(game.initialFen.replace('0 1', '10 5')), question.id);
});

test('間隔反復を共有し、当日再挑戦では復習レベルを二重に上げない', () => {
  const date = day => new Date(2026, 10, day, 12);
  let history = api.personalProgress(undefined, 'good', 0, date(24));
  assert.equal(history.due, '2026-11-25');
  history = api.personalProgress(history, 'good', 0, date(24));
  assert.equal(history.level, 0);
  assert.equal(history.streak, 1);
  assert.equal(history.correct, 2);
  history = api.personalProgress(history, 'good', 0, date(25));
  assert.equal(history.due, '2026-11-28');
  const rows = [{ question: { created: '2026-11-24' }, history }];
  assert.equal(api.personalDue(rows, '2026-11-27').length, 0);
  assert.equal(api.personalDue(rows, '2026-11-28').length, 1);
  history = api.personalProgress(history, 'retry', 1, date(28));
  assert.equal(history.due, '2026-11-29');
  assert.equal(history.streak, 0);
  assert.equal(history.hints, 1);
});

test('専用問題は初回を保存し、再回答・バックアップ統合・旧記録で上書きしない', () => {
  const when = new Date(2026, 10, 24, 12);
  const first = api.personalAnswerProgress(undefined, 'retry', 1, when);
  const retry = api.personalAnswerProgress(first, 'good', 0, new Date(2026, 10, 25, 12));
  assert.deepEqual(JSON.parse(JSON.stringify(retry.firstAnswer)), { correct: false, hints: 1, day: '2026-11-24', at: when.toISOString() });
  const legacy = api.personalProgress(undefined, 'good', 0, when);
  assert.equal(api.personalAnswerProgress(legacy, 'good', 0).firstAnswer, undefined);
  assert.equal(api.mergePersonalHistory(first, retry).firstAnswer.correct, false);
});

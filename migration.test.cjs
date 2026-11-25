const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');
const { webcrypto } = require('node:crypto');

const scripts = ['vendor/chess.js', 'data.js', 'opening-data.js', 'navigation.js', 'cpu-game.js', 'intro-course.js',
  'opening-memory.js', 'learning.js', 'game-review.js', 'game-study.js', 'lichess-api.js', 'personal-practice.js', 'play-style.js', 'migration.js'];
const api = runInNewContext(scripts.map(file => readFileSync(join(__dirname, file), 'utf8')).join('\n')
  + '\n({ validateMigration, addMigrationSettings, learningBackup, makeGameBackup, parseReviewGames, reviewGameRecord, studyContentKey, studyEngineResult })',
{ window: { addEventListener() {} }, TextEncoder, crypto: webcrypto });

test('移行バックアップは棋譜の局面と解析・検討を検証し、対象外のキーを拒否する', async () => {
  const [sample] = api.parseReviewGames('1. e4 e5 *');
  const game = api.reviewGameRecord(sample, 'a'.repeat(32), '2026-11-24T00:00:00.000Z');
  const key = await api.studyContentKey(game);
  const value = api.studyEngineResult({ move: 'd2d4', lines: [{ score: { unit: 'cp', value: 20 }, pv: ['d2d4'], depth: 10 }] }, 'w', game.initialFen);
  const row = { scores: [value], single: {}, variations: [{ id: 'b'.repeat(32), name: '検討', ply: 0, moves: ['d2d4'] }],
    version: '19', mode: 'analysis-quick', analyzed: null, gameId: game.id };
  const backup = { type: 'rookori.site-backup', version: 1, learning: api.learningBackup({ getItem: () => null }),
    settings: { 'rookori.type-result.v1': { code: 'ATCI', mode: 'beginner' }, 'rookori.lichess-username.v1': 'alice' },
    library: api.makeGameBackup([game]), studies: [[key, row]] };
  backup.settings['rookori.style-games.v1'] = { [game.id]: 'b' };
  backup.settings['rookori.style-snapshots.v1'] = [];
  const imported = await api.validateMigration(backup);
  assert.equal(imported.values['rookori.style-games.v1'][game.id], 'b');
  assert.equal(imported.games[0].id, game.id);
  assert.equal(imported.studies[0][1].variations[0].moves[0], 'd2d4');
  row.variations[0].moves = ['d2d5'];
  await assert.rejects(api.validateMigration(backup));
  row.variations[0].moves = ['d2d4'];
  backup.settings['rookori.analytics-consent.v1'] = 'granted';
  await assert.rejects(api.validateMigration(backup));
});

test('移行を繰り返しても保存済みの項目を上書きせず、Lichessユーザー名の既存形式を維持する', () => {
  const data = new Map([['chesspath.learning.v1', 'previous']]);
  const storage = { getItem: key => data.get(key) ?? null, setItem: data.set.bind(data) };
  const values = { 'chesspath.learning.v1': {}, 'rookori.lichess-username.v1': 'alice' };
  assert.equal(api.addMigrationSettings(storage, values).added, 1);
  assert.equal(api.addMigrationSettings(storage, values).added, 0);
  assert.equal(data.get('chesspath.learning.v1'), 'previous');
  assert.equal(data.get('rookori.lichess-username.v1'), 'alice');
});

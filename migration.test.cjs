const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');
const { webcrypto } = require('node:crypto');

const scripts = ['vendor/chess.js', 'data.js', 'opening-data.js', 'navigation.js', 'cpu-game.js', 'intro-course.js',
  'opening-memory.js', 'learning.js', 'game-review.js', 'game-study.js', 'lichess-api.js', 'personal-practice.js', 'play-style.js',
  'daily-life.js', 'pgn-batch.js', 'game-library.js', 'migration.js'];
const api = runInNewContext(scripts.map(file => readFileSync(join(__dirname, file), 'utf8')).join('\n')
  + '\n({ validateMigration, addMigrationSettings, learningBackup, makeGameBackup, validateGameBackup, parseReviewGames, reviewGameRecord, reviewNote, studyContentKey, studyEngineResult, mergeLibraryRecords, prepareMigrationLinks, freshLearning, mergePersonalHistory })',
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
  backup.settings['rookori.welcome.v1'] = true;
  backup.settings['rookori.learning-goal.v1'] = { goal: 'review', minutes: '10', days: '2' };
  const imported = await api.validateMigration(backup);
  assert.equal(imported.values['rookori.welcome.v1'], true);
  assert.equal(imported.values['rookori.learning-goal.v1'].minutes, '10');
  assert.equal(imported.values['rookori.style-games.v1'][game.id], 'b');
  assert.equal(imported.games[0].id, game.id);
  assert.equal(imported.studies[0][1].variations[0].moves[0], 'd2d4');
  row.variations[0].moves = ['d2d5'];
  await assert.rejects(api.validateMigration(backup));
  row.variations[0].moves = ['d2d4'];
  backup.settings['rookori.analytics-consent.v1'] = 'granted';
  await assert.rejects(api.validateMigration(backup));
});

test('復元先の目標と使用色を保持し、取り込んだ棋譜の使用色を補う', () => {
  const own = 'rookori.style-games.v1';
  const goals = 'rookori.learning-goal.v1';
  const a = 'a'.repeat(32), b = 'b'.repeat(32);
  const data = new Map([[own, JSON.stringify({ [a]: 'exclude' })], [goals, '{"goal":"enjoy"}']]);
  const storage = { getItem: key => data.get(key) ?? null, setItem: data.set.bind(data) };
  api.addMigrationSettings(storage, { [own]: { [a]: 'w', [b]: 'b' }, [goals]: { goal: 'review' } });
  assert.deepEqual(JSON.parse(data.get(own)), { [a]: 'exclude', [b]: 'b' });
  assert.equal(JSON.parse(data.get(goals)).goal, 'enjoy');
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

test('別IDの棋譜を統合し、両方のメモ、元のURL、解析と個別問題への参照を保持する', async () => {
  const date = '2026-11-24T00:00:00.000Z';
  const old = api.reviewGameRecord(api.parseReviewGames('1. e4 { old } e5 1-0')[0], 'a'.repeat(32), date);
  const current = api.reviewGameRecord(api.parseReviewGames('1. e4 e5 1-0')[0], 'b'.repeat(32), date);
  old.notes.push(api.reviewNote(old, 0, '移行元'), api.reviewNote(old, 1, '移行元だけ'));
  current.notes.push(api.reviewNote(current, 0, '移行先'));
  const merged = api.mergeLibraryRecords([current], [old]);
  assert.equal(merged.added, 0);
  assert.equal(merged.conflicts, 1);
  const game = merged.records.get(current.id);
  assert.equal(game.notes[0].text, '移行先');
  assert.equal(game.notes[1].gameId, current.id);
  assert.equal(game.migrationNotes[0].text, '移行元');
  assert.ok(game.migrationIds.includes(old.id));
  const [restored] = api.validateGameBackup(api.makeGameBackup([game]));
  assert.equal(restored.migrationNotes[0].text, '移行元');
  assert.equal(api.mergeLibraryRecords([restored], [old]).changed.size, 0);
  const key = await api.studyContentKey(old);
  const changed = await api.prepareMigrationLinks({ games: [old],
    studies: [[key, { gameId: old.id }]], personal: [{ question: { gameId: old.id, sourceKey: key }, history: null }],
    values: { 'rookori.style-games.v1': { [old.id]: 'w' } } }, merged);
  assert.equal(changed.studies[0][0], await api.studyContentKey(current));
  assert.equal(changed.studies[0][1].gameId, current.id);
  assert.equal(changed.personal[0].question.gameId, current.id);
  assert.equal(changed.personal[0].question.sourceKey, changed.studies[0][0]);
  assert.equal(changed.values['rookori.style-games.v1'][current.id], 'w');
});

test('空の日次計画に旧履歴を取り込み、その日の両方の問題と別日の履歴を保つ', () => {
  const key = 'chesspath.learning.v1';
  const current = api.freshLearning();
  const old = api.freshLearning();
  const today = '2026-11-25', prior = '2026-11-24';
  const plan = (...questions) => ({ reviewIds: [], questions, correct: [], checked: [], reviewed: [], target: null, newDone: false, reviewRemaining: null });
  current.days[today] = plan('current');
  old.days[today] = { ...plan('old'), correct: ['old'], checked: ['old'] };
  old.days[prior] = plan('old');
  old.questions.old = { errors: 1, solved: today };
  const storageMap = new Map([[key, JSON.stringify(current)]]);
  const storage = { getItem: k => storageMap.get(k) ?? null, setItem: storageMap.set.bind(storageMap) };
  assert.equal(api.addMigrationSettings(storage, { [key]: old }).added, 1);
  const both = JSON.parse(storageMap.get(key));
  assert.deepEqual(both.days[today].checked, ['old']);
  assert.ok(both.days[prior]);
  both.days[today].questions = ['current'];
  both.days[today].checked = both.days[today].correct = ['current'];
  storageMap.set(key, JSON.stringify(both));
  api.addMigrationSettings(storage, { [key]: old });
  assert.deepEqual(JSON.parse(storageMap.get(key)).days[today].correct, ['current', 'old']);
  assert.equal(api.addMigrationSettings(storage, { [key]: old }).added, 0);
});

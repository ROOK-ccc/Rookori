const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');

const files = ['vendor/chess.js', 'learning.js', 'personal-practice.js', 'general-practice.js', 'practice-editor-validate.js'];
const storage = new Map();
const vm = runInNewContext(files.map(file => readFileSync(join(__dirname, file), 'utf8')).join('\n')
  + '\n({chessRules, validatePracticeEdit, generalRecord, generalHistory, buildPracticeMenu, practiceEvidence, validGeneralHistory, validPracticeDaily})',
  { Date, localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) } });
const raw = file => readFileSync(join(__dirname, 'puzzles', file), 'utf8');

test('Lichessの5,000問はID・開始局面が重複せず、白黒の合法手と詰め手順を再生できる', () => {
  const catalog = JSON.parse(raw('catalog.json'));
  assert.equal(catalog.license, 'CC0-1.0');
  assert.deepEqual(catalog.counts, [1000, 2000, 1500, 500]);
  const ids = new Set(), positions = new Set(), totals = {};
  for (const [key, metadata] of Object.entries(catalog.batches)) {
    const file = raw(key + '.json');
    assert.equal(metadata.hash, createHash('sha256').update(file).digest('hex').slice(0, 12));
    for (const row of JSON.parse(file)) {
      const position = row[1].split(' ').slice(0, 4).join(' ');
      assert.equal(ids.has(row[0]) || positions.has(position), false);
      ids.add(row[0]);
      positions.add(position);
      vm.validatePracticeEdit({}, row, vm.chessRules);
      for (const tag of row[4]) totals[tag] = (totals[tag] ?? 0) + 1;
    }
  }
  assert.equal(ids.size, 5000);
  assert.deepEqual(totals, catalog.themes);
});

test('編集で非合法着手を拒否し、編集中の別解と公開状態を独立して検証する', () => {
  const row = ['Demo1', vm.chessRules.DEFAULT_POSITION, ['e2e4'], 950, ['opening']];
  assert.throws(() => vm.validatePracticeEdit({ moves: ['e2e5'] }, row, vm.chessRules));
  const edit = vm.validatePracticeEdit({ alternatives: [['d2d4']], published: false }, row, vm.chessRules);
  assert.equal(edit.published, false);
  assert.deepEqual(edit.alternatives, [['d2d4']]);
});

test('個別・関連・復習・未学習から日次メニューを重複なしで選び、履歴と初回記録を保存できる', () => {
  const date = new Date(2026, 10, 27, 12);
  const day = '2026-11-27';
  const general = Array.from({ length: 12 }, (_, i) => ({ id: 'Test' + i.toString(36), type: 'general',
    tags: [i < 4 ? 'fork' : i < 8 ? 'pin' : 'backRankMate'], rating: 950 }));
  const personal = Array.from({ length: 6 }, (_, i) => ({
    question: { id: String(i).repeat(64), created: day + 'T00:00:00.000Z', tags: ['fork'], gameId: String(i) },
    history: i < 4 ? null : { due: day, reviewedDay: '2026-11-26', events: [] },
  }));
  const fresh = vm.buildPracticeMenu(personal, general, {}, 'fork', 'recommended', day);
  assert.equal(fresh.length, 10);
  assert.equal(new Set(fresh.map(row => row.id)).size, 10);
  assert.equal(fresh.filter(row => row.reason === '自分の対局').length, 4);
  assert.equal(fresh.filter(row => row.reason.startsWith('おすすめ')).length, 3);
  assert.equal(fresh.filter(row => row.reason === '復習予定').length, 2);
  assert.equal(vm.validPracticeDaily({ day, complete: false, menus: { recommended: fresh } }), true);
  assert.equal(vm.practiceEvidence(personal, [], day)[0].tag, 'fork');
  assert.equal(vm.practiceEvidence(personal.slice(0, 1), [], day).length, 0);
  vm.generalRecord('Test0', false, 1, date);
  vm.generalRecord('Test0', true, 0, date);
  const history = vm.generalHistory();
  assert.equal(history.Test0.first.correct, false);
  assert.equal(history.Test0.correct, 1);
  assert.equal(history.Test0.wrong, 1);
  assert.equal(vm.validGeneralHistory(history), true);
});

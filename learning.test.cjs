const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');
const { test } = require('node:test');

const source = ['vendor/chess.js', 'opening-data.js', 'opening-variations.js', 'opening-study.js',
  'opening-memory.js', 'intro-data.js', 'intro-course.js', 'learning.js', 'learning-insights.js']
  .map(file => readFileSync(join(__dirname, file), 'utf8')).join('\n');
const api = runInNewContext(source + '\n({ chessRules, openings, introLessons, findStudyOpening, localDay, offsetDay, reviewItemsFor, freshLearning, scheduleReview, planQuestions, summarizeLearningDays, firstAnswerRate, activityVolume, activeLearningDay, weekStart, learningPeriod, openingMastery, LearningTracker, OpeningPractice, learningKey, introStorageKey, openingHistoryKey, learningBackup, validateLearningBackup, restoreLearningBackup })');
const { localDay, offsetDay, scheduleReview, reviewItemsFor, OpeningPractice, LearningTracker,
  introLessons, openings, findStudyOpening, learningKey, introStorageKey, openingHistoryKey } = api;
const date = (year, month, day, hour = 12) => new Date(year, month - 1, day, hour);
const plain = value => JSON.parse(JSON.stringify(value));
function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
const learner = (data, clock) => new LearningTracker(data, introLessons, openings, findStudyOpening, clock);

test('復習間隔は翌日・3・7・14・30日、ヒントや誤答は短縮し同日中の学習で二重に進まない', () => {
  let entry = { level: -1 };
  let day = '2026-12-31';
  for (const interval of [1, 3, 7, 14, 30, 30]) {
    const now = new Date(day + 'T12:00:00');
    entry = scheduleReview(entry, 'clean', day, now);
    assert.equal(entry.interval, interval);
    assert.equal(entry.due, offsetDay(day, interval));
    assert.equal(scheduleReview(entry, 'clean', day, now).level, entry.level);
    day = entry.due;
  }
  assert.equal(offsetDay('2026-12-31', 1), '2027-01-01');
  assert.equal(offsetDay('2028-02-28', 1), '2028-02-29');
  assert.equal(scheduleReview(entry, 'hint', day, new Date()).interval, 1);
  assert.ok(scheduleReview(entry, 'retry', day, new Date()).level < entry.level);
});

test('学習項目は対象局面を合法手で再現し、登録した別の正解も判定する', () => {
  const opening = { ...findStudyOpening('italian-game'), acceptedMoves: { 2: ['b1c3', 'a1a5'] } };
  const item = reviewItemsFor(opening)[2];
  assert.deepEqual(plain(item.answers), ['g1f3', 'b1c3']);
  const practice = new OpeningPractice(opening, 'w', item);
  assert.equal(practice.study.game.fen(), item.fen);
  assert.equal(practice.study.game.turn(), item.color);
  assert.equal(practice.play('d2', 'd4'), false);
  assert.equal(practice.study.game.fen(), item.fen);
  assert.equal(practice.play('b1', 'c3'), true);
  assert.equal(practice.complete, true);
  assert.equal(practice.record().kind, 'review');
  const dragon = reviewItemsFor(findStudyOpening('sicilian-dragon')).at(-1);
  assert.equal(dragon.move, 'g7g6');
  assert.equal(dragon.color, 'b');
  assert.equal(dragon.variationId, 'sicilian-dragon');
});

test('初回・診断のみは紹介型、学習履歴があるとダッシュボード。手動指定を保持する', () => {
  const store = storage();
  assert.equal(learner(store).home(), 'intro');
  store.setItem('result', '{"code":"ATCI"}');
  assert.equal(learner(store).home(), 'intro');
  store.setItem(introStorageKey, JSON.stringify({ completed: ['first-turn'], chapter: 'basics', lesson: 'first-turn', quiz: {} }));
  const tracker = learner(store);
  assert.equal(tracker.home(), 'dashboard');
  tracker.data.home = 'intro';
  tracker.save();
  assert.equal(learner(store).home(), 'intro');
});

test('旧履歴をそのまま残して復習予定を作り、正解・中断・翌日の期限を扱う', () => {
  let now = date(2026, 11, 23);
  const opening = findStudyOpening('italian-game');
  const original = { schemaVersion: 1, records: [{
    id: 'old', date: date(2026, 11, 22).toISOString(), openingId: opening.id, variationId: null,
    lineId: opening.id + ':main-v1', color: 'w', trained: 2, firstCorrect: 1, unassistedFirstCorrect: 1,
    hints: 1, mistakes: 1, complete: false, errors: [{ ply: 2, expected: 'g1f3', played: 'g1h3' }],
  }] };
  const before = JSON.stringify(original);
  const store = storage({ [openingHistoryKey]: before });
  const tracker = learner(store, () => now);
  assert.equal(tracker.due().length, 2);
  const item = tracker.due()[0];
  tracker.observe(item, 'interrupted', { mistakes: 1 });
  assert.equal(tracker.data.items[item.id].outcome, 'interrupted');
  tracker.observe(item, 'retry');
  assert.equal(tracker.due().length, 1);
  assert.equal(learner(store, () => now).due().length, 1);
  assert.equal(store.getItem(openingHistoryKey), before);
  now = date(2026, 11, 24, 0);
  assert.equal(tracker.due().length, 2);
  assert.equal(tracker.data.items[item.id].outcome, 'retry');
});

test('10問の選定、同日の重複防止、日付が変わったときの計画と集計', () => {
  let now = date(2026, 11, 23, 23);
  const tracker = learner(storage(), () => now);
  assert.equal(tracker.activity().length, 0);
  const first = tracker.day();
  assert.equal(first.questions.length, 10);
  assert.equal(new Set(first.questions).size, first.questions.length);
  tracker.lessonAnswer(first.questions[0], true);
  tracker.lessonAnswer(first.questions[0], true);
  tracker.lessonAnswer('quiz-promotion', false);
  assert.equal(first.checked.length, 1);
  assert.equal(first.correct.length, 1);
  assert.equal(first.newDone, true);
  assert.equal(tracker.activity()[0].questions, 1);
  assert.equal(api.planQuestions([{ id: 'a' }], { completed: [], quiz: {} }, {}, localDay(now)).length, 1);
  now = date(2026, 11, 24, 0);
  assert.equal(tracker.day().questions[0], 'quiz-promotion');
  assert.equal(tracker.day().checked.length, 0);
});

test('バックアップの不正形式は変更を行わず、有効なデータは対象キーだけを置換する', () => {
  const tracker = learner(storage(), () => date(2026, 11, 23));
  tracker.lessonAnswer('first-turn', true);
  tracker.storage.setItem(introStorageKey, JSON.stringify({ completed: ['first-turn'], chapter: 'basics', lesson: 'first-turn', quiz: {} }));
  const backup = api.learningBackup(tracker.storage);
  assert.equal(api.validateLearningBackup(backup), true);
  const other = storage({ [introStorageKey]: 'existing', 'chesspath.editor.v1': 'author content' });
  const broken = { ...backup, data: { ...backup.data, [learningKey]: { schemaVersion: 1 } } };
  assert.throws(() => api.restoreLearningBackup(other, broken), /形式/);
  assert.equal(other.getItem(introStorageKey), 'existing');
  api.restoreLearningBackup(other, backup);
  assert.equal(JSON.parse(other.getItem(introStorageKey)).completed[0], 'first-turn');
  assert.equal(other.getItem('chesspath.editor.v1'), 'author content');
});
  
test('中断した誤答は初回0％になり、同じ手の解き直しで初回回答を追加しない', () => {
  const practice = new OpeningPractice(findStudyOpening('italian-game'), 'w');
  practice.wrong('d2d4');
  practice.wrong('c2c4');
  const incomplete = practice.record();
  assert.equal(incomplete.trained, 0);
  assert.deepEqual(plain(incomplete.answerEvents).map(event => [event.ply, event.correct]), [[0, false]]);
  const incompleteDays = api.summarizeLearningDays([incomplete], {});
  assert.equal(api.firstAnswerRate(incompleteDays), 0);
  assert.equal(api.firstAnswerRate([]), null);
  practice.revealHint();
  assert.equal(practice.play('e2', 'e4'), true);
  assert.equal(practice.opponentMove(), true);
  practice.revealHint();
  assert.equal(practice.play('g1', 'f3'), true);
  assert.deepEqual(plain(practice.record().answerEvents).map(event => [event.ply, event.correct, event.hinted]),
    [[0, false, false], [2, true, true]]);
  assert.equal(api.firstAnswerRate(api.summarizeLearningDays([practice.record()], {})), 50);
  const later = { ...practice.record(), answerEvents: plain(practice.record().answerEvents)
    .map(event => ({ ...event, at: date(2026, 11, 23, 12).toISOString() })) };
  const earlier = { ...later, answerEvents: [{ ply: 2,
    at: date(2026, 11, 23, 9).toISOString(), correct: false, hinted: false }] };
  assert.equal(api.firstAnswerRate(api.summarizeLearningDays([later, earlier], {})), 0);
});

test('学習日と期間は現地日付で集計し、旧データの種類を推測しない', () => {
  const at = date(2026, 11, 22, 23).toISOString();
  const next = date(2026, 11, 23, 0).toISOString();
  const data = storage();
  const tracker = learner(data, () => date(2026, 11, 24));
  tracker.lessonAnswer('quiz-knight', false);
  tracker.lessonAnswer('quiz-knight', true);
  tracker.lessonAnswer('quiz-knight', true);
  tracker.openingDone('italian-game', 'study');
  tracker.openingDone('italian-game', 'study');
  const rows = api.summarizeLearningDays([
    { date: at, trained: 2, firstCorrect: 1 },
    { date: at, kind: 'practice', activityAt: next, answerEvents: [{ ply: 0, at: next, correct: false, hinted: false }] },
    { date: next, kind: 'review', answerEvents: [] },
  ], tracker.data.days);
  assert.deepEqual(plain(rows).map(row => [row.day, api.activityVolume(row), api.firstAnswerRate([row])]),
    [['2026-11-22', 1, 50], ['2026-11-23', 2, 0], ['2026-11-24', 2, null]]);
  assert.deepEqual(plain(rows[0].counts), { practice: 0, review: 0, questions: 0, study: 0, unknown: 1 });
  assert.deepEqual(plain(rows[2].counts), { practice: 0, review: 0, questions: 1, study: 1, unknown: 0 });
  assert.equal(api.weekStart('2026-11-29'), '2026-11-23');
  assert.deepEqual(plain(api.learningPeriod(rows, '2026-11-29', 7).rows).map(row => row.day),
    ['2026-11-23', '2026-11-24']);
  assert.equal(api.learningPeriod(rows, '2026-11-29', 7).end, '2026-11-29');
});

test('習熟度は復習段階・誤答・ヒント・期限を反映し、同日反復では変わらない', () => {
  const today = '2026-11-23';
  const now = date(2026, 11, 23);
  const clean = scheduleReview({ level: 2 }, 'clean', today, now);
  const hinted = { ...scheduleReview({ level: 2 }, 'hint', today, now), firstTryCorrect: true };
  const retried = { ...hinted, firstTryCorrect: false };
  const mastery = items => api.openingMastery(items, 5, today);
  assert.equal(mastery([]).score, null);
  assert.ok(mastery([clean]).score > mastery([hinted]).score);
  assert.ok(mastery([hinted]).score > mastery([retried]).score);
  assert.deepEqual(plain(mastery([scheduleReview(clean, 'clean', today, now, 3, 2)])), plain(mastery([clean])));
  assert.ok(mastery([{ ...clean, due: '2026-11-21', reviewedDay: '2026-11-15' }]).score < mastery([clean]).score);
  assert.equal(mastery([{ ...clean, due: today, reviewedDay: '2026-11-22' }]).status, '復習が必要');
});

test('新しい回答イベントと学習日記録をバックアップで復元できる', () => {
  const data = storage();
  const tracker = learner(data, () => date(2026, 11, 23));
  const practice = new OpeningPractice(findStudyOpening('italian-game'), 'w');
  practice.wrong('d2d4');
  data.setItem(openingHistoryKey, JSON.stringify({ schemaVersion: 1, records: [practice.record()] }));
  tracker.lessonAnswer('quiz-knight', false);
  tracker.openingDone('italian-game', 'study');
  const backup = api.learningBackup(data);
  assert.equal(api.validateLearningBackup(backup), true);
  const restored = storage();
  api.restoreLearningBackup(restored, backup);
  assert.equal(learner(restored).history()[0].answerEvents[0].correct, false);
  assert.deepEqual(plain(JSON.parse(restored.getItem(learningKey)).days['2026-11-23'].questionAttempts), ['quiz-knight']);
  backup.data[openingHistoryKey].records[0].answerEvents.push(practice.record().answerEvents[0]);
  assert.equal(api.validateLearningBackup(backup), false);
});

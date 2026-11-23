const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

const source = ['vendor/chess.js', 'opening-study.js', 'intro-data.js', 'problem-data.js', 'problem-curriculum.js']
  .map(file => readFileSync(join(__dirname, file), 'utf8')).join('\n');
const data = () => runInNewContext(`const publishedProblemPack = { schemaVersion: 1, problems: [] };\n${source}\n({ chessRules, introChapters, introLessons, introPositions,
  parsePositionFen, formatPositionFen, problemStart, validateProblem, validateProblemPack,
  baseLessonProblem, installProblemPack, problemCourseScript, ProblemPractice, splitProblemMove })`);
const sample = (d, extra = {}) => ({
  id: 'test-knight', title: 'ナイトの練習', chapter: 'pieces', difficulty: 'intro',
  kind: 'square', mode: 'standard', goal: 'match', fen: d.chessRules.DEFAULT_POSITION,
  prompt: '白のナイトを出す', hint: 'L字に進む', correct: 'ナイトが進みました。',
  incorrect: 'ナイトを選びましょう。', lines: [['g1f3'], ['b1c3']], tags: ['ナイト'], ...extra,
});
const pack = problems => ({ schemaVersion: 1, problems });
const move = (d, study, uci) => study.play(...d.splitProblemMove(uci));

test('盤の編集とFENの往復で手番・権利・アンパッサン・手数を保つ', () => {
  const d = data();
  const fen = 'r3k2r/8/8/3pP3/8/8/8/R3K2R w KQkq d6 0 19';
  const position = d.parsePositionFen(fen);
  assert.equal(d.formatPositionFen(position), fen);
  assert.equal(d.problemStart(fen), fen);
  position.squares.b2 = position.squares.a1;
  delete position.squares.a1;
  assert.equal(d.parsePositionFen(d.formatPositionFen(position)).squares.b2.type, 'r');
  assert.throws(() => d.problemStart(d.formatPositionFen(position)), /キャスリング権/);
  assert.throws(() => d.parsePositionFen('8/8/8/8/8/8/8/8 w - - 0 0'), /FEN/);
  assert.throws(() => d.problemStart('8/8/8/8/8/8/8/8 w - - 0 1'), /キング/);
  assert.throws(() => d.problemStart('4k3/8/8/8/8/8/4R3/4K3 w - - 0 1'), /攻撃/);
  assert.throws(() => d.problemStart('4k3/8/8/8/8/8/8/4K3 w - d6 0 2'), /アンパッサン/);
  assert.equal(d.problemStart('4k3/8/8/8/8/8/8/4K3 b - - 13 23').endsWith('b - - 13 23'), true);
});

test('単手の複数正解とチェックメイトの目的を検証する', () => {
  const d = data();
  const problem = d.validateProblem(sample(d), d.introLessons);
  assert.equal(problem.lines.length, 2);
  for (const uci of ['g1f3', 'b1c3']) {
    const practice = new d.ProblemPractice(problem);
    assert.equal(move(d, practice, 'g1h3'), false);
    assert.equal(practice.position.step, 0);
    assert.equal(move(d, practice, uci), true);
    assert.equal(practice.solved, true);
  }
  const mate = sample(d, { goal: 'mate', fen: d.introPositions.queenEnding, lines: [['g5g7']] });
  assert.ok(d.validateProblem(mate, d.introLessons));
  assert.throws(() => d.validateProblem({ ...mate, lines: [['g5g6']] }, d.introLessons), /チェックメイト/);
  assert.throws(() => d.validateProblem(sample(d, { lines: [['g1g3']] }), d.introLessons), /指せません/);
});

test('複数手の分岐を再生し、間違えても局面を維持し前の課題手へ戻せる', () => {
  const d = data();
  const lines = [['e2e4', 'e7e5', 'g1f3'], ['d2d4', 'd7d5', 'c2c4'], ['e2e4', 'e7e5', 'f1c4']];
  const problem = d.validateProblem(sample(d, { kind: 'sequence', lines }), d.introLessons);
  const practice = new d.ProblemPractice(problem);
  assert.equal(move(d, practice, 'e2e4'), true);
  assert.equal(practice.position.lastMove.lan, 'e7e5');
  const afterReply = practice.position.game.fen();
  assert.equal(move(d, practice, 'd2d3'), false);
  assert.equal(practice.position.game.fen(), afterReply);
  assert.equal(move(d, practice, 'f1c4'), true);
  assert.equal(practice.solved, true);
  practice.back();
  assert.equal(practice.solved, false);
  assert.equal(practice.position.game.fen(), afterReply);
  practice.back();
  assert.equal(practice.position.game.fen(), problem.fen);
  assert.equal(move(d, practice, 'd2d4'), true);
  assert.equal(move(d, practice, 'c2c4'), true);
  assert.equal(practice.solved, true);
  assert.throws(() => d.validateProblem({ ...problem, lines: [...lines, ['e2e4', 'c7c5', 'g1f3']] }, d.introLessons), /応手/);
  assert.throws(() => d.validateProblem({ ...problem, lines: [['e2e4', 'e7e5', 'g1g3']] }, d.introLessons), /指せません/);
});

test('指定の駒だけの練習ではキングとナイトの盤でも合法手を練習できる', () => {
  const d = data();
  const puzzle = sample(d, {
    mode: 'piece', practiceSquare: 'g1', fen: '4k3/8/8/8/8/8/8/4K1N1 w - - 0 1', lines: [['g1f3']],
  });
  const valid = d.validateProblem(puzzle, d.introLessons);
  const practice = new d.ProblemPractice(valid);
  assert.equal(move(d, practice, 'e1e2'), false);
  assert.equal(move(d, practice, 'g1f3'), true);
  assert.throws(() => d.validateProblem({ ...puzzle, mode: 'standard' }, d.introLessons), /指せません/);
  assert.throws(() => d.validateProblem({ ...puzzle, practiceSquare: 'e1' }, d.introLessons), /開始マス/);
});

test('JSON書式・重複IDを検証し、新規問題と既存IDの編集を教材に反映できる', () => {
  const d = data();
  const original = d.introLessons.find(lesson => lesson.id === 'knight');
  const edited = { ...d.baseLessonProblem(original), title: 'ナイトのL字を練習' };
  const puzzle = sample(d, { title: '<駒>の練習' });
  const formatted = JSON.parse(JSON.stringify(pack([puzzle, edited])));
  assert.throws(() => d.validateProblemPack(pack([puzzle, puzzle]), d.introLessons), /重複/);
  assert.throws(() => d.validateProblemPack({ schemaVersion: 2, problems: [] }, d.introLessons), /バージョン/);
  assert.throws(() => d.validateProblem({ ...edited, chapter: 'review' }, d.introLessons), /IDと章/);
  assert.throws(() => d.validateProblem({ ...puzzle, id: 'first-turn' }, d.introLessons), /IDと章/);
  const script = d.problemCourseScript(d.validateProblemPack(formatted, d.introLessons));
  assert.equal(script.includes('<駒>'), false);
  const exported = runInNewContext(`${script}\npublishedProblemPack`);
  d.installProblemPack(exported, d.introChapters, d.introLessons);
  assert.equal(d.introLessons.length, 27);
  assert.equal(d.introLessons.find(lesson => lesson.id === original.id).title, edited.title);
  assert.equal(d.introLessons.find(lesson => lesson.id === puzzle.id).title, puzzle.title);
  assert.equal(d.introChapters.find(chapter => chapter.id === 'pieces').lessons.at(-1).id, puzzle.id);
});

test('CBurnettの白黒12ファイルとライセンスが同梱されている', () => {
  for (const color of ['w', 'b']) for (const piece of 'KQRBNP') {
    assert.match(readFileSync(join(__dirname, 'pieces', 'cburnett', `${color}${piece}.svg`), 'utf8'), /<svg\b/);
  }
  assert.ok(existsSync(join(__dirname, 'pieces', 'cburnett', 'LICENSE.txt')));
});

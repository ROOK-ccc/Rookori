const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

const source = ['vendor/chess.js', 'opening-study.js', 'intro-data.js', 'intro-course.js']
  .map((file) => readFileSync(join(__dirname, file), 'utf8')).join('\n');
const { chessRules, introChapters, introLessons, IntroExercise, IntroProgress, introStorageKey } = runInNewContext(
  `${source}\n({ chessRules, introChapters, introLessons, IntroExercise, IntroProgress, introStorageKey })`,
);
const lesson = (id) => introLessons.find((item) => item.id === id);
const play = (exercise, uci) => exercise.play(uci.slice(0, 2), uci.slice(2, 4), uci[4]);

test('6章の全レッスンに合法な局面・答え・ヒント・解説がある', () => {
  assert.equal(introChapters.length, 6);
  assert.equal(introLessons.filter(({ chapter }) => chapter === 'review').length, 7);
  assert.equal(new Set(introLessons.map(({ id }) => id)).size, introLessons.length);
  for (const current of introLessons) {
    const exercise = new IntroExercise(current);
    const fen = current.fen ?? chessRules.DEFAULT_POSITION;
    const { game } = exercise.position;
    const turn = game.turn();
    const opponent = game.board().flat().find((piece) => piece?.type === 'k' && piece.color !== turn);
    assert.equal(chessRules.validateFen(fen).ok, true, current.id);
    assert.equal(game.isAttacked(opponent.square, turn), false, current.id);
    for (const field of ['title', 'text', 'task', 'hint', 'success']) assert.ok(current[field]?.trim(), current.id);
    if (current.moves) {
      assert.ok(current.moves.length && new Set(current.moves).size === current.moves.length);
      for (const uci of current.moves) {
        assert.match(uci, /^[a-h][1-8][a-h][1-8][qrbn]?$/);
        assert.equal(play(new IntroExercise(current), uci), true, `${current.id}: ${uci}`);
      }
    } else {
      assert.ok(current.choices.length >= 2);
      assert.equal(exercise.choose((current.answer + 1) % current.choices.length), false);
      assert.equal(exercise.choose(current.answer), true);
    }
  }
});

test('不正な移動と課題と違う合法手を拒否し、元の局面で再挑戦できる', () => {
  const knight = new IntroExercise(lesson('knight'));
  assert.equal(play(knight, 'g1g3'), false);
  assert.equal(play(knight, 'g1h3'), false);
  assert.equal(knight.position.game.fen(), chessRules.DEFAULT_POSITION);
  assert.equal(play(knight, 'g1f3'), true);
  assert.equal(play(knight, 'g1f3'), false);
});

test('特殊ルールとチェックの課題が盤上で意図した結果になる', () => {
  const castle = new IntroExercise(lesson('castle'));
  assert.ok(play(castle, 'e1g1'));
  assert.equal(castle.position.game.get('f1').type, 'r');
  assert.equal(castle.position.game.get('g1').type, 'k');

  const passant = new IntroExercise(lesson('en-passant'));
  assert.ok(play(passant, 'e5d6'));
  assert.equal(passant.position.game.get('d5'), undefined);
  assert.ok(passant.position.lastMove.isEnPassant());

  const promotion = new IntroExercise(lesson('promotion'));
  assert.equal(play(promotion, 'a7a8r'), false);
  assert.ok(play(promotion, 'a7a8q'));
  assert.equal(promotion.position.game.get('a8').type, 'q');

  const escape = new IntroExercise(lesson('escape'));
  assert.ok(escape.position.game.isCheck());
  assert.ok(play(escape, 'e1f1'));
  assert.equal(escape.position.game.isCheck(), false);
});

test('同じ局面でクイーンの行き先によって勝ちとステイルメイトが分かれる', () => {
  const trap = new IntroExercise(lesson('stalemate'));
  const mate = new IntroExercise(lesson('mate'));
  assert.equal(trap.position.game.fen(), mate.position.game.fen());
  assert.ok(play(trap, 'g5g6'));
  assert.equal(trap.position.outcome, 'stalemate');
  assert.equal(trap.position.game.isCheck(), false);
  assert.ok(play(mate, 'g5g7'));
  assert.equal(mate.position.outcome, 'checkmate');
  const quiz = lesson('quiz-mate');
  const actual = new IntroExercise(quiz).position.game.moves({ verbose: true })
    .filter((move) => move.piece === 'q' && move.san.endsWith('#')).map(({ lan }) => lan);
  assert.deepEqual(Array.from(actual).sort(), Array.from(quiz.moves).sort());
});

test('完了したレッスン・章・理解度チェックを保存、再読込、削除できる', () => {
  const data = new Map([['unrelated', 'keep']]);
  const storage = {
    getItem: (key) => data.get(key),
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
  const progress = new IntroProgress(storage);
  progress.enter(lesson('knight'));
  progress.answer(lesson('knight'), true);
  progress.enter(lesson('quiz-knight'));
  progress.answer(lesson('quiz-knight'), false);
  progress.answer(lesson('quiz-knight'), true);
  progress.answer(lesson('quiz-knight'), false);
  const reloaded = new IntroProgress(storage);
  assert.equal(reloaded.data.chapter, 'review');
  assert.equal(reloaded.data.lesson, 'quiz-knight');
  assert.deepEqual(Array.from(reloaded.data.completed), ['knight', 'quiz-knight']);
  assert.deepEqual({ ...reloaded.data.quiz['quiz-knight'] }, { attempts: 3, firstCorrect: false, solved: true });
  assert.equal(reloaded.clear(), true);
  assert.equal(data.has(introStorageKey), false);
  assert.equal(data.get('unrelated'), 'keep');
  assert.equal(new IntroProgress(storage).data.completed.length, 0);
});

test('保存を拒否された場合でもタブ内で進め、壊れた保存データでも開始できる', () => {
  const disabled = new IntroProgress({ getItem: () => null, setItem: () => { throw new Error(); } });
  disabled.enter(lesson('pawn'));
  disabled.answer(lesson('pawn'), true);
  assert.equal(disabled.available, false);
  assert.equal(disabled.data.completed.includes('pawn'), true);
  const corrupted = new IntroProgress({ getItem: () => '{bad-json' });
  assert.equal(corrupted.data.completed.length, 0);
});

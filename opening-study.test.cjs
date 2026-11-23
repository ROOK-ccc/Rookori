const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

const source = ['vendor/chess.js', 'opening-data.js', 'opening-study.js']
  .map((file) => readFileSync(join(__dirname, file), 'utf8')).join('\n');
const { OpeningStudy, openings, chessRules } = runInNewContext(
  `${source}\n({ OpeningStudy, openings, chessRules })`,
);

const playLine = (study, ...moves) => {
  for (const [from, to, promotion] of moves) assert.equal(study.play(from, to, promotion), true);
};

test('全20候補を解説付きで最後まで再生し、全局面を戻せる', () => {
  assert.equal(openings.length, 20);
  for (const { id, moves, explanations } of openings) {
    const study = new OpeningStudy(moves);
    const positions = [study.game.fen()];
    assert.equal(positions[0], chessRules.DEFAULT_POSITION, id);
    assert.equal(explanations.length, moves.length, id);
    moves.forEach((uci, index) => {
      assert.ok(explanations[index].trim(), `${id}: ${uci} の解説`);
      assert.equal(study.advance(), true, `${id}: ${uci}`);
      assert.equal(study.lastMove.lan, uci);
      assert.equal(study.lastMove.color, index % 2 === 0 ? 'w' : 'b');
      assert.equal(study.step, index + 1);
      positions.push(study.game.fen());
    });
    assert.equal(study.complete, true, id);
    assert.equal(study.advance(), false, id);
    for (let index = moves.length - 1; index >= 0; index -= 1) {
      study.undo();
      assert.equal(study.game.fen(), positions[index], id);
      assert.equal(study.lastMove?.lan, moves[index - 1], id);
    }
    assert.equal(study.step, 0);
    assert.equal(study.advance(), true);
    study.reset();
    assert.equal(study.game.fen(), positions[0], id);
    assert.equal(study.lastMove, undefined, id);
  }
});

test('手で見本を指せる。脱線した手を戻すと基本手順を再開できる', () => {
  const study = new OpeningStudy(openings[0].moves);
  playLine(study, ['e2', 'e4']);
  assert.equal(study.guided, true);
  const position = study.game.fen();
  playLine(study, ['c7', 'c5'], ['g1', 'f3']);
  assert.equal(study.guided, false);
  assert.equal(study.advance(), false);
  study.undo();
  assert.equal(study.guided, false);
  study.undo();
  assert.equal(study.game.fen(), position);
  assert.equal(study.advance(), true);
  assert.equal(study.lastMove.lan, 'e7e5');
  while (study.advance()) {}
  playLine(study, ['g8', 'f6']);
  assert.equal(study.guided, false);
  study.undo();
  assert.equal(study.complete, true);
  study.reset();
  assert.equal(study.canAdvance, true);
});

test('手番違い、駒の動き違反、チェックを解消しない手を拒む', () => {
  const study = new OpeningStudy([]);
  assert.equal(study.play('e7', 'e5'), false);
  assert.equal(study.play('a1', 'a4'), false);
  assert.equal(study.play('e2', 'e5'), false);
  assert.equal(study.game.fen(), chessRules.DEFAULT_POSITION);
  const checked = new OpeningStudy([], '4r1k1/8/8/8/8/8/PPP5/4K3 w - - 0 1');
  assert.equal(checked.game.isCheck(), true);
  const position = checked.game.fen();
  assert.equal(checked.play('a2', 'a4'), false);
  assert.equal(checked.game.fen(), position);
  playLine(checked, ['e1', 'f1']);
  assert.equal(checked.game.isCheck(), false);
});

test('キャスリングでキングとルークを動かし、権利も含めて戻す', () => {
  const study = new OpeningStudy([]);
  playLine(study, ['e2', 'e4'], ['e7', 'e5'], ['g1', 'f3'], ['b8', 'c6'],
    ['f1', 'c4'], ['g8', 'f6']);
  const position = study.game.fen();
  playLine(study, ['e1', 'g1']);
  assert.equal(study.game.get('g1').type, 'k');
  assert.equal(study.game.get('f1').type, 'r');
  assert.equal(study.game.get('h1'), undefined);
  study.undo();
  assert.equal(study.game.fen(), position);
  assert.equal(study.legalMoves('e1').some((move) => move.isKingsideCastle()), true);

  const blocked = new OpeningStudy([], '4k3/8/8/8/8/5r2/8/4K2R w K - 0 1');
  assert.equal(blocked.play('e1', 'g1'), false, '攻撃されているマスを通れない');
});

test('アンパッサンでポーンを取り、戻したら直後だけ指せる状態も復元する', () => {
  const study = new OpeningStudy([]);
  playLine(study, ['e2', 'e4'], ['a7', 'a6'], ['e4', 'e5'], ['d7', 'd5']);
  const position = study.game.fen();
  playLine(study, ['e5', 'd6']);
  assert.equal(study.lastMove.isEnPassant(), true);
  assert.equal(study.game.get('d5'), undefined);
  study.undo();
  assert.equal(study.game.fen(), position);
  assert.equal(study.legalMoves('e5').some((move) => move.to === 'd6'), true);
  playLine(study, ['h2', 'h3'], ['a6', 'a5']);
  assert.equal(study.play('e5', 'd6'), false);
});

test('昇格先4種類を選べる。昇格を戻すとポーンに戻る', () => {
  const initial = '7k/P7/8/8/8/8/8/7K w - - 0 1';
  const study = new OpeningStudy([], initial);
  assert.equal(study.play('a7', 'a8'), false);
  for (const piece of ['q', 'r', 'b', 'n']) {
    playLine(study, ['a7', 'a8', piece]);
    assert.equal(study.game.get('a8').type, piece);
    study.undo();
    assert.equal(study.game.fen(), initial);
  }
});

test('チェックメイト、ステイルメイト、駒不足で終了し、一手戻ると続けられる', () => {
  const mate = new OpeningStudy([]);
  playLine(mate, ['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4']);
  assert.equal(mate.outcome, 'checkmate');
  assert.equal(mate.legalMoves('a2').length, 0);
  assert.equal(mate.play('a2', 'a3'), false);
  mate.undo();
  assert.equal(mate.outcome, null);
  playLine(mate, ['b8', 'c6']);

  const stale = new OpeningStudy([], '7k/5K2/8/6Q1/8/8/8/8 w - - 0 1');
  playLine(stale, ['g5', 'g6']);
  assert.equal(stale.outcome, 'stalemate');
  stale.undo();
  assert.equal(stale.outcome, null);

  const material = new OpeningStudy([], '7k/P7/8/8/8/8/8/7K w - - 0 1');
  playLine(material, ['a7', 'a8', 'n']);
  assert.equal(material.outcome, 'insufficient-material');
  assert.equal(material.play('h8', 'h7'), false);
});

test('同じ局面の繰り返しと50手ルールを扱い、取り消すと終了状態も戻る', () => {
  const repetition = new OpeningStudy([]);
  for (let index = 0; index < 2; index += 1) {
    playLine(repetition, ['g1', 'f3'], ['g8', 'f6'], ['f3', 'g1'], ['f6', 'g8']);
  }
  assert.equal(repetition.outcome, 'repetition');
  repetition.undo();
  assert.equal(repetition.outcome, null);
  playLine(repetition, ['f6', 'g8']);
  assert.equal(repetition.outcome, 'repetition');
  repetition.reset();
  assert.equal(repetition.outcome, null);

  const fifty = new OpeningStudy([], '7k/8/8/8/8/8/R7/7K w - - 99 50');
  playLine(fifty, ['a2', 'b2']);
  assert.equal(fifty.outcome, 'fifty-moves');
  fifty.undo();
  assert.equal(fifty.outcome, null);
});

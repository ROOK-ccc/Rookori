const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

const source = ['vendor/chess.js', 'opening-data.js', 'opening-variations.js', 'opening-study.js', 'opening-memory.js']
  .map(file => readFileSync(join(__dirname, file), 'utf8')).join('\n');
const { openings, openingVariations, findStudyOpening, openingNotation, OpeningPractice, OpeningPracticeHistory, openingHistoryKey } = runInNewContext(
  `${source}\n({ openings, openingVariations, findStudyOpening, openingNotation, OpeningPractice, OpeningPracticeHistory, openingHistoryKey })`,
);
const play = (practice, uci) => practice.play(uci.slice(0, 2), uci.slice(2, 4), uci[4]);

test('従来の20戦法と追加の8分岐を、白番・黒番とも最後まで練習できる', () => {
  assert.equal(openings.length, 20);
  assert.equal(openingVariations.length, 8);
  assert.equal(new Set([...openings, ...openingVariations].map(opening => opening.id)).size, 28);
  assert.equal(openingVariations.filter(opening => opening.slot === 'white').length, 2);
  for (const opening of [...openings, ...openingVariations]) {
    assert.equal(findStudyOpening(opening.id), opening);
    assert.ok(opening.explanations.every(explanation => Boolean(explanation?.trim())), opening.id);
    const notation = openingNotation(opening);
    assert.equal(notation.length, opening.moves.length);
    for (const color of ['w', 'b']) {
      const practice = new OpeningPractice(opening, color);
      for (const expected of opening.moves) {
        assert.equal(practice.expected, expected);
        assert.equal(practice.learnerTurn ? play(practice, expected) : practice.opponentMove(), true, opening.id);
        assert.equal(practice.study.lastMove.lan, expected);
      }
      assert.equal(practice.complete, true);
      assert.equal(practice.trained, practice.total);
      assert.equal(practice.record().unassistedFirstCorrect, practice.total);
    }
  }
});

test('シシリアンの代表手順が各体系を決める手に到達する', () => {
  const finalMoves = {
    najdorf: '5...a6', dragon: '5...g6', classical: '5...d6', alapin: '2.c3',
    'accelerated-dragon': '4...g6', sveshnikov: '5...e5', scheveningen: '5...e6', closed: '2.Nc3',
  };
  for (const [id, expected] of Object.entries(finalMoves)) {
    const variation = findStudyOpening(`sicilian-${id}`);
    assert.equal(variation.parentId, 'sicilian-defense');
    assert.equal(openingNotation(variation).at(-1), expected);
  }
});

test('不正解で局面を変えず、3段階のヒントと初回正解を別々に記録する', () => {
  const practice = new OpeningPractice(findStudyOpening('italian-game'), 'w');
  assert.equal(practice.opponentMove(), false);
  const fen = practice.study.game.fen();
  assert.equal(play(practice, 'd2d4'), false);
  assert.equal(practice.study.game.fen(), fen);
  assert.deepEqual([1, 2, 3, 3], Array.from({ length: 4 }, () => practice.revealHint()));
  assert.equal(play(practice, 'e2e4'), true);
  assert.equal(play(practice, 'g1f3'), false);
  assert.equal(practice.opponentMove(), true);
  practice.revealHint();
  assert.equal(play(practice, 'g1f3'), true);
  assert.equal(practice.opponentMove(), true);
  assert.equal(play(practice, 'f1c4'), true);
  const record = practice.record();
  assert.equal(record.trained, 3);
  assert.equal(record.firstCorrect, 2);
  assert.equal(record.unassistedFirstCorrect, 1);
  assert.equal(record.mistakes, 1);
  assert.equal(record.hints, 4);
  assert.equal(record.errors[0].expected, 'e2e4');
  assert.equal(record.errors[0].played, 'd2d4');
});

test('保存済みのバリエーションと色を分け、前回の誤答から復習を並べる', () => {
  const values = new Map([['chesspath.intro.v1', 'preserved']]);
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const history = new OpeningPracticeHistory(storage);
  const opening = findStudyOpening('sicilian-najdorf');
  const black = new OpeningPractice(opening, 'b');
  black.opponentMove();
  play(black, 'e7e5');
  history.save(black.record());
  play(black, 'c7c5');
  history.save(black.record());
  const white = new OpeningPractice(opening, 'w');
  play(white, 'e2e4');
  history.save(white.record());
  const other = new OpeningPractice(findStudyOpening('sicilian-dragon'), 'b');
  other.opponentMove();
  other.revealHint();
  history.save(other.record());
  const loaded = new OpeningPracticeHistory(storage).summaries();
  assert.equal(loaded.length, 3);
  assert.equal(loaded[0].latest.openingId, 'sicilian-defense');
  assert.equal(loaded[0].latest.variationId, 'sicilian-najdorf');
  assert.equal(loaded[0].color, 'b');
  assert.equal(loaded[0].count, 1);
  assert.equal(loaded[0].errors.get(1), 1);
  assert.equal(loaded[1].id, 'sicilian-dragon');
  assert.equal(values.get('chesspath.intro.v1'), 'preserved');
  assert.equal(JSON.parse(values.get(openingHistoryKey)).schemaVersion, 1);
});

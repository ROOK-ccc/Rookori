const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

const source = ['vendor/chess.js', 'opening-data.js', 'opening-expansion.js', 'opening-variations.js', 'opening-study.js', 'opening-memory.js']
  .map(file => readFileSync(join(__dirname, file), 'utf8')).join('\n');
const { studyOpenings, openingVariations, findStudyOpening, openingNotation, OpeningPractice, OpeningPracticeHistory, openingHistoryKey, chessRules, expandedOpenings, expandedVariations } = runInNewContext(
  `${source}\n({ studyOpenings, openingVariations, findStudyOpening, openingNotation, OpeningPractice, OpeningPracticeHistory, openingHistoryKey, chessRules, expandedOpenings, expandedVariations })`,
);
const play = (practice, uci) => practice.play(uci.slice(0, 2), uci.slice(2, 4), uci[4]);

test('全オープニングと分岐を初期局面から白番・黒番とも最後まで練習できる', () => {
  assert.equal(studyOpenings.length, 46);
  assert.equal(openingVariations.length, 52);
  assert.equal(new Set([...studyOpenings, ...openingVariations].map(opening => opening.id)).size, 98);
  for (const opening of [...studyOpenings, ...openingVariations]) {
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

test('追加定跡の親・出典・分岐・SAN・FENを検証し、同じ主手順の重複を防ぐ', () => {
  const expanded = new Set([...expandedOpenings, ...expandedVariations].map(opening => opening.id));
  const existing = [...studyOpenings, ...openingVariations].filter(opening => !expanded.has(opening.id));
  const seen = new Set(existing.map(opening => opening.moves.join(' ')));
  for (const entry of [...expandedOpenings, ...expandedVariations]) {
    const { id, name, english, moves, eco, branchPly, parentId, source, white, black, placement } = entry;
    assert.ok(name && english && white && black && placement && source, id);
    assert.match(eco, /^[A-E][0-9]{2}$/);
    assert.ok(branchPly >= 1 && branchPly <= moves.length, id);
    const key = moves.join(' ');
    assert.ok(!seen.has(key), id);
    seen.add(key);
    const board = new chessRules.Chess();
    const positions = moves.map(uci => board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).after);
    assert.ok(positions.every(fen => chessRules.validateFen(fen).ok), id);
    if (parentId) {
      const parent = findStudyOpening(parentId);
      assert.ok(parent && !parent.parentId, id);
      assert.equal(entry.moves[0], parent.moves[0], id);
    }
  }
  const petrov = openingNotation(findStudyOpening('petrov-center'));
  assert.equal(petrov.at(-2), '6.exd6');
  assert.equal(petrov.at(-1), '6...Nxd6');
  assert.equal(openingNotation(findStudyOpening('petrov-classical')).at(-1), '9...Nf6');
  assert.equal(openingNotation(findStudyOpening('pirc-quiet-czech')).at(-1), '7...Nbd7');
  assert.equal(openingNotation(findStudyOpening('pirc-byrne')).at(-1), '6...O-O');
  assert.equal(openingNotation(findStudyOpening('pirc-weiss')).at(-1), '6.Bd3');
  const normalized = value => value.toLowerCase().replace(/[\s・'’\-–]+/g, '');
  const rootNames = new Map();
  for (const { id, name, english, aliases = [] } of studyOpenings) {
    for (const label of [name, english, ...aliases]) {
      const key = normalized(label);
      assert.ok(!rootNames.has(key) || rootNames.get(key) === id, label);
      rootNames.set(key, id);
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

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

const source = ['opening-data.js', 'opening-scoring.js']
  .map((file) => readFileSync(join(__dirname, file), 'utf8')).join('\n');
const { openingQuestions, openingPreferences, openingTraits, openings, scoreOpenings } = runInNewContext(
  `${source}\n({ openingQuestions, openingPreferences, openingTraits, openings, scoreOpenings })`,
);
const slots = ['white', 'blackE4', 'blackD4'];
const resultIds = (results) => Array.from(results, ({ candidate }) => candidate.id);

test('8問・各3択に採点の設定があり、20候補のIDが重複しない', () => {
  assert.equal(openingQuestions.length, 8);
  assert.equal(openingPreferences.length, 8);
  openingQuestions.forEach(({ choices }, index) => {
    assert.equal(choices.length, 3);
    assert.equal(openingPreferences[index].choices.length, 3);
    for (const [targets, reason] of openingPreferences[index].choices) {
      assert.ok(reason.trim());
      for (const [trait, value] of Object.entries(targets)) {
        assert.ok(openingTraits.includes(trait));
        assert.ok(Number.isInteger(value) && value >= 1 && value <= 5);
      }
    }
  });
  assert.equal(openings.length, 20);
  assert.equal(new Set(openings.map(({ id }) => id)).size, 20);
  for (const candidate of openings) {
    assert.match(candidate.id, /^[a-z]+(?:-[a-z]+)*$/);
    assert.ok(slots.includes(candidate.slot));
    for (const field of ['name', 'english', 'description', 'tip', 'condition']) {
      assert.ok(candidate[field].trim(), `${candidate.id}: ${field}`);
    }
    for (const trait of openingTraits) {
      const value = candidate.traits[trait];
      assert.ok(Number.isInteger(value) && value >= 1 && value <= 5, `${candidate.id}: ${trait}`);
    }
    assert.ok(candidate.moves.length >= 2);
    candidate.moves.forEach((move) => assert.match(move, /^[a-h][1-8][a-h][1-8]$/));
    if (candidate.slot === 'blackE4') assert.equal(candidate.moves[0], 'e2e4');
    if (candidate.slot === 'blackD4') assert.equal(candidate.moves[0], 'd2d4');
  }
});

test('全6,561通りで3枠を返し、同じ回答の結果は同じになる', () => {
  for (let pattern = 0; pattern < 3 ** 8; pattern += 1) {
    const answers = Array.from({ length: 8 }, (_, index) => Math.floor(pattern / 3 ** index) % 3);
    const results = scoreOpenings(answers);
    assert.deepEqual(Array.from(results, ({ candidate }) => candidate.slot), slots);
    assert.deepEqual(resultIds(results), resultIds(scoreOpenings(answers)));
    const reasons = openingPreferences.map(({ choices }, index) => choices[answers[index]][1]);
    for (const { candidate, reason } of results) {
      const limit = 3 + Math.min(answers[0], answers[3]);
      assert.ok(candidate.traits.complexity <= limit);
      assert.ok(candidate.traits.burden <= limit);
      assert.ok(reasons.includes(reason));
    }
  }
});

test('戦い方や学習量を変えると推薦が変わり、経験者には難しい候補も出る', () => {
  const attacking = scoreOpenings([0, 0, 0, 0, 0, 0, 0, 0]);
  const patient = scoreOpenings([0, 1, 1, 0, 0, 1, 0, 1]);
  assert.notDeepEqual(resultIds(attacking), resultIds(patient));
  const advanced = scoreOpenings([2, 0, 0, 2, 2, 0, 2, 0]);
  assert.ok(advanced.some(({ candidate }) => candidate.traits.complexity === 5));
  for (const questionIndex of [0, 3]) {
    const answers = [2, 0, 0, 2, 2, 0, 2, 0];
    answers[questionIndex] = 0;
    assert.notDeepEqual(resultIds(scoreOpenings(answers)), resultIds(advanced));
  }
});

test('同点では負担、複雑さ、IDの順に比較する', () => {
  const scoreTies = runInNewContext(`${source}
    (candidates) => {
      // 攻撃性だけを採点し、負担と複雑さに関係なく同点になるようにする。
      openingPreferences.forEach(({ choices }) => choices.forEach((choice) => {
        choice[0] = { attack: 5 };
      }));
      openings.splice(0, openings.length, ...candidates.map(([id, burden, complexity]) => ({
        id, slot: 'white',
        traits: { attack: 5, tactics: 5, theory: 3, clarity: 4, flexibility: 1, originality: 3, burden, complexity },
      })));
      return scoreOpenings([0, 0, 0, 2, 0, 0, 0, 0])[0].candidate.id;
    }
  `);
  assert.equal(scoreTies([['a', 2, 1], ['z', 1, 2]]), 'z');
  assert.equal(scoreTies([['a', 1, 2], ['z', 1, 1]]), 'z');
  assert.equal(scoreTies([['a', 1, 2], ['z', 1, 2]]), 'a');
});

test('未回答・範囲外・数値以外の回答を検出する', () => {
  for (const answers of [[], Array(8).fill(null), Array(8).fill(3), Array(8).fill('1'), Array(8)]) {
    assert.throws(() => scoreOpenings(answers), /全問の回答/);
  }
});

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

// ブラウザーと同じ順でファイルを読み込み、採点処理だけをテストします。
const source = ['data.js', 'scoring.js'].map((file) => readFileSync(join(__dirname, file), 'utf8')).join('\n');
const { getQuestions, scoreAnswers, types } = runInNewContext(`${source}\n({ getQuestions, scoreAnswers, types })`);

const expectedSides = ['AS', 'TP', 'CL', 'ID'];
const expectedTypes = [
  'ATCI', 'ATCD', 'ATLI', 'ATLD', 'APCI', 'APCD', 'APLI', 'APLD',
  'STCI', 'STCD', 'STLI', 'STLD', 'SPCI', 'SPCD', 'SPLI', 'SPLD',
];

for (const mode of ['beginner', 'experienced']) {
  test(`${mode}: 12問を4軸から交互に出題する`, () => {
    const questions = getQuestions(mode);
    assert.equal(questions.length, 12);
    assert.equal(new Set(questions.map(({ prompt }) => prompt)).size, 12);
    questions.forEach((question, index) => {
      assert.equal(question.codes.join(''), expectedSides[index % 4]);
      assert.equal(question.choices.length, 2);
    });
  });

  test(`${mode}: 全4,096通りの回答を多数決で採点する`, () => {
    const questions = getQuestions(mode);
    const results = new Set();

    for (let mask = 0; mask < 2 ** 12; mask += 1) {
      const answers = Array.from({ length: 12 }, (_, index) => (mask >> index) & 1);
      const expected = expectedSides.map((sides, axis) => {
        const rightVotes = answers[axis] + answers[axis + 4] + answers[axis + 8];
        return sides[Number(rightVotes >= 2)];
      }).join('');
      const actual = scoreAnswers(questions, answers);
      assert.equal(actual, expected);
      results.add(actual);
    }

    assert.deepEqual([...results].sort(), [...expectedTypes].sort());
    assert.throws(() => scoreAnswers(questions, Array(12).fill(null)), /全問の回答/);
  });
}

test('16タイプすべてに結果表示用のデータがある', () => {
  assert.deepEqual(Object.keys(types), expectedTypes);
  for (const code of expectedTypes) {
    for (const field of ['name', 'description', 'strength', 'caution', 'opening', 'tip']) {
      assert.ok(types[code][field]?.trim(), `${code} ${field}`);
    }
  }
});

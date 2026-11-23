const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

const source = ['data.js', 'card-data.js', 'cards.js']
  .map(file => readFileSync(join(__dirname, file), 'utf8')).join('\n');
const document = { getElementById: () => ({ addEventListener() {} }) };
const { axes, types, cardStyles, getCardData, piecePaths, artworkPatterns, metalFinishes } = runInNewContext(
  source + '\n({ axes, types, cardStyles, getCardData, piecePaths, artworkPatterns, metalFinishes })',
  { document }
);

test('16タイプの共有カードに既存の名称・4軸と個別のデザインが揃っている', () => {
  const codes = Object.keys(types);
  assert.equal(codes.length, 16);
  assert.deepEqual(Object.keys(cardStyles).sort(), codes.sort());
  const taglines = new Set();
  const appearances = new Set();

  for (const code of codes) {
    const card = getCardData(code);
    assert.equal(card.typeCode, code);
    assert.equal(card.typeName, types[code].name);
    assert.equal(card.traits.length, axes.length);
    card.traits.forEach(({ letter, label }, index) => {
      assert.equal(letter, code[index]);
      assert.equal(label, axes[index].labels[axes[index].codes.indexOf(letter)]);
    });
    assert.match(card.color, /^#[0-9a-f]{6}$/i);
    assert.ok(Object.hasOwn(piecePaths, card.motif));
    assert.ok(Object.hasOwn(artworkPatterns, card.pattern));
    assert.ok(Object.hasOwn(metalFinishes, card.finish));
    assert.match(card.tagline, /^[^\n\r]+$/);
    taglines.add(card.tagline);
    appearances.add([card.color, card.motif, card.pattern, card.finish, card.angle].join('/'));
  }
  assert.equal(taglines.size, 16);
  assert.equal(appearances.size, 16);
});

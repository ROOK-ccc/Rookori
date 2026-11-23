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

test('保存と画像共有はRookori名の同じPNGを使う', async () => {
  const controls = new Map();
  const recorded = {};
  const blob = new Blob(['PNG'], { type: 'image/png' });
  const document = {
    getElementById(id) {
      const control = { addEventListener: (event, listener) => { control[event] = listener; } };
      if (id === 'share-preview') {
        control.setAttribute = (name, value) => { recorded[name] = value; };
        control.toBlob = (callback, type) => {
          assert.equal(type, 'image/png');
          callback(blob);
        };
      }
      controls.set(id, control);
      return control;
    },
    createElement: () => ({ click() { recorded.download = this.download; } }),
  };
  runInNewContext(source + '\ndrawCard = () => {}; renderShareCard("ATCI");', {
    document, File,
    navigator: {
      canShare: ({ files }) => files[0].type === 'image/png',
      share: async ({ files }) => { recorded.shared = files[0]; },
    },
    URL: { createObjectURL: file => { recorded.saved = file; return 'blob:test'; } },
    window: { setTimeout() {} },
  });
  assert.match(recorded['aria-label'], /^Rookori チェス16タイプ診断、ATCI、炎の戦術家/);
  assert.equal(controls.get('save-card').disabled, false);
  assert.equal(controls.get('share-card').hidden, false);
  controls.get('save-card').click();
  await controls.get('share-card').click();
  assert.equal(recorded.download, 'Rookori-ATCI.png');
  assert.equal(recorded.saved.type, 'image/png');
  assert.equal(recorded.shared, recorded.saved);
});

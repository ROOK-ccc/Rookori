const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

const sources = ['chess-terms.js', 'navigation.js']
  .map(file => readFileSync(join(__dirname, file), 'utf8')).join('\n');
const { chessTerms, chessTermCategories, findChessTerms, readSiteRoute } = runInNewContext(
  sources + '\n({ chessTerms, chessTermCategories, findChessTerms, readSiteRoute })', { URL }
);

test('5分野に40語あり、英語表記と関連用語の参照が揃う', () => {
  const ids = new Set(chessTerms.map(entry => entry.id));
  const categories = new Set(chessTermCategories.map(([id]) => id));
  assert.equal(chessTerms.length, 40);
  assert.equal(ids.size, chessTerms.length);
  assert.equal(categories.size, 5);
  assert.equal(new Set(chessTerms.map(entry => entry.category)).size, categories.size);
  for (const entry of chessTerms) {
    assert.ok(categories.has(entry.category));
    assert.ok(entry.term && entry.english && entry.definition);
    for (const id of entry.related ?? []) assert.ok(ids.has(id), `${entry.id}: ${id}`);
  }
});

test('用語を日本語、かなの表記ゆれ、英語と別表記から検索できる', () => {
  const ids = (query, category) => Array.from(findChessTerms(query, category), entry => entry.id);
  assert.ok(ids('あんぱっさん').includes('en-passant'));
  assert.ok(ids('ｽｷｭｱｰ').includes('skewer'));
  assert.ok(ids('FOR K').includes('fork'));
  assert.ok(ids('Forsyth Edwards').includes('fen'));
  assert.ok(ids('ＥＣＯ コード').includes('eco'));
  assert.ok(ids('両取り', 'tactics').includes('fork'));
  assert.deepEqual(ids('両取り', 'analysis'), []);
  assert.deepEqual(ids('zzzz'), []);
});

test('個々の用語を直接開くルートを認識する', () => {
  const site = 'https://example.test/Rookori/';
  assert.equal(readSiteRoute(site + '#glossary').path, 'glossary');
  for (const id of ['fen', 'threefold-repetition']) {
    assert.equal(readSiteRoute(site + '#glossary/' + id).termId, id);
  }
});

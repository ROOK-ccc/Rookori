const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');

const { explainSan, chessRules } = runInNewContext(['vendor/chess.js', 'chess-notation.js']
  .map(file => readFileSync(join(__dirname, file), 'utf8')).join('\n') + '\n({ explainSan, chessRules })');

test('SANの駒、駒取り、手数・移動元の指定、キャスリング、昇格と詰みを読み分ける', () => {
  assert.equal(explainSan('Qxd8+').meaning, 'クイーンがd8の駒を取り、チェックをかける。');
  assert.match(explainSan('3...O-O-O+').parts.join(' '), /3手目の黒.*クイーンサイド.*チェック/);
  assert.match(explainSan('O-O').meaning, /キングサイド/);
  assert.match(explainSan('Nbd2').parts.join(' '), /b：移動元のファイル/);
  assert.match(explainSan('R1e2').parts.join(' '), /1：移動元のランク/);
  assert.match(explainSan('Nb1d2').parts.join(' '), /b1：移動元のマス/);
  assert.match(explainSan('cxd8=N#').parts.join(' '), /ナイトに昇格.*チェックメイト/);
  assert.match(explainSan('e4').meaning, /ポーン/);
  for (const value of ['R99', 'Qxd9+', 'e2=K', 'e2=Q', 'e8', 'bxb5', '000.e4', '1-0', 'e2e4', 'a1:b2']) {
    assert.equal(explainSan(value), null, value);
  }
  const position = new chessRules.Chess();
  assert.ok(explainSan('1.e4', position));
  assert.equal(explainSan('1...e4', position), null);
  assert.equal(explainSan('Qxd8+', position), null);
});

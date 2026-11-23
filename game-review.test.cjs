const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

const source = ['vendor/chess.js', 'opening-data.js', 'opening-variations.js', 'game-review.js', 'navigation.js']
  .map(file => readFileSync(join(__dirname, file), 'utf8')).join('\n');
const {
  chessRules, sampleGamePgn, parseReviewGames, reviewPosition, reviewOpening, openings,
  openingVariations, reviewGameRecord, reviewNote, makeGameBackup, validateGameBackup, readSiteRoute,
} = runInNewContext(source + `
  ({ chessRules, sampleGamePgn, parseReviewGames, reviewPosition, reviewOpening, openings,
    openingVariations, reviewGameRecord, reviewNote, makeGameBackup, validateGameBackup, readSiteRoute })
`, { URL });

const san = game => Array.from(game.positions.slice(1), ({ move }) => move.san);
const gameId = 'a'.repeat(32);

test('コメント・分岐・複数の対局を読み込み、本譜と記録された情報を使用する', () => {
  const pgn = '[Event "対局 [1-0]"]\r\n[White "A"]\r\n[Black "B"]\r\n[Date "2026.11.23"]\r\n[Result "1-0"]\r\n\r\n'
    + '1. e4 {0-1 *} (1. d4 d5 (1... Nf6)) e5 $1 ; 0-1\r\n2. Nf3 Nc6 1-0\r\n\r\n'
    + '% escape line\r\n1. d4 d5*';
  const games = parseReviewGames('\uFEFF' + pgn);
  assert.equal(games.length, 2);
  assert.deepEqual(san(games[0]), ['e4', 'e5', 'Nf3', 'Nc6']);
  assert.equal(games[0].metadata.event, '対局 [1-0]');
  assert.equal(games[0].metadata.white, 'A');
  assert.equal(games[0].metadata.black, 'B');
  assert.equal(games[0].metadata.date, '2026.11.23');
  assert.equal(games[0].metadata.result, '1-0');
  assert.match(games[0].pgn, /\{0-1 \*\}/);
  assert.deepEqual(san(games[1]), ['d4', 'd5']);
  assert.equal(games[1].metadata.result, '*');
  assert.equal(games[1].metadata.white, null);
  assert.equal(games[1].metadata.date, null);
});

test('不正な手、壊れた区切り、タグとの矛盾を拒否する', () => {
  for (const pgn of [
    '1. e4 Qh4 *', '1. e4 e5 2.', '1. e4 {壊れたコメント', '1. e4 (1. d4 *',
    '[Result "1-0"]\n\n1. e4 0-1', '[SetUp "1"]\n\n1. e4 *',
    '[FEN "invalid"]\n\n1. e4 *', '[Variant "Chess960"]\n\n1. e4 *',
    '1. e4 *\n\n1. e5 *', '1. d4 * 2. Nf3', '1. e4 e5 2. -- *',
  ]) assert.throws(() => parseReviewGames(pgn), /局目/, pgn);
  const [partial] = parseReviewGames('1. e4 e5');
  assert.equal(partial.metadata.result, null);
  assert.equal(partial.metadata.hasEndMarker, false);
});

test('キャスリング・アンパッサン・昇格と指定の開始局面を正しく再現する', () => {
  const [castle] = parseReviewGames(sampleGamePgn);
  const castled = new chessRules.Chess(castle.positions[7].fen);
  assert.equal(castled.get('g1').type, 'k');
  assert.equal(castled.get('f1').type, 'r');
  const [capture] = parseReviewGames('1. e4 a6 2. e5 d5 3. exd6 *');
  const ep = new chessRules.Chess(capture.positions[5].fen);
  assert.equal(ep.get('d6').color, 'w');
  assert.equal(ep.get('d5'), undefined);
  const fen = '7k/8/8/8/8/8/p7/7K b - - 0 34';
  const [promotion] = parseReviewGames(`[SetUp "1"]\n[FEN "${fen}"]\n\n34... a1=Q+ *`);
  assert.equal(promotion.initialFen, fen);
  const [{ move }] = promotion.positions.slice(1);
  assert.equal(move.number, 34);
  assert.equal(move.color, 'b');
  assert.equal(move.promotion, 'q');
  assert.equal(new chessRules.Chess(promotion.positions[1].fen).get('a1').type, 'q');
  assert.throws(() => parseReviewGames('[FEN "7k/8/8/8/8/8/8/4K3 w K - 0 1"]\n\n1. Kf2 *'), /開始時/);
});

test('最初・途中・最後を選び、すべての局面で手順と盤を一致させる', () => {
  const [game] = parseReviewGames(sampleGamePgn);
  const chess = new chessRules.Chess(game.initialFen);
  const last = game.positions.length - 1;
  assert.equal(reviewPosition(game, -1).ply, 0);
  assert.equal(reviewPosition(game, last + 1).ply, last);
  for (const position of game.positions.slice(1)) {
    chess.move(position.move.san);
    assert.equal(reviewPosition(game, position.ply).fen, chess.fen());
    assert.equal(reviewPosition(game, position.ply - 1).ply, position.ply - 1);
  }
});

test('既存教材と冒頭の手順が一致する場合に教材を選ぶ', () => {
  const [game] = parseReviewGames('1. e4 c5 2. Nc3 *');
  assert.equal(reviewOpening(game, [...openings, ...openingVariations]).id, 'sicilian-closed');
  assert.equal(reviewOpening(parseReviewGames('1. e4 *')[0], openings), null);
});

test('設定した局面と棋譜をバックアップから復元し、重複や不正な局面を拒否する', () => {
  const record = reviewGameRecord(parseReviewGames(sampleGamePgn)[0], gameId);
  record.notes.push(reviewNote(record, 0, ''), reviewNote(record, 7, 'キングの安全を確認'));
  const backup = makeGameBackup([record]);
  const [restored] = validateGameBackup(JSON.parse(JSON.stringify(backup)));
  assert.equal(restored.pgn, sampleGamePgn);
  assert.equal(restored.notes[1].fen, record.positions[7].fen);
  assert.equal(restored.notes[1].text, 'キングの安全を確認');
  assert.equal(restored.notes[1].gameId, gameId);
  assert.equal(restored.notes[1].moveNumber, 4);
  assert.equal(restored.notes[0].text, '');
  for (const corrupt of [
    entry => { entry.notes[1].fen = record.initialFen; },
    entry => { entry.notes[1].moveNumber = 5; },
    entry => { entry.notes[1].ply = -1; },
    entry => { entry.notes.push(entry.notes[0]); },
    entry => { entry.pgn += '\n1. e5 *'; },
  ]) {
    const copy = JSON.parse(JSON.stringify(backup));
    corrupt(copy.games[0]);
    assert.throws(() => validateGameBackup(copy));
  }
  assert.throws(() => validateGameBackup({
    ...backup, games: [backup.games[0], { ...backup.games[0], id: 'b'.repeat(32) }],
  }), /複数/);
  assert.throws(() => validateGameBackup({ ...backup, version: 2 }));
});

test('対局の画面に直接移動し、履歴の局面番号を該当する対局にだけ復元する', () => {
  const url = 'https://example.test/ChessPath/';
  const path = `game-review/${gameId}`;
  assert.equal(readSiteRoute(url + '#game-review').path, 'game-review');
  assert.equal(readSiteRoute(url + '#game-library').path, 'game-library');
  assert.equal(readSiteRoute(url + '#game-review/sample').game, 'sample');
  assert.equal(readSiteRoute(url + '#' + path, { path, gamePly: 3 }).gamePly, 3);
  assert.equal(readSiteRoute(url + '#' + path, { path: 'game-review/sample', gamePly: 3 }).gamePly, undefined);
});

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');
const { webcrypto } = require('node:crypto');

const files = ['vendor/chess.js', 'opening-data.js', 'opening-expansion.js', 'opening-variations.js', 'opening-memory.js', 'opening-classification.js',
  'cpu-game.js', 'game-review.js', 'game-study.js', 'learning.js', 'play-style.js', 'uci-engine.js'];
const api = runInNewContext(files.map(file => readFileSync(join(__dirname, file), 'utf8')).join('\n')
  + '\n({ Chess: chessRules.Chess, openings, studyOpenings, openingVariations, cpuOpeningPosition, cpuPgn, cpuReviewGame, validateGameBackup, makeGameBackup, reviewGameRecord, restoreCpuSnapshot, cpuSnapshot, CpuMatch, chooseStyledCpuMove, cpuStyles, cpuStyleFeatures, parseReviewGames, styleFilterGames, styleObserveGame, styleOutline, styleGameGrades, validStyleOwnership, validStyleSnapshots })',
{ URL, document: { currentScript: { src: 'https://example.test/Rookori/uci-engine.js' } }, crypto: webcrypto });

test('本人が使用色を選んだ取り込み棋譜だけを含め、終了状態と重複を確認する', () => {
  const [manual] = api.parseReviewGames('[Site "https://lichess.org/AbCd1234"]\n[TimeControl "180+2"]\n\n1. e4 e5 1-0');
  const white = { ...manual, id: 'a'.repeat(32) };
  const duplicate = { ...white, id: 'b'.repeat(32) };
  const cpu = { ...api.parseReviewGames('1. d4 Nf6 0-1')[0], id: 'c'.repeat(32), cpu: { player: 'b', settings: { mode: 'practice', time: 'unlimited' } } };
  const live = { ...api.parseReviewGames('1. d4 d5 *')[0], id: 'd'.repeat(32) };
  const f = { limit: '10', source: 'all', side: 'all', time: 'all' };
  const games = [white, duplicate, cpu, live];
  assert.deepEqual(Array.from(api.styleFilterGames(games, {}, f), row => row.side), ['b']);
  const ownership = { [white.id]: 'w', [duplicate.id]: 'w', [live.id]: 'w' };
  assert.equal(api.validStyleOwnership(ownership), true);
  const picked = api.styleFilterGames(games, ownership, { ...f, source: 'external', side: 'w', time: 'fast' });
  assert.equal(picked.length, 1);
  const observed = api.styleObserveGame(picked[0].game, 'w');
  assert.equal(observed.checkOpportunities, 0);
  assert.equal(observed.captureOpportunities, 0);
  const outline = api.styleOutline([{ ...picked[0], observed, grades: null }]);
  assert.equal(outline.analyzed, 0);
  assert.equal(outline.castleMedian, null);
  assert.equal(api.validStyleSnapshots([{ filters: f, outline, date: '2026-11-25T00:00:00.000Z' }]), true);
});

test('既存の全定跡を着手履歴どおりに再生し、定跡・棋風・復習用局面を履歴と復元に保持する', () => {
  for (const opening of [...api.studyOpenings, ...api.openingVariations]) {
    const origin = api.cpuOpeningPosition(opening);
    const board = new api.Chess();
    for (const code of origin.moves) board.move({ from: code.slice(0, 2), to: code.slice(2, 4), promotion: code[4] });
    assert.equal(origin.fen, board.fen(), opening.id);
    assert.equal(origin.ply, opening.moves.length);
  }
  const origin = api.cpuOpeningPosition(api.openings[0], 1);
  assert.equal(origin.fen.split(' ')[1], 'b');
  assert.equal(origin.fen.split(' ')[2], 'KQkq');
  const match = new api.CpuMatch({ style: 'defense', time: '3+2', color: 'b' }, { origin, now: () => 0 });
  match.start();
  const move = match.game.moves({ verbose: true })[0];
  match.play(move.from + move.to + (move.promotion ?? ''), 'b');
  const restored = api.restoreCpuSnapshot(api.cpuSnapshot(match), () => 0);
  assert.equal(restored.settings.style, 'defense');
  assert.equal(restored.origin.opening, origin.opening);
  assert.equal(restored.game.fen(), match.game.fen());
  const old = api.cpuSnapshot(match);
  old.settings = { ...old.settings };
  delete old.settings.style;
  assert.equal(api.restoreCpuSnapshot(old, () => 0).settings.style, 'balanced');
  match.finish('resign', 'w');
  const pgn = api.cpuPgn(match);
  assert.match(pgn, /\[RookoriCPUStyle "defense"\]/);
  assert.match(pgn, /\[RookoriOpeningMoves "/);
  const record = api.reviewGameRecord(api.cpuReviewGame(match, { name: 'Stockfish', version: '19', distribution: 'Lite' }), match.id);
  const [archived] = api.validateGameBackup(api.makeGameBackup([record]));
  assert.equal(archived.cpu.origin.opening, origin.opening);
  assert.equal(archived.cpu.settings.style, 'defense');
});

test('全6難易度で棋風による選択が合法、候補差とメイトを優先する', () => {
  const board = new api.Chess('rnbq1rk1/pp2bppp/2p1pn2/3p4/3P1B2/2NBPN2/PPQ2PPP/R3K2R w KQ - 0 9');
  const legal = board.moves({ verbose: true });
  const code = move => move.from + move.to + (move.promotion ?? '');
  const common = { move: code(legal[0]), lines: legal.map(move => ({ score: { unit: 'cp', value: 20 }, depth: 12, pv: [code(move)] })) };
  const moves = new Set();
  const mate = new api.Chess('7k/8/5KQ1/8/8/8/8/8 w - - 0 1');
  for (let level = 1; level <= 6; level++) for (const style of Object.keys(api.cpuStyles)) {
    const settings = new api.CpuMatch({ level, style }).settings;
    const selected = api.chooseStyledCpuMove(board, common, settings);
    assert.ok(legal.some(move => code(move) === selected));
    if (!['balanced', 'random'].includes(style)) {
      moves.add(selected);
      assert.equal(api.chooseStyledCpuMove(mate, { move: 'g6h6', lines: [] }, settings), 'g6g7');
      const wide = { ...common, lines: common.lines.map((line, i) => ({ ...line, score: { unit: 'cp', value: i ? -95 : 30 } })) };
      assert.equal(api.chooseStyledCpuMove(board, wide, settings), common.move);
    }
  }
  assert.ok(moves.size >= 3, Array.from(moves).join(','));
});

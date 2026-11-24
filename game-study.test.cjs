const { test } = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');

const source = ['vendor/chess.js', 'cpu-game.js', 'game-review.js', 'game-study.js']
  .map(file => readFileSync(join(__dirname, file), 'utf8')).join('\n');
const { parseReviewGames, studyPosition, studyPlay, studyVariations, studyEngineResult, studyScoreText, studyGraphValue,
  studyMoveGrade, CpuMatch, cpuSnapshot, restoreCpuSnapshot, cpuPgn, cpuStartingPosition, studyContentKey,
  cpuReviewGame, makeGameBackup, validateGameBackup, studyProgressLabel, studyTimelineScore, studyWhiteShare, reviewRecentTime } =
runInNewContext(source + '\n({ parseReviewGames, studyPosition, studyPlay,'
  + 'studyVariations, studyEngineResult, studyScoreText, studyGraphValue, studyMoveGrade, CpuMatch, cpuSnapshot,'
  + 'restoreCpuSnapshot,cpuPgn,cpuStartingPosition,studyContentKey,cpuReviewGame,makeGameBackup,validateGameBackup,'
  + 'studyProgressLabel,studyTimelineScore,studyWhiteShare,reviewRecentTime })',
{ crypto: webcrypto, performance, TextEncoder });

const [sample] = parseReviewGames('1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 *');

test('盤とグラフが同じ局面評価を選び、空白と片側メイトを区別する', () => {
  const batch = { score: { unit: 'cp', value: 10 } };
  const refined = { score: { unit: 'cp', value: -225 } };
  const record = { scores: [batch, null], single: { '0:': { value: refined }, '1:c7c5': { value: batch } } };
  assert.equal(studyTimelineScore(record, 0), refined);
  assert.equal(studyTimelineScore(record, 1), null);
  assert.equal(studyWhiteShare(refined.score), .275);
  assert.equal(studyWhiteShare({ unit: 'mate', winner: 'w' }), 1);
  assert.equal(studyWhiteShare({ unit: 'mate', winner: 'b' }), 0);
  assert.equal(studyProgressLabel(record, 2), '解析途中（1 / 2局面）');
  assert.equal(studyProgressLabel({ single: record.single }, 2), '局面解析済み');
  assert.equal(studyProgressLabel({ scores: [batch, batch] }, 2), '対局解析済み');
  assert.equal(reviewRecentTime({ pgn: '[TimeControl "180+2"]' }), '3分＋2秒');
});
const seed = (game, ply, variation) => {
  const position = studyPosition(game, ply, variation);
  return { fen: position.game.fen(), initialFen: position.fen, moves: position.moves, gameId: 'a'.repeat(32), ply, color: 'w' };
};

test('複数の変化と途中からの分岐を再現し、本譜を維持する', async () => {
  const original = JSON.stringify(sample);
  const a = { id: 'a', ply: 2, name: '変化A', moves: ['f1c4', 'g8f6'] };
  const b = { id: 'b', ply: 2, name: '変化B', moves: ['f1c4', 'f8c5'] };
  const [one, two] = studyVariations(sample, [a, b, { ...b, moves: ['e4e8'] }]);
  assert.equal(one.name, '変化A');
  assert.equal(two.name, '変化B');
  assert.equal(studyPosition(sample, 2, two.moves).game.get('c5').type, 'b');
  assert.equal(studyPosition(sample, 2, one.moves).game.get('f6').type, 'n');
  assert.equal(JSON.stringify(sample), original);
  assert.notEqual(await studyContentKey(sample), await studyContentKey({ ...sample, pgn: sample.pgn.replace('Nc6', 'Nf6') }));
});

test('自由検討中のキャスリング、アンパッサン、昇格に通常のルールを適用する', () => {
  const examples = [
    ['r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1g1', 'g1', 'k'],
    ['4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', 'e5d6', 'd6', 'p'],
    ...['q', 'r', 'b', 'n'].map(piece => ['4k3/P7/8/8/8/8/7p/4K3 w - - 0 1', 'a7a8' + piece, 'a8', piece]),
  ];
  for (const [fen, code, square, piece] of examples) {
    const game = { initialFen: fen, positions: [{ ply: 0, fen }], pgn: '' };
    const position = studyPosition(game, 0, [code]);
    assert.equal(position.game.get(square).type, piece);
    assert.throws(() => studyPlay(position.game, 'a1a8'));
  }
});

test('Stockfishが返した評価を白基準に変換し、メイトと限定評価を区別する', () => {
  const fen = sample.positions[1].fen;
  const result = studyEngineResult({ move: 'e7e5', lines: [
    { pv: ['e7e5'], depth: 15, score: { unit: 'cp', value: 160 } },
    { pv: ['c7c5'], depth: 15, score: { unit: 'mate', value: -3 } },
    { pv: ['b7b6'], depth: 16, score: { unit: 'cp', value: 400, bound: 'lowerbound' } },
  ] }, 'b', fen);
  assert.equal(studyScoreText(result.score), '-1.6');
  assert.equal(result.candidates[0].san[0], 'e5');
  assert.equal(studyScoreText(result.candidates[1].score), 'M3');
  assert.equal(studyGraphValue(result.candidates[1].score), 500);
  assert.equal(result.candidates.length, 2);
});

test('指し手の評価は浅い探索・大きな深度差を保留し、指した側と強制手を区別する', () => {
  const evaluation = (value, depth = 12) => ({ depth, score: { unit: 'cp', value }, move: 'c7c5', bestmove: 'c7c5' });
  const black = sample.positions[2].move;
  assert.equal(studyMoveGrade(evaluation(-90), evaluation(180), black).kind, 'blunder');
  assert.equal(studyMoveGrade(evaluation(-90, 3), evaluation(180), black), null);
  assert.equal(studyMoveGrade(evaluation(-90, 5), evaluation(180, 14), black), null);
  assert.equal(studyMoveGrade(null, null, black, { forced: true }).kind, 'forced');
  assert.equal(studyMoveGrade(evaluation(900), evaluation(1130), black).kind, 'inaccuracy');
});

test('局面指定のCPU対戦は黒の手番と元の履歴を復元し、新規着手だけをPGNに出力する', () => {
  const origin = seed(sample, 3);
  const match = new CpuMatch({ color: 'b', time: '3+2' }, { origin, now: () => 0 });
  assert.equal(match.game.turn(), 'b');
  assert.equal(match.game.history().join(' '), 'e4 e5 Nf3');
  match.start();
  assert.ok(match.play('f8c5', 'b'));
  assert.ok(match.play('f1c4', 'w'));
  const restored = restoreCpuSnapshot(JSON.parse(JSON.stringify(cpuSnapshot(match))), () => 0);
  assert.equal(restored.game.fen(), match.game.fen());
  assert.equal(restored.origin.gameId, origin.gameId);
  assert.equal(restored.undo(), true);
  assert.equal(restored.game.fen(), origin.fen);
  assert.equal(restored.game.history().length, 3);
  match.finish('resign', 'w');
  assert.match(cpuPgn(match), /\[SetUp "1"\]/);
  assert.match(cpuPgn(match), /\[FEN "/);
  assert.equal(parseReviewGames(cpuPgn(match))[0].positions.length, 3);
  const exported = cpuReviewGame(match, { name: 'Stockfish', version: '19', distribution: 'Lite' });
  const [saved] = validateGameBackup(makeGameBackup([{ ...exported, id: match.id, savedAt: match.started.toISOString(), notes: [] }]));
  assert.equal(saved.cpu.origin.gameId, origin.gameId);
  assert.equal(studyPosition(saved, 2).moves.length, 5);
});

test('局面指定のCPU対戦は終了した局面を拒否し、過去の同一局面を引き継ぐ', () => {
  const [repeated] = parseReviewGames('1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 *');
  const match = new CpuMatch({ color: 'w' }, { origin: seed(repeated, 8) });
  assert.equal(match.repetitions(), 3);
  assert.equal(match.drawClaim(), 'threefold');
  const [mate] = parseReviewGames('1. f3 e5 2. g4 Qh4# 0-1');
  assert.throws(() => cpuStartingPosition(seed(mate, 4)), /対局できません/);
});

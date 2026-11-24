const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');
const source = name => readFileSync(join(__dirname, name), 'utf8');
const context = { performance };
const { CpuMatch, cpuPgn, cpuTimeControl, normalizeCpuSettings, validCpuTime, cpuLevels, cpuHintLevel, Chess } =
  runInNewContext(source('vendor/chess.js') + '\n' + source('cpu-game.js') +
    '\n({ CpuMatch, cpuPgn, cpuTimeControl, normalizeCpuSettings, validCpuTime, cpuLevels, cpuHintLevel, Chess: chessRules.Chess })', context);

function fixture(settings = {}, fen) {
  let elapsed = 0;
  const match = new CpuMatch({ color: 'w', ...settings }, { fen, now: () => elapsed });
  return { match, advance: duration => { elapsed += duration; } };
}

function play(match, ...codes) {
  for (const code of codes) assert.ok(match.play(code, match.game.turn()), code);
}

test('初期値・色の抽選・プリセット・自由設定・壊れた値を扱う', () => {
  const invalid = normalizeCpuSettings({ level: 7, mode: false, time: 'custom', minutes: { toString: 1 }, seconds: null });
  assert.deepEqual({ ...invalid }, { mode: 'practice', level: 1, color: 'random', time: 'unlimited', minutes: 10, seconds: 0 });
  assert.equal(new CpuMatch({}, { random: () => .2 }).player, 'w');
  assert.equal(new CpuMatch({}, { random: () => .8 }).player, 'b');
  for (const [time, initial, increment] of [['1+0', 60000, 0], ['3+2', 180000, 2000], ['10+5', 600000, 5000], ['custom', 10800000, 60000]]) {
    assert.deepEqual({ ...cpuTimeControl(normalizeCpuSettings({ time, minutes: 180, seconds: 60 })) }, { initial, increment });
  }
  for (const [minutes, seconds] of [['', 0], [0, 0], [181, 0], [1, ''], [1, 61], [1.5, 0], [1, -1]]) {
    assert.equal(validCpuTime(minutes, seconds), false);
  }
});

test('準備中は時計が止まり、手番側の経過時間と合法手の加算のみを反映する', () => {
  const { match, advance } = fixture({ time: '3+2' });
  advance(8000);
  assert.equal(match.clocks().w, 180000);
  assert.equal(match.play('e2e4', 'w'), false);
  match.start();
  advance(4000);
  assert.equal(match.play('e2e5', 'w'), false);
  assert.equal(match.clocks().w, 176000);
  assert.equal(match.clocks().b, 180000);
  play(match, 'e2e4');
  assert.equal(match.clocks().w, 178000);
  advance(5000);
  match.stop();
  advance(50000);
  assert.equal(match.clocks().b, 175000);
  assert.equal(match.play('e7e5', 'b'), false);
  match.start();
  advance(1000);
  play(match, 'e7e5');
  assert.equal(match.clocks().b, 176000);
  assert.equal(match.clocks().w, 178000);
});

test('タブ休止相当の経過後、ユーザー・CPUの遅い応答を拒否し、練習のみ継続する', () => {
  for (const mode of ['practice', 'match']) {
    const { match, advance } = fixture({ mode, time: '1+0', color: 'w' });
    match.start();
    if (mode === 'match') play(match, 'e2e4');
    const turn = match.game.turn();
    const fen = match.game.fen();
    advance(65000);
    assert.equal(match.play(turn === 'w' ? 'e2e4' : 'e7e5', turn), false);
    assert.deepEqual({ ...match.outcome }, { reason: 'flag', winner: turn === 'w' ? 'b' : 'w' });
    assert.equal(match.game.fen(), fen);
    assert.equal(match.continuePractice(), mode === 'practice');
    if (mode === 'practice') {
      match.start();
      assert.equal(match.clocks().w, Infinity);
      play(match, 'e2e4');
      assert.match(cpuPgn(match), /\[Event "Rookori Practice Continuation"\]/);
    } else assert.match(cpuPgn(match), /\[Termination "time forfeit"\]/);
  }
});

test('待ったが1手または2手・棋譜・持ち時間・局面履歴を復元する', () => {
  const { match, advance } = fixture({ time: '10+5', color: 'b' });
  match.start();
  advance(1500);
  play(match, 'e2e4');
  const target = match.game.fen();
  const clocks = match.clocks();
  assert.equal(match.undo(), false);
  advance(2500);
  play(match, 'e7e5');
  assert.equal(match.undo(), true);
  assert.equal(match.game.fen(), target);
  advance(2500);
  play(match, 'c7c5', 'g1f3');
  assert.equal(match.undo(), true);
  assert.equal(match.game.fen(), target);
  assert.deepEqual(match.clocks(), clocks);
  assert.equal(match.positions.length, 2);
  assert.doesNotMatch(cpuPgn(match).split('\n\n').at(-1), /e5|c5|Nf3/);
  const strict = fixture({ mode: 'match' }).match;
  strict.start();
  play(strict, 'e2e4');
  assert.equal(strict.undo(), false);
});

test('特殊な着手と昇格4種類、メイト、ステイルメイト、駒不足を扱う', () => {
  for (const [fen, code, target] of [
    ['r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1g1', 'g1'],
    ['4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', 'e5d6', 'd6'],
    ...['q', 'r', 'b', 'n'].map(type => ['4k3/P7/8/8/8/8/7p/4K3 w - - 0 1', 'a7a8' + type, 'a8']),
  ]) {
    const { match } = fixture({}, fen);
    match.start();
    play(match, code);
    if (code.length === 5) assert.equal(match.game.get(target).type, code[4]);
    assert.equal(match.undo(), true);
    assert.equal(match.game.fen(), fen);
  }
  for (const [fen, code, reason] of [
    ['7k/8/5KQ1/8/8/8/8/8 w - - 0 1', 'g6g7', 'mate'],
    ['7k/5K2/8/5Q2/8/8/8/8 w - - 0 1', 'f5g6', 'stalemate'],
    ['4k3/8/8/8/8/8/3n4/4K3 w - - 0 1', 'e1d2', 'material'],
  ]) {
    const { match } = fixture({}, fen);
    match.start();
    play(match, code);
    assert.equal(match.outcome?.reason, reason);
  }
});

test('3回と50手は請求、5回と75手は自動。時間切れで相手がキングだけなら引き分け', () => {
  const { match } = fixture();
  match.start();
  const cycle = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];
  play(match, ...cycle, ...cycle);
  assert.equal(match.outcome, null);
  assert.equal(match.drawClaim(), 'threefold');
  play(match, ...cycle, ...cycle);
  assert.equal(match.outcome.reason, 'fivefold');
  for (const [halfMoves, reason] of [[99, 'fifty'], [149, 'seventyFive']]) {
    const { match } = fixture({}, '7k/8/8/8/8/8/R7/4K3 w - - ' + halfMoves + ' 80');
    match.start();
    play(match, 'a2a3');
    if (halfMoves === 99) assert.equal(match.claim(), true);
    assert.equal(match.outcome.reason, reason);
  }
  const loneKing = fixture({ time: '1+0' }, '4k3/8/8/8/8/8/R7/4K3 w - - 0 1');
  loneKing.match.start();
  loneKing.advance(60000);
  assert.equal(loneKing.match.flag(), true);
  assert.equal(loneKing.match.outcome.winner, null);
});

test('投了した実戦のPGNを読み込み直せる', () => {
  const { match } = fixture({ mode: 'match', time: '10+5', level: 4 });
  match.start();
  play(match, 'e2e4', 'e7e5', 'g1f3');
  match.finish('resign', 'b');
  const pgn = cpuPgn(match);
  assert.match(pgn, /\[Event "Rookori Match"\]/);
  assert.match(pgn, /\[Black "Rookori CPU Lv.4"\]/);
  assert.match(pgn, /\[TimeControl "600\+5"\]/);
  assert.match(pgn, /\[Result "0-1"\]/);
  const replay = new Chess();
  replay.loadPgn(pgn);
  assert.equal(replay.history().join(' '), 'e4 e5 Nf3');
  assert.equal(replay.fen(), match.game.fen());
});

test('Workerの6段階は合法手を返し、ヒントは一手メイトを見つける', () => {
  const replies = [];
  const self = { postMessage: reply => replies.push(reply) };
  runInNewContext(source('vendor/chess.js') + '\n' + source('cpu-engine-worker.js'), {
    self, importScripts() {}, performance,
  });
  assert.equal(replies.pop().ready, true);
  const game = new Chess();
  for (const level of cpuLevels) {
    self.onmessage({ data: { fen: game.fen(), level } });
    const reply = replies.pop();
    const move = reply.move;
    assert.ok(move, level.name);
    assert.ok(game.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] }), level.name);
  }
  self.onmessage({ data: { fen: '7k/8/5KQ1/8/8/8/8/8 w - - 0 1', level: cpuHintLevel } });
  assert.equal(replies.pop().move, 'g6g7');
});

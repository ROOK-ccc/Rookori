const assert = require('node:assert/strict');
const { test } = require('node:test');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');

const source = name => readFileSync(join(__dirname, name), 'utf8');
const { createUciEngine, stockfishProfile, chooseStockfishMove, engineUseAllowed, Chess } =
  runInNewContext(source('vendor/chess.js') + '\n' + source('uci-engine.js') +
    '\n({ createUciEngine, stockfishProfile, chooseStockfishMove, engineUseAllowed, Chess: chessRules.Chess })',
    { setTimeout, clearTimeout, URL, document: { currentScript: { src: 'https://example.test/Rookori/uci-engine.js' } } });

const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const moveCode = move => move.from + move.to + (move.promotion ?? '');

test('UCI起動・探索・中断を順序通り扱い、破棄した探索結果を反映しない', async () => {
  const sent = [];
  let receive;
  let closed = false;
  const client = createUciEngine(() => ({
    send: message => sent.push(message),
    listen: callback => { receive = callback; },
    close: () => { closed = true; },
  }));
  const ready = client.start();
  receive('id name Stockfish 19 Lite WASM\nuciok');
  assert.deepEqual(sent, ['uci', 'ucinewgame', 'isready']);
  receive('readyok');
  assert.equal((await ready).name, 'Stockfish 19 Lite WASM');
  const pending = client.search({ fen, moves: ['e2e4'], ...stockfishProfile('opponent', 1) });
  assert.ok(sent.includes('position fen ' + fen + ' moves e2e4'));
  assert.ok(sent.includes('setoption name MultiPV value 6'));
  assert.ok(sent.includes('go depth 3 movetime 55'));
  client.close();
  receive('bestmove e7e5');
  await assert.rejects(pending, /停止/);
  assert.equal(sent.at(-1), 'stop');
  assert.equal(closed, true);
});

test('接続失敗を呼び出し元に返し、オンライン対局中は探索用途を許可しない', async () => {
  const client = createUciEngine(() => { throw new Error('fetch'); });
  await assert.rejects(client.start(), /通信/);
  for (const purpose of ['opponent', 'hint', 'analysis', 'analysis-lesson']) assert.equal(engineUseAllowed(purpose, { liveOnline: true }), false);
});

test('配布されたStockfish WASMが6難易度で合法手を返し、弱体化を解除したヒントを返す', async t => {
  const commands = [];
  const client = createUciEngine(() => {
    const child = spawn(process.execPath, [join(__dirname, 'vendor', 'stockfish', 'stockfish-19-lite-single.js')],
      { stdio: ['pipe', 'pipe', 'ignore'] });
    const stdout = createInterface({ input: child.stdout });
    return {
      send(line) { commands.push(line); child.stdin.write(line + '\n'); },
      listen(onLine, onError) {
        stdout.on('line', onLine);
        child.on('error', onError);
        child.stdin.on('error', onError);
        child.on('exit', onError);
      },
      close: () => child.kill(),
    };
  });
  t.after(() => client.close());
  assert.match((await client.start()).name, /^Stockfish 19 Lite WASM/);
  const chess = new Chess(fen);
  for (let level = 1; level <= 6; level++) {
    const result = await client.search({ fen, moves: chess.history({ verbose: true }).map(moveCode),
      ...stockfishProfile('opponent', level) });
    const legal = chess.moves({ verbose: true }).map(moveCode);
    const move = chooseStockfishMove(result, level, legal, () => .15);
    assert.ok(legal.includes(move), 'Lv.' + level);
    chess.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] });
  }
  const hint = await client.search({ fen: '7k/8/5KQ1/8/8/8/8/8 w - - 0 1', ...stockfishProfile('hint', 1) });
  assert.equal(hint.move, 'g6g7');
  assert.ok(hint.lines.some(line => line.score?.unit === 'mate'));
  assert.ok(commands.includes('setoption name UCI_LimitStrength value true'));
  assert.ok(commands.slice(-6).includes('setoption name UCI_LimitStrength value false'));
  const restricted = await client.search({ fen, onlyMove: 'd2d4', ...stockfishProfile('analysis-lesson', 1, Infinity, 0, 1) });
  assert.equal(restricted.move, 'd2d4');
  assert.ok(restricted.lines.every(line => line.pv[0] === 'd2d4'));
});

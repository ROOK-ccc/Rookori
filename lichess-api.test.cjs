const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');

const { lichessRequestUrl, createLichessClient, normalizeLichessGame, lichessPgnId, parseReviewGames,
  readLichessGames, makeGameBackup, validateGameBackup, sameReviewMainline } = runInNewContext(
  ['vendor/chess.js', 'game-review.js', 'lichess-api.js'].map(file => readFileSync(join(__dirname, file), 'utf8')).join('\n')
  + '\n({ lichessRequestUrl, createLichessClient, normalizeLichessGame, lichessPgnId, parseReviewGames,'
  + ' readLichessGames, makeGameBackup, validateGameBackup, sameReviewMainline })', { URL, URLSearchParams, TextDecoder });

const gameId = 'abAB1245';
const pgn = `[Site "https://lichess.org/game/${gameId}"]
[GameId "${gameId}"]
[Result "1-0"]
[TimeControl "300+3"]

1. e4 e5 1-0`;
const game = {
  id: gameId, variant: 'standard', status: 'resign', speed: 'blitz', createdAt: 1794455200000,
  pgn, winner: 'white', players: {
    white: { user: { id: 'alice', name: 'Alice' }, rating: 1320, ratingDiff: 7 },
    black: { user: { id: 'bob', name: 'Bob' }, rating: 1334, ratingDiff: -5 },
  },
};
const ndjson = rows => new Response(rows.map(row => JSON.stringify(row)).join('\n'), {
  headers: { 'Content-Type': 'application/x-ndjson; charset=UTF-8' },
});
const signal = () => new AbortController().signal;
const settings = { readCooldown: () => 0, writeCooldown() {} };

test('公式の取得形式で終了棋譜を絞り込み、無効な入力を送らない', () => {
  const url = lichessRequestUrl('Alice', 20, 'blitz');
  assert.equal(url.origin, 'https://lichess.org');
  assert.equal(url.pathname, '/api/games/user/alice');
  assert.equal(url.searchParams.get('max'), '20');
  assert.equal(url.searchParams.get('perfType'), 'blitz');
  assert.equal(url.searchParams.get('ongoing'), 'false');
  assert.equal(url.searchParams.get('finished'), 'true');
  assert.equal(url.searchParams.get('pgnInJson'), 'true');
  for (const bad of ['', 'evil?max=200', 'bad/name', '日本語']) assert.throws(() => lichessRequestUrl(bad, 20, 'all'), /ユーザー名/);
  assert.throws(() => lichessRequestUrl('Alice', 200, 'all'), /取得条件/);
});

test('白黒の視点で勝敗とレーティングを換算し、対局中や変則ルールを除外する', () => {
  const white = normalizeLichessGame(game, 'ALICE', 'all').source;
  assert.equal(white.result, 'win');
  assert.equal(white.color, 'white');
  assert.equal(white.opponent, 'Bob');
  assert.equal(white.ratingDiff, 7);
  assert.equal(white.time.increment, 3);
  const black = normalizeLichessGame(game, 'bob', 'blitz').source;
  assert.equal(black.result, 'loss');
  assert.equal(black.color, 'black');
  assert.equal(black.opponentRating, 1320);
  const draw = { ...game, winner: undefined, status: 'draw', pgn: pgn.replaceAll('1-0', '1/2-1/2') };
  assert.equal(normalizeLichessGame(draw, 'bob', 'all').source.result, 'draw');
  assert.equal(normalizeLichessGame({ ...game, status: 'started' }, 'alice', 'all'), null);
  assert.equal(normalizeLichessGame({ ...game, variant: 'chess960' }, 'alice', 'all'), null);
  assert.equal(normalizeLichessGame(game, 'alice', 'rapid'), null);
  assert.throws(() => normalizeLichessGame({ ...game, winner: 'black' }, 'alice', 'all'), /対局結果/);
});

test('旧URLと新URLで対局IDが一致し、外部メタデータを既存形式のバックアップから復元できる', () => {
  assert.equal(lichessPgnId(pgn), gameId);
  assert.equal(lichessPgnId(pgn.replace('/game/', '/')), gameId);
  assert.equal(lichessPgnId(pgn.replace('https://lichess.org/', 'https://unrelated.test/')), null);
  assert.equal(lichessPgnId(pgn.replace('[GameId "' + gameId, '[GameId "different')), null);
  const [parsed] = parseReviewGames(pgn);
  const saved = { ...parsed, id: 'f'.repeat(32), savedAt: '2026-10-08T01:00:00.000Z', notes: [],
    source: normalizeLichessGame(game, 'Alice', 'blitz').source };
  const [restored] = validateGameBackup(makeGameBackup([saved]));
  assert.equal(restored.source.id, gameId);
  assert.equal(restored.source.opponent, 'Bob');
  assert.equal(restored.positions.length, 3);
  assert.equal(sameReviewMainline(restored, parseReviewGames(pgn.replace('/game/', '/'))[0]), true);
  assert.equal(sameReviewMainline(restored, parseReviewGames(pgn.replace('e4 e5', 'e4'))[0]), false);
});

test('NDJSONをチャンク境界をまたいで読み取り、上限超過を拒否する', async () => {
  const bytes = new TextEncoder().encode('{"name":"日本語"}\n{"name":"次"}');
  const body = new ReadableStream({
    start(controller) {
      for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    },
  });
  const rows = await readLichessGames({ body }, 2);
  assert.equal(rows[0].name, '日本語');
  assert.equal(rows[1].name, '次');
  await assert.rejects(readLichessGames(ndjson([game, game]), 1), /上限/);
});

test('429以降は同じ分内のAPI送信を止め、サーバー指定が長ければ優先する', async () => {
  let now = 1000;
  let cooldown;
  let total = 0;
  const client = createLichessClient({ now: () => now, readCooldown: () => cooldown,
    writeCooldown: value => { cooldown = value; }, locks: null,
    request: async () => ++total === 1 ? new Response(null, { status: 429, headers: { 'Retry-After': '90' } }) : ndjson([game]),
  });
  await assert.rejects(client.games('Alice', 10, 'all', signal()), /90秒/);
  now += 60000;
  await assert.rejects(client.games('Alice', 10, 'all', signal()), /30秒/);
  assert.equal(total, 1);
  now += 30000;
  assert.equal((await client.games('Alice', 10, 'all', signal())).length, 1);
  assert.equal(total, 2);
});

test('404でもプロフィールを照会せず、Cookie・認証情報・リファラーを送らない', async () => {
  const calls = [];
  const client = createLichessClient({ ...settings, request: async (url, options) => {
    calls.push(url.pathname);
    assert.equal(options.headers.Accept, 'application/x-ndjson');
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.credentials, 'omit');
    assert.equal(options.referrerPolicy, 'no-referrer');
    assert.equal(options.cache, 'no-store');
    return new Response(null, { status: 404 });
  } });
  await assert.rejects(client.games('Alice', 20, 'all', signal()), /公開棋譜を取得できません/);
  assert.deepEqual(calls, ['/api/games/user/alice']);
});

test('通信キャンセル時は並行取得を防ぐ', async () => {
  const client = createLichessClient({ ...settings, request: (_url, { signal: requestSignal }) =>
    new Promise((_, reject) => requestSignal.addEventListener('abort', () => reject(requestSignal.reason))) });
  const cancel = new AbortController();
  const pending = client.games('Alice', 20, 'all', cancel.signal);
  await assert.rejects(client.games('Alice', 20, 'all', signal()), /取得中/);
  cancel.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});

test('Retry-Afterが読めない場合も429から60秒間は別クライアントの取得を防ぐ', async () => {
  let now = 1000;
  let stored;
  let requests = 0;
  const options = { now: () => now, readCooldown: () => stored, writeCooldown: value => { stored = value; },
    locks: { request: (_name, { ifAvailable }, action) => { assert.equal(ifAvailable, true); return action({}); } },
    request: async () => ++requests === 1 ? new Response(null, { status: 429 }) : ndjson([game]) };
  await assert.rejects(createLichessClient(options).games('Alice', 10, 'all', signal()), /60秒/);
  now += 59999;
  await assert.rejects(createLichessClient(options).games('Bob', 10, 'all', signal()), /1秒/);
  assert.equal(requests, 1);
  now++;
  assert.equal((await createLichessClient(options).games('Bob', 10, 'all', signal())).length, 1);
});

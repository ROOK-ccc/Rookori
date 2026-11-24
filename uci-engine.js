const uciMovePattern = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

function createWorkerUciTransport(url) {
  const worker = new Worker(url);
  return {
    send: line => worker.postMessage(line),
    listen(onLine, onError) {
      worker.addEventListener('message', event => onLine(event.data));
      worker.addEventListener('error', event => { event.preventDefault(); onError(); });
      worker.addEventListener('messageerror', onError);
    },
    close: () => worker.terminate(),
  };
}

// A transport sends and receives UCI text lines. It need not be a Worker.
function createUciEngine(connect, { startupTimeout = 15000 } = {}) {
  let transport, pending, timer, name;
  let state = 'idle';

  function close(error = new Error('エンジンを停止しました。')) {
    if (state === 'closed') return;
    clearTimeout(timer);
    const request = pending;
    pending = null;
    const searching = state === 'search';
    state = 'closed';
    if (searching) {
      try { transport.send('stop'); } catch { /* Disconnection also stops the request. */ }
    }
    transport?.close();
    request?.reject(error);
  }

  function fail() { close(new Error('エンジンとの通信に失敗しました。')); }

  function expect(timeout, send) {
    return new Promise((resolve, reject) => {
      pending = { resolve, reject, lines: new Map() };
      timer = setTimeout(fail, timeout);
      try { send(); } catch { fail(); }
    });
  }

  function receive(message) {
    if (typeof message !== 'string') return;
    for (const raw of message.split(/\r?\n/)) {
      const line = raw.trim();
      if (!pending) return;
      if (state === 'uci') {
        if (line.startsWith('id name ')) name = line.slice(8);
        if (line === 'uciok') {
          state = 'readying';
          try {
            transport.send('ucinewgame');
            transport.send('isready');
          } catch { fail(); }
        }
      } else if (state === 'readying' && line === 'readyok') {
        complete({ name });
      } else if (state === 'search' && line.startsWith('info ')) {
        const pv = line.match(/(?:^| )pv (.+)$/)?.[1]?.split(/\s+/) ?? [];
        const score = line.match(/ score (cp|mate) (-?\d+)(?: (upperbound|lowerbound))?/);
        if ((!pv.length && !score) || !pv.every(move => uciMovePattern.test(move))) continue;
        const rank = Number(line.match(/ multipv (\d+)/)?.[1] ?? 1);
        if (score?.[3] && pending.lines.get(rank)?.score && !pending.lines.get(rank).score.bound) continue;
        pending.lines.set(rank, {
          rank, pv, depth: Number(line.match(/ depth (\d+)/)?.[1] ?? 0),
          score: score ? { unit: score[1], value: Number(score[2]), bound: score[3] } : null,
        });
      } else if (state === 'search' && line.startsWith('bestmove ')) {
        const token = line.split(/\s+/)[1];
        if (!uciMovePattern.test(token) && token !== '(none)' && token !== '0000') { fail(); return; }
        complete({ move: uciMovePattern.test(token) ? token : null,
          lines: [...pending.lines.values()].sort((a, b) => a.rank - b.rank) });
      }
    }
  }

  function complete(result) {
    const request = pending;
    clearTimeout(timer);
    pending = null;
    state = 'ready';
    request.resolve(result);
  }

  function start() {
    if (state !== 'idle') return Promise.reject(new Error('エンジンは初期化済みです。'));
    state = 'uci';
    return expect(startupTimeout, () => {
      transport = connect();
      transport.listen(receive, fail);
      transport.send('uci');
    });
  }

  function search({ fen, moves = [], options = {}, depth, ms, onlyMove }) {
    if (state !== 'ready') return Promise.reject(new Error('エンジンは探索を受け付けられません。'));
    const valid = typeof fen === 'string' && /^[\w/ -]+$/.test(fen) && moves.every(move => uciMovePattern.test(move))
      && (onlyMove === undefined || (typeof onlyMove === 'string' && uciMovePattern.test(onlyMove)))
      && Number.isInteger(ms) && ms > 0 && ms <= 60000 && Number.isInteger(depth) && depth > 0 && depth <= 99
      && Object.entries(options).every(([key, value]) => /^[\w ]+$/.test(key) && (Number.isInteger(value) || typeof value === 'boolean'));
    if (!valid) return Promise.reject(new Error('探索する局面または設定が正しくありません。'));
    state = 'search';
    return expect(ms + 10000, () => {
      for (const [key, value] of Object.entries(options)) transport.send(`setoption name ${key} value ${value}`);
      transport.send('position fen ' + fen + (moves.length ? ' moves ' + moves.join(' ') : ''));
      transport.send(`go depth ${depth} movetime ${ms}${onlyMove ? ' searchmoves ' + onlyMove : ''}`);
    });
  }

  return { start, search, close };
}

const stockfishEngine = {
  name: 'Stockfish',
  version: '19',
  distribution: 'stockfish.js 19.0.0 Lite Single',
  workerUrl: new URL('vendor/stockfish/stockfish-19-lite-single.js', document.currentScript.src),
  connect() { return createWorkerUciTransport(this.workerUrl); },
};

function engineUseAllowed(purpose, { liveOnline = false } = {}) {
  return !liveOnline && (purpose === 'opponent' || Object.hasOwn(stockfishStudyProfiles, purpose));
}

function createStockfishSession(provider = stockfishEngine, context = {}) {
  const client = createUciEngine(() => provider.connect());
  return {
    async start() {
      const { name } = await client.start();
      if (!name?.startsWith(`${provider.name} ${provider.version}`)) {
        client.close();
        throw new Error('想定したStockfishのバージョンを確認できません。');
      }
    },
    search(purpose, position, { level, remaining, increment, candidates, onlyMove } = {}) {
      if (!engineUseAllowed(purpose, context)) return Promise.reject(new Error('この対局ではエンジンを使用できません。'));
      return client.search({ ...position, ...stockfishProfile(purpose, level, remaining, increment, candidates), onlyMove });
    },
    close: client.close,
  };
}

const stockfishOpponentLevels = [
  { skill: 0, depth: 3, ms: 55, candidates: 6, random: .78 },
  { skill: 0, depth: 4, ms: 90, candidates: 4, random: .32 },
  { elo: 1320, depth: 7, ms: 150 },
  { elo: 1660, depth: 10, ms: 300 },
  { skill: 13, depth: 15, ms: 600 },
  { skill: 20, depth: 22, ms: 1300 },
];
const stockfishStudyProfiles = {
  hint: { skill: 20, depth: 16, ms: 650 },
  analysis: { skill: 20, depth: 22, ms: 1500, candidates: 3 },
  'analysis-quick': { depth: 10, ms: 65, candidates: 1 },
  'analysis-detail': { depth: 16, ms: 260, candidates: 3 },
  'analysis-branch': { depth: 22, ms: 900, candidates: 3 },
  'analysis-lesson': { depth: 17, ms: 600, candidates: 3 },
};

function stockfishProfile(purpose, level, remaining = Infinity, increment = 0, candidates) {
  const profile = purpose === 'opponent' ? stockfishOpponentLevels[level - 1] : stockfishStudyProfiles[purpose];
  const ms = Math.max(1, Math.floor(Math.min(profile.ms, remaining * .08 + increment * .15, remaining * .45)));
  return {
    depth: profile.depth, ms,
    options: {
      'Skill Level': profile.skill ?? 20,
      UCI_LimitStrength: profile.elo !== undefined,
      UCI_Elo: profile.elo ?? 1320,
      MultiPV: purpose.startsWith('analysis') && [1, 2, 3, 5].includes(candidates) ? candidates : profile.candidates ?? 1,
    },
  };
}

function chooseStockfishMove(result, level, legal, random = Math.random) {
  if (!legal.includes(result.move)) return null;
  const profile = stockfishOpponentLevels[level - 1];
  if (!profile.random) return result.move;
  if (random() < profile.random) return legal[Math.floor(random() * legal.length)];
  const candidates = [...new Set(result.lines.map(line => line.pv[0]).filter(move => legal.includes(move)))];
  return candidates.length > 1 ? candidates[Math.floor(random() * candidates.length)] : result.move;
}

const lichessFormats = Object.freeze({
  bullet: 'Bullet（超早指し）', blitz: 'Blitz（早指し）', rapid: 'Rapid', classical: 'Classical', correspondence: 'Correspondence（通信対局）',
});
const lichessResults = { win: '勝利', loss: '敗北', draw: '引き分け' };
const lichessFinished = new Set(['mate', 'resign', 'stalemate', 'timeout', 'outoftime', 'draw', 'cheat', 'unknownFinish']);
const lichessUsername = /^[a-z0-9_-]{2,30}$/i;
const lichessUsernameKey = 'rookori.lichess-username.v1';
const lichessCooldownKey = 'rookori.lichess-retry-at.v1';

function lichessRequestUrl(username, count, format) {
  if (typeof username !== 'string' || !lichessUsername.test(username) || ![10, 20, 50, 100].includes(count)
    || (format !== 'all' && !Object.hasOwn(lichessFormats, format))) throw new Error('ユーザー名と取得条件を確認してください。');
  const url = new URL('https://lichess.org/api/games/user/' + username.toLowerCase());
  url.search = new URLSearchParams({
    max: count, perfType: format === 'all' ? ['ultraBullet', ...Object.keys(lichessFormats)].join(',')
      : format === 'bullet' ? 'ultraBullet,bullet' : format,
    ongoing: 'false', finished: 'true', pgnInJson: 'true', opening: 'true', clocks: 'false', evals: 'false', sort: 'dateDesc',
  });
  return url;
}

async function readLichessGames(response, count) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const games = [];
  let buffer = '';
  let bytes = 0;
  function readLine(line) {
    if (!line.trim()) return;
    if (games.length >= count) throw new Error('対局数が指定した上限を超えました。');
    games.push(JSON.parse(line));
  }
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 8000000) throw new Error('棋譜が大きすぎます。取得件数を減らしてください。');
      const lines = (buffer + decoder.decode(value, { stream: true })).split('\n');
      buffer = lines.pop();
      for (const line of lines) readLine(line);
    }
    readLine(buffer + decoder.decode());
    return games;
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

function createLichessClient({ request = (...args) => fetch(...args), now = Date.now,
  readCooldown = () => localStorage.getItem(lichessCooldownKey),
  writeCooldown = value => localStorage.setItem(lichessCooldownKey, value),
  locks = typeof navigator === 'undefined' ? null : navigator.locks } = {}) {
  let pending = false;
  let cooldown = 0;

  function remaining() {
    let stored = 0;
    try { stored = Number(readCooldown()) || 0; } catch { /* Storage may be unavailable. */ }
    return Math.max(0, Math.ceil((Math.max(cooldown, Number.isFinite(stored) ? stored : 0) - now()) / 1000));
  }

  function limitMessage() {
    return `Lichessの利用制限に達しました。約${remaining()}秒お待ちください。`;
  }

  async function requestOnce(url, accept, signal) {
    if (remaining()) throw new Error(limitMessage());
    const response = await request(url, { signal, headers: { Accept: accept },
      credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error' });
    if (response.status === 429) {
      const retry = response.headers.get('Retry-After');
      const at = retry && /^\d+$/.test(retry) ? now() + Number(retry) * 1000 : Date.parse(retry);
      cooldown = Math.max(now() + 60000, Number.isFinite(at) ? at : 0);
      try { writeCooldown(cooldown); } catch { /* The current tab keeps the cooldown. */ }
      await response.body?.cancel().catch(() => {});
      throw new Error(limitMessage());
    }
    return response;
  }

  async function fetchGames(url, count, signal) {
    const response = await requestOnce(url, 'application/x-ndjson', signal);
    if (response.status === 404) {
      // An account can exist even when Lichess returns 404 for its game export.
      await response.body?.cancel().catch(() => {});
      const profile = await requestOnce(new URL('/api/user/' + url.pathname.split('/').at(-1), url), 'application/json', signal);
      await profile.body?.cancel().catch(() => {});
      if (profile.status === 404) throw new Error('Lichessユーザーが見つかりません。ユーザー名を確認してください。');
      if (profile.ok) return [];
      throw new Error('Lichessから棋譜を取得できませんでした。時間をおいてお試しください。');
    }
    if (!response.ok) await response.body?.cancel().catch(() => {});
    if (!response.ok) throw new Error(`Lichessから棋譜を取得できませんでした（HTTP ${response.status}）。`);
    if (!/^application\/(?:x-)?ndjson\b/i.test(response.headers.get('Content-Type') ?? '') || !response.body) {
      throw new Error('Lichessから棋譜の形式で応答を受け取れませんでした。');
    }
    try { return await readLichessGames(response, count); }
    catch (error) {
      if (signal.aborted) throw error;
      throw new Error('Lichessの棋譜を読み取れませんでした。取得件数を減らしてお試しください。');
    }
  }

  return {
    remaining,
    async games(username, count, format, signal) {
      if (pending) throw new Error('棋譜を取得中です。');
      const url = lichessRequestUrl(username, count, format);
      pending = true;
      try {
        if (!locks) return await fetchGames(url, count, signal);
        return await locks.request('rookori.lichess-api', { ifAvailable: true }, lock => {
          if (!lock) throw new Error('別のタブで棋譜を取得中です。');
          return fetchGames(url, count, signal);
        });
      } finally { pending = false; }
    },
  };
}

function normalizeLichessGame(game, username, format) {
  const speed = game?.speed === 'ultraBullet' ? 'bullet' : game?.speed;
  if (game?.variant !== 'standard' || !lichessFinished.has(game.status)
    || !Object.hasOwn(lichessFormats, speed) || (format !== 'all' && format !== speed)) return null;
  if (!lichessGameId.test(game.id ?? '') || typeof game.pgn !== 'string' || game.pgn.length > gamePgnLimit
    || lichessPgnId(game.pgn) !== game.id || !Number.isSafeInteger(game.createdAt) || game.createdAt <= 0
    || game.createdAt > 8640000000000000) throw new Error('対局情報が不正です。');
  const player = color => game.players?.[color];
  const userId = side => side?.user?.id ?? side?.user?.name;
  const sameUser = color => typeof userId(player(color)) === 'string' && userId(player(color)).toLowerCase() === username.toLowerCase();
  const color = sameUser('white') ? 'white' : sameUser('black') ? 'black' : null;
  if (!color) throw new Error('指定したプレイヤーの色を確認できません。');
  const result = reviewPgnTag(game.pgn, 'Result');
  if (!['1-0', '0-1', '1/2-1/2'].includes(result) || (game.winner && result !== (game.winner === 'white' ? '1-0' : game.winner === 'black' ? '0-1' : ''))) {
    throw new Error('対局結果を確認できません。');
  }
  const opponent = player(color === 'white' ? 'black' : 'white');
  const clock = game.clock;
  const days = game.daysPerTurn;
  const tagTime = /^(\d+)\+(\d+)$/.exec(reviewPgnTag(game.pgn, 'TimeControl') ?? '');
  const time = Number.isSafeInteger(clock?.initial) && Number.isSafeInteger(clock?.increment)
    ? { initial: clock.initial, increment: clock.increment }
    : Number.isSafeInteger(days) ? { days } : tagTime ? { initial: Number(tagTime[1]), increment: Number(tagTime[2]) } : null;
  const name = opponent?.user?.name ?? (Number.isInteger(opponent?.aiLevel) ? `コンピューター Lv.${opponent.aiLevel}` : null);
  const source = validateReviewExternal({
    provider: 'lichess', id: game.id, date: new Date(game.createdAt).toISOString(), color,
    format: speed, opponent: name, time, opening: game.opening?.name ?? null,
    rating: player(color)?.rating, ratingDiff: player(color)?.ratingDiff,
    opponentRating: opponent?.rating, opponentRatingDiff: opponent?.ratingDiff,
  }, game.pgn, result);
  return { source, pgn: game.pgn };
}

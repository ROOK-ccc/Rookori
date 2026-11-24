const gamePgnLimit = 2_000_000;
const gameNoteLimit = 4000;
const gameIdPattern = /^[a-f0-9]{32}$/;
const lichessGameId = /^[A-Za-z0-9]{8}$/;
const gameResults = Object.freeze({
  '1-0': '白の勝ち', '0-1': '黒の勝ち', '1/2-1/2': '引き分け', '*': '結果未確定',
});

const sampleGamePgn = `[Event "サンプル対局：中央に駒を出そう"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O Nf6 5. d3 O-O *`;

function parseReviewGames(input) {
  if (typeof input !== 'string' || input.length > gamePgnLimit) {
    throw new Error('棋譜が大きすぎます。対局をいくつかに分けて読み込んでください（最大200万文字）。');
  }
  const pgn = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  // Read past comments, tags and alternative lines before looking for a game result.
  const token = /\s+|^%[^\n]*|;[^\n]*|\{[^}]*\}|\[\s*([A-Za-z0-9_]+)\s+"((?:\\["\\]|[^"\\\n])*)"\s*\]|[()*]|[^\s{}()[\];*]+/gmy;
  const games = [];
  let start = 0;
  let end = 0;
  let depth = 0;
  let hasMoves = false;
  let result = null;
  let tags = new Map();

  function invalid(message) {
    throw new Error(`${games.length + 1}局目：${message}`);
  }

  function finish() {
    const source = pgn.slice(start, end).trim();
    if (games.length && !tags.size && !result) invalid('この対局の区切りや終了記号を確認してください。');
    const headerResult = tags.get('result');
    if (headerResult !== undefined && (!Object.hasOwn(gameResults, headerResult)
      || result && headerResult !== result)) invalid('棋譜に書かれた対局結果が一致しません。');
    if ((tags.get('setup') === '1' && !tags.get('fen'))
      || (tags.get('setup') === '0' && tags.has('fen')) || tags.get('fen') === '') {
      invalid('開始時の盤面の指定を確認してください。');
    }
    if (tags.has('variant') && !/^(?:standard|chess)$/i.test(tags.get('variant'))) {
      invalid('通常のチェスの棋譜を読み込んでください。');
    }
    const board = new chessRules.Chess();
    let history;
    try {
      // PGN escape lines are ignored, but kept in the exported original.
      board.loadPgn(source.replace(/^%[^\n]*\n?/gm, ''));
      history = board.history({ verbose: true });
    } catch {
      invalid('棋譜や開始時の盤面を再現できません。対局ページから手順をまとめてコピーしてください。');
    }
    if (!history.length || history.some(move => move.san === '--' || move.from === move.to || move.captured === 'k')) {
      invalid('対局で実際に指せる手を含んだ棋譜を読み込んでください。');
    }
    const initialFen = history[0].before;
    if (tags.has('fen')) {
      const initial = new chessRules.Chess(initialFen);
      const turn = initial.turn();
      const previous = turn === 'w' ? 'b' : 'w';
      const [previousKing] = initial.findPiece({ type: 'k', color: previous });
      const rights = initialFen.split(' ')[2];
      const castlePieces = { K: ['w', 'e1', 'h1'], Q: ['w', 'e1', 'a1'], k: ['b', 'e8', 'h8'], q: ['b', 'e8', 'a8'] };
      const validRights = Object.entries(castlePieces).every(([right, [color, king, rook]]) =>
        !rights.includes(right) || (initial.get(king)?.type === 'k' && initial.get(king)?.color === color
          && initial.get(rook)?.type === 'r' && initial.get(rook)?.color === color));
      if (!previousKing || initial.isAttacked(previousKing, turn) || !validRights) {
        invalid('開始時の盤面で、キングの位置やキャスリングの指定を確認してください。');
      }
    }
    const positions = [{ ply: 0, fen: initialFen, move: null }, ...history.map((move, index) => ({
      ply: index + 1,
      fen: move.after,
      move: {
        from: move.from, to: move.to, color: move.color, san: move.san, lan: move.lan,
        number: Number(move.before.split(' ')[5]),
        ...(move.promotion && { promotion: move.promotion }),
      },
    }))];
    games.push({
      pgn: source, initialFen, positions,
      metadata: {
        white: tags.get('white') || null,
        black: tags.get('black') || null,
        date: tags.get('date') || null,
        event: tags.get('event') || null,
        result: result ?? headerResult ?? null,
        hasEndMarker: result !== null,
      },
    });
    tags = new Map();
    hasMoves = false;
    result = null;
  }

  while (end < pgn.length) {
    const match = token.exec(pgn);
    if (!match) invalid('棋譜の記号やコメントが途中で切れています。');
    const [value, tag, encoded] = match;
    const trivia = /^[\s;{%]/.test(value);
    if (result && !trivia) {
      finish();
      start = match.index;
    }
    end = token.lastIndex;
    if (trivia) continue;
    if (tag) {
      if (hasMoves || depth) invalid('次の対局との区切りを確認してください。');
      const key = tag.toLowerCase();
      if (tags.has(key)) invalid('対局情報に同じ項目が複数あります。');
      tags.set(key, encoded.replace(/\\(["\\])/g, '$1'));
    } else if (value === '(') {
      depth++;
    } else if (value === ')') {
      if (!depth) invalid('別の手順を囲むかっこが合っていません。');
      depth--;
    } else if (!depth) {
      if (Object.hasOwn(gameResults, value)) result = value;
      else hasMoves = true;
    }
  }
  if (depth) invalid('別の手順を囲むかっこが閉じていません。');
  if (hasMoves || tags.size || result) finish();
  if (!games.length) throw new Error('棋譜を貼り付けるか、棋譜ファイルを選んでください。');
  return games;
}

function reviewPosition(game, ply) {
  return game.positions[Math.max(0, Math.min(ply, game.positions.length - 1))];
}

function reviewRecentDate(game) {
  const date = game.cpu?.started ?? game.source?.date;
  if (date && Number.isFinite(Date.parse(date))) return { value: date, time: true, isSaved: false };
  const raw = game.metadata.date;
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(raw ?? '')) {
    const value = raw.replaceAll('.', '-') + 'T00:00:00';
    if (Number.isFinite(Date.parse(value))) return { value, time: false, isSaved: false };
  }
  return { value: game.savedAt, time: true, isSaved: true };
}

function reviewRecentTime(game) {
  if (game.cpu) return game.cpu.continued ? '時間無制限の継続練習' : cpuTimeLabel(game.cpu.settings);
  const time = game.source?.time;
  if (time?.days) return `1手につき ${time.days}日`;
  const tag = reviewPgnTag(game.pgn, 'TimeControl');
  if (!time && tag === '-') return '時間無制限';
  const parts = /^(\d+)\+(\d+)$/.exec(tag ?? '');
  const initial = time?.initial ?? (parts ? Number(parts[1]) : null);
  const increment = time?.increment ?? (parts ? Number(parts[2]) : null);
  if (initial === null || !Number.isSafeInteger(initial) || !Number.isSafeInteger(increment)) return '持ち時間の記録なし';
  const start = initial % 60 === 0 ? `${initial / 60}分` : `${initial}秒`;
  return `${start}＋${increment}秒`;
}

function reviewPgnTag(pgn, name) {
  const header = pgn.slice(0, 16000).trimStart().split(/\r?\n\s*\r?\n/, 1)[0];
  return header.match(new RegExp('^\\s*\\[' + name + '\\s+"([^"\\r\\n]*)"\\s*\\]', 'im'))?.[1] ?? null;
}

function lichessPgnId(pgn) {
  const site = typeof pgn === 'string' && reviewPgnTag(pgn, 'Site');
  if (!site) return null;
  const id = /^https:\/\/lichess\.org\/(?:game\/)?([a-zA-Z0-9]{8})(?:\/(?:white|black))?\/?(?:#\d+)?$/.exec(site)?.[1];
  const tag = reviewPgnTag(pgn, 'GameId');
  return id && (!tag || tag === id) ? id : null;
}

function lichessGameUrl(id) {
  return 'https://lichess.org/' + id;
}

function sameReviewMainline(a, b) {
  return a.metadata.result === b.metadata.result && a.initialFen === b.initialFen
    && a.positions.length === b.positions.length
    && a.positions.every((position, i) => position.move?.lan === b.positions[i].move?.lan);
}

function validateReviewExternal(source, pgn, result) {
  const { provider, id, date, color, format, time } = source ?? {};
  if (provider !== 'lichess' || typeof id !== 'string' || !lichessGameId.test(id) || lichessPgnId(pgn) !== id
    || typeof date !== 'string' || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString() !== date
    || !['white', 'black'].includes(color) || !['bullet', 'blitz', 'rapid', 'classical', 'correspondence'].includes(format)
    || !['1-0', '0-1', '1/2-1/2'].includes(result)) throw new Error('外部棋譜の情報を確認できません。');
  const number = value => Number.isSafeInteger(value) && value >= 0 && value < 100000 ? value : null;
  const text = value => typeof value === 'string' && value.trim() ? value.trim().slice(0, 200) : null;
  let normalizedTime = null;
  if (number(time?.days)) normalizedTime = { days: time.days };
  else if (number(time?.initial) !== null && number(time?.increment) !== null) {
    normalizedTime = { initial: time.initial, increment: time.increment };
  }
  return {
    provider, id, url: lichessGameUrl(id), date, color, format, time: normalizedTime,
    result: result === '1/2-1/2' ? 'draw' : result === (color === 'white' ? '1-0' : '0-1') ? 'win' : 'loss',
    opponent: text(source.opponent), opening: text(source.opening),
    rating: number(source.rating), ratingDiff: Number.isInteger(source.ratingDiff) && Math.abs(source.ratingDiff) < 10000 ? source.ratingDiff : null,
    opponentRating: number(source.opponentRating),
    opponentRatingDiff: Number.isInteger(source.opponentRatingDiff) && Math.abs(source.opponentRatingDiff) < 10000 ? source.opponentRatingDiff : null,
  };
}

function reviewGameRecord(game, id, savedAt = new Date().toISOString()) {
  const lichessId = lichessPgnId(game.pgn);
  return {
    id, savedAt, pgn: game.pgn, initialFen: game.initialFen, positions: game.positions,
    metadata: game.metadata, notes: [], ...(game.cpu && { cpu: game.cpu }),
    ...(lichessId && { lichessId }), ...(game.source && { source: game.source }),
  };
}

function reviewNote(game, ply, text, savedAt = new Date().toISOString()) {
  if (!Number.isInteger(ply) || !game.positions[ply] || typeof text !== 'string' || text.length > gameNoteLimit) {
    throw new Error('局面とメモの内容を確認してください。');
  }
  const { fen, move } = game.positions[ply];
  const moveNumber = move?.number ?? Number(fen.split(' ')[5]);
  return { gameId: game.id, ply, moveNumber, fen, text: text.trim(), savedAt };
}

function makeGameBackup(games) {
  return {
    type: 'chesspath.game-library', version: 1,
    games: games.map(({ id, pgn, savedAt, notes, cpu, source }) => ({
      id, pgn, savedAt, notes, ...(cpu && { cpu }), ...(source && { source }),
    })),
  };
}

function validateGameBackup(backup) {
  const invalid = '対局履歴のバックアップを確認してください。';
  if (backup?.type !== 'chesspath.game-library' || backup.version !== 1 || !Array.isArray(backup.games)) {
    throw new Error(invalid);
  }
  const ids = new Set();
  const sources = new Set();
  const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value;
  return backup.games.map(entry => {
    if (typeof entry?.id !== 'string' || !gameIdPattern.test(entry.id) || ids.has(entry.id)
      || !validDate(entry.savedAt) || !Array.isArray(entry.notes)) throw new Error(invalid);
    const [game, extra] = parseReviewGames(entry.pgn);
    if (extra || sources.has(game.pgn)) throw new Error('同じ対局がバックアップに複数含まれています。');
    if (entry.cpu !== undefined) {
      if (!game.metadata.result || game.metadata.result === '*') throw new Error(invalid);
      game.cpu = validateCpuGameDetails(entry.cpu);
      if (game.cpu.origin && game.cpu.origin.fen !== game.initialFen) throw new Error(invalid);
    }
    if (entry.source !== undefined) {
      if (entry.cpu !== undefined) throw new Error(invalid);
      game.source = validateReviewExternal(entry.source, game.pgn, game.metadata.result);
    }
    const record = reviewGameRecord(game, entry.id, entry.savedAt);
    ids.add(entry.id);
    sources.add(game.pgn);
    const plies = new Set();
    record.notes = entry.notes.map(note => {
      if (!note || note.gameId !== entry.id || plies.has(note.ply) || !validDate(note.savedAt)
        || typeof note.text !== 'string') throw new Error(invalid);
      const restored = reviewNote(record, note.ply, note.text, note.savedAt);
      if (restored.fen !== note.fen || (note.moveNumber !== undefined && restored.moveNumber !== note.moveNumber)) {
        throw new Error('バックアップの棋譜とメモの局面が一致しません。');
      }
      plies.add(note.ply);
      return restored;
    });
    return record;
  });
}

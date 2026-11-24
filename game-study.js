const studyMovePattern = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const studyMoveCode = move => move.from + move.to + (move.promotion ?? '');

function studyPlay(board, code) {
  if (typeof code !== 'string' || !studyMovePattern.test(code)) throw new Error('指し手を確認できません。');
  return board.move({ from: code.slice(0, 2), to: code.slice(2, 4), promotion: code[4] });
}

function studyMainMoves(game, ply) {
  return game.positions.slice(1, ply + 1).map(({ move }) => studyMoveCode(move));
}

function studyPosition(game, ply, variation = []) {
  const fen = game.cpu?.origin?.initialFen ?? game.initialFen;
  const moves = [...(game.cpu?.origin?.moves ?? []), ...studyMainMoves(game, ply), ...variation];
  const board = new chessRules.Chess(fen);
  const positionKey = () => board.fen().split(' ').slice(0, 4).join(' ');
  const keys = [positionKey()];
  let lastMove;
  for (const code of moves) {
    lastMove = studyPlay(board, code);
    keys.push(positionKey());
  }
  const ended = board.isCheckmate() || board.isStalemate() || board.isInsufficientMaterial()
    || Number(board.fen().split(' ')[4]) >= 150 || keys.filter(key => key === keys.at(-1)).length >= 5;
  return {
    game: board, lastMove, fen, moves, ended,
    legalMoves: square => board.moves({ square, verbose: true }),
  };
}

function studyPv(fen, moves) {
  const board = new chessRules.Chess(fen);
  const san = [];
  for (const code of moves.slice(0, 10)) {
    try { san.push(studyPlay(board, code).san); }
    catch { break; }
  }
  return san;
}

function studyEngineResult(result, turn, fen) {
  const factor = turn === 'w' ? 1 : -1;
  const lines = result.lines.filter(line => line.score && !line.score.bound).map(line => {
    const { unit, value } = line.score;
    const pv = line.pv.slice(0, 10);
    const san = studyPv(fen, pv);
    if (pv.length && !san.length) return null;
    const score = unit === 'cp' ? { unit, value: value * factor }
      : { unit, value: Math.abs(value), winner: (value > 0 ? turn : turn === 'w' ? 'b' : 'w') };
    return { move: pv[0] ?? null, pv: pv.slice(0, san.length), san, depth: line.depth, score };
  }).filter(Boolean);
  const best = lines[0];
  return best ? { ...best, candidates: lines, bestmove: result.move } : null;
}

function studyScoreText(score) {
  if (!score) return '—';
  if (score.unit === 'mate') return (score.winner === 'b' ? '−' : '') + 'M' + score.value;
  return (score.value > 0 ? '+' : '') + (score.value / 100).toFixed(1);
}

function studyScoreSummary(score) {
  if (!score) return '評価値を取得できませんでした。';
  if (score.unit === 'mate') return score.value
    ? `${chessColorNames[score.winner]}にメイトの可能性（${score.value}手）` : `${chessColorNames[score.winner]}がチェックメイト`;
  const value = Math.abs(score.value);
  if (value < 40) return 'ほぼ互角';
  return chessColorNames[score.value > 0 ? 'w' : 'b'] + (value < 115 ? 'がやや有利' : value < 260 ? 'が有利' : 'が大きく優勢');
}

const studyGradeRules = { minimumDepth: 5, depthGap: 6, inaccuracy: 55, mistake: 115, blunder: 235 };
const studyGraphLimit = 500;
const studyGraphValue = score => score.unit === 'mate' ? (score.winner === 'w' ? 1 : -1) * studyGraphLimit
  : Math.max(-studyGraphLimit, Math.min(studyGraphLimit, score.value));

function studyMoveGrade(before, after, move, { forced = false, terminalWinner = null } = {}) {
  if (forced) return { label: '強制手', kind: 'forced', loss: 0 };
  if (!before || before.depth < studyGradeRules.minimumDepth || !move) return null;
  const code = studyMoveCode(move);
  if (before.bestmove === code && terminalWinner === move.color) return { label: '最善手', kind: 'best', loss: 0 };
  if (!after || after.depth < studyGradeRules.minimumDepth
    || Math.abs(before.depth - after.depth) > studyGradeRules.depthGap) return null;
  const player = move.color;
  const sign = player === 'w' ? 1 : -1;
  if (before.bestmove === code && before.move === code) return { label: '最善手', kind: 'best', loss: 0 };
  const a = before.score, b = after.score;
  if (a.unit === 'mate' || b.unit === 'mate') {
    if ((a.winner === player && b.winner !== player) || (b.winner && b.winner !== player && !a.winner)) {
      return { label: '大きなミス', kind: 'blunder', loss: 400, mate: true };
    }
    return null;
  }
  const rawLoss = (a.value - b.value) * sign;
  const saturated = Math.sign(a.value) === Math.sign(b.value) && Math.min(Math.abs(a.value), Math.abs(b.value)) >= 350;
  const loss = saturated ? rawLoss * .4 : rawLoss;
  const { inaccuracy, mistake, blunder } = studyGradeRules;
  if (loss < -90) return null;
  if (loss >= blunder) return { label: '大きなミス', kind: 'blunder', loss };
  if (loss >= mistake) return { label: 'ミス', kind: 'mistake', loss };
  if (loss >= inaccuracy) return { label: 'やや不正確な手', kind: 'inaccuracy', loss };
  return { label: loss <= 15 ? '優れた手' : '良い手', kind: loss <= 15 ? 'excellent' : 'good', loss };
}

function studyReviewGrades(game, scores, side = null) {
  const events = [];
  for (let ply = 1; ply < game.positions.length; ply++) {
    const before = scores[ply - 1], after = scores[ply];
    const { move } = game.positions[ply];
    if (!before || (side && move.color !== side)) continue;
    const fen = game.positions[ply - 1].fen;
    const forced = new chessRules.Chess(fen).moves().length === 1;
    const grade = studyMoveGrade(before, after, move, { forced, terminalWinner: move.san.endsWith('#') ? move.color : null });
    if (grade) events.push({ gameId: game.id ?? null, ply, fen, move, grade, before, after });
  }
  return events;
}

function studyVariations(game, saved) {
  if (!Array.isArray(saved)) return [];
  return saved.slice(0, 100).filter(entry => {
    if (typeof entry?.id !== 'string' || typeof entry.name !== 'string' || !Number.isInteger(entry.ply)
      || !game.positions[entry.ply] || !Array.isArray(entry.moves) || !entry.moves.length || entry.moves.length > 300) return false;
    try { studyPosition(game, entry.ply, entry.moves); return true; } catch { return false; }
  });
}

async function studyContentKey(game) {
  const data = new TextEncoder().encode(JSON.stringify([game.pgn, game.cpu?.origin?.initialFen, game.cpu?.origin?.moves]));
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

function createStudyStore() {
  let connection;
  function open() {
    connection ??= new Promise((resolve, reject) => {
      const request = indexedDB.open('rookori.game-study', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('studies');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch(error => { connection = null; throw error; });
    return connection;
  }
  async function access(mode, action) {
    const database = await open();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('studies', mode);
      let request;
      tx.oncomplete = () => resolve(request?.result);
      tx.onabort = () => reject(tx.error);
      request = action(tx.objectStore('studies'));
    });
  }
  return {
    get: key => access('readonly', store => store.get(key)),
    put: (key, record) => access('readwrite', store => store.put(record, key)),
  };
}

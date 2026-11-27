const personalRules = Object.freeze({ perGame: 5, checks: 8, minimumDepth: 9, depthGap: 4,
  good: 35, close: 105, meaningful: 115, lost: -500, historyLimit: 80 });
const personalTags = { mate: 'メイト', mateIn1: '1手詰め', capture: '駒を取る手',
  threat: '相手の脅威', defensiveMove: '守備的な着手', fork: 'フォーク', chance: '勝機', swing: '形勢の変化',
  endgame: '終盤', other: '局面の判断' };
const personalSources = { cpu: 'Rookori CPU対戦', positioned: '局面指定CPU対戦', lichess: 'Lichess', manual: '手動取り込み' };
const personalVerdicts = { good: '正解', close: '惜しい', retry: '再挑戦', hold: '判定保留' };
const personalAutoKey = 'rookori.personal-auto.v1';
const personalDailyKey = 'rookori.personal-daily.v1';
const generalHistoryKey = 'rookori.general-practice.v1';
const practiceDailyKey = 'rookori.practice-daily.v1';
const practiceSavedKey = 'rookori.practice-saved.v1';
const personalId = /^[a-f0-9]{64}$/;

function personalSide(game) {
  return game.cpu?.player ?? ({ white: 'w', black: 'b' })[game.source?.color] ?? null;
}

function personalSource(game) {
  return game.cpu ? (game.cpu.origin ? 'positioned' : 'cpu') : game.source?.provider === 'lichess' || lichessPgnId(game.pgn) ? 'lichess' : 'manual';
}

function personalEligibility(game) {
  if (game.pgn === sampleGamePgn) return 'sample';
  if (['1-0', '0-1', '1/2-1/2'].includes(game.metadata.result)) return 'finished';
  const site = reviewPgnTag(game.pgn, 'Site');
  if (personalSource(game) === 'lichess' || game.source || (site && /(?:https?:\/\/|\b(?:lichess\.org|chess\.com)\b)/i.test(site))) return 'live';
  return 'confirm';
}

function personalCandidates(game, scores, side) {
  return studyReviewGrades(game, scores, side).filter(({ grade, before, move }) =>
    grade.loss >= personalRules.meaningful && (before.score.unit === 'cp'
      ? before.score.value * (move.color === 'w' ? 1 : -1) > personalRules.lost : before.score.winner === side))
    .sort((a, b) => b.grade.loss - a.grade.loss || a.ply - b.ply).slice(0, personalRules.checks);
}

function personalValue(score, side) {
  return score.value * (score.unit === 'mate' ? (score.winner === side ? 1 : -1) : side === 'w' ? 1 : -1);
}

function personalCompare(best, answer, side) {
  const usable = line => line?.move && line.score && line.depth >= personalRules.minimumDepth;
  if (!usable(best) || !usable(answer) || Math.abs(best.depth - answer.depth) > personalRules.depthGap) return { kind: 'hold', loss: null };
  const a = personalValue(best.score, side), b = personalValue(answer.score, side);
  if (best.score.unit === 'mate' && answer.score.unit === 'mate') {
    if (best.score.winner !== answer.score.winner) return { kind: answer.score.winner === side ? 'hold' : 'retry', loss: null };
    return { kind: best.score.winner === side || b <= a - 2 ? 'good' : 'hold', loss: null };
  }
  if (best.score.unit !== answer.score.unit) {
    const worse = (best.score.unit === 'mate' && best.score.winner === side)
      || (answer.score.unit === 'mate' && answer.score.winner !== side);
    return { kind: worse ? 'retry' : 'hold', loss: null };
  }
  const loss = a - b;
  if (loss < -personalRules.good) return { kind: 'hold', loss: null };
  const sameClearLead = Math.sign(a) === Math.sign(b) && Math.min(Math.abs(a), Math.abs(b)) >= 350;
  return { kind: loss <= personalRules.good ? 'good' : loss <= personalRules.close || (sameClearLead && loss <= 180) ? 'close' : 'retry', loss };
}

async function personalEvaluate(engine, position, board, onlyMove, candidates = 1) {
  const result = await engine.search('analysis-lesson', position, { onlyMove, candidates });
  return studyEngineResult(result, board.turn(), board.fen());
}

function personalPositionKey(fen) {
  const parts = fen.split(' ');
  return parts.slice(0, Number(parts[4]) >= 80 ? 5 : 4).join(' ');
}

async function personalPositionId(fen) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(personalPositionKey(fen)));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

function personalExplanation(board, best, actual, comparison) {
  const recommended = studyPlay(new chessRules.Chess(board.fen()), best.move);
  if (recommended.san.endsWith('#')) return { tags: ['mate', 'mateIn1'], confidence: 'board', text: `${recommended.san}でチェックメイトになります。` };
  if (best.score.unit === 'mate' && best.score.winner === board.turn()) {
    return { tags: ['mate'], confidence: 'engine', text: '解析ではメイトにつながる手順があります。推奨手からの続きを盤で確認しましょう。' };
  }
  if (recommended.piece === 'n' && recommended.san.endsWith('+') && best.pv.length >= 3) {
    const position = new chessRules.Chess(board.fen());
    const move = studyPlay(position, best.move);
    const target = position.board().flat().find(piece => piece?.color === position.turn()
      && ['r', 'q'].includes(piece.type) && position.attackers(piece.square, board.turn()).includes(move.to)
      && best.pv[2].slice(2, 4) === piece.square);
    if (target) {
      const reply = studyPlay(position, best.pv[1]);
      const capture = studyPlay(position, best.pv[2]);
      if (capture.from === move.to && capture.captured === target.type) return {
        tags: ['fork'], confidence: 'line',
        text: `${move.san} はキングと${cpuPieceLabels[target.type]}の両取りです。解析候補では ${reply.san} のあと ${capture.san} で取れます。`,
      };
    }
  }
  if (actual?.pv[1] && comparison.kind === 'retry') {
    const copy = new chessRules.Chess(board.fen());
    studyPlay(copy, actual.move);
    const reply = studyPlay(copy, actual.pv[1]);
    if (cpuPieceValues[reply.captured] >= 3 && reply.to === actual.move.slice(2, 4)) return { tags: ['threat', 'defensiveMove'], confidence: 'line',
      text: `実戦では動かした駒が、解析候補の ${reply.san} で取られます。移動先を相手のどの駒が攻撃しているか確かめましょう。` };
    if (cpuPieceValues[reply.captured] >= 3) return { tags: ['threat'], confidence: 'line',
      text: `実戦の手のあと、解析候補の ${reply.san} で${cpuPieceLabels[reply.captured]}を取られます。相手の応手まで盤で確認しましょう。` };
  }
  if (recommended.captured) return { tags: ['capture'], confidence: 'board',
    text: `推奨手 ${recommended.san} では相手の${cpuPieceLabels[recommended.captured]}を取れます。そのあとの応手も見てみましょう。` };
  if (comparison.loss >= personalRules.meaningful) {
    const chance = best.score.unit === 'cp' && personalValue(best.score, board.turn()) >= 130
      && actual.score.unit === 'cp' && personalValue(actual.score, board.turn()) < 60;
    const majorPieces = board.board().flat().filter(piece => piece && !['p', 'k'].includes(piece.type)).length;
    return { tags: [chance ? 'chance' : 'swing', ...(majorPieces <= 4 ? ['endgame'] : [])], confidence: 'engine',
      text: '実戦の手と推奨手で解析上の評価に差があります。推奨手のあとに相手がどう応じるかを比べましょう。' };
  }
  return { tags: ['other'], confidence: 'engine', text: '解析の候補から、次の一手と相手の応手を盤で確かめましょう。' };
}

async function verifyPersonalQuestion(engine, game, ply, automatic, active = () => true, variation = [], sourceKey = null) {
  const { game: board, fen: initialFen, moves, ended } = studyPosition(game, ply, variation);
  const fen = board.fen(), side = board.turn();
  if (board.moves().length < 2 || ended) return null;
  const position = { fen: initialFen, moves };
  const scored = await personalEvaluate(engine, position, board, undefined, 3);
  if (!active() || !scored?.move || scored.depth < personalRules.minimumDepth || scored.bestmove !== scored.move) return null;
  const actualMove = variation.length ? null : game.positions[ply + 1]?.move;
  const actualCode = actualMove && studyMoveCode(actualMove);
  let reference = scored;
  let actual = scored.candidates.find(line => line.move === actualCode);
  if (actualCode && !actual) {
    reference = await personalEvaluate(engine, position, board, scored.move);
    if (!active()) return null;
    actual = await personalEvaluate(engine, position, board, actualCode);
  }
  if (!active()) return null;
  const comparison = personalCompare(reference, actual, side);
  if (automatic && (comparison.kind !== 'retry' || (comparison.loss !== null && comparison.loss < personalRules.meaningful)
    || (scored.score.unit === 'cp' && personalValue(scored.score, side) <= personalRules.lost)
    || (scored.score.unit === 'mate' && scored.score.winner !== side))) return null;
  if (scored.score.unit === 'mate' && scored.score.winner !== side) return null;
  const alternatives = scored.candidates.filter(line => line.move === scored.move || personalCompare(scored, line, side).kind === 'good');
  const immediateMate = studyPlay(new chessRules.Chess(fen), scored.move).san.endsWith('#');
  if (automatic && !immediateMate && (scored.candidates.length < Math.min(3, board.moves().length)
    || scored.candidates.some(line => line.depth < personalRules.minimumDepth || Math.abs(line.depth - scored.depth) > personalRules.depthGap)
    || alternatives.some(line => !line.pv.length))) return null;
  const id = await personalPositionId(fen);
  const sourceDate = game.source?.date ?? game.cpu?.started ?? game.metadata.date;
  return { id, gameId: game.id ?? null, sourceKey, source: personalSource(game), sourceDate: typeof sourceDate === 'string' && sourceDate.length <= 40 ? sourceDate : null, ply,
    fen, initialFen, moves, side, actual: actualCode ?? null, actualScore: actual?.score ?? null,
    ...(actual?.pv[0] === actualCode && actualCode ? { actualLine: actual.pv } : {}),
    best: scored.move, candidates: scored.candidates, accepted: alternatives.map(line => line.move),
    loss: comparison.loss, ...personalExplanation(board, scored, actual, comparison),
    engine: stockfishEngine.version, profile: 'analysis-lesson', created: new Date().toISOString(), memo: '' };
}

function personalProgress(previous = {}, kind, hints, date = new Date()) {
  const day = localDay(date);
  const correct = kind === 'good';
  const scheduled = scheduleReview({ due: day, level: -1, interval: 0, reviewedDay: null, ...previous },
    correct && !hints ? 'clean' : correct ? 'hint' : 'retry', day, date, Number(!correct), hints);
  return { ...scheduled, correct: (previous.correct ?? 0) + Number(correct), wrong: (previous.wrong ?? 0) + Number(!correct),
    streak: correct && !hints ? (previous.streak ?? 0) + Number(previous.reviewedDay !== day) : 0,
    events: [...(previous.events ?? []), { day, at: date.toISOString(), kind, hints }].slice(-personalRules.historyLimit) };
}

function personalDue(rows, day = localDay()) {
  const recentMiss = row => ['close', 'retry'].includes(row.history?.events.at(-1)?.kind);
  return rows.filter(({ history }) => !history || (history.due <= day && history.reviewedDay !== day))
    .sort((a, b) => (a.history?.due ?? day).localeCompare(b.history?.due ?? day)
      || Number(recentMiss(b)) - Number(recentMiss(a))
      || (a.history?.level ?? -1) - (b.history?.level ?? -1) || b.question.created.localeCompare(a.question.created));
}

function personalPreference(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

function savePersonalPreference(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

function validGeneralHistory(rows) {
  return learningObject(rows) && Object.entries(rows).length <= 15000
    && Object.entries(rows).every(([id, row]) => /^[A-Za-z0-9]{5}$/.test(id) && learningObject(row)
      && learningDate(row.due) && learningDate(row.reviewedDay) && learningDateTime(row.lastAt)
      && ['level', 'interval', 'streak', 'correct', 'wrong', 'hints', 'mistakes'].every(key => learningCount(row[key]))
      && learningObject(row.first) && typeof row.first.correct === 'boolean' && learningCount(row.first.hints)
      && learningDate(row.first.day) && Array.isArray(row.events) && row.events.length > 0 && row.events.length <= 12
      && row.events.every(event => learningDate(event?.day) && learningDateTime(event.at)
        && ['good', 'retry'].includes(event.kind) && learningCount(event.hints)));
}

function validPracticeDaily(value) {
  return learningObject(value) && learningDate(value.day) && typeof value.complete === 'boolean' && learningObject(value.menus)
    && Object.entries(value.menus).every(([mode, rows]) => ['recommended', 'general', 'personal'].includes(mode)
      && Array.isArray(rows) && rows.length <= 10 && new Set(rows.map(row => row?.id)).size === rows.length
      && rows.every(row => learningObject(row) && (row.type === 'personal' ? personalId.test(row.id ?? '')
        : row.type === 'general' && /^[A-Za-z0-9]{5}$/.test(row.id ?? ''))
        && typeof row.reason === 'string' && row.reason.length < 80));
}

function validPracticeSaved(value) {
  return learningIds(value) && value.length <= 10000 && value.every(id => /^[A-Za-z0-9]{5}$/.test(id));
}

function createPersonalStore() {
  let opening;
  async function access(mode, action) {
    opening ??= new Promise((resolve, reject) => {
      const request = indexedDB.open('rookori.personal-practice', 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('questions', { keyPath: 'id' });
        request.result.createObjectStore('history');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch(error => { opening = null; throw error; });
    const db = await opening;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['questions', 'history'], mode);
      let result;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error ?? new Error('問題データを保存できませんでした。'));
      action(tx.objectStore('questions'), tx.objectStore('history'), value => { result = value; });
    });
  }
  return {
    all: () => access('readonly', (questions, history, complete) => {
      const all = questions.getAll(), saved = history.getAll(), ids = history.getAllKeys();
      ids.onsuccess = () => {
        const map = new Map(ids.result.map((id, i) => [id, saved.result[i]]));
        complete(all.result.map(question => ({ question, history: map.get(question.id) ?? null })));
      };
    }),
    merge: (rows, combineHistory) => access('readwrite', (questions, history, complete) => {
      let added = 0;
      complete(0);
      for (const row of rows) {
        const get = questions.getKey(row.question.id);
        get.onsuccess = () => {
          if (get.result !== undefined) {
            if (!combineHistory || !row.history) return;
            const current = history.get(row.question.id);
            current.onsuccess = () => {
              const merged = combineHistory(current.result, row.history);
              if (JSON.stringify(merged) !== JSON.stringify(current.result)) history.put(merged, row.question.id);
            };
            return;
          }
          questions.add(row.question);
          if (row.history) history.add(row.history, row.question.id);
          complete(++added);
        };
      }
    }),
    answer: (id, kind, hints) => access('readwrite', (questions, history) => {
      const exists = questions.getKey(id);
      exists.onsuccess = () => {
        if (!exists.result) return;
        const get = history.get(id);
        get.onsuccess = () => history.put(personalProgress(get.result, kind, hints), id);
      };
    }),
    memo: (id, memo) => access('readwrite', questions => {
      const get = questions.get(id);
      get.onsuccess = () => { if (get.result) questions.put({ ...get.result, memo }); };
    }),
    remove: id => access('readwrite', (questions, history) => { questions.delete(id); history.delete(id); }),
  };
}

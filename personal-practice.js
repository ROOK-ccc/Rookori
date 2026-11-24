const personalRules = Object.freeze({ perGame: 5, checks: 8, minimumDepth: 9, depthGap: 4,
  good: 35, close: 105, meaningful: 115, lost: -500, historyLimit: 80 });
const personalTags = { mate: 'メイト', capture: '駒を取る手', threat: '相手の脅威', chance: '勝機', swing: '形勢の変化', other: '局面の判断' };
const personalSources = { cpu: 'Rookori CPU対戦', positioned: '局面指定CPU対戦', lichess: 'Lichess', manual: '手動取り込み' };
const personalVerdicts = { good: '正解', close: '惜しい', retry: '再挑戦', hold: '判定保留' };
const personalAutoKey = 'rookori.personal-auto.v1';
const personalDailyKey = 'rookori.personal-daily.v1';
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
  if (recommended.san.endsWith('#')) return { tags: ['mate'], confidence: 'board', text: `${recommended.san}でチェックメイトになります。` };
  if (best.score.unit === 'mate' && best.score.winner === board.turn()) {
    return { tags: ['mate'], confidence: 'engine', text: '解析ではメイトにつながる手順があります。推奨手からの続きを盤で確認しましょう。' };
  }
  if (actual?.pv[1] && comparison.kind === 'retry') {
    const copy = new chessRules.Chess(board.fen());
    studyPlay(copy, actual.move);
    const reply = studyPlay(copy, actual.pv[1]);
    if (cpuPieceValues[reply.captured] >= 3) return { tags: ['threat'], confidence: 'line',
      text: `実戦の手のあと、解析候補の ${reply.san} で${cpuPieceLabels[reply.captured]}を取られます。相手の応手まで盤で確認しましょう。` };
  }
  if (recommended.captured) return { tags: ['capture'], confidence: 'board',
    text: `推奨手 ${recommended.san} では相手の${cpuPieceLabels[recommended.captured]}を取れます。そのあとの応手も見てみましょう。` };
  if (comparison.loss >= personalRules.meaningful) {
    const chance = best.score.unit === 'cp' && personalValue(best.score, board.turn()) >= 130
      && actual.score.unit === 'cp' && personalValue(actual.score, board.turn()) < 60;
    return { tags: [chance ? 'chance' : 'swing'], confidence: 'engine', text: '実戦の手と推奨手で解析上の評価に差があります。推奨手のあとに相手がどう応じるかを比べましょう。' };
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
  const id = await personalPositionId(fen);
  const sourceDate = game.source?.date ?? game.cpu?.started ?? game.metadata.date;
  return { id, gameId: game.id ?? null, sourceKey, source: personalSource(game), sourceDate: typeof sourceDate === 'string' && sourceDate.length <= 40 ? sourceDate : null, ply,
    fen, initialFen, moves, side, actual: actualCode ?? null, actualScore: actual?.score ?? null,
    best: scored.move, candidates: scored.candidates, accepted: scored.candidates.filter(line =>
      line.move === scored.move || personalCompare(scored, line, side).kind === 'good').map(line => line.move),
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

function personalGeneralQuestions(lessons, weak, newQuestion, count) {
  const related = lessons.filter(lesson => (lesson.problem?.tags ?? []).some(tag =>
    weak.has(tag) || [...weak].some(key => personalTags[key] === tag))).slice(0, 3);
  const fresh = lessons.filter(lesson => !related.includes(lesson) && newQuestion(lesson)).slice(0, 3);
  return [...new Set([...related, ...fresh, ...lessons])].slice(0, count);
}

function personalPreference(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

function savePersonalPreference(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
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
    merge: rows => access('readwrite', (questions, history, complete) => {
      let added = 0;
      complete(0);
      for (const row of rows) {
        const get = questions.getKey(row.question.id);
        get.onsuccess = () => {
          if (get.result !== undefined) return;
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

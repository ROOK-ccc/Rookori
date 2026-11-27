const migrationType = 'rookori.site-backup';
const migrationLimit = 64 * 1024 ** 2;
const savedTypeResultKey = 'rookori.type-result.v1';
const savedOpeningResultKey = 'rookori.opening-result.v1';

function validSavedTypeResult(value) {
  return learningObject(value) && typeof value.code === 'string' && typeof value.mode === 'string'
    && Object.hasOwn(types, value.code) && Object.hasOwn(modes, value.mode);
}

const migrationSettings = new Map([
  [cpuSettingsKey, value => learningObject(value) && cpuSettingsMatch(normalizeCpuSettings(value), value)],
  [cpuMaterialKey, value => ['practice', 'match'].every(mode =>
    ['captures', 'score'].every(key => typeof value?.[mode]?.[key] === 'boolean'))],
  [cpuResumeKey, value => Boolean(restoreCpuSnapshot(value))],
  [cpuResultsKey, value => Array.isArray(value) && value.length <= 50 && value.every(row =>
    learningObject(row) && typeof row.date === 'string' && Number.isFinite(Date.parse(row.date))
    && Number.isInteger(row.level) && cpuLevels[row.level - 1] && ['w', 'b'].includes(row.color)
    && typeof row.time === 'string' && row.time.length < 30 && typeof row.result === 'string' && row.result.length < 100)],
  [lichessUsernameKey, value => typeof value === 'string' && lichessUsername.test(value)],
  [savedTypeResultKey, validSavedTypeResult],
  [savedOpeningResultKey, validOpeningAnswers],
  [personalAutoKey, value => typeof value === 'boolean'],
  [personalDailyKey, value => ['recommended', 'general', 'personal'].includes(value)],
  [generalHistoryKey, validGeneralHistory],
  [practiceDailyKey, validPracticeDaily],
  [practiceSavedKey, validPracticeSaved],
  [styleOwnershipKey, validStyleOwnership],
  [styleSnapshotsKey, validStyleSnapshots],
  [welcomeKey, value => typeof value === 'boolean'],
  [learningGoalKey, validLearningGoal],
]);

function migrationRead(key) {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { return null; }
}

function rememberDiagnosis(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* The current result remains visible. */ }
}

function validMigrationLine(line) {
  const move = code => typeof code === 'string' && studyMovePattern.test(code);
  const score = line?.score;
  return (line?.move === null || move(line?.move)) && Number.isInteger(line.depth) && line.depth >= 0 && line.depth <= 256
    && Array.isArray(line.pv) && line.pv.length <= 10 && line.pv.every(move)
    && Array.isArray(line.san) && line.san.length === line.pv.length
    && line.san.every(san => typeof san === 'string' && san.length <= 16)
    && Number.isSafeInteger(score?.value) && (score.unit === 'cp'
      || (score.unit === 'mate' && score.value >= 0 && ['w', 'b'].includes(score.winner)));
}

function validMigrationEvaluation(value) {
  return validMigrationLine(value) && (value.bestmove === null || value.bestmove === undefined
    || value.bestmove === '(none)' || (typeof value.bestmove === 'string' && studyMovePattern.test(value.bestmove)))
    && Array.isArray(value.candidates) && value.candidates.length <= 5 && value.candidates.every(validMigrationLine);
}

function validMigrationStudy(record, game) {
  const smallText = value => value === null || (typeof value === 'string' && value.length <= 80);
  if (!learningObject(record) || !smallText(record.version) || !smallText(record.mode)
    || (record.analyzed !== null && !cpuTimestamp(record.analyzed))
    || (record.gameId !== null && !validCpuId(record.gameId))
    || !Array.isArray(record.scores) || record.scores.length > (game?.positions.length ?? 12001)
    || !record.scores.every(score => score === null || validMigrationEvaluation(score))
    || !learningObject(record.single) || Object.keys(record.single).length > 120
    || !Array.isArray(record.variations) || record.variations.length > 100) return false;
  const moves = values => values.length <= 300 && values.every(value =>
    typeof value === 'string' && studyMovePattern.test(value));
  const ply = value => Number.isInteger(value) && value >= 0 && value < (game?.positions.length ?? 12001);
  const ids = new Set();
  return Object.entries(record.single).every(([key, entry]) => {
    const parts = /^(\d{1,5}):(.*)$/.exec(key);
    if (!parts || !ply(Number(parts[1])) || !moves(parts[2] ? parts[2].split(' ') : [])
      || typeof entry?.version !== 'string' || !smallText(entry.version) || !cpuTimestamp(entry.date)
      || !validMigrationEvaluation(entry.value)) return false;
    if (!game || !parts[2]) return true;
    try { studyPosition(game, Number(parts[1]), parts[2].split(' ')); return true; } catch { return false; }
  }) && record.variations.every(entry => {
    if (!validCpuId(entry?.id) || ids.has(entry.id) || typeof entry.name !== 'string' || !smallText(entry.name)
      || !ply(entry.ply) || !Array.isArray(entry.moves) || !entry.moves.length || !moves(entry.moves)) return false;
    ids.add(entry.id);
    return true;
  }) && (!game || studyVariations(game, record.variations).length === record.variations.length);
}

async function validateMigration(backup) {
  const invalid = () => new Error('このファイルはRookoriの一括バックアップとして読み込めません。');
  if (backup?.type !== migrationType || backup.version !== 1 || !validateLearningBackup(backup.learning)
    || !learningObject(backup.settings) || !Array.isArray(backup.studies)) throw invalid();
  for (const [key, value] of Object.entries(backup.settings)) {
    if (!migrationSettings.get(key)?.(value)) throw invalid();
  }
  const games = validateGameBackup(backup.library);
  const byHash = new Map();
  for (const game of games) byHash.set(await studyContentKey(game), game);
  const keys = new Set();
  for (const row of backup.studies) {
    const [key, record] = Array.isArray(row) ? row : [];
    if (typeof key !== 'string' || !/^[a-f0-9]{64}$/.test(key) || keys.has(key)
      || !validMigrationStudy(record, byHash.get(key))) throw invalid();
    keys.add(key);
  }
  const personal = await validatePersonalBackup(backup.personal ?? []);
  return { games, studies: backup.studies, personal, values: { ...backup.learning.data, ...backup.settings } };
}

async function validatePersonalBackup(rows) {
  const invalid = () => new Error('個別練習問題または学習履歴の形式を確認してください。');
  if (!Array.isArray(rows)) throw invalid();
  const ids = new Set();
  for (const row of rows) {
    const question = row?.question;
    const history = row?.history;
    if (!learningObject(question) || !personalId.test(question.id ?? '') || ids.has(question.id)
      || (question.gameId !== null && !validCpuId(question.gameId)) || !Object.hasOwn(personalSources, question.source)
      || (question.sourceKey !== null && (typeof question.sourceKey !== 'string' || !personalId.test(question.sourceKey)))
      || !learningCount(question.ply) || !['w', 'b'].includes(question.side) || !cpuTimestamp(question.created)
      || typeof question.engine !== 'string' || question.engine.length > 32 || question.profile !== 'analysis-lesson'
      || typeof question.fen !== 'string' || question.fen.length > 128 || typeof question.initialFen !== 'string' || question.initialFen.length > 128
      || !Array.isArray(question.moves) || question.moves.length > 12000 || !question.moves.every(learningUci)
      || !learningUci(question.best) || (question.actual !== null && !learningUci(question.actual))
      || !Array.isArray(question.candidates) || !question.candidates.length || question.candidates.length > 5
      || !question.candidates.every(validMigrationLine) || !question.candidates.some(line => line.move === question.best)
      || !learningIds(question.accepted) || !question.accepted.includes(question.best)
      || !question.accepted.every(code => question.candidates.some(line => line.move === code))
      || !learningIds(question.tags) || !question.tags.length || !question.tags.every(tag => Object.hasOwn(personalTags, tag))
      || !['board', 'line', 'engine'].includes(question.confidence) || typeof question.text !== 'string' || question.text.length > 500
      || typeof question.memo !== 'string' || question.memo.length > 1000
      || (question.sourceDate !== null && (typeof question.sourceDate !== 'string' || question.sourceDate.length > 40))
      || (question.loss !== null && !Number.isSafeInteger(question.loss))) throw invalid();
    const score = question.actualScore;
    if (score !== null && (!Number.isSafeInteger(score?.value) || (score.unit !== 'cp'
      && (score.unit !== 'mate' || score.value < 0 || !['w', 'b'].includes(score.winner))))) throw invalid();
    const { game: board } = cpuStartingPosition({ fen: question.fen, initialFen: question.initialFen, moves: question.moves,
      ply: question.ply, gameId: question.gameId, color: question.side });
    if (board.turn() !== question.side || board.moves().length < 2
      || await personalPositionId(question.fen) !== question.id) throw invalid();
    if (question.actual) studyPlay(new chessRules.Chess(question.fen), question.actual);
    for (const line of question.candidates) {
      if (line.pv[0] !== line.move || studyPv(question.fen, line.pv).join(' ') !== line.san.join(' ')) throw invalid();
    }
    ids.add(question.id);
    if (history === null) continue;
    if (!learningObject(history) || !learningDate(history.due) || !learningDate(history.reviewedDay) || !cpuTimestamp(history.lastAt)
      || !Number.isInteger(history.level) || history.level < -1 || history.level >= reviewIntervals.length
      || !reviewIntervals.includes(history.interval) || !['clean', 'hint', 'retry'].includes(history.outcome)
      || !['correct', 'wrong', 'streak', 'hints', 'mistakes'].every(key => learningCount(history[key]))
      || !Array.isArray(history.events) || !history.events.length || history.events.length > personalRules.historyLimit
      || history.events.length > history.correct + history.wrong
      || !history.events.every(event => cpuTimestamp(event?.at) && learningDate(event.day)
        && ['good', 'close', 'retry'].includes(event.kind) && learningCount(event.hints) && event.hints <= 2)) throw invalid();
  }
  return rows;
}

function addMigrationSettings(storage, values) {
  let added = 0;
  let skipped = 0;
  for (const [key, value] of Object.entries(values)) {
    if (value === null) continue;
    if (storage.getItem(key) === null) {
      storage.setItem(key, key === lichessUsernameKey ? value : JSON.stringify(value));
      added++;
    } else if ([styleOwnershipKey, learningKey, introStorageKey, openingHistoryKey, styleSnapshotsKey,
      cpuResultsKey, generalHistoryKey, practiceSavedKey].includes(key)) {
      let current;
      try { current = JSON.parse(storage.getItem(key)); } catch { /* Preserve unreadable settings. */ }
      const baseline = { [learningKey]: null, [introStorageKey]: null, [openingHistoryKey]: null, [key]: current };
      const valid = migrationSettings.has(key) ? migrationSettings.get(key)(current)
        : current && validateLearningBackup({ schemaVersion: 1, data: baseline });
      if (!valid || JSON.stringify(current) === JSON.stringify(value)) { skipped++; continue; }
      let combined;
      if (key === learningKey) combined = mergeLearningProgress(current, value);
      else if (key === introStorageKey) combined = mergeIntroProgress(current, value);
      else if (key === practiceSavedKey) combined = [...new Set([...current, ...value])];
      else if (key === openingHistoryKey) combined = { ...current, records:
        [...new Map([...value.records, ...current.records].map(row => [row.id, row])).values()] };
      else if (key === generalHistoryKey) {
        combined = { ...current };
        for (const [id, incoming] of Object.entries(value)) {
          const previous = current[id];
          if (!previous) { combined[id] = incoming; continue; }
          const events = [...new Map([...previous.events, ...incoming.events].map(event =>
            [JSON.stringify([event.at, event.kind, event.hints]), event])).values()].sort((a, b) => a.at.localeCompare(b.at)).slice(-12);
          const latest = incoming.lastAt > previous.lastAt ? incoming : previous;
          combined[id] = { ...latest, events, first: incoming.first.day < previous.first.day ? incoming.first : previous.first,
            correct: Math.max(previous.correct, incoming.correct, events.filter(event => event.kind === 'good').length),
            wrong: Math.max(previous.wrong, incoming.wrong, events.filter(event => event.kind === 'retry').length) };
        }
      }
      else if (key === styleSnapshotsKey || key === cpuResultsKey) {
        const limit = key === styleSnapshotsKey ? 30 : 50;
        const signature = row => key === cpuResultsKey
          ? JSON.stringify([row.date, row.level, row.color, row.time, row.result])
          : JSON.stringify([row.date, row.engine, row.filters, row.outline]);
        const rows = new Map(current.map(row => [signature(row), row]));
        for (const row of value) if (rows.size < limit && !rows.has(signature(row))) rows.set(signature(row), row);
        combined = [...rows.values()].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
      }
      else combined = { ...value, ...current };
      if (JSON.stringify(combined) === JSON.stringify(current)) { skipped++; continue; }
      storage.setItem(key, JSON.stringify(combined));
      added++;
    } else skipped++;
  }
  return { added, skipped };
}

async function prepareMigrationLinks(staged, { links, records }) {
  const hashes = new Map();
  for (const game of staged.games) {
    const destination = records.get(links.get(game.id));
    if (!destination) continue;
    const before = await studyContentKey(game);
    const after = await studyContentKey(destination);
    if (before !== after) hashes.set(before, after);
  }
  const gameId = id => links.get(id) ?? id;
  const sourceKey = key => hashes.get(key) ?? key;
  const values = { ...staged.values };
  if (values[styleOwnershipKey]) {
    values[styleOwnershipKey] = Object.fromEntries(Object.entries(values[styleOwnershipKey]).map(([id, side]) => [gameId(id), side]));
  }
  const resume = values[cpuResumeKey];
  if (resume) {
    const { origin, parentId } = resume;
    values[cpuResumeKey] = { ...resume, parentId: gameId(parentId),
      ...(origin && { origin: { ...origin, gameId: gameId(origin.gameId) } }) };
  }
  const studies = new Map();
  for (const [key, row] of staged.studies) {
    const target = sourceKey(key);
    const linked = { ...row, gameId: gameId(row.gameId) };
    studies.set(target, studies.has(target) ? mergeMigrationStudy(studies.get(target), linked) : linked);
  }
  return { values, studies: [...studies],
    personal: staged.personal.map(({ question, history }) => ({
      question: { ...question, gameId: gameId(question.gameId), sourceKey: sourceKey(question.sourceKey) }, history,
    })) };
}

function mergeMigrationStudy(current, incoming) {
  const empty = !current.scores.some(Boolean);
  const compatible = empty || current.version === incoming.version && current.mode === incoming.mode;
  const scores = compatible
    ? Array.from({ length: Math.max(current.scores.length, incoming.scores.length) }, (_, i) =>
      current.scores[i] ?? incoming.scores[i] ?? null)
    : current.scores;
  const single = { ...current.single };
  for (const [key, entry] of Object.entries(incoming.single)) {
    if (!Object.hasOwn(single, key) && Object.keys(single).length < 120) single[key] = entry;
  }
  const variations = [...current.variations];
  const signature = row => JSON.stringify([row.ply, row.moves, row.name]);
  const seen = new Set(variations.map(signature));
  for (const variation of incoming.variations) {
    const key = signature(variation);
    if (seen.has(key) || variations.length >= 100) continue;
    variations.push(variations.some(row => row.id === variation.id) ? { ...variation, id: newCpuGameId() } : variation);
    seen.add(key);
  }
  return { ...current, ...(empty && incoming.scores.some(Boolean)
    && { version: incoming.version, mode: incoming.mode, analyzed: incoming.analyzed }),
  scores, single, variations, gameId: current.gameId ?? incoming.gameId };
}

function mergePersonalHistory(current, incoming) {
  if (!current || !incoming) return current ?? incoming;
  const signature = event => JSON.stringify([event.at, event.kind, event.hints]);
  const occupied = new Set(current.events.map(signature));
  const added = [...new Map(incoming.events.filter(event => !occupied.has(signature(event)))
    .map(event => [signature(event), event])).values()];
  const events = [...current.events, ...added];
  const remaining = Math.max(0, personalRules.historyLimit - current.events.length);
  const retained = [...current.events, ...added.slice(added.length - Math.min(remaining, added.length))]
    .sort((a, b) => a.at.localeCompare(b.at));
  const progress = incoming.lastAt > current.lastAt ? incoming : current;
  const correct = events.filter(event => event.kind === 'good').length;
  return { ...progress, events: retained,
    correct: Math.max(current.correct, incoming.correct, correct),
    wrong: Math.max(current.wrong, incoming.wrong, events.length - correct),
    hints: Math.max(current.hints, incoming.hints),
    mistakes: Math.max(current.mistakes, incoming.mistakes) };
}

function initializeMigration() {
  byId('site-migration-dismiss')?.addEventListener('click', () => {
    byId('site-migration-notice').hidden = true;
    document.querySelector('main .screen:not([hidden]) h1')?.focus();
  });
  const library = createGameLibrary();
  const studies = createStudyStore();
  const personalStore = createPersonalStore();
  const input = byId('migration-file');
  const download = byId('migration-export');
  const restore = byId('migration-restore');
  const status = byId('migration-status');
  const refresh = byId('migration-refresh');
  let staged;
  let selection = 0;

  download.addEventListener('click', async () => {
    download.disabled = true;
    try {
      const [games, analysis, personal] = await Promise.all([library.all(), studies.all(), personalStore.all()]);
      const settings = {};
      for (const key of migrationSettings.keys()) {
        const text = localStorage.getItem(key);
        if (text !== null) settings[key] = key === lichessUsernameKey ? text : JSON.parse(text);
      }
      const backup = { type: migrationType, version: 1, learning: learningBackup(localStorage),
        library: makeGameBackup(games), studies: analysis, personal, settings };
      const json = new Blob([JSON.stringify(backup)], { type: 'application/json' });
      if (json.size > migrationLimit) throw new Error('一括バックアップの上限（64 MiB）を超えています。');
      await validateMigration(backup);
      const url = URL.createObjectURL(json);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Rookori-移行-${localDay()}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status.textContent = '一括バックアップをダウンロードしました。';
    } catch (error) { status.textContent = `一括バックアップを作成できませんでした。${error.message}`; }
    finally { download.disabled = false; }
  });

  input.addEventListener('change', async () => {
    const current = ++selection;
    const file = input.files[0];
    input.value = '';
    staged = null;
    restore.hidden = true;
    if (!file) return;
    status.textContent = 'バックアップを確認しています…';
    try {
      if (file.size > migrationLimit) throw new Error('ファイルの上限は64 MiBです。');
      const validated = await validateMigration(JSON.parse(await file.text()));
      if (current !== selection) return;
      staged = validated;
      status.textContent = `棋譜 ${staged.games.length} 件・解析と検討 ${staged.studies.length} 件・個別問題 ${staged.personal.length} 件を確認しました。`;
      restore.hidden = false;
    } catch {
      if (current === selection) status.textContent = '一括バックアップの形式または大きさを確認してください。';
    }
  });

  restore.addEventListener('click', async () => {
    if (!staged || restore.disabled) return;
    restore.disabled = input.disabled = download.disabled = true;
    try {
      const games = await library.merge(staged.games);
      const linked = await prepareMigrationLinks(staged, games);
      const analysis = await studies.merge(linked.studies, mergeMigrationStudy);
      const personal = await personalStore.merge(linked.personal, mergePersonalHistory);
      const settings = addMigrationSettings(localStorage, linked.values);
      status.textContent = `追加した棋譜 ${games.added} 件、更新した既存の棋譜 ${games.changed.size - games.added} 件、解析と検討の追加・統合 ${analysis} 件、個別問題の追加 ${personal} 件、学習・設定の追加・統合 ${settings.added} 件。`
        + (games.conflicts ? ` 同じ局面にあった別のメモ ${games.conflicts} 件を「移行元のメモ」として残しました。` : '');
      staged = null;
      restore.hidden = true;
    } catch {
      status.textContent = '復元の途中で保存できなくなりました。すでに追加した分は残ります。空き容量やブラウザーの設定を確認し、同じファイルで再実行できます。';
    } finally {
      refresh.hidden = false;
      restore.disabled = input.disabled = download.disabled = false;
    }
  });
  refresh.addEventListener('click', () => location.reload());

  const type = migrationRead(savedTypeResultKey);
  if (validSavedTypeResult(type)) {
    byId('migration-type-result').hidden = false;
    byId('migration-type-result').addEventListener('click', () => goTo('result', { code: type.code, mode: type.mode }));
  }
  const opening = migrationRead(savedOpeningResultKey);
  if (validOpeningAnswers(opening)) {
    lastOpeningAnswers = opening;
    byId('migration-opening-result').hidden = false;
    byId('migration-opening-result').addEventListener('click', () => goTo('opening-result', { openingAnswers: opening }));
  }
}

function updateMigrationLink() {
  const address = document.querySelector('meta[name="rookori-migration-url"]')?.content;
  if (!address) return;
  const dest = new URL(address);
  const current = new URL(location.href);
  const result = readResultLink(current);
  if (result.screen === 'result') {
    dest.searchParams.set('type', result.code);
    dest.searchParams.set('mode', result.mode);
  }
  const route = readSiteRoute(current, history.state);
  if (current.hash === '#' + route.path && !['game-review/preview', 'opening-result'].includes(route.path)) dest.hash = current.hash;
  byId('site-migration-link').href = dest.href;
}

window.addEventListener('DOMContentLoaded', initializeMigration, { once: true });

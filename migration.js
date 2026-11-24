const migrationType = 'rookori.site-backup';
const migrationLimit = 64 * 1024 ** 2;
const savedTypeResultKey = 'rookori.type-result.v1';
const savedOpeningResultKey = 'rookori.opening-result.v1';

function validSavedTypeResult(value) {
  return learningObject(value) && typeof value.code === 'string' && typeof value.mode === 'string'
    && Object.hasOwn(types, value.code) && Object.hasOwn(modes, value.mode);
}

const migrationSettings = new Map([
  [cpuSettingsKey, value => learningObject(value)
    && Object.entries(normalizeCpuSettings(value)).every(([key, setting]) => setting === value[key])],
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
  return { games, studies: backup.studies, values: { ...backup.learning.data, ...backup.settings } };
}

function addMigrationSettings(storage, values) {
  let added = 0;
  let skipped = 0;
  for (const [key, value] of Object.entries(values)) {
    if (value === null) continue;
    if (storage.getItem(key) === null) {
      storage.setItem(key, key === lichessUsernameKey ? value : JSON.stringify(value));
      added++;
    } else skipped++;
  }
  return { added, skipped };
}

function initializeMigration() {
  const library = createGameLibrary();
  const studies = createStudyStore();
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
      const [games, analysis] = await Promise.all([library.all(), studies.all()]);
      const settings = {};
      for (const key of migrationSettings.keys()) {
        const text = localStorage.getItem(key);
        if (text !== null) settings[key] = key === lichessUsernameKey ? text : JSON.parse(text);
      }
      const backup = { type: migrationType, version: 1, learning: learningBackup(localStorage),
        library: makeGameBackup(games), studies: analysis, settings };
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
      status.textContent = `棋譜 ${staged.games.length} 件・解析と検討 ${staged.studies.length} 件を確認しました。`;
      restore.hidden = false;
    } catch {
      if (current === selection) status.textContent = '一括バックアップの形式または大きさを確認してください。';
    }
  });

  restore.addEventListener('click', async () => {
    if (!staged || restore.disabled) return;
    restore.disabled = input.disabled = download.disabled = true;
    let games = 0;
    let analysis = 0;
    try {
      games = await library.merge(staged.games);
      analysis = await studies.merge(staged.studies);
      const settings = addMigrationSettings(localStorage, staged.values);
      status.textContent = `追加した棋譜 ${games} 件、解析と検討 ${analysis} 件、学習・設定の項目 ${settings.added} 件。`
        + ` 重複または移行先にデータがある項目 ${staged.games.length - games + staged.studies.length - analysis + settings.skipped} 件は追加しませんでした。`;
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
  byId('site-migration-notice').hidden = false;
}

window.addEventListener('DOMContentLoaded', initializeMigration, { once: true });

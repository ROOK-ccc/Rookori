const diagnosisHistoryKey = 'rookori.diagnosis-history.v1';
const diagnosisVersion = 1;
const diagnosisId = /^(?:[a-f0-9]{32}|legacy-[a-z0-9-]{1,45})$/;
const emptyDiagnosisHistory = () => ({ version: 1, records: [], removed: [] });

function validDiagnosisHistory(value) {
  if (value?.version !== 1 || !Array.isArray(value.records) || !Array.isArray(value.removed)
    || value.records.length > 5000 || value.removed.length > 15000
    || new Set(value.records.map(row => row?.id)).size !== value.records.length
    || new Set(value.removed).size !== value.removed.length
    || !value.removed.every(id => typeof id === 'string' && diagnosisId.test(id))) return false;
  return value.records.every(row => {
    if (!row || typeof row.id !== 'string' || !diagnosisId.test(row.id) || row.spec !== diagnosisVersion
      || !(row.at === null ? row.id.startsWith('legacy-') : typeof row.at === 'string' && Number.isFinite(Date.parse(row.at)))) return false;
    if (row.kind === 'type') return validSavedTypeResult(row) && (row.scores === null && row.at === null
      || Array.isArray(row.scores) && row.scores.length === axes.length && row.scores.every((pair, i) =>
        Array.isArray(pair) && pair.length === 2 && pair.every(n => Number.isInteger(n) && n >= 0)
        && pair[0] + pair[1] === modes[row.mode].questions[axes[i].codes[0]].length
        && axes[i].codes[pair[0] > pair[1] ? 0 : 1] === row.code[i]));
    if (row.kind !== 'opening' || !Array.isArray(row.picks) || row.picks.length !== Object.keys(openingSlots).length) return false;
    return row.picks.every((pick, index) => openings.some(item => item.id === pick?.id && item.slot === Object.keys(openingSlots)[index])
      && typeof pick.reason === 'string' && pick.reason.length <= 300);
  });
}

function mergeDiagnosisHistory(current, incoming) {
  const removed = [...new Set([...current.removed, ...incoming.removed])].sort();
  const skipped = new Set(removed);
  const records = [...new Map([...incoming.records, ...current.records].map(row => [row.id, row])).values()]
    .filter(row => !skipped.has(row.id)).sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0) || b.id.localeCompare(a.id));
  return { version: 1, records, removed };
}

function diagnosisPicks(answers) {
  return scoreOpenings(answers).map(({ candidate, reason }) => ({ id: candidate.id, reason }));
}

function legacyDiagnoses(oldType, oldOpening) {
  const legacy = [];
  if (validSavedTypeResult(oldType)) legacy.push({ id: 'legacy-type-' + oldType.code.toLowerCase() + '-' + oldType.mode,
    kind: 'type', code: oldType.code, mode: oldType.mode, scores: null, at: null, spec: diagnosisVersion });
  if (validOpeningAnswers(oldOpening)) {
    const picks = diagnosisPicks(oldOpening);
    let hash = 2166136261;
    for (const character of JSON.stringify(picks)) hash = Math.imul(hash ^ character.codePointAt(0), 16777619);
    legacy.push({ id: 'legacy-opening-' + (hash >>> 0).toString(16), kind: 'opening', picks, at: null, spec: diagnosisVersion });
  }
  return { version: 1, records: legacy, removed: [] };
}

function readDiagnosisHistory() {
  const stored = migrationRead(diagnosisHistoryKey);
  const base = validDiagnosisHistory(stored) ? stored : emptyDiagnosisHistory();
  return mergeDiagnosisHistory(legacyDiagnoses(migrationRead(savedTypeResultKey), migrationRead(savedOpeningResultKey)), base);
}

function writeDiagnosisHistory(value) {
  if (!validDiagnosisHistory(value)) return false;
  try { localStorage.setItem(diagnosisHistoryKey, JSON.stringify(value)); return true; }
  catch { return false; }
}

function completeDiagnosis(kind, data) {
  const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
  const row = { ...data, id, kind, at: new Date().toISOString(), spec: diagnosisVersion };
  const history = readDiagnosisHistory();
  return { row, saved: writeDiagnosisHistory({ ...history, records: [row, ...history.records] }) };
}

function deleteDiagnosis(id) {
  const history = readDiagnosisHistory();
  const deleted = writeDiagnosisHistory(mergeDiagnosisHistory(history, { version: 1, records: [], removed: [id] }));
  if (deleted && id.startsWith('legacy-')) {
    const legacy = legacyDiagnoses(migrationRead(savedTypeResultKey), migrationRead(savedOpeningResultKey));
    const row = legacy.records.find(row => row.id === id);
    if (row) try { localStorage.removeItem(row.kind === 'type' ? savedTypeResultKey : savedOpeningResultKey); }
    catch { /* The recorded deletion still hides the old result. */ }
  }
  return deleted;
}

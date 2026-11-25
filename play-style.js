const styleOwnershipKey = 'rookori.style-games.v1';
const styleSnapshotsKey = 'rookori.style-snapshots.v1';
const styleChoices = {
  limit: { 10: '最近10局', 30: '最近30局', 100: '最近100局', all: 'すべての対象対局' },
  source: { all: 'すべて', cpu: 'CPU対戦のみ', external: '外部対局のみ', normal: '通常の開始局面のみ' },
  side: { all: 'すべて', w: '白番', b: '黒番' },
  time: { all: 'すべて', fast: '10分未満', medium: '10〜29分', long: '30分以上', untimed: '時間無制限', correspondence: '日数制', unknown: '記録なし' },
};

function styleFinished(game) {
  return ['1-0', '0-1', '1/2-1/2'].includes(game.metadata.result);
}

function styleSide(game, ownership) {
  const chosen = ownership[game.id];
  if (chosen === 'exclude') return null;
  if (game.cpu) return game.cpu.player;
  return ['w', 'b'].includes(chosen) ? chosen : null;
}

function styleClock(game) {
  const time = game.cpu && !game.cpu.continued ? cpuTimeControl(game.cpu.settings) : null;
  if ((game.cpu && !time) || reviewPgnTag(game.pgn, 'TimeControl') === '-') return 'untimed';
  if (game.source?.time?.days || game.source?.format === 'correspondence') return 'correspondence';
  const tag = /^(\d+)\+(\d+)$/.exec(reviewPgnTag(game.pgn, 'TimeControl') ?? '');
  const seconds = time ? (time.initial + 40 * time.increment) / 1000 : game.source?.time?.initial != null
    ? game.source.time.initial + 40 * game.source.time.increment : tag ? Number(tag[1]) + 40 * Number(tag[2]) : NaN;
  return !Number.isFinite(seconds) ? 'unknown' : seconds < 600 ? 'fast' : seconds < 1800 ? 'medium' : 'long';
}

function styleGameKey(game) {
  const external = game.source?.id ?? lichessPgnId(game.pgn);
  const cpu = game.cpu && reviewPgnTag(game.pgn, 'RookoriGameId');
  if (external || cpu) return (external ? 'external:' : 'cpu:') + (external ?? cpu);
  const { white, black, date, result } = game.metadata;
  return JSON.stringify([game.initialFen, studyMainMoves(game, game.positions.length - 1), white, black, date, result]);
}

function styleFilterGames(games, ownership, filters) {
  const seen = new Set();
  const sorted = [...games].sort((a, b) => String(reviewRecentDate(b).value).localeCompare(String(reviewRecentDate(a).value)));
  return sorted.flatMap(game => {
    const side = styleSide(game, ownership);
    if (!styleFinished(game) || !side || (filters.side !== 'all' && filters.side !== side)
      || (filters.source === 'cpu' && !game.cpu) || (filters.source === 'external' && game.cpu)
      || (filters.source === 'normal' && (game.cpu?.origin || game.initialFen !== chessRules.DEFAULT_POSITION))
      || (filters.time !== 'all' && filters.time !== styleClock(game))) return [];
    const key = styleGameKey(game);
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ game, side }];
  }).slice(0, filters.limit === 'all' ? undefined : Number(filters.limit));
}

function styleObserveGame(game, side) {
  const standardStart = !game.cpu?.origin && game.initialFen === chessRules.DEFAULT_POSITION;
  const counts = { check: 0, checkOpportunities: 0, capture: 0, captureOpportunities: 0, castle: null, castleChance: false };
  for (let ply = 1; ply < game.positions.length; ply++) {
    const played = game.positions[ply].move;
    if (played.color !== side) continue;
    const board = new chessRules.Chess(game.positions[ply - 1].fen);
    const legal = board.moves({ verbose: true });
    if (choicesIncludeAlternative(legal, move => /[+#]$/.test(move.san))) {
      counts.checkOpportunities++;
      counts.check += Number(/[+#]$/.test(played.san));
    }
    if (choicesIncludeAlternative(legal, move => Boolean(move.captured))) {
      counts.captureOpportunities++;
      counts.capture += Number(played.san.includes('x'));
    }
    if (standardStart && legal.some(move => move.san.startsWith('O-O'))) counts.castleChance = true;
    if (standardStart && played.san.startsWith('O-O')) counts.castle = played.number;
  }
  return { ...counts, opening: standardStart ? classifyReviewOpening(game)?.id ?? null : null };
}

function choicesIncludeAlternative(moves, predicate) {
  return moves.some(predicate) && moves.some(move => !predicate(move));
}

function styleOutline(rows) {
  const result = { games: rows.length, cpu: 0, practice: 0, positioned: 0, analyzed: 0, check: 0, checkOpportunities: 0, capture: 0, captureOpportunities: 0,
    castleChance: 0, castled: 0, castleMedian: null, openings: 0, classified: 0, graded: 0, stable: 0, lossGames: 0 };
  const openingSet = new Set();
  const castles = [];
  for (const { game, side, observed, grades } of rows) {
    result.cpu += Number(Boolean(game.cpu));
    result.practice += Number(game.cpu?.settings.mode === 'practice');
    result.positioned += Number(Boolean(game.cpu?.origin) || game.initialFen !== chessRules.DEFAULT_POSITION);
    for (const k of ['check', 'capture', 'checkOpportunities', 'captureOpportunities', 'castleChance']) result[k] += Number(observed[k]);
    if (observed.castle !== null) castles.push(observed.castle);
    if (observed.opening) { openingSet.add(side + ':' + observed.opening); result.classified++; }
    if (!grades) continue;
    result.analyzed++;
    result.graded += grades.length;
    result.stable += grades.filter(({ grade }) => grade.loss < studyGradeRules.mistake).length;
    result.lossGames += Number(grades.some(({ grade }) => grade.loss >= studyGradeRules.mistake));
  }
  castles.sort((a, b) => a - b);
  result.castled = castles.length;
  if (castles.length) result.castleMedian = (castles[Math.floor((castles.length - 1) / 2)] + castles[Math.floor(castles.length / 2)]) / 2;
  result.openings = openingSet.size;
  return result;
}

function styleGameGrades(game, side, study) {
  const usable = study?.scores?.some(row => Boolean(row?.score)) || Object.values(study?.single ?? {}).some(entry => entry?.value?.score);
  return usable ? studyReviewGrades(game, study.scores ?? [], side).filter(({ grade }) => grade.kind !== 'forced') : null;
}

function validStyleOwnership(value) {
  return learningObject(value) && Object.entries(value).every(([id, side]) => validCpuId(id) && ['w', 'b', 'exclude'].includes(side));
}

function validStyleSnapshots(rows) {
  return Array.isArray(rows) && rows.length <= 30 && rows.every(row => cpuTimestamp(row?.date)
    && Object.entries(styleChoices).every(([key, options]) => typeof row.filters?.[key] === 'string' && Object.hasOwn(options, row.filters[key]))
    && Object.keys(styleOutline([])).every(key => key === 'castleMedian'
      ? row.outline?.[key] === null || (Number.isFinite(row.outline?.[key]) && row.outline[key] >= 1)
      : learningCount(row.outline?.[key])));
}

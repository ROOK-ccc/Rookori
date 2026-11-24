const cpuLevels = [
  { name: 'ポーン', piece: 'P', description: 'ルールを覚えたばかり' },
  { name: 'ナイト', piece: 'N', description: '駒の動きを理解している' },
  { name: 'ビショップ', piece: 'B', description: '簡単な戦術を理解している' },
  { name: 'ルーク', piece: 'R', description: '基本的な実戦経験がある' },
  { name: 'クイーン', piece: 'Q', description: '手応えのある対局をしたい' },
  { name: 'キング', piece: 'K', description: '強い相手に挑戦したい' },
];
const cpuTimePresets = {
  Bullet: ['1+0', '2+1'], Blitz: ['3+0', '3+2', '5+0', '5+3'],
  Rapid: ['10+0', '10+5', '15+10'], Classical: ['30+0', '30+20'],
};
const cpuDefaultSettings = { mode: 'practice', level: 1, color: 'random', time: 'unlimited', minutes: 10, seconds: 0 };
const cpuSettingsKey = 'rookori.cpu-settings.v1';
const cpuResultsKey = 'rookori.cpu-results.v1';
const cpuResumeKey = 'rookori.cpu-resume.v1';
const cpuMaterialKey = 'rookori.cpu-material-display.v1';
const cpuPieceValues = { p: 1, n: 3, b: 3, r: 5, q: 9 };
const cpuPieceLabels = { p: 'ポーン', n: 'ナイト', b: 'ビショップ', r: 'ルーク', q: 'クイーン' };
const cpuLabels = { practice: '練習モード', match: '実戦モード', w: '白番', b: '黒番', random: 'ランダム' };
const cpuReasons = {
  mate: 'チェックメイト', stalemate: 'ステイルメイト', material: '駒不足',
  threefold: '同一局面の3回出現（請求）', fivefold: '同一局面の5回出現',
  fifty: '50手ルール（請求）', seventyFive: '75手ルール', resign: '投了', flag: '時間切れ',
};
const otherChessColor = color => color === 'w' ? 'b' : 'w';
const cpuMoveCode = move => move.from + move.to + (move.promotion ?? '');
const newCpuGameId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), value =>
  value.toString(16).padStart(2, '0')).join('');
const validCpuId = id => typeof id === 'string' && /^[a-f0-9]{32}$/.test(id);
const cpuTimestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString() === value;
const cpuLevelLabel = level => `Lv.${level} ${cpuLevels[level - 1].name}`;

function validCpuTime(minutes, seconds) {
  const integer = value => (typeof value === 'string' || typeof value === 'number') && /^[0-9]+$/.test(value);
  return integer(minutes) && Number(minutes) >= 1 && Number(minutes) <= 180
    && integer(seconds) && Number(seconds) <= 60;
}

function normalizeCpuSettings(saved) {
  const settings = { ...cpuDefaultSettings };
  if (!saved || typeof saved !== 'object') return settings;
  if (['practice', 'match'].includes(saved.mode)) settings.mode = saved.mode;
  if (Number.isInteger(saved.level) && cpuLevels[saved.level - 1]) settings.level = saved.level;
  if (['w', 'b', 'random'].includes(saved.color)) settings.color = saved.color;
  if (validCpuTime(saved.minutes, saved.seconds)) {
    settings.minutes = Number(saved.minutes);
    settings.seconds = Number(saved.seconds);
    if (saved.time === 'custom') settings.time = 'custom';
  }
  if (Object.values(cpuTimePresets).flat().includes(saved.time)) settings.time = saved.time;
  return settings;
}

function cpuTimeControl(settings) {
  if (settings.time === 'unlimited') return null;
  const [minutes, seconds] = settings.time === 'custom'
    ? [settings.minutes, settings.seconds] : settings.time.split('+').map(Number);
  return { initial: minutes * 60000, increment: seconds * 1000 };
}

function cpuTimeLabel(settings) {
  const time = cpuTimeControl(settings);
  return time ? `${time.initial / 60000}分 ＋ ${time.increment / 1000}秒` : '時間無制限';
}

function cpuPlayerColor(choice, random = Math.random) {
  return choice === 'random' ? (random() < .5 ? 'w' : 'b') : choice;
}

function normalizeCpuMaterialDisplay(saved) {
  return Object.fromEntries(['practice', 'match'].map(mode => [mode, {
    captures: typeof saved?.[mode]?.captures === 'boolean' ? saved[mode].captures : true,
    score: typeof saved?.[mode]?.score === 'boolean' ? saved[mode].score : mode === 'practice',
  }]));
}

function cpuMaterial(match) {
  const captures = { w: [], b: [] };
  for (const { move } of match.turns) {
    if (Object.hasOwn(cpuPieceValues, move.captured)) captures[move.color].push(move.captured);
  }
  const remaining = { w: 0, b: 0 };
  for (const piece of match.game.board().flat()) {
    if (piece) remaining[piece.color] += cpuPieceValues[piece.type] ?? 0;
  }
  for (const pieces of Object.values(captures)) pieces.sort((a, b) => cpuPieceValues[b] - cpuPieceValues[a]);
  return { captures, difference: remaining.w - remaining.b };
}

function cpuStartingPosition(origin) {
  if (typeof origin?.fen !== 'string' || typeof origin.initialFen !== 'string'
    || !Array.isArray(origin.moves) || origin.moves.length > 12000
    || !Number.isSafeInteger(origin.ply) || origin.ply < 0 || origin.ply > origin.moves.length
    || (origin.gameId !== null && !validCpuId(origin.gameId)) || !['w', 'b', null].includes(origin.color)) {
    throw new Error('開始局面を確認できません。');
  }
  const game = new chessRules.Chess(origin.initialFen);
  const positions = [game.fen().split(' ').slice(0, 4).join(' ')];
  for (const code of origin.moves) {
    if (typeof code !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(code)) throw new Error('開始局面の手順を確認できません。');
    game.move({ from: code.slice(0, 2), to: code.slice(2, 4), promotion: code[4] });
    positions.push(game.fen().split(' ').slice(0, 4).join(' '));
  }
  if (game.fen() !== origin.fen || game.isCheckmate() || game.isStalemate() || game.isInsufficientMaterial()
    || Number(origin.fen.split(' ')[4]) >= 150 || positions.filter(key => key === positions.at(-1)).length >= 5) {
    throw new Error('この局面からは対局できません。');
  }
  const { fen, initialFen, moves, ply, gameId, color } = origin;
  return { origin: { fen, initialFen, moves: moves.slice(), ply, gameId, color }, game, positions };
}

class CpuMatch {
  constructor(settings, { fen, now = () => performance.now(), random = Math.random, started = new Date(),
    id = newCpuGameId(), player, origin } = {}) {
    const setup = origin ? cpuStartingPosition(origin) : null;
    this.origin = setup?.origin ?? null;
    this.game = setup?.game ?? new chessRules.Chess(fen);
    this.initialFen = this.game.fen();
    this.settings = normalizeCpuSettings(settings);
    this.id = id;
    this.player = player ?? cpuPlayerColor(this.settings.color, random);
    this.time = cpuTimeControl(this.settings);
    this.started = started;
    this.now = now;
    this.remaining = { w: this.time?.initial ?? Infinity, b: this.time?.initial ?? Infinity };
    this.anchor = null;
    this.turnStart = { ...this.remaining };
    this.turns = [];
    this.positions = setup?.positions ?? [this.positionKey()];
    this.outcome = null;
    this.continued = false;
    this.parentId = null;
    this.hintCount = 0;
    this.undoCount = 0;
    this.resumeCount = 0;
  }

  get lastMove() { return this.turns.at(-1)?.move; }
  positionKey() { return this.game.fen().split(' ').slice(0, 4).join(' '); }
  halfMoves() { return Number(this.game.fen().split(' ')[4]); }
  repetitions() { return this.positions.filter(key => key === this.positions.at(-1)).length; }
  legalMoves(square) { return this.game.moves({ square, verbose: true }); }

  clocks(at = this.now()) {
    const remaining = { ...this.remaining };
    if (this.anchor !== null) {
      const side = this.game.turn();
      remaining[side] = Math.max(0, remaining[side] - Math.max(0, at - this.anchor));
    }
    return remaining;
  }

  start(at = this.now()) {
    if (!this.outcome && this.anchor === null) this.anchor = at;
  }

  stop(at = this.now()) {
    this.remaining = this.clocks(at);
    this.anchor = null;
  }

  finish(reason, winner = null, at = this.now()) {
    if (this.outcome) return;
    this.stop(at);
    this.outcome = { reason, winner };
  }

  flag(at = this.now()) {
    if (this.outcome || this.anchor === null || this.clocks(at)[this.game.turn()] > 0) return false;
    const other = otherChessColor(this.game.turn());
    const board = this.game.board().flat().filter(Boolean);
    const material = board.filter(piece => piece.color === other && piece.type !== 'k');
    this.finish('flag', !material.length || this.game.isInsufficientMaterial() ? null : other, at);
    return true;
  }

  legalMove(code) {
    return typeof code === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(code)
      && this.legalMoves(code.slice(0, 2)).some(move => cpuMoveCode(move) === code);
  }

  play(code, side) {
    if (this.outcome || this.anchor === null || side !== this.game.turn() || this.flag() || !this.legalMove(code)) return false;
    const at = this.now();
    if (this.flag(at)) return false;
    const move = this.game.move({ from: code.slice(0, 2), to: code.slice(2, 4), promotion: code[4] });
    this.turns.push({ move, start: this.turnStart });
    const elapsed = Math.max(0, at - this.anchor);
    this.remaining[side] = this.remaining[side] - elapsed + (this.time?.increment ?? 0);
    this.anchor = at;
    this.turnStart = { ...this.remaining };
    this.positions.push(this.positionKey());
    if (this.game.isCheckmate()) this.finish('mate', side, at);
    else if (this.game.isStalemate()) this.finish('stalemate', null, at);
    else if (this.game.isInsufficientMaterial()) this.finish('material', null, at);
    else if (this.repetitions() >= 5) this.finish('fivefold', null, at);
    else if (this.halfMoves() >= 150) this.finish('seventyFive', null, at);
    return true;
  }

  drawClaim() {
    if (this.outcome) return null;
    if (this.repetitions() >= 3) return 'threefold';
    return this.halfMoves() >= 100 ? 'fifty' : null;
  }

  claim() {
    if (this.anchor === null || this.flag()) return false;
    const reason = this.drawClaim();
    if (!reason) return false;
    this.finish(reason);
    return true;
  }

  undoIndex() {
    return this.settings.mode === 'practice' && !this.outcome
      ? this.turns.findLastIndex(({ move }) => move.color === this.player) : -1;
  }

  undo() {
    const index = this.undoIndex();
    if (index < 0 || this.flag()) return false;
    this.remaining = this.continued ? { w: Infinity, b: Infinity } : { ...this.turns[index].start };
    this.turnStart = { ...this.remaining };
    while (this.turns.length > index) {
      this.game.undo();
      this.turns.pop();
      this.positions.pop();
    }
    if (this.anchor !== null) this.anchor = this.now();
    this.undoCount++;
    return true;
  }

  continuePractice() {
    if (this.settings.mode !== 'practice' || this.outcome?.reason !== 'flag') return false;
    this.continued = true;
    this.parentId = this.id;
    this.id = newCpuGameId();
    this.outcome = null;
    this.time = null;
    this.remaining = { w: Infinity, b: Infinity };
    this.turnStart = { ...this.remaining };
    return true;
  }
}

function cpuSnapshot(match, updatedAt = new Date()) {
  const encodeClock = values => ({ w: Number.isFinite(values.w) ? values.w : null, b: Number.isFinite(values.b) ? values.b : null });
  return {
    id: match.id, started: match.started.toISOString(), updatedAt: updatedAt.toISOString(),
    settings: match.settings, player: match.player, initialFen: match.initialFen, fen: match.game.fen(), turn: match.game.turn(),
    ...(match.origin && { origin: match.origin }),
    remaining: encodeClock(match.clocks()), turnStart: encodeClock(match.turnStart),
    moves: match.turns.map(({ move, start }) => ({ code: cpuMoveCode(move), start: encodeClock(start) })),
    continued: match.continued, parentId: match.parentId, hintCount: match.hintCount,
    undoCount: match.undoCount, resumeCount: match.resumeCount,
  };
}

function restoreCpuSnapshot(snapshot, now) {
  const counter = value => Number.isSafeInteger(value) && value >= 0;
  const clock = (values, timed) => {
    const result = {};
    for (const color of ['w', 'b']) {
      const value = values?.[color];
      if (value === null && timed !== true) result[color] = Infinity;
      else if (Number.isFinite(value) && value >= 0 && timed !== false) result[color] = value;
      else throw new Error('持ち時間を復元できません。');
    }
    return result;
  };
  const settings = normalizeCpuSettings(snapshot?.settings);
  if (!validCpuId(snapshot?.id) || !cpuTimestamp(snapshot.started) || !cpuTimestamp(snapshot.updatedAt)
    || !['w', 'b'].includes(snapshot.player) || Object.keys(settings).some(key => settings[key] !== snapshot.settings?.[key])
    || (settings.color !== 'random' && settings.color !== snapshot.player)
    || !Array.isArray(snapshot.moves) || snapshot.moves.length > 12000
    || typeof snapshot.initialFen !== 'string' || ![snapshot.hintCount, snapshot.undoCount, snapshot.resumeCount].every(counter)
    || typeof snapshot.continued !== 'boolean' || (snapshot.continued
      ? settings.mode !== 'practice' || !validCpuId(snapshot.parentId) || snapshot.parentId === snapshot.id : snapshot.parentId !== null)) {
    throw new Error('中断した対局のデータを確認できません。');
  }
  const match = new CpuMatch(settings, { id: snapshot.id, player: snapshot.player, fen: snapshot.initialFen,
    origin: snapshot.origin, started: new Date(snapshot.started), now: () => 0 });
  if (match.initialFen !== snapshot.initialFen) throw new Error('開始局面が一致しません。');
  match.start();
  const timed = Boolean(match.time);
  for (const entry of snapshot.moves) {
    if (!match.play(entry?.code, match.game.turn())) throw new Error('中断した対局の着手が正しくありません。');
    match.turns.at(-1).start = clock(entry.start, snapshot.continued ? undefined : timed);
  }
  if (match.outcome || match.game.fen() !== snapshot.fen || match.game.turn() !== snapshot.turn) {
    throw new Error('中断した対局の局面が一致しません。');
  }
  match.anchor = null;
  match.now = now ?? (() => performance.now());
  match.continued = snapshot.continued;
  match.parentId = snapshot.parentId;
  if (match.continued) match.time = null;
  match.remaining = clock(snapshot.remaining, Boolean(match.time));
  match.turnStart = clock(snapshot.turnStart, Boolean(match.time));
  match.hintCount = snapshot.hintCount;
  match.undoCount = snapshot.undoCount;
  match.resumeCount = snapshot.resumeCount + 1;
  return match;
}

function cpuReviewGame(match, engine) {
  const [game] = parseReviewGames(cpuPgn(match));
  game.cpu = {
    settings: match.settings, player: match.player, started: match.started.toISOString(),
    engine: { name: engine.name, version: engine.version, distribution: engine.distribution },
    reason: match.outcome.reason, continued: match.continued, parentId: match.parentId,
    hints: match.hintCount, undos: match.undoCount, resumes: match.resumeCount,
    ...(match.origin && { origin: match.origin }),
  };
  return game;
}

function validateCpuGameDetails(details) {
  const settings = normalizeCpuSettings(details?.settings);
  const engine = details?.engine;
  if (!details || !['w', 'b'].includes(details.player)
    || !cpuTimestamp(details.started) || !Object.hasOwn(cpuReasons, details.reason)
    || !['name', 'version', 'distribution'].every(key => typeof engine?.[key] === 'string' && engine[key].length > 0 && engine[key].length <= 120)
    || !['hints', 'undos', 'resumes'].every(key => Number.isSafeInteger(details[key]) && details[key] >= 0)
    || typeof details.continued !== 'boolean'
    || (details.continued ? settings.mode !== 'practice' || !validCpuId(details.parentId) : details.parentId !== null)
    || Object.keys(settings).some(key => settings[key] !== details.settings?.[key])
    || (settings.color !== 'random' && settings.color !== details.player)) throw new Error('CPU対局の記録を確認してください。');
  const origin = details.origin ? cpuStartingPosition(details.origin).origin : null;
  return { settings, engine: { name: engine.name, version: engine.version, distribution: engine.distribution },
    player: details.player, started: details.started, reason: details.reason, continued: details.continued,
    parentId: details.parentId, hints: details.hints, undos: details.undos, resumes: details.resumes,
    ...(origin && { origin }) };
}

function cpuResultCode(outcome) {
  return !outcome ? '*' : outcome.winner === 'w' ? '1-0' : outcome.winner === 'b' ? '0-1' : '1/2-1/2';
}

function cpuPgn(match) {
  const pgn = new chessRules.Chess(match.initialFen);
  const opponent = 'Rookori CPU Lv.' + match.settings.level;
  const time = match.continued ? '?' : match.time ? `${match.time.initial / 1000}+${match.time.increment / 1000}` : '-';
  const date = match.started.toISOString().slice(0, 10).replaceAll('-', '.');
  const tags = {
    Event: match.continued ? 'Rookori Practice Continuation' : match.origin ? 'Rookori Position Practice'
      : match.settings.mode === 'practice' ? 'Rookori Practice' : 'Rookori Match',
    Site: 'Rookori', Date: date, Round: '-',
    White: match.player === 'w' ? 'Player' : opponent, Black: match.player === 'b' ? 'Player' : opponent,
    Result: cpuResultCode(match.outcome), TimeControl: time,
    Termination: match.outcome?.reason === 'flag' ? 'time forfeit' : match.outcome ? 'normal' : 'unterminated',
    RookoriGameId: match.id,
  };
  for (const [tag, value] of Object.entries(tags)) pgn.setHeader(tag, value);
  for (const { move } of match.turns) pgn.move(move);
  pgn.setHeader('Result', tags.Result);
  return pgn.pgn({ maxWidth: 78 });
}

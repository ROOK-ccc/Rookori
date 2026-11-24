const cpuLevels = [
  { name: 'ポーン', piece: 'P', description: 'ルールを覚えたばかり', depth: 1, ms: 90, nodes: 120, random: .8, spread: 8 },
  { name: 'ナイト', piece: 'N', description: '駒の動きを理解している', depth: 1, ms: 150, nodes: 260, random: .33, spread: 4 },
  { name: 'ビショップ', piece: 'B', description: '簡単な戦術を理解している', depth: 2, ms: 250, nodes: 850, spread: 2 },
  { name: 'ルーク', piece: 'R', description: '基本的な実戦経験がある', depth: 3, ms: 450, nodes: 2200 },
  { name: 'クイーン', piece: 'Q', description: '手応えのある対局をしたい', depth: 4, ms: 750, nodes: 5200 },
  { name: 'キング', piece: 'K', description: '強い相手に挑戦したい', depth: 5, ms: 1300, nodes: 14000 },
];
const cpuHintLevel = { depth: 4, ms: 900, nodes: 8000 };
const cpuTimePresets = {
  Bullet: ['1+0', '2+1'], Blitz: ['3+0', '3+2', '5+0', '5+3'],
  Rapid: ['10+0', '10+5', '15+10'], Classical: ['30+0', '30+20'],
};
const cpuDefaultSettings = { mode: 'practice', level: 1, color: 'random', time: 'unlimited', minutes: 10, seconds: 0 };
const cpuSettingsKey = 'rookori.cpu-settings.v1';
const cpuResultsKey = 'rookori.cpu-results.v1';
const otherChessColor = color => color === 'w' ? 'b' : 'w';
const cpuMoveCode = move => move.from + move.to + (move.promotion ?? '');

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

function cpuPlayerColor(choice, random = Math.random) {
  return choice === 'random' ? (random() < .5 ? 'w' : 'b') : choice;
}

class CpuMatch {
  constructor(settings, { fen, now = () => performance.now(), random = Math.random, started = new Date() } = {}) {
    this.game = new chessRules.Chess(fen);
    this.initialFen = this.game.fen();
    this.settings = normalizeCpuSettings(settings);
    this.player = cpuPlayerColor(this.settings.color, random);
    this.time = cpuTimeControl(this.settings);
    this.started = started;
    this.now = now;
    this.remaining = { w: this.time?.initial ?? Infinity, b: this.time?.initial ?? Infinity };
    this.anchor = null;
    this.turnStart = { ...this.remaining };
    this.turns = [];
    this.positions = [this.positionKey()];
    this.outcome = null;
    this.continued = false;
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
    return true;
  }

  continuePractice() {
    if (this.settings.mode !== 'practice' || this.outcome?.reason !== 'flag') return false;
    this.continued = true;
    this.outcome = null;
    this.time = null;
    this.remaining = { w: Infinity, b: Infinity };
    this.turnStart = { ...this.remaining };
    return true;
  }
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
    Event: match.continued ? 'Rookori Practice Continuation' : match.settings.mode === 'practice' ? 'Rookori Practice' : 'Rookori Match',
    Site: 'Rookori', Date: date, Round: '-',
    White: match.player === 'w' ? 'Player' : opponent, Black: match.player === 'b' ? 'Player' : opponent,
    Result: cpuResultCode(match.outcome), TimeControl: time,
    Termination: match.outcome?.reason === 'flag' ? 'time forfeit' : match.outcome ? 'normal' : 'unterminated',
  };
  for (const [tag, value] of Object.entries(tags)) pgn.setHeader(tag, value);
  for (const { move } of match.turns) pgn.move(move);
  pgn.setHeader('Result', tags.Result);
  return pgn.pgn({ maxWidth: 78 });
}

class OpeningStudy {
  constructor(line, initialFen = chessRules.DEFAULT_POSITION) {
    this.line = line;
    this.initialFen = initialFen;
    this.game = new chessRules.Chess(initialFen);
    this.played = [];
  }

  get step() {
    return this.played.length;
  }

  get lastMove() {
    return this.played.at(-1);
  }

  get guided() {
    return this.played.every((move, index) => move.lan === this.line[index]);
  }

  get complete() {
    return this.guided && this.step === this.line.length;
  }

  get canAdvance() {
    return this.guided && this.step < this.line.length && !this.game.isGameOver();
  }

  legalMoves(square) {
    return this.game.isGameOver() ? [] : this.game.moves({ square, verbose: true });
  }

  play(from, to, promotion) {
    const choice = this.legalMoves(from).find((move) => move.to === to && move.promotion === promotion);
    if (!choice) return false;
    this.played.push(this.game.move({ from, to, promotion }));
    return true;
  }

  advance() {
    if (!this.canAdvance) return false;
    const uci = this.line[this.step];
    return this.play(uci.slice(0, 2), uci.slice(2, 4), uci[4]);
  }

  undo() {
    if (this.step === 0) return;
    this.game.undo();
    this.played.pop();
  }

  reset() {
    this.game.load(this.initialFen);
    this.played.length = 0;
  }

  get outcome() {
    if (this.game.isCheckmate()) return 'checkmate';
    if (this.game.isStalemate()) return 'stalemate';
    if (this.game.isInsufficientMaterial()) return 'insufficient-material';
    if (this.game.isThreefoldRepetition()) return 'repetition';
    if (this.game.isDrawByFiftyMoves()) return 'fifty-moves';
    return null;
  }
}

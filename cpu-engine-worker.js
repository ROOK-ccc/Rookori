// Rookori CPU 1.0.0. See cpu-engine.LICENSE.txt.
importScripts('vendor/chess.js');

const pieceValue = { p: 100, n: 320, b: 335, r: 510, q: 950, k: 0 };

function evaluatePosition(game) {
  const pieces = game.board();
  const endgame = pieces.flat().reduce((sum, piece) =>
    sum + (piece && piece.type !== 'p' ? pieceValue[piece.type] : 0), 0) < 2300;
  let total = 0;
  for (let row = 0; row < 8; row++) {
    for (let file = 0; file < 8; file++) {
      const piece = pieces[row][file];
      if (!piece) continue;
      const { color, type } = piece;
      const rank = color === 'w' ? 7 - row : row;
      const center = 7 - Math.abs(3.5 - row) - Math.abs(3.5 - file);
      let placement = 0;
      if (type === 'p') placement = rank * 8 + center * 3 + (rank === 6 ? 20 : 0);
      if (type === 'n' || type === 'b') placement = center * (type === 'n' ? 10 : 5) + (rank > 0 ? 9 : 0);
      if (type === 'r') placement = rank === 6 ? 22 : 0;
      if (type === 'k') placement = endgame ? center * 8 : -center * 5 + (rank === 0 && (file === 6 || file === 2) ? 30 : 0);
      total += (color === 'w' ? 1 : -1) * (pieceValue[type] + placement);
    }
  }
  return game.turn() === 'w' ? total : -total;
}

function searchCpuMove(fen, level, random = Math.random) {
  const game = new chessRules.Chess(fen);
  const legal = game.moves({ verbose: true });
  if (!legal.length) return null;
  const code = move => move.from + move.to + (move.promotion ?? '');
  if (level.random && random() < level.random) return code(legal[Math.floor(random() * legal.length)]);

  const deadline = performance.now() + level.ms;
  const exhausted = Symbol();
  let nodes = 0;
  const weight = move => (move.promotion ? pieceValue[move.promotion] : 0)
    + (move.captured ? 10 * pieceValue[move.captured] - pieceValue[move.piece] : 0)
    + (/[+#]$/.test(move.san) ? 35 : 0);
  const order = moves => moves.sort((a, b) => weight(b) - weight(a));
  function node(depth, alpha, beta, ply) {
    if (++nodes > level.nodes || performance.now() >= deadline) throw exhausted;
    if (game.isInsufficientMaterial()) return 0;
    if (!depth) {
      if (game.isCheckmate()) return -100000 + ply;
      return game.isStalemate() ? 0 : evaluatePosition(game);
    }
    const moves = order(game.moves({ verbose: true }));
    if (!moves.length) return game.isCheck() ? -100000 + ply : 0;
    let best = -Infinity;
    for (const move of moves) {
      game.move(move);
      const score = -node(depth - 1, -beta, -alpha, ply + 1);
      game.undo();
      best = Math.max(best, score);
      alpha = Math.max(alpha, score);
      if (alpha >= beta) break;
    }
    return best;
  }

  let ranked = order(legal);
  for (let depth = 1; depth <= level.depth; depth++) {
    const evaluated = [];
    let best = -Infinity;
    try {
      for (const move of ranked) {
        game.move(move);
        const score = -node(depth - 1, -Infinity, level.spread ? Infinity : -best, 1);
        game.undo();
        evaluated.push({ move, score });
        best = Math.max(best, score);
      }
    } catch (error) {
      if (error !== exhausted) throw error;
      break;
    }
    ranked = evaluated.sort((a, b) => b.score - a.score).map(entry => entry.move);
    if (best > 99000) return code(ranked[0]);
  }
  const choices = Math.min(ranked.length, level.spread ?? 1);
  return code(ranked[Math.floor(random() * choices)]);
}

self.onmessage = ({ data }) => {
  try {
    self.postMessage({ move: searchCpuMove(data.fen, data.level) });
  } catch {
    self.postMessage({ error: true });
  }
};
self.postMessage({ ready: true });

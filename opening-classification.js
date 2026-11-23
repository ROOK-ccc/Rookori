// Selected positions from Lichess chess-openings (CC0 1.0).
// https://github.com/lichess-org/chess-openings
const openingReferenceLines = [
  ['english-opening', 'A10', '1. c4'],
  ['reti-opening', 'A09', '1. Nf3 d5 2. c4'],
  ['london-system', 'A48', '1. d4 Nf6 2. Nf3 g6 3. Bf4'],
  ['london-system', 'D02', '1. d4 d5 2. Nf3 Nf6 3. Bf4'],
  ['london-system', 'D02', '1. d4 d5 2. Nf3 e6 3. Bf4'],
  ['dutch-defense', 'A80', '1. d4 f5'],
  ['dutch-defense', 'A84', '1. d4 f5 2. c4'],
  ['scandinavian-defense', 'B01', '1. e4 d5'],
  ['pirc-defense', 'B07', '1. e4 d6 2. d4 Nf6 3. Nc3 g6'],
  ['caro-kann', 'B10', '1. e4 c6'],
  ['caro-kann', 'B12', '1. e4 c6 2. d4 d5'],
  ['sicilian-defense', 'B20', '1. e4 c5'],
  ['sicilian-defense', 'B27', '1. e4 c5 2. Nf3'],
  ['sicilian-alapin', 'B22', '1. e4 c5 2. c3'],
  ['sicilian-closed', 'B23', '1. e4 c5 2. Nc3'],
  ['sicilian-accelerated-dragon', 'B32', '1. e4 c5 2. Nf3 Nc6 3. d4 cxd4 4. Nxd4 g6'],
  ['sicilian-sveshnikov', 'B33', '1. e4 c5 2. Nf3 Nc6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 e5 6. Ndb5 d6 7. Bg5 a6 8. Na3 b5'],
  ['sicilian-classical', 'B56', '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 Nc6'],
  ['sicilian-dragon', 'B70', '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 g6'],
  ['sicilian-scheveningen', 'B80', '1. e4 c5 2. Nf3 e6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 d6'],
  ['sicilian-najdorf', 'B90', '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6'],
  ['french-defense', 'C00', '1. e4 e6'],
  ['french-defense', 'C00', '1. e4 e6 2. d4 d5'],
  ['open-game', 'C20', '1. e4 e5'],
  ['scotch-game', 'C44', '1. e4 e5 2. Nf3 Nc6 3. d4'],
  ['scotch-game', 'C45', '1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Nxd4'],
  ['italian-game', 'C50', '1. e4 e5 2. Nf3 Nc6 3. Bc4'],
  ['ruy-lopez', 'C60', '1. e4 e5 2. Nf3 Nc6 3. Bb5'],
  ['queens-gambit', 'D06', '1. d4 d5 2. c4'],
  ['slav-defense', 'D10', '1. d4 d5 2. c4 c6'],
  ['queens-gambit-declined', 'D30', '1. d4 d5 2. c4 e6'],
  ['queens-gambit-declined', 'D53', '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7'],
  ['grunfeld-defense', 'D80', '1. d4 Nf6 2. c4 g6 3. Nc3 d5'],
  ['queens-indian', 'E12', '1. d4 Nf6 2. c4 e6 3. Nf3 b6'],
  ['nimzo-indian', 'E20', '1. d4 Nf6 2. c4 e6 3. Nc3 Bb4'],
  ['kings-indian', 'E61', '1. d4 Nf6 2. c4 g6 3. Nc3'],
];

// Keep the four position fields. Move counters can differ after a transposition.
const openingPositionKey = fen => fen.split(' ', 4).join(' ');

function buildOpeningPositionIndex(lines) {
  const index = new Map();
  const chess = new chessRules.Chess();
  for (const [id, eco, pgn] of lines) {
    chess.loadPgn(pgn);
    const key = openingPositionKey(chess.fen());
    const previous = index.get(key);
    if (!index.has(key)) index.set(key, { id, eco });
    else if (previous && (previous.id !== id || previous.eco !== eco)) {
      index.set(key, previous.id === id ? { id, eco: null } : null);
    }
  }
  return index;
}

let openingPositionIndex;

function classifyReviewOpening(game) {
  if (game.initialFen !== chessRules.DEFAULT_POSITION) return null;
  openingPositionIndex ??= buildOpeningPositionIndex(openingReferenceLines);
  for (let ply = Math.min(24, game.positions.length - 1); ply > 0; ply--) {
    const key = openingPositionKey(game.positions[ply].fen);
    if (!openingPositionIndex.has(key)) continue;
    const match = openingPositionIndex.get(key);
    return match ? { ...match, ply } : null;
  }
  return null;
}

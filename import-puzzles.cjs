const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const zlib = require('node:zlib');
const vm = require('node:vm');
const crypto = require('node:crypto');

const [input, stamp, output = 'puzzles'] = process.argv.slice(2);
if (!input || !/^\d{4}-\d{2}-\d{2}$/.test(stamp ?? '')) {
  throw new Error('使用方法: node import-puzzles.cjs lichess_db_puzzle.csv.zst YYYY-MM-DD [出力先]');
}
const rules = vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'vendor/chess.js'), 'utf8') + '\nchessRules');
const supported = new Set('fork pin skewer discoveredAttack doubleCheck deflection attraction interference clearance capturingDefender promotion mateIn1 mateIn2 mateIn3 mateIn4 mateIn5 backRankMate endgame pawnEndgame rookEndgame queenEndgame opening middlegame defensiveMove advantage crushing mate'.split(' '));
const budgets = [1000, 2000, 1500, 500];
const bands = budgets.map(() => []);
const seen = new Set(), ids = new Set();
const themes = new Map();
const stream = fs.createReadStream(input);
const data = input.endsWith('.zst') ? stream.pipe(zlib.createZstdDecompress()) : stream;
async function run() {
  const lines = readline.createInterface({ input: data, crlfDelay: Infinity });
  for await (const line of lines) {
    const [id, initialFen, raw, ratingText, deviation, popularity, plays, tags] = line.split(',');
    if (!/^[a-zA-Z0-9]{5}$/.test(id) || ids.has(id) || !tags || Number(popularity) < 75 || Number(plays) < 100
      || Number(deviation) > 110) continue;
    const rating = Number(ratingText);
    if (!Number.isInteger(rating) || rating < 400 || rating > 3000) continue;
    const band = rating < 1000 ? 0 : rating < 1400 ? 1 : rating < 1800 ? 2 : 3;
    if (bands[band].length >= budgets[band]) continue;
    const tagsUsed = tags.split(' ').filter(tag => supported.has(tag));
    if (!tagsUsed.length || !rules.validateFen(initialFen).ok) continue;
    const moves = raw.split(' ');
    if (moves.length < 2 || moves.length > 16 || moves.length % 2 || moves.some(move => !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move))) continue;
    try {
      const board = new rules.Chess(initialFen);
      const play = move => board.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] });
      play(moves.shift());
      const fen = board.fen();
      const key = fen.split(' ').slice(0, 4).join(' ');
      if (seen.has(key)) continue;
      moves.forEach(play);
      if (tagsUsed.some(tag => /^mateIn\d$/.test(tag)) && !board.isCheckmate()) continue;
      seen.add(key);
      ids.add(id);
      bands[band].push([id, fen, moves, rating, tagsUsed]);
      for (const tag of tagsUsed) themes.set(tag, (themes.get(tag) ?? 0) + 1);
      if (bands.every((rows, i) => rows.length === budgets[i])) {
        lines.close();
        data.destroy();
        stream.destroy();
        break;
      }
    } catch { /* Exclude rows that cannot be replayed as standard chess. */ }
  }
  if (bands.some(band => !band.length)) throw new Error('すべての難易度の候補が必要です。');
  const files = {};
  for (const [band, rows] of bands.entries()) {
    // Spread themes across batches without changing stable source IDs.
    rows.sort((a, b) => a[0].localeCompare(b[0], 'en'));
    for (let i = 0; i < rows.length; i += 100) files[`${band}-${i / 100}`] = rows.slice(i, i + 100);
  }
  fs.mkdirSync(output, { recursive: true });
  const write = (name, data) => fs.writeFileSync(path.join(output, name + '.json'), JSON.stringify(data) + '\n');
  for (const [name, rows] of Object.entries(files)) write(name, rows);
  write('catalog', { date: stamp, license: 'CC0-1.0', source: 'https://database.lichess.org/#puzzles',
    counts: bands.map(rows => rows.length), themes: Object.fromEntries([...themes].sort()),
    batches: Object.fromEntries(Object.entries(files).map(([name, rows]) => [name, {
      hash: crypto.createHash('sha256').update(JSON.stringify(rows) + '\n').digest('hex').slice(0, 12),
      ids: rows.map(row => row[0]), themes: [...new Set(rows.flatMap(row => row[4]))].sort(),
    }])) });
  console.log(bands.map(rows => rows.length), Object.fromEntries(themes));
}
run().catch(error => { console.error(error.message); process.exitCode = 1; });

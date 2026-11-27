const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');
const { createHash } = require('node:crypto');

function preparePuzzleFiles(directory, editPath) {
  const { chessRules, validatePracticeEdit } = runInNewContext(
    ['vendor/chess.js', 'practice-editor-validate.js'].map(file => readFileSync(join(__dirname, file), 'utf8')).join('\n')
    + '\n({chessRules, validatePracticeEdit})');
  const read = file => JSON.parse(readFileSync(file, 'utf8'));
  const edits = read(editPath);
  if (!edits || typeof edits !== 'object' || Array.isArray(edits)) throw new Error('問題の変更ファイルが不正です。');
  const catalog = read(join(directory, 'catalog.json'));
  const files = {};
  const remaining = new Set(Object.keys(edits));
  catalog.counts = [0, 0, 0, 0];
  catalog.themes = {};
  const activeIds = new Set();
  const bands = [[], [], [], []];
  for (const name of Object.keys(catalog.batches)) {
    if (!/^[0-3]-\d+$/.test(name)) throw new Error('問題ファイル名が不正です。');
    const raw = read(join(directory, name + '.json'));
    const rows = raw.flatMap(row => {
      if (activeIds.has(row[0])) throw new Error('問題IDが重複しています。');
      activeIds.add(row[0]);
      if (!Object.hasOwn(edits, row[0])) return [row];
      remaining.delete(row[0]);
      const edit = validatePracticeEdit(edits[row[0]], row, chessRules);
      const { published, fen, moves, rating, tags, ...copy } = edit;
      return published ? [[row[0], fen, moves, rating, tags, copy]] : [];
    });
    for (const row of rows) {
      const band = row[3] < 1000 ? 0 : row[3] < 1400 ? 1 : row[3] < 1800 ? 2 : 3;
      bands[band].push(row);
      for (const tag of row[4]) catalog.themes[tag] = (catalog.themes[tag] ?? 0) + 1;
    }
  }
  catalog.batches = {};
  catalog.counts = bands.map(rows => rows.length);
  for (const [band, rows] of bands.entries()) {
    for (let i = 0; i < rows.length; i += 100) {
      const group = rows.slice(i, i + 100);
      const name = band + '-' + i / 100;
      const output = JSON.stringify(group) + '\n';
      catalog.batches[name] = { hash: createHash('sha256').update(output).digest('hex').slice(0, 12),
        ids: group.map(row => row[0]), themes: [...new Set(group.flatMap(row => row[4]))].sort() };
      files['puzzles/' + name + '.json'] = output;
    }
  }
  if (remaining.size) throw new Error('変更ファイルに未収録の問題IDがあります。');
  files['puzzles/catalog.json'] = JSON.stringify(catalog) + '\n';
  return files;
}

module.exports = { preparePuzzleFiles };

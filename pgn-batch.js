const batchLimits = Object.freeze({ files: 20, file: 2_000_000, total: 8_000_000, games: 200 });

// Ignore PGN comments and sidelines when looking for boundaries between records.
// The existing replay parser still validates each candidate independently.
function* batchPgnRecords(input) {
  const pgn = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  const tokens = new RegExp(reviewPgnToken.source + '|.', 'gm');
  let start = 0;
  let depth = 0;
  let moves = false;
  let ended = false;
  let tags = new Set();
  for (const match of pgn.matchAll(tokens)) {
    const [value, key] = match;
    if (/^[\s;%]/.test(value) || value.startsWith('{') && value.endsWith('}')) continue;
    const tag = key?.toLowerCase();
    const newEvent = tag === 'event' && (moves || tags.has('event'));
    if (ended || newEvent || tag && moves && !depth) {
      yield pgn.slice(start, match.index).trim();
      start = match.index;
      depth = 0;
      moves = ended = false;
      tags = new Set();
    }
    if (tag && !depth) tags.add(tag);
    else if (value === '(') depth++;
    else if (value === ')') depth = Math.max(0, depth - 1);
    else if (!depth) {
      if (Object.hasOwn(gameResults, value)) ended = true;
      else moves = true;
    }
  }
  if (start < pgn.length) yield pgn.slice(start).trim();
}

function batchGameKey(game) {
  const cpuId = reviewPgnTag(game.pgn, 'RookoriGameId');
  if (/^[a-f0-9]{32}$/.test(cpuId ?? '')) return 'cpu:' + cpuId;
  const link = reviewPgnTag(game.pgn, 'Link') ?? '';
  const chessCom = /^https:\/\/(?:www\.)?chess\.com\/game\/(live|daily)\/(\d+)\/?$/.exec(link);
  if (chessCom) return `chess.com:${chessCom[1]}:${chessCom[2]}`;
  const key = styleGameKey(game);
  if (key.startsWith('external:')) return key;
  const tags = ['Round', 'UTCDate', 'UTCTime', 'StartTime'].map(tag => reviewPgnTag(game.pgn, tag));
  return JSON.stringify([key, ...tags]);
}

function batchPlayerColor(game, name) {
  if (!styleFinished(game)) return '';
  const clean = value => value?.normalize('NFC').trim().toLowerCase() ?? '';
  const player = clean(name);
  if (!player) return '';
  const white = clean(game.metadata.white) === player;
  const black = clean(game.metadata.black) === player;
  return white === black ? '' : white ? 'w' : 'b';
}

async function batchLocalId(key) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('rookori.pgn:' + key));
  return [...new Uint8Array(bytes).slice(0, 16)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

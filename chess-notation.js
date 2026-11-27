const sanPieceNames = { K: 'キング', Q: 'クイーン', R: 'ルーク', B: 'ビショップ', N: 'ナイト' };
const sanMovePattern = /^(?:(\d+)\.(\.\.)?\s*)?(?:(O-O(?:-O)?)([+#])?|([KQRBN])([a-h]?)([1-8]?)(x?)([a-h][1-8])([+#])?|(?:([a-h])x)?([a-h][1-8])(?:=([QRBN]))?([+#])?)$/;

function explainSan(text, position) {
  const match = sanMovePattern.exec(text);
  if (!match) return null;
  const [, number, black, castle, castleEnd, piece, file, rank, capture, destination, pieceEnd, pawnFile, pawnDestination, promotion, pawnEnd] = match;
  if (number && !Number(number) || promotion && !/[18]$/.test(pawnDestination)
    || !piece && !castle && !promotion && /[18]$/.test(pawnDestination)
    || pawnFile && Math.abs(pawnFile.charCodeAt(0) - pawnDestination.charCodeAt(0)) !== 1) return null;
  if (position && (number && position.turn() !== (black ? 'b' : 'w')
    || !position.moves().includes(text.replace(/^\d+\.(?:\.\.)?\s*/, '')))) return null;
  const end = castleEnd || pieceEnd || pawnEnd;
  const parts = number ? [`${number}${black ? '...' : '.'}：${number}手目の${black ? '黒' : '白'}`] : [];
  const name = sanPieceNames[piece] ?? 'ポーン';
  const target = destination ?? pawnDestination;
  let meaning;
  if (castle) {
    meaning = (castle === 'O-O' ? 'キングサイド' : 'クイーンサイド') + 'にキャスリングする';
    parts.push(castle + '：' + meaning);
  } else {
    const source = file || rank;
    parts.push(piece ? piece + '：' + name : '駒の記号なし：ポーン');
    if (source) parts.push(file && rank ? file + rank + '：移動元のマス'
      : source + '：移動元の' + (file ? 'ファイル（縦列）' : 'ランク（横段）'));
    if (pawnFile) parts.push(pawnFile + '：移動元のファイル（縦列）');
    if (capture || pawnFile) parts.push('x：駒を取る');
    parts.push(`${target}：移動先（${target[0]}ファイル・${target[1]}ランク）`);
    if (promotion) parts.push('=' + promotion + '：' + sanPieceNames[promotion] + 'に昇格する');
    meaning = name + 'が' + target + (capture || pawnFile ? 'の駒を取る' : 'に移動する');
    if (promotion) meaning += '。' + sanPieceNames[promotion] + 'に昇格する';
  }
  if (end) {
    const action = end === '#' ? 'チェックメイト' : 'チェック';
    parts.push(end + '：' + action);
    meaning = meaning.replace(/(取る|する)$/, value => value === '取る' ? '取り' : 'し')
      + '、' + action + (end === '#' ? 'になる' : 'をかける');
  }
  return { parts, meaning: meaning + '。' };
}

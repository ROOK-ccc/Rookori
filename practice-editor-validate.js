function validatePracticeEdit(edit, row, rules) {
  const allowed = ['published', 'fen', 'moves', 'rating', 'tags', 'alternatives', 'title', 'prompt', 'hint', 'explanation', 'explanationStatus', 'source'];
  const supported = new Set('fork pin skewer discoveredAttack doubleCheck deflection attraction interference clearance capturingDefender promotion mateIn1 mateIn2 mateIn3 mateIn4 mateIn5 backRankMate endgame pawnEndgame rookEndgame queenEndgame opening middlegame defensiveMove advantage crushing mate'.split(' '));
  const err = message => { throw new Error(row[0] + ' · ' + message); };
  if (!edit || typeof edit !== 'object' || Array.isArray(edit) || Object.keys(edit).some(key => !allowed.includes(key))) err('変更の構造を確認してください。');
  const data = { published: true, fen: row[1], moves: row[2], rating: row[3], tags: row[4], alternatives: [],
    explanationStatus: edit.explanation?.trim?.() ? 'authored' : 'generated', ...edit };
  if (!['generated', 'reviewed', 'authored'].includes(data.explanationStatus)
    || data.explanationStatus === 'generated' && data.explanation
    || data.explanationStatus !== 'generated' && (typeof data.explanation !== 'string' || !data.explanation.trim())) {
    err('解説の確認状態と日本語解説の入力を確認してください。');
  }
  if (typeof data.published !== 'boolean' || !Number.isInteger(data.rating) || data.rating < 400 || data.rating > 3000
    || typeof data.fen !== 'string' || !rules.validateFen(data.fen).ok || !Array.isArray(data.tags)
    || !data.tags.length || new Set(data.tags).size !== data.tags.length || data.tags.some(tag => !supported.has(tag))
    || !Array.isArray(data.alternatives) || data.alternatives.length > 6) err('公開状態、難易度、局面、テーマを確認してください。');
  for (const key of ['title', 'prompt', 'hint', 'explanation', 'source']) {
    if (data[key] !== undefined && (typeof data[key] !== 'string' || data[key].length > 3000)) err(key + ' の文章が長すぎるか、不正です。');
  }
  for (const line of [data.moves, ...data.alternatives]) {
    if (!Array.isArray(line) || !line.length || line.length > 15 || line.length % 2 === 0
      || line.some(move => typeof move !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move))) err('手順は自分の手で始まり自分の手で終わる座標表記にしてください。');
    const board = new rules.Chess(data.fen);
    try {
      for (const move of line) {
        if (board.isGameOver()) throw new Error();
        board.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] });
      }
    } catch { err('局面から再生できない着手があります。'); }
    if (data.tags.some(tag => /^mateIn[1-5]$/.test(tag) && line.length !== Number(tag.at(-1)) * 2 - 1 || /^mate(In[1-5])?$/.test(tag) && !board.isCheckmate())) {
      err('詰めの手数または最終局面を確認してください。');
    }
  }
  if (new Set([data.moves, ...data.alternatives].map(line => line[0])).size !== data.alternatives.length + 1) err('別解の最初の手が重複しています。');
  return data;
}

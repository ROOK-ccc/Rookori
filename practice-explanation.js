const practicePieceNames = { p: 'ポーン', n: 'ナイト', b: 'ビショップ', r: 'ルーク', q: 'クイーン', k: 'キング' };
const practicePiecePoints = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function practiceLineFacts(fen, codes) {
  const board = new chessRules.Chess(fen);
  const side = board.turn();
  const steps = [];
  let material = 0;
  for (const code of codes) {
    const move = studyPlay(board, code);
    const gain = (practicePiecePoints[move.captured] ?? 0) + (move.promotion ? practicePiecePoints[move.promotion] - 1 : 0);
    material += move.color === side ? gain : -gain;
    steps.push({ move, fen: board.fen(), mate: board.isCheckmate(), check: board.isCheck(), material });
  }
  const first = steps[0];
  if (!first) return { steps, summary: '', details: [], marks: [] };
  board.load(first.fen);
  const { move } = first;
  const targets = board.board().flat().filter(piece => piece && piece.color !== side && piece.type !== 'k'
    && piece.type !== 'p' && board.attackers(piece.square, side).includes(move.to));
  const defenders = board.attackers(move.to, side);
  const attacks = board.attackers(move.to, board.turn());
  const original = new chessRules.Chess(fen);
  const improvedGuard = board.board().flat().find(piece => piece && piece.square !== move.to
    && piece.color === side && !['k', 'p'].includes(piece.type)
    && board.attackers(piece.square, board.turn()).length
    && board.attackers(piece.square, side).includes(move.to)
    && !original.attackers(piece.square, side).includes(move.from));
  const capture = step => step.move.captured ? practicePieceNames[step.move.captured] + 'を取ります' : '';
  const result = steps.at(-1);
  const aim = first.mate ? 'この一手でチェックメイトです'
    : [capture(first), move.promotion && practicePieceNames[move.promotion] + 'に昇格します',
      first.check && 'チェックをかけます'].filter(Boolean).join('。')
      || (targets.length ? targets.map(piece => piece.square + 'の' + practicePieceNames[piece.type]).join('と') + 'に動かした駒の利きが届きます'
        : improvedGuard ? improvedGuard.square + 'の' + practicePieceNames[improvedGuard.type] + 'に味方の利きが一つ加わります'
        : 'まず' + practicePieceNames[move.piece] + 'を' + move.to + 'へ動かします');
  const details = [];
  if (steps[1]) {
    const reply = steps[1];
    details.push(`相手の応手例は ${reply.move.san}（${reply.move.from}→${reply.move.to}）です。${capture(reply) ? '相手は' + capture(reply) + '。' : ''}`);
  }
  if (targets.length) {
    details.push(targets.map(piece => {
      const guards = board.attackers(piece.square, piece.color).length;
      return piece.square + 'の' + practicePieceNames[piece.type] + '（相手の駒の利き ' + guards + '）';
    }).join('、') + 'に同じ駒の利きが届きます。');
  }
  if (attacks.length) details.push(`${move.to}には相手の駒${attacks.length}個と味方の駒${defenders.length}個の利きがあります。取り返せるかは手順で確かめましょう。`);
  if (result !== first && result.mate) details.push(`この変化では ${result.move.san} でチェックメイトになります。`);
  if (result.material) details.push(`この手順に出てくる駒取り・昇格の差は、手番側から見て${result.material > 0 ? '+' : '−'}${Math.abs(result.material)}点です。`);
  if (first.mate) details.push('次の実戦では、チェックしたあとに逃げ場・取り返し・合駒がすべてなくなるか確かめましょう。');
  else if (targets.length >= 2) details.push('次の実戦でも、一手でいくつの駒を狙えるか、相手がどの駒を守れるかを考えましょう。');
  return { steps, summary: `${move.san}（${move.from}→${move.to}）で、${aim}。`, details,
    marks: [...targets.map(piece => piece.square), ...(improvedGuard ? [improvedGuard.square] : [])] };
}

function showPracticeExplanation(container, toolbar, lines, edit, applyStep) {
  const usable = lines.filter(line => line.facts.steps.length);
  container.replaceChildren();
  toolbar.replaceChildren();
  if (!usable.length) return;
  const best = usable[0].facts;
  const heading = element('h3', edit?.explanation || best.summary);
  const origin = edit?.explanation
    ? (edit.explanationStatus === 'reviewed' ? '運営者が確認した解説' : '運営者の解説') : '盤面から生成した解説';
  container.append(element('p', origin, 'dashboard-note'), heading);
  if (edit?.explanation) {
    heading.textContent = 'この問題の解説';
    container.append(element('p', edit.explanation, 'practice-authored'));
  }
  const select = element('select');
  for (const [index, line] of usable.entries()) select.append(new Option(line.label, index));
  const label = element('label', '再生する手順 ');
  label.append(select);
  label.hidden = usable.length === 1;
  const previous = element('button', '前の手', 'button secondary');
  const next = element('button', '次の手', 'button secondary');
  const progress = element('p', '', 'dashboard-note');
  progress.setAttribute('role', 'status');
  const controls = element('div', null, 'study-mode-links');
  controls.append(previous, next);
  const details = element('details');
  details.append(element('summary', '局面の詳しい解説'));
  const copy = element('div');
  details.append(copy);
  toolbar.replaceChildren(label, controls, progress);
  toolbar.hidden = false;
  container.append(details);
  const reply = element('p');
  container.insertBefore(reply, details);
  let ply = 1;
  function render() {
    const { facts } = usable[Number(select.value)];
    const step = facts.steps[ply - 1];
    progress.textContent = step ? `${ply} / ${facts.steps.length}手 · ${step.move.san}（${step.move.from}→${step.move.to}）` : '着手前の局面';
    previous.disabled = ply === 0;
    next.disabled = ply >= facts.steps.length;
    reply.hidden = !facts.steps[1];
    reply.textContent = facts.steps[1] ? '相手の応手例 ' + facts.steps[1].move.san : '';
    copy.replaceChildren(...[facts.summary, ...facts.details].map(text => element('p', text)));
    applyStep(step, ply === 1 ? facts.marks : []);
  }
  select.addEventListener('change', () => { ply = 1; render(); });
  previous.addEventListener('click', () => { ply--; render(); });
  next.addEventListener('click', () => { ply++; render(); });
  render();
}

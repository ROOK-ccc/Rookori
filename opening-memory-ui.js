const openingMemoryScreen = (() => {
  let storage;
  try { storage = window.localStorage; } catch { /* このタブでは引き続き練習できます。 */ }
  const history = new OpeningPracticeHistory(storage);
  const dateFormat = new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short' });
  const pieceNames = { p: 'ポーン', n: 'ナイト', b: 'ビショップ', r: 'ルーク', q: 'クイーン', k: 'キング' };
  const hintLabels = ['考え方のヒント', '駒のヒント', '正解手のヒント', 'ヒントを表示しました'];
  const text = (id, value) => { byId(id).textContent = value; };
  let practice;
  let flipped;
  let timer;
  let recordedCompletion;
  const currentItem = () => learningTracker.itemList(practice.opening)[practice.study.step];
  const board = createChessBoard(byId('practice-board'), byId('practice-promotion'), {
    position: () => practice.study,
    isFlipped: () => flipped,
    canPlay: () => practice.learnerTurn && !timer,
    hints: () => practice.hintLevel === 3 && practice.learnerTurn ? [practice.expected] : [],
    play(from, to, promotion) {
      const item = currentItem();
      const firstTryCorrect = !practice.missed;
      const quality = practice.hintLevel ? 'hint' : practice.missed ? 'retry' : 'clean';
      if (!practice.play(from, to, promotion)) {
        incorrect();
        return false;
      }
      learningTracker.observe(item, quality, { firstTryCorrect });
      return true;
    },
    onMove() {
      text('practice-status', '正解！');
      text('practice-comment', practice.opening.explanations[practice.study.step - 1]);
      advanceOpponent();
    },
    feedback(message) {
      if (message && !byId('practice-status').textContent.startsWith('不正解')) text('practice-status', message);
    },
    onIllegal(message, from, to) {
      practice.wrong(from + to);
      incorrect(message);
    },
  });

  function incorrect(message = '登録手順と違います。同じ局面からもう一度試しましょう。') {
    text('practice-status', `不正解。 ${message}`);
    text('practice-comment', '');
    learningTracker.observe(currentItem(), 'interrupted', { mistakes: 1 });
    save();
  }

  function save() {
    if (practice.trained || practice.errors.length || practice.hints || practice.complete) history.save(practice.record());
  }

  function close() {
    clearTimeout(timer);
    timer = undefined;
    board.close();
  }

  function advanceOpponent() {
    if (!practice.complete && !practice.learnerTurn) {
      timer = setTimeout(() => {
        timer = undefined;
        practice.opponentMove();
        text('practice-status', `相手は ${practice.study.lastMove.san} と指しました。`);
        advanceOpponent();
      }, 520);
    }
    if (practice.complete && !practice.target && !recordedCompletion) {
      learningTracker.openingDone(practice.opening.id, 'practice');
      recordedCompletion = true;
    }
    save();
    render();
  }

  function stats(items) {
    return items.flatMap(([label, value]) => [element('dt', label), element('dd', String(value))]);
  }

  function cleanPercent(record) {
    return record.trained ? `${Math.round(100 * record.unassistedFirstCorrect / record.trained)}%` : '—';
  }

  function render() {
    const color = chessColorNames[practice.color];
    text('practice-turn', practice.complete ? '練習完了' : timer ? '相手の手を再生中' : `${color}の手番`);
    byId('practice-turn').dataset.color = practice.study.game.turn();
    text('practice-flip', flipped ? '白を手前にする' : '黒を手前にする');
    text('practice-steps', `${color}番の手順　${practice.trained} / ${practice.total} 手`);
    const hint = byId('practice-show-hint');
    hint.disabled = Boolean(timer) || practice.complete || practice.hintLevel === 3;
    hint.textContent = hintLabels[practice.hintLevel];
    byId('practice-hint').hidden = !practice.hintLevel;
    byId('practice-result').hidden = !practice.complete;
    if (practice.complete) {
      const next = byId('practice-next-review');
      const [item] = practice.target ? learningTracker.due() : [];
      next.hidden = !item;
      next.href = item ? reviewLink(item.id) : '#review';
      const record = practice.record();
      byId('practice-result-stats').replaceChildren(...stats([
        ['戦法', practice.opening.name], ['練習した手数', record.trained],
        ['初回正解', record.firstCorrect], ['不正解', record.mistakes], ['ヒント使用', record.hints],
        ['ヒントなしの初回正解率', cleanPercent(record)], ['練習日時', dateFormat.format(new Date(record.date))],
      ]));
    }
    board.render();
  }

  function open(opening, color, target = null) {
    close();
    practice = new OpeningPractice(opening, color, target);
    recordedCompletion = false;
    byId('practice-colors').hidden = Boolean(target);
    flipped = color === 'b';
    text('practice-title', opening.name);
    const explain = `#study/${opening.id}`;
    byId('practice-explain').href = explain;
    byId('practice-result-explain').href = explain;
    for (const [id, side] of [['practice-white', 'w'], ['practice-black', 'b']]) {
      const link = byId(id);
      link.href = `#practice/${opening.id}/${side}`;
      if (color === side) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    text('practice-status', target ? '今日の復習。再現した局面から、次の一手を指しましょう。'
      : color === 'w' ? '白の最初の手から指しましょう。' : '白の最初の手を再生します。');
    text('practice-comment', '');
    board.reset();
    showScreen('opening-practice', 'practice-title');
    advanceOpponent();
  }

  function review() {
    const rows = history.summaries().flatMap(group => {
      const opening = findStudyOpening(group.id);
      if (!opening) return [];
      const card = element('article', null, 'opening-card review-card');
      const latest = group.latest;
      const parent = opening.parentId ? findStudyOpening(opening.parentId)?.name : null;
      const notation = openingNotation(opening);
      const mistakes = [...group.errors].sort((a, b) => b[1] - a[1]).slice(0, 3);
      const weak = mistakes.map(([ply, count]) => `${notation[ply] ?? `${ply + 1}手目`}（${count}回）`).join('、');
      const list = element('dl');
      list.append(...stats([
        ['最終練習日', dateFormat.format(new Date(latest.date))], ['練習回数', `${group.count}回`],
        ['前回の成績', `${latest.complete ? '完了' : '途中'}、初回正解 ${latest.firstCorrect} / ${latest.trained}手、ヒントなし ${cleanPercent(latest)}`],
        ['前回の不正解・ヒント', `${latest.mistakes}回・${latest.hints}回`],
        ['間違いが多かった手', weak || '記録なし'],
      ]));
      const link = element('a', 'もう一度練習する', 'button primary');
      link.href = `#practice/${opening.id}/${group.color}`;
      if (parent) card.append(element('p', parent, 'eyebrow'));
      card.append(element('h2', `${opening.name}・${chessColorNames[group.color]}番`), list, link);
      return [card];
    });
    byId('review-list').replaceChildren(...(rows.length ? rows : [
      element('p', '暗記練習の履歴がまだありません。戦法一覧から好きな戦法を選びましょう。'),
    ]));
    byId('review-storage-note').hidden = history.available;
    showScreen('review', 'review-title');
  }

  byId('practice-show-hint').addEventListener('click', () => {
    const before = practice.hintLevel;
    const level = practice.revealHint();
    if (level === before) return;
    learningTracker.observe(currentItem(), 'interrupted', { hints: 1 });
    const from = practice.expected.slice(0, 2);
    const piece = practice.study.game.get(from);
    const messages = [
      practice.opening.thinkingHints?.[practice.study.step] ?? '直前の相手の手を見て、中央・駒の展開・キングの安全を考えましょう。',
      `${pieceNames[piece.type]}を動かします。`,
      `盤の印をたどり、${from}から${practice.expected.slice(2, 4)}へ動かします。`,
    ];
    text('practice-hint', messages[level - 1]);
    save();
    render();
  });
  byId('practice-flip').addEventListener('click', () => { flipped = !flipped; render(); });
  for (const id of ['practice-again', 'practice-reset']) {
    byId(id).addEventListener('click', () => open(practice.opening, practice.color, practice.target));
  }
  return { open, close, review };
})();

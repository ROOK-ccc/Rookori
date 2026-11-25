const openingStudyScreen = (() => {
  const colorNames = chessColorNames;
  let candidate;
  let study;
  let flipped;
  let completionRecorded;
  const board = createChessBoard(byId('study-board'), byId('study-promotion'), {
    position: () => study,
    isFlipped: () => flipped,
    play: (from, to, promotion) => study.play(from, to, promotion),
    onMove: () => {
      saveProgress();
      render();
    },
    feedback: (message) => { byId('study-feedback').textContent = message; },
  });

  function open(opening, route) {
    candidate = opening;
    completionRecorded = false;
    study = new OpeningStudy(candidate.moves);
    for (const uci of route.studyMoves ?? []) {
      if (!study.play(uci.slice(0, 2), uci.slice(2, 4), uci[4])) break;
    }
    completionRecorded = study.complete;
    flipped = Boolean(route.flipped);
    board.reset();
    chessGlossary.annotate(byId('study-title'), candidate.name);
    byId('study-english').textContent = candidate.english;
    byId('study-slot').textContent = openingSlots[candidate.slot];
    byId('study-practice').href = `#practice/${candidate.id}/${openingDefaultColor(candidate)}`;
    byId('study-parent').hidden = !candidate.parentId;
    byId('study-parent').href = candidate.parentId ? `#study/${candidate.parentId}` : '#openings';
    byId('variation-details').hidden = !candidate.parentId;
    byId('sicilian-comparison').hidden = !openingVariations.some(variation => variation.parentId === candidate.id);
    byId('study-compare').hidden = byId('sicilian-comparison').hidden;
    if (candidate.parentId) {
      chessGlossary.annotate(byId('variation-overview'), candidate.description);
      const facts = [
        ['代表手順', openingNotation(candidate).join(' ')], ['白番の狙い', candidate.white],
        ['黒番の狙い', candidate.black], ['ポーンの形', candidate.pawns],
        ['注意したい弱点', candidate.weakness], ['よくある間違い', candidate.mistake],
      ];
      byId('variation-facts').replaceChildren(...facts.flatMap(([label, value]) =>
        [element('dt', label), chessTermText('dd', value)]));
    }
    if (!byId('sicilian-comparison').hidden) {
      const variants = openingVariations.filter(variation => variation.parentId === candidate.id);
      byId('sicilian-groups').replaceChildren(...[
        ['黒番の主な駒組み', variants.filter(variation => variation.slot !== 'white')],
        ['白番が選ぶ対抗策', variants.filter(variation => variation.slot === 'white')],
      ].map(([title, group]) => {
        const section = element('section');
        section.append(element('h3', title));
        const list = element('ul', null, 'goal-links');
        for (const variation of group) {
          const item = element('li');
          const link = element('a', variation.name);
          link.href = `#study/${variation.id}`;
          item.append(link, chessTermText('p', variation.description));
          list.append(item);
        }
        section.append(list);
        return section;
      }));
    }
    const destination = route.recommended ? '#opening-result' : candidate.parentId ? `#study/${candidate.parentId}` : '#openings';
    const fromGame = /^game-review\/(sample|preview|[a-f0-9]{32})$/.test(route.from ?? '');
    const back = byId('study-back');
    back.href = fromGame ? `#${route.from}` : destination;
    back.textContent = fromGame ? '対局の振り返りに戻る' : route.recommended ? '診断結果に戻る'
      : candidate.parentId ? 'シシリアンの比較へ戻る' : '戦法一覧に戻る';
    const more = byId('study-more');
    more.href = destination;
    more.textContent = route.recommended ? 'ほかのおすすめ戦法を見る' : 'ほかの戦法を見る';
    byId('study-complete-title').textContent = `${candidate.name}の基本手順を学びました！`;
    render();
    showScreen('opening-study', 'study-title');
  }

  function saveProgress() {
    updateEntry({ studyMoves: study.played.map(({ lan }) => lan), flipped });
  }

  function render() {
    byId('study-cpu').href = `#cpu-opening/${candidate.id}${study.guided && study.step ? '/' + study.step : ''}`;
    const last = study.lastMove;
    const turn = study.game.turn();
    const outcome = study.outcome;
    const outcomes = {
      checkmate: `チェックメイト。${colorNames[last?.color ?? (turn === 'w' ? 'b' : 'w')]}の勝ちです。`,
      stalemate: 'ステイルメイト。キングはチェックされていませんが、指せる手がないため引き分けです。',
      'insufficient-material': 'チェックメイトに必要な駒が残っていないため、引き分けです。',
      repetition: '同じ局面が3回現れたため、この学習盤では引き分けです。',
      'fifty-moves': '駒取りもポーンの移動もないまま白黒が50手ずつ指したため、この学習盤では引き分けです。',
    };
    const turnLabel = byId('study-turn');
    turnLabel.dataset.color = turn;
    turnLabel.textContent = outcome ? '対局終了' : `${colorNames[turn]}の手番${study.game.isCheck() ? '（チェック）' : ''}`;
    byId('study-flip').textContent = flipped ? '白を手前にする' : '黒を手前にする';
    const next = byId('study-next');
    const undo = byId('study-undo');
    const active = document.activeElement;
    next.disabled = !study.canAdvance;
    undo.disabled = study.step === 0;
    byId('study-status').textContent = outcomes[outcome] || (
      study.complete ? '基本手順はここまでです。続けて自由に指せます。'
        : study.guided ? '基本手順の一例' : 'ここからは自由に動かせます'
    );
    byId('study-count').textContent = study.guided
      ? `${study.step} / ${candidate.moves.length} 手`
      : `${study.step}手目（自由に指す）`;
    const moveNumber = Math.ceil(study.step / 2);
    byId('study-move').textContent = last
      ? `${moveNumber}${last.color === 'w' ? '.' : '...'}${last.san}　${colorNames[last.color]}の手`
      : '初期配置';
    chessGlossary.annotate(byId('study-comment'), !last ? candidate.tip
      : study.guided ? candidate.explanations[study.step - 1]
        : '「一手戻る」で前の局面へ、「最初からやり直す」で基本手順の入口へ戻れます。');
    byId('study-complete').hidden = !study.complete;
    if (study.complete && !completionRecorded) {
      learningTracker.openingDone(candidate.id, 'study');
      completionRecorded = true;
    }
    board.render();
    if (active === next && next.disabled) undo.focus({ preventScroll: true });
    if (active === undo && undo.disabled) next.focus({ preventScroll: true });
  }

  const actions = {
    'study-next': () => study.advance(),
    'study-undo': () => study.undo(),
    'study-reset': () => study.reset(),
    'study-repeat': () => study.reset(),
  };
  for (const [id, action] of Object.entries(actions)) {
    byId(id).addEventListener('click', () => {
      action();
      if (!study.complete) completionRecorded = false;
      board.clearSelection();
      saveProgress();
      render();
      if (id === 'study-repeat') byId('study-title').focus();
    });
  }
  byId('study-flip').addEventListener('click', () => {
    flipped = !flipped;
    saveProgress();
    render();
  });
  byId('study-compare').addEventListener('click', () => byId('sicilian-comparison-title').focus());
  return { open, close: board.close };
})();

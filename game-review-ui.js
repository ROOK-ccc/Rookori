const gameReviewPages = (() => {
  const library = createGameLibrary();
  const importChoices = byId('game-import-choice');
  const noteField = byId('game-note');
  const moveList = byId('game-moves');
  const drafts = new Map();
  let imports = [];
  const previews = new Map();
  let previewId = 0;
  let reading = 0;
  let viewer;
  let historyPage;
  let restorePending = false;

  function title(game) {
    const { event, white, black } = game.metadata;
    if (event && event !== '?') return event;
    if (white && black) return `${white} 対 ${black}`;
    return '対局の振り返り';
  }

  function resultText(metadata) {
    return metadata.result ? gameResults[metadata.result] : '記録なし';
  }

  function describe(game) {
    const { white, black, date } = game.metadata;
    const players = [white && `白：${white}`, black && `黒：${black}`].filter(Boolean);
    return [...players, date, `${game.positions.length - 1}手`].filter(Boolean).join(' ／ ');
  }

  function moveLabel({ move }) {
    return move ? `${move.number}${move.color === 'w' ? '.' : '…'} ${move.san}` : '最初の局面';
  }

  function download(filename, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = element('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function storageMessage(error) {
    if (error.name === 'QuotaExceededError') return 'ブラウザーの保存容量が足りません。入力した内容はこの画面に残っています。';
    if (error.name === 'Error') return error.message;
    return 'このブラウザーに保存できませんでした。対局や入力内容を控えてから、保存を使える環境でもう一度お試しください。';
  }

  function openPreview(game) {
    previews.set(++previewId, game);
    if (previews.size > 12) previews.delete(previews.keys().next().value);
    goTo('game-review/preview', { gamePly: 0, gamePreviewId: previewId });
  }

  function loadPgn(text) {
    importChoices.hidden = true;
    imports = [];
    byId('game-import-error').textContent = '';
    try {
      imports = parseReviewGames(text);
    } catch (error) {
      byId('game-import-error').textContent = error.message;
      return;
    }
    if (imports.length === 1) {
      openPreview(imports[0]);
      return;
    }
    const select = byId('game-import-select');
    select.replaceChildren(...imports.map((game, index) => {
      const option = element('option', `${index + 1}. ${title(game)} ／ ${describe(game)}`);
      option.value = index;
      return option;
    }));
    importChoices.hidden = false;
    select.focus();
  }

  byId('game-import-form').addEventListener('submit', event => {
    event.preventDefault();
    reading++;
    loadPgn(byId('game-pgn').value);
  });
  byId('game-pgn').addEventListener('input', () => {
    reading++;
    importChoices.hidden = true;
    byId('game-import-error').textContent = '';
  });
  byId('game-pgn-file').addEventListener('change', async event => {
    const field = event.currentTarget;
    const file = field.files[0];
    field.value = '';
    if (!file) return;
    const request = ++reading;
    importChoices.hidden = true;
    byId('game-import-error').textContent = '';
    try {
      if (file.size > gamePgnLimit * 4) throw new Error('棋譜ファイルが大きすぎます。分けて読み込んでください。');
      const text = await file.text();
      if (request !== reading || byId('game-review').hidden) return;
      byId('game-pgn').value = text;
      loadPgn(text);
    } catch (error) {
      if (request === reading) byId('game-import-error').textContent =
        error.name === 'Error' ? error.message : 'ファイルを開けませんでした。別の棋譜ファイルを選んでください。';
    }
  });
  byId('game-open-choice').addEventListener('click', () => {
    const game = imports[Number(byId('game-import-select').value)];
    if (game) openPreview(game);
  });

  const board = createChessBoard(byId('game-board'), null, {
    position: () => ({
      game: new chessRules.Chess(viewer.position.fen), lastMove: viewer.position.move,
    }),
    canPlay: () => false,
    isFlipped: () => viewer.flipped,
    feedback: () => {},
  });

  function activeView(view) {
    return viewer === view && !byId('game-player').hidden;
  }

  function currentNote(view, ply = view.position.ply) {
    return view.game.notes?.find(note => note.ply === ply);
  }

  function updateDraft(view, value) {
    const { pgn } = view.game;
    const { ply } = view.position;
    const positions = drafts.get(pgn) ?? new Map();
    if (value === (currentNote(view)?.text ?? '')) positions.delete(ply);
    else positions.set(ply, value);
    if (positions.size) drafts.set(pgn, positions);
    else drafts.delete(pgn);
  }

  function renderNoteForm(view) {
    const { ply } = view.position;
    const note = currentNote(view);
    noteField.value = drafts.get(view.game.pgn)?.get(ply) ?? note?.text ?? '';
    byId('game-note-position').textContent = ply ? `${moveLabel(view.position)} の直後` : '最初の局面';
    byId('game-save-note').textContent = note ? 'メモを更新' : 'この局面を保存';
    byId('game-delete-note').hidden = !note;
    setBusy(view, view.busy);
  }

  function renderNotes(view) {
    const list = byId('game-notes');
    list.replaceChildren(...(view.game.notes ?? []).map(note => {
      const item = element('li');
      const button = element('button', moveLabel(view.game.positions[note.ply]), 'text-button');
      button.type = 'button';
      button.addEventListener('click', () => {
        goToPly(note.ply);
        noteField.focus();
      });
      item.append(button, element('p', note.text || '局面のみ保存', 'game-note-text'));
      return item;
    }));
    if (!list.children.length) list.append(element('li', 'まだ保存した局面はありません。'));
  }

  function goToPly(ply) {
    const view = viewer;
    view.position = reviewPosition(view.game, ply);
    const { position, game } = view;
    const last = game.positions.length - 1;
    board.render();
    const turn = position.fen.split(' ')[1];
    const turnText = byId('game-turn');
    turnText.dataset.color = turn;
    turnText.textContent = position.ply === last ? '最後の局面' : `${chessColorNames[turn]}の番`;
    byId('game-counter').textContent = `${position.ply} / ${last}手 · ${moveLabel(position)}`;
    byId('game-fen').textContent = position.fen;
    byId('game-first').disabled = byId('game-prev').disabled = position.ply === 0;
    byId('game-next').disabled = byId('game-last').disabled = position.ply === last;
    moveList.querySelector('[aria-current]')?.removeAttribute('aria-current');
    const selected = moveList.children[position.ply].firstElementChild;
    selected.setAttribute('aria-current', 'step');
    const bounds = moveList.getBoundingClientRect();
    const button = selected.getBoundingClientRect();
    if (button.top < bounds.top) moveList.scrollTop -= bounds.top - button.top + 6;
    if (button.bottom > bounds.bottom) moveList.scrollTop += button.bottom - bounds.bottom + 6;
    byId('game-note-status').textContent = '';
    renderNoteForm(view);
  }

  function showGame(view, start) {
    const { game } = view;
    byId('game-player-title').textContent = title(game);
    const summary = describe(game);
    byId('game-player-summary').textContent = game.metadata.hasEndMarker ? summary
      : `${summary} ／ 終了記号がないため、記録されている手まで表示`;
    byId('game-player-status').textContent = '';
    byId('game-flip').textContent = '黒を手前にする';
    const metadata = byId('game-metadata');
    const fields = [
      ['白番', game.metadata.white], ['黒番', game.metadata.black], ['対局日', game.metadata.date],
      ['結果', resultText(game.metadata)], ['手数（白・黒をそれぞれ1手と数える）', game.positions.length - 1],
    ];
    metadata.replaceChildren(...fields.flatMap(([name, value]) =>
      [element('dt', name), element('dd', String(value ?? '記録なし'))]));
    byId('game-player-content').querySelector('details').open = false;
    const opening = reviewOpening(game, [...openings, ...openingVariations]);
    const learningLink = byId('game-learning-link');
    learningLink.href = opening ? `#study/${opening.id}` : '#lesson/center';
    learningLink.textContent = opening ? `${opening.name}の基本を学ぶ` : '中央の使い方を学ぶ';
    byId('game-next-learning').textContent = opening
      ? `対局の冒頭は「${opening.name}」の教材の手順と一致しました。序盤の一手ずつの狙いを盤で確かめてみましょう。`
      : '序盤で迷ったら、駒を中央にどう出せるか、入門レッスンで試してみましょう。';
    const moves = document.createDocumentFragment();
    for (const position of game.positions) {
      const item = element('li');
      const button = element('button', moveLabel(position), 'game-move');
      button.type = 'button';
      button.dataset.ply = position.ply;
      item.append(button);
      moves.append(item);
    }
    moveList.replaceChildren(moves);
    moveList.scrollTop = 0;
    byId('game-player-content').hidden = false;
    board.reset();
    renderNotes(view);
    goToPly(start);
  }

  function setBusy(view, busy) {
    view.busy = busy;
    byId('game-save').hidden = Boolean(view.game.id);
    byId('game-download').hidden = !view.game.id;
    byId('game-save').disabled = busy;
    byId('game-save-note').disabled = busy;
    byId('game-delete-note').disabled = busy;
    noteField.readOnly = busy;
  }

  function markSaved(view) {
    const path = `game-review/${view.game.id}`;
    if (displayedRoute.path === path) return;
    history.replaceState({ ...history.state, path, gamePly: view.position.ply }, '', '#' + path);
    displayedRoute = readSiteRoute(location.href, history.state);
  }

  async function saveGame() {
    const view = viewer;
    setBusy(view, true);
    const status = byId('game-player-status');
    try {
      view.game = await library.save(view.game);
      if (!activeView(view)) return;
      markSaved(view);
      renderNotes(view);
      renderNoteForm(view);
      status.textContent = '対局履歴に保存しました。';
    } catch (error) {
      if (activeView(view)) status.textContent = storageMessage(error);
    } finally {
      if (activeView(view)) setBusy(view, false);
    }
  }

  async function savePoint(remove = false) {
    const view = viewer;
    const { ply } = view.position;
    const text = remove ? null : noteField.value;
    const status = byId('game-note-status');
    if (remove && !window.confirm('この局面のメモを削除しますか？')) return;
    setBusy(view, true);
    try {
      view.game = view.game.id
        ? await library.updateNote(view.game, ply, currentNote(view, ply), text)
        : await library.save(view.game, { ply, text });
      const positions = drafts.get(view.game.pgn);
      positions?.delete(ply);
      if (!positions?.size) drafts.delete(view.game.pgn);
      if (!activeView(view)) return;
      markSaved(view);
      renderNotes(view);
      renderNoteForm(view);
      if (view.position.ply === ply) {
        status.textContent = remove ? 'この局面のメモを削除しました。' : 'この局面を保存しました。';
        if (remove) byId('game-save-note').focus();
      }
    } catch (error) {
      if (activeView(view)) status.textContent = storageMessage(error);
    } finally {
      if (activeView(view)) setBusy(view, false);
    }
  }

  const moveBy = amount => goToPly(viewer.position.ply + amount);
  byId('game-first').addEventListener('click', () => goToPly(0));
  byId('game-prev').addEventListener('click', () => moveBy(-1));
  byId('game-next').addEventListener('click', () => moveBy(1));
  byId('game-last').addEventListener('click', () => goToPly(viewer.game.positions.length - 1));
  byId('game-flip').addEventListener('click', event => {
    viewer.flipped = !viewer.flipped;
    event.currentTarget.textContent = viewer.flipped ? '白を手前にする' : '黒を手前にする';
    board.render();
  });
  moveList.addEventListener('click', event => {
    const button = event.target.closest('button[data-ply]');
    if (button) goToPly(Number(button.dataset.ply));
  });
  document.addEventListener('keydown', event => {
    if (!viewer?.position || !activeView(viewer) || event.altKey || event.ctrlKey || event.metaKey
      || document.querySelector('dialog[open]') || event.target.isContentEditable
      || event.target.closest?.('input, textarea, select, #game-board')) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    event.stopPropagation();
    moveBy(event.key === 'ArrowLeft' ? -1 : 1);
  }, true);
  noteField.addEventListener('input', () => updateDraft(viewer, noteField.value));
  byId('game-save').addEventListener('click', saveGame);
  byId('game-download').addEventListener('click', () =>
    download('chesspath-game.pgn', viewer.game.pgn + '\n', 'application/x-chess-pgn;charset=utf-8'));
  byId('game-note-form').addEventListener('submit', event => {
    event.preventDefault();
    if (!viewer.busy) savePoint();
  });
  byId('game-delete-note').addEventListener('click', () => savePoint(true));
  window.addEventListener('beforeunload', event => {
    if (drafts.size) event.preventDefault();
  });

  function renderHistory(page) {
    const query = byId('game-search').value.trim().toLocaleLowerCase();
    const matching = page.games.filter(game =>
      [game.metadata.event, game.metadata.white, game.metadata.black, ...game.notes.map(note => note.text)]
        .some(text => text?.toLocaleLowerCase().includes(query)) || !query);
    byId('game-library-status').textContent = !page.games.length ? '保存した対局はまだありません。'
      : matching.length ? `${matching.length}局` : '検索に一致する対局はありません。';
    byId('game-history').replaceChildren(...matching.map(game => {
      const item = element('li', null, 'game-card');
      const heading = element('h2');
      const link = element('a', title(game), 'text-button');
      link.href = `#game-review/${game.id}`;
      heading.append(link);
      const { date, white, black, hasEndMarker } = game.metadata;
      item.append(heading, element('p', `白：${white ?? '記録なし'} ／ 黒：${black ?? '記録なし'}`),
        element('p', `対局日：${date ?? '記録なし'} ／ 結果：${resultText(game.metadata)} ／ ${game.positions.length - 1}手 ／ 振り返りポイント ${game.notes.length}件`));
      if (!hasEndMarker) item.append(element('p', '対局の終わりを示す記号のない棋譜'));
      return item;
    }));
  }

  function activeHistory(page) {
    return historyPage === page && !byId('game-library').hidden;
  }

  async function loadHistory(page) {
    try {
      const games = await library.all();
      if (!activeHistory(page)) return;
      page.games = games.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
      renderHistory(page);
    } catch {
      if (activeHistory(page)) byId('game-library-status').textContent = '対局履歴を読み込めませんでした。';
    }
  }

  byId('game-search').addEventListener('input', () => {
    if (historyPage?.games) renderHistory(historyPage);
  });
  byId('game-export-library').addEventListener('click', async () => {
    const page = historyPage;
    const status = byId('game-backup-status');
    try {
      const backup = makeGameBackup(await library.all());
      if (!activeHistory(page)) return;
      download('chesspath-game-library.json', JSON.stringify(backup, null, 2), 'application/json');
      status.textContent = '対局とメモを書き出しました。';
    } catch {
      if (activeHistory(page)) status.textContent = 'バックアップを書き出せませんでした。';
    }
  });
  byId('game-restore-library').addEventListener('change', async event => {
    const field = event.currentTarget;
    const file = field.files[0];
    field.value = '';
    if (!file || restorePending) return;
    const page = historyPage;
    const status = byId('game-backup-status');
    restorePending = true;
    status.textContent = 'バックアップを確認しています。';
    try {
      let backup;
      try { backup = JSON.parse(await file.text()); }
      catch { throw new Error('対局履歴のバックアップファイルを確認してください。'); }
      const games = validateGameBackup(backup);
      if (!activeHistory(page)) return;
      if (!window.confirm(`現在の対局とメモを取り除き、ファイルにある ${games.length} 局に置き換えますか？`)) {
        status.textContent = '復元を取り消しました。';
        return;
      }
      await library.restore(games);
      if (activeHistory(page)) {
        status.textContent = `${games.length}局を復元しました。`;
        await loadHistory(page);
      } else if (activeHistory(historyPage)) {
        await loadHistory(historyPage);
      }
    } catch (error) {
      if (activeHistory(page)) status.textContent = `復元できませんでした。${storageMessage(error)}`;
    } finally {
      restorePending = false;
    }
  });

  async function open(route) {
    if (route.path === 'game-library') {
      historyPage = {};
      byId('game-library-status').textContent = '対局履歴を読み込んでいます。';
      byId('game-backup-status').textContent = '';
      byId('game-history').replaceChildren();
      showScreen('game-library', 'game-library-title');
      await loadHistory(historyPage);
      return;
    }
    if (!route.game) {
      reading++;
      showScreen('game-review', 'game-review-title');
      return;
    }
    const view = { flipped: false, busy: false };
    viewer = view;
    byId('game-player-title').textContent = '対局を振り返る';
    byId('game-player-content').hidden = true;
    const status = byId('game-player-status');
    status.textContent = '対局を開いています。';
    showScreen('game-player', 'game-player-title');
    try {
      view.game = route.game === 'sample' ? parseReviewGames(sampleGamePgn)[0]
        : route.game === 'preview' ? previews.get(route.gamePreviewId) : await library.get(route.game);
      if (!activeView(view)) return;
      if (!view.game) {
        status.textContent = '対局を開けませんでした。棋譜を取り込むか、対局履歴から選んでください。';
        return;
      }
      const ply = route.gamePly;
      showGame(view, Number.isInteger(ply) ? ply : 0);
    } catch {
      if (activeView(view)) status.textContent = '対局を再表示できませんでした。';
    }
  }

  return { open };
})();

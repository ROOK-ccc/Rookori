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
    if (game.cpu) return `コンピューター対戦 · ${cpuLevelLabel(game.cpu.settings.level)}`;
    const { event, white, black } = game.metadata;
    if (event && event !== '?') return event;
    if (white && black) return `${white} 対 ${black}`;
    return '対局の振り返り';
  }

  function resultText(metadata) {
    return metadata.result ? gameResults[metadata.result] : '記録なし';
  }

  function cpuHistoryResult(game) {
    if (game.metadata.result === '1/2-1/2') return '引き分け';
    return game.metadata.result === (game.cpu.player === 'w' ? '1-0' : '0-1') ? '勝利' : '敗北';
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

  function openSavedOrPreview(record, game) {
    if (record) goTo(`game-review/${record.id}`, { gamePly: 0 });
    else openPreview(game);
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

  function showOpening(game) {
    let match;
    try { match = classifyReviewOpening(game); }
    catch { /* Opening classification is optional for replay. */ }
    const opening = match && findStudyOpening(match.id);
    const name = opening?.parentId ? `${findStudyOpening(opening.parentId).name}：${opening.name}` : opening?.name;
    chessGlossary.annotate(byId('game-opening-name'), name ?? '一致する局面が見つかりませんでした');
    chessGlossary.annotate(byId('game-opening-description'), opening?.description
      ?? 'そのまま手順を再生して、気になる場面を見返せます。');
    const link = byId('game-learning-link');
    link.hidden = !opening;
    if (opening) link.href = `#study/${opening.id}`;
    const details = byId('game-opening-details');
    details.open = false;
    details.hidden = !opening || !match.eco;
    chessGlossary.annotate(byId('game-opening-code'), details.hidden ? '' : `ECOコード ${match.eco}（${match.ply}手目の局面）`);
    byId('game-next-learning').textContent = '序盤で迷ったら、駒を中央にどう出せるか、入門レッスンで試してみましょう。';
  }

  byId('game-learning-link').addEventListener('click', () => updateEntry({ gamePly: viewer.position.ply }));

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
    metadata.closest('details').open = false;
    showOpening(game);
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
    download('rookori-game.pgn', viewer.game.pgn + '\n', 'application/x-chess-pgn;charset=utf-8'));
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
    const filter = byId('game-history-mode').value;
    const sourceFilter = byId('game-history-source').value;
    const origin = game => game.cpu ? 'cpu' : game.source?.provider === 'lichess' ? 'lichess' : 'manual';
    const matching = page.games.filter(game =>
      (filter === 'all' || (game.cpu?.settings.mode ?? 'imported') === filter)
      && (sourceFilter === 'all' || origin(game) === sourceFilter)
      && (!query || [title(game), game.metadata.event, game.metadata.white, game.metadata.black, ...game.notes.map(note => note.text)]
        .some(text => text?.toLocaleLowerCase().includes(query))));
    const types = { practice: '練習', match: '実戦', resumed: '中断から再開した実戦', continued: '時間切れ後の継続練習' };
    const counts = Object.fromEntries(Object.keys(types).map(key => [key, { 勝利: 0, 敗北: 0, 引き分け: 0 }]));
    for (const game of page.games) {
      const { cpu } = game;
      if (!cpu) continue;
      const group = cpu.continued ? 'continued' : cpu.settings.mode === 'match' && cpu.resumes ? 'resumed' : cpu.settings.mode;
      counts[group][cpuHistoryResult(game)]++;
    }
    byId('game-history-counts').textContent = Object.keys(types)
      .filter(key => Object.values(counts[key]).some(Boolean))
      .map(key => `${types[key]} ${counts[key].勝利}勝 ${counts[key].敗北}敗 ${counts[key].引き分け}分`).join(' ／ ');
    byId('game-library-status').textContent = !page.games.length ? '保存した対局はまだありません。'
      : matching.length ? `${matching.length}局` : '条件に一致する対局はありません。';
    const lastPage = Math.max(0, Math.ceil(matching.length / 20) - 1);
    page.index = Math.min(page.index, lastPage);
    byId('game-history-pages').hidden = !lastPage;
    byId('game-history-prev').disabled = page.index === 0;
    byId('game-history-next').disabled = page.index === lastPage;
    byId('game-history-page').textContent = `${page.index + 1} / ${lastPage + 1}`;
    byId('game-history').replaceChildren(...matching.slice(page.index * 20, (page.index + 1) * 20).map(game => {
      const item = element('li', null, 'game-card');
      const heading = element('h2');
      const link = element('a', title(game), 'text-button');
      link.href = `#game-review/${game.id}`;
      heading.append(link);
      const { date, white, black, hasEndMarker } = game.metadata;
      const { cpu } = game;
      const result = cpu ? cpuHistoryResult(game) : resultText(game.metadata);
      item.append(heading);
      item.append(element('p', { cpu: 'Rookori CPU対戦', lichess: 'Lichess', manual: '手動取り込み' }[origin(game)]));
      if (cpu) {
        const mode = cpu.continued ? types.continued : cpu.resumes && cpu.settings.mode === 'match' ? types.resumed : cpuLabels[cpu.settings.mode];
        item.append(element('p', `${mode} ／ ${cpuLabels[cpu.player]} ／ ${cpu.continued ? '時間無制限' : cpuTimeLabel(cpu.settings)}`));
      } else item.append(element('p', `白：${white ?? '記録なし'} ／ 黒：${black ?? '記録なし'}`));
      const playedAt = cpu ? new Date(cpu.started).toLocaleString('ja-JP')
        : game.source?.date ? new Date(game.source.date).toLocaleString('ja-JP') : date ?? '記録なし';
      item.append(element('p', `${playedAt} ／ ${result}${cpu ? '（' + cpuReasons[cpu.reason] + '）' : ''} ／ ${game.positions.length - 1}手 ／ メモ ${game.notes.length}件`));
      if (!hasEndMarker) item.append(element('p', '対局の終わりを示す記号のない棋譜'));
      const actions = element('div', null, 'study-mode-links');
      const review = element('a', '対局を復習する', 'text-button');
      review.href = `#game-review/${game.id}`;
      const exportPgn = element('button', 'PGNを保存', 'text-button');
      exportPgn.type = 'button';
      exportPgn.addEventListener('click', () => download(`rookori-${game.id}.pgn`, game.pgn, 'application/x-chess-pgn'));
      const remove = element('button', '削除', 'text-button');
      remove.type = 'button';
      remove.addEventListener('click', async () => {
        if (!window.confirm('この対局とメモを履歴から削除しますか？')) return;
        remove.disabled = true;
        try {
          await library.remove(game.id);
          if (activeHistory(page)) {
            page.games = page.games.filter(record => record.id !== game.id);
            renderHistory(page);
            byId('game-history-action').textContent = '対局を削除しました。';
          }
        } catch {
          if (activeHistory(page)) byId('game-history-action').textContent = '対局を削除できませんでした。';
          remove.disabled = false;
        }
      });
      actions.append(review);
      if (game.source?.provider === 'lichess' && lichessGameId.test(game.source.id)) {
        const sourceLink = element('a', 'Lichessで対局を開く', 'text-button');
        sourceLink.href = lichessGameUrl(game.source.id);
        sourceLink.target = '_blank';
        sourceLink.rel = 'noopener noreferrer';
        actions.append(sourceLink);
      }
      if (cpu) {
        const replay = element('button', '同じ設定で対局', 'text-button');
        replay.type = 'button';
        replay.addEventListener('click', () => goTo('cpu', {
          cpuReplay: cpu.continued ? { ...cpu.settings, time: 'unlimited' } : cpu.settings,
        }));
        actions.append(replay);
      }
      if (game.notes.length) {
        const notes = element('details');
        notes.append(element('summary', '棋譜メモを確認・編集'));
        const list = element('ul');
        for (const note of game.notes) {
          const point = element('li');
          const edit = element('button', moveLabel(game.positions[note.ply]) + 'のメモを開く', 'text-button');
          edit.type = 'button';
          edit.addEventListener('click', () => goTo(`game-review/${game.id}`, { gamePly: note.ply }));
          point.append(element('p', note.text || '（局面のみ保存）'), edit);
          list.append(point);
        }
        notes.append(list);
        item.append(notes);
      }
      actions.append(exportPgn, remove);
      item.append(actions);
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

  function resetHistoryPage() {
    if (!historyPage?.games) return;
    historyPage.index = 0;
    renderHistory(historyPage);
  }
  byId('game-search').addEventListener('input', resetHistoryPage);
  byId('game-history-mode').addEventListener('change', resetHistoryPage);
  byId('game-history-source').addEventListener('change', resetHistoryPage);
  byId('game-history-prev').addEventListener('click', () => { historyPage.index--; renderHistory(historyPage); });
  byId('game-history-next').addEventListener('click', () => { historyPage.index++; renderHistory(historyPage); });
  byId('game-export-library').addEventListener('click', async () => {
    const page = historyPage;
    const status = byId('game-backup-status');
    try {
      const backup = makeGameBackup(await library.all());
      if (!activeHistory(page)) return;
      download('rookori-game-library.json', JSON.stringify(backup, null, 2), 'application/json');
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
      historyPage = { index: 0 };
      byId('game-library-status').textContent = '対局履歴を読み込んでいます。';
      byId('game-backup-status').textContent = '';
      byId('game-history-action').textContent = '';
      byId('game-history-counts').textContent = '';
      byId('game-history-pages').hidden = true;
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

  return { open, openSavedOrPreview, saveCpu: (game, id) => library.save(game, undefined, id),
    saveExternal: library.saveExternal, lichessIds: library.lichessIds };
})();

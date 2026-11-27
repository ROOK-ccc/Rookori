const generalPractice = (() => {
  const node = id => byId('general-' + id);
  const store = createPersonalStore();
  let active, serial = 0, browseSerial = 0, batchIndex = 0, dailySerial = 0;
  const routeLink = (label, route) => Object.assign(element('a', label, 'button secondary'), { href: '#' + route });
  const rowOf = puzzle => ({ id: puzzle[0], type: 'general', tags: puzzle[4], rating: puzzle[3] });
  const status = text => { node('feedback').textContent = text; };
  const savedIds = () => {
    const saved = personalPreference(practiceSavedKey, []);
    return new Set(Array.isArray(saved) ? saved : []);
  };
  const uiBoard = createChessBoard(node('board'), node('promotion'), {
    position: () => ({ game: active.board, lastMove: active.last, legalMoves: square => active.board.moves({ square, verbose: true }) }),
    isFlipped: () => active.side === 'b', canPlay: () => Boolean(active && !active.done),
    hints: () => active?.hintSquare ? [active.hintSquare] : [], feedback: status,
    play(from, to, promotion) {
      if (!active || active.done) return false;
      const { board, tags } = active;
      const code = from + to + (promotion ?? '');
      const moves = active.ply === 0 ? active.lines.find(line => line[0] === code) ?? active.moves : active.moves;
      const move = studyPlay(board, code);
      const mateAlternative = moves.length === 1 && tags.includes('mateIn1') && board.isCheckmate();
      if (code !== moves[active.ply] && !mateAlternative) {
        board.undo();
        active.hintSquare = '';
        if (!active.attemptRecorded) {
          active.attemptRecorded = generalRecord(active.id, false, active.hints);
          if (!active.attemptRecorded) { status('記録を保存できませんでした。もう一度、相手の応手を考えましょう。'); return false; }
        }
        status('別の手を考えてみましょう。相手がどう応じるかが手がかりです。');
        return false;
      }
      active.last = move;
      active.moves = moves;
      active.played.push(move.san);
      active.ply++;
      active.hintSquare = '';
      if (active.ply < moves.length) {
        active.last = studyPlay(board, moves[active.ply++]);
        active.played.push(active.last.san);
        status(`${move.san}。相手は ${active.last.san} と応じました。`);
      } else {
        active.done = true;
        if (!generalRecord(active.id, true, active.hints)) status('正解です。学習記録を保存できませんでした。');
        else status('手順を解き終えました。次の復習予定を記録しました。');
        rookoriAnalytics.event('general_practice_complete');
        updateDailyCompletion();
        const theme = tags.find(tag => practiceThemes[tag]?.[1]);
        node('explanation').replaceChildren(element('p', '確認した手順 ' + active.played.join(' ')),
          ...(theme ? [element('p', 'テーマの解説 ' + practiceThemes[theme][1])] : []));
        if (active.edit?.explanation) node('explanation').append(element('p', active.edit.explanation));
        if (active.edit?.source) node('explanation').append(element('p', '出典 ' + active.edit.source));
        if (mateAlternative && code !== moves[0]) {
          node('explanation').append(element('p', 'この手もチェックメイトなので正解です。'));
        }
        node('hint').disabled = true;
        node('next-daily').hidden = !active.daily;
      }
      return true;
    },
    onMove() { uiBoard.render(); },
  });

  function close() { serial++; active = null; uiBoard.close(); }

  async function open(route) {
    close();
    const request = serial;
    showScreen('general-play', 'general-play-title');
    node('play-layout').hidden = true;
    node('load-status').textContent = '問題を読み込んでいます…';
    try {
      const row = await generalFind(route.generalId);
      if (serial !== request) return;
      if (!row) { node('load-status').textContent = 'この問題は現在の教材にありません。'; return; }
      const [id, fen, moves, rating, tags, edit] = row;
      const board = new chessRules.Chess(fen);
      active = { id, moves, tags, board, side: board.turn(), ply: 0, hints: 0, played: [],
        lines: [moves, ...(edit?.alternatives ?? [])], daily: route.generalDaily, edit };
      node('prompt').textContent = edit?.prompt || chessColorNames[active.side] + '番です。次の一手を考えましょう。';
      node('rating').textContent = '問題レート ' + rating;
      node('load-status').textContent = '';
      node('play-layout').hidden = false;
      node('hint').disabled = false;
      node('save').setAttribute('aria-pressed', String(savedIds().has(id)));
      node('next-daily').hidden = true;
      node('explanation').replaceChildren();
      status('');
      uiBoard.reset();
      uiBoard.render();
      rookoriAnalytics.event('general_practice_start');
      if (route.generalRecommended) rookoriAnalytics.event('practice_recommendation_start');
    } catch { if (serial === request) node('load-status').textContent = '問題を読み込めませんでした。接続を確認し、ページを開き直してください。'; }
  }

  node('hint').addEventListener('click', () => {
    if (!active || active.done) return;
    active.hints++;
    const expected = active.moves[active.ply];
    active.hintSquare = active.hints % 2 ? expected.slice(0, 2) : expected.slice(2, 4);
    status(active.edit?.hint || '盤上の印を手がかりにしてください。');
    uiBoard.render();
  });
  node('next-daily').addEventListener('click', async () => {
    const owner = active;
    if (!owner) return;
    const next = await nextDaily(owner.id);
    if (active === owner) goTo(next);
  });
  node('save').addEventListener('click', () => {
    if (!active) return;
    const saved = savedIds(), remove = saved.has(active.id);
    if (remove) saved.delete(active.id);
    else saved.add(active.id);
    if (!savePersonalPreference(practiceSavedKey, [...saved])) { status('保存できませんでした。'); return; }
    node('save').setAttribute('aria-pressed', String(!remove));
    status(remove ? 'あとで解く問題から外しました。' : 'あとで解く問題に追加しました。');
  });

  async function browse(reset = true) {
    const request = ++browseSerial;
    if (reset) batchIndex = 0;
    const band = node('level').value, theme = node('theme').value;
    const list = node('list'), history = generalHistory(), saved = savedIds();
    const matches = id => theme === 'due' ? history[id]?.due <= localDay() : saved.has(id);
    list.replaceChildren();
    node('more').hidden = node('previous').hidden = true;
    node('status').textContent = '読み込み中…';
    node('theme-help').textContent = practiceThemes[theme]?.[1] ?? '';
    try {
      const catalog = await generalCatalog();
      const batches = Object.keys(catalog.batches).filter(id => id.startsWith(band + '-') &&
        (theme === 'all' || (['due', 'saved'].includes(theme) ? catalog.batches[id].ids.some(matches)
          : catalog.batches[id].themes.includes(theme))));
      const batch = batches[batchIndex];
      const rows = (await generalBatch(batch ?? '', catalog)).filter(row =>
        theme === 'all' || (['due', 'saved'].includes(theme) ? matches(row[0]) : row[4].includes(theme)));
      if (request !== browseSerial) return;
      list.replaceChildren(...rows.map(row => {
        const item = element('li');
        item.append(setRowAction(routeLink(`${row[5]?.title || '問題 ' + row[0]} · 問題レート ${row[3]}`, 'general/' + row[0])));
        return item;
      }));
      node('status').textContent = rows.length ? `${practiceLevels[band]} · ${rows.length}問（${batchIndex + 1} / ${batches.length}ページ）` : 'このページに該当する問題はありません。';
      node('more').hidden = batchIndex + 1 >= batches.length;
      node('previous').hidden = batchIndex === 0;
    } catch { if (request === browseSerial) node('status').textContent = '問題を読み込めませんでした。「再読み込み」をお試しください。'; }
  }
  for (const [label, tags] of practiceThemeGroups) {
    const group = element('optgroup');
    group.label = label;
    group.append(...tags.map(tag => new Option(practiceThemes[tag][0], tag)));
    node('theme').append(group);
  }
  node('theme').addEventListener('change', () => browse());
  node('level').addEventListener('change', () => browse());
  node('reload').addEventListener('click', () => browse(false));
  node('more').addEventListener('click', () => { batchIndex++; browse(false); });
  node('previous').addEventListener('click', () => { batchIndex--; browse(false); });
  function openList(theme) {
    node('theme').value = Object.hasOwn(practiceThemes, theme) || ['due', 'saved'].includes(theme) ? theme : 'all';
    showScreen('general', 'general-title');
    browse();
  }

  async function pool(personal, history) {
    const catalog = await generalCatalog();
    const savedIds = new Set(Object.keys(history));
    const recentIds = Object.keys(history).sort((a, b) => history[b].lastAt.localeCompare(history[a].lastAt)).slice(0, 36);
    const lookup = new Map(Object.entries(catalog.batches).flatMap(([key, batch]) => batch.ids.map(id => [id, key])));
    const dueIds = Object.keys(history).filter(id => history[id].due <= localDay() && history[id].reviewedDay !== localDay())
      .sort((a, b) => history[a].due.localeCompare(history[b].due)).slice(0, 10);
    const known = [...new Set(recentIds.map(id => lookup.get(id)).filter(Boolean))].slice(0, 3);
    const dueBatches = [...new Set(dueIds.map(id => lookup.get(id)).filter(Boolean))].slice(0, 2);
    const recent = await Promise.all(known.slice(0, 4).map(key => generalBatch(key, catalog)));
    const experienced = savedIds.size >= 10;
    const seen = recent.flat().map(row => ({ tags: row[4], history: history[row[0]] }));
    const [evidence] = practiceEvidence(personal, seen);
    const band = experienced && Object.values(history).filter(row => row.first?.correct && !row.first.hints).length >= 7 ? 1 : 0;
    const keys = Object.keys(catalog.batches).filter(key => key.startsWith(band + '-'));
    const candidates = evidence ? keys.filter(key => catalog.batches[key].themes.includes(evidence.tag)) : keys;
    const start = Number(localDay().replaceAll('-', '')) % keys.length;
    const raw = await Promise.all([...new Set([keys[start], candidates[start % candidates.length], ...known, ...dueBatches].filter(Boolean))]
      .map(key => generalBatch(key, catalog)));
    return { rows: raw.flat().map(rowOf), evidence };
  }

  function dailyState() {
    const ledger = personalPreference(practiceDailyKey, {});
    const day = localDay();
    return ledger.day === day && validPracticeDaily(ledger) ? ledger : { day, menus: {}, complete: false };
  }
  const done = (row, personal, history, day) => row.type === 'personal'
    ? personal.find(entry => entry.question.id === row.id)?.history?.events.some(event => event.day === day && event.kind === 'good')
    : history[row.id]?.events.some(event => event.day === day && event.kind === 'good');

  async function curriculum(mode, personal, history) {
    const ledger = dailyState();
    if (ledger.menus[mode]) {
      const personalIds = new Set(personal.map(row => row.question.id));
      const saved = ledger.menus[mode].filter(row => row.type !== 'personal' || personalIds.has(row.id));
      if (saved.length === ledger.menus[mode].length) return saved;
    }
    const content = mode === 'personal' ? { rows: [] } : await pool(personal, history);
    const menu = buildPracticeMenu(personal, content.rows, history, content.evidence?.tag, mode);
    const latest = dailyState();
    latest.menus[mode] = menu;
    savePersonalPreference(practiceDailyKey, latest);
    return menu;
  }

  async function updateDailyCompletion() {
    const ledger = dailyState();
    if (ledger.complete) return;
    const personal = await store.all().catch(() => []);
    const history = generalHistory();
    if (!Object.values(ledger.menus).some(menu => menu.length === 10 && menu.every(row => done(row, personal, history, ledger.day)))) return;
    const latest = dailyState();
    if (latest.complete || latest.day !== ledger.day) return;
    latest.complete = true;
    savePersonalPreference(practiceDailyKey, latest);
    rookoriAnalytics.event('daily_practice_complete');
  }

  async function daily() {
    const request = ++dailySerial;
    const mode = byId('personal-daily-mode').value;
    try {
      const personal = await store.all().catch(() => []);
      const history = generalHistory(), day = localDay();
      const menu = await curriculum(mode, personal, history);
      if (request !== dailySerial || displayedRoute?.path !== 'daily') return;
      const solved = menu.filter(row => done(row, personal, history, day)).length;
      byId('daily-status').textContent = menu.length ? `${solved} / ${menu.length}問 正解済み · 個別 ${menu.filter(row => row.type === 'personal').length}問`
        : '今日取り組める専用問題がありません。終了した対局から追加できます。';
      byId('daily-list').replaceChildren(...menu.map((row, index) => {
        const item = element('li');
        const type = row.type === 'personal' ? '専用問題' : '一般問題';
        const reason = row.reason === '一般練習' || row.reason === '自分の対局' ? '' : ' · ' + row.reason;
        item.append(setRowAction(routeLink(type + ' ' + (index + 1) + reason, dailyRoute(row))));
        if (done(row, personal, history, day)) item.append(element('span', '正解済み', 'learning-done'));
        return item;
      }));
    } catch {
      if (request === dailySerial && displayedRoute?.path === 'daily') {
        byId('daily-status').textContent += ' 一般問題が読み込めないため、端末内の教材を表示しています。';
        if (mode === 'personal') byId('daily-list').replaceChildren();
      }
    }
  }

  function dailySummary(mode, personal, history) {
    const ledger = dailyState();
    const menu = ledger.menus[mode];
    return menu?.length ? [menu.filter(row => done(row, personal, history, ledger.day)).length, menu.length] : null;
  }

  async function nextDaily(id) {
    const ledger = dailyState(), history = generalHistory();
    const menu = ledger.menus[byId('personal-daily-mode').value] ?? [];
    const personal = await store.all().catch(() => []);
    const row = menu.find(row => row.id !== id && !done(row, personal, history, ledger.day));
    return row ? dailyRoute(row) : 'daily';
  }

  function dailyRoute(row) {
    return row.type === 'personal' ? 'personal/' + row.id + '/daily'
      : 'general/' + row.id + (row.reason.startsWith('おすすめ') ? '/daily-recommended' : '/daily');
  }

  return { open, close, openList, daily, pool, updateDailyCompletion, dailySummary, nextDaily };
})();

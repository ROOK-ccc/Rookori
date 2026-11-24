const personalPages = (() => {
  const store = createPersonalStore();
  const library = createGameLibrary();
  const el = suffix => byId(suffix ? 'personal-' + suffix : 'personal');
  let view, request = 0, dailyRequest = 0, listRequest = 0;
  const feedback = text => { el('feedback').textContent = text; };
  const action = (text, listener, className = 'text-button') => {
    const button = element('button', text, className);
    button.type = 'button';
    button.addEventListener('click', listener);
    return button;
  };
  const link = (text, hash) => {
    const node = element('a', text, 'text-button');
    node.href = hash;
    return node;
  };

  function playable() { return Boolean(view && !view.job && (view.phase === 'ask' || view.phase === 'explore')); }

  const board = createChessBoard(el('board'), el('promotion'), {
    position: () => ({ game: view.board, lastMove: view.last, legalMoves: square => view.board.moves({ square, verbose: true }) }),
    isFlipped: () => view.question.side === 'b', canPlay: playable, feedback,
    hints: () => view.phase !== 'ask' || !view.hints ? [] : [view.question.best.slice(0, view.hints === 1 ? 2 : 4)],
    play(from, to, promotion) {
      const code = from + to + (promotion ?? '');
      try { view.last = studyPlay(view.board, code); } catch { feedback('その手は指せません。'); return false; }
      if (view.phase === 'ask') answer(view, code, view.last.san);
      return true;
    },
    onMove() { renderBoard(); },
  });

  function renderBoard() {
    if (!view) return;
    board.render();
    el('turn').textContent = `自分の駒は${chessColorNames[view.question.side]} · ${chessColorNames[view.board.turn()]}の手番`;
    el('hint').disabled = view.phase !== 'ask' || view.hints >= 2;
    el('skip').hidden = view.phase !== 'ask';
    el('stop-answer').hidden = !view.job;
  }

  function cancelJob() {
    const work = view?.job;
    if (!work) return;
    view.job = null;
    work.close();
  }

  function close() {
    request++;
    cancelJob();
    view = null;
    board.close();
  }

  function showAnswer(owner, code, san, verdict, evaluated) {
    if (view !== owner) return;
    const question = owner.question;
    owner.phase = 'answer';
    owner.linePly = 0;
    const best = question.candidates.find(line => line.move === question.best);
    const alternatives = question.candidates.filter(line => line.move !== question.best && question.accepted.includes(line.move));
    el('answer').hidden = false;
    el('verdict').textContent = verdict ? personalVerdicts[verdict] : '推奨手を確認する';
    el('answer-move').textContent = code ? `今回の手 ${san}` : '今回はスキップしました。';
    el('answer-best').textContent = `登録時の推奨手 ${best.san[0]}${alternatives.length ? ' · 別の正解候補 ' + alternatives.map(line => line.san[0]).join('、') : ''}`;
    const compared = evaluated?.baseline ?? best;
    el('answer-score').textContent = `評価値（白基準） ${evaluated?.baseline ? '再解析の推奨手' : '登録時の推奨手'} ${studyScoreText(compared.score)}`
      + (evaluated?.line ? ` ／ 今回の手 ${studyScoreText(evaluated.line.score)}` : '');
    el('answer-explanation').textContent = question.text;
    const old = question.actual && studyPlay(new chessRules.Chess(question.fen), question.actual).san;
    el('answer-actual').textContent = old ? `実戦で指した手 ${old}${question.actualScore ? ' · ' + studyScoreText(question.actualScore) : ''}` : '';
    el('line-note').textContent = verdict === 'hold' ? '比較に必要な精度がそろわなかったため、学習結果には記録しません。' : '';
    el('line').textContent = '推奨手の続きを見る';
    el('line').disabled = !best.pv.length;
    el('play-status').textContent = '';
    renderBoard();
  }

  async function answer(owner, code, san) {
    owner.phase = 'checking';
    const question = owner.question;
    const best = question.candidates.find(line => line.move === question.best);
    const existing = question.candidates.find(line => line.move === code);
    let evaluated = existing ? { line: existing } : owner.cache.get(code);
    let verdict = question.accepted.includes(code) ? 'good' : personalCompare(best, existing, question.side).kind;
    if (!existing && !evaluated) {
      const work = owner.job = createStockfishSession();
      el('play-status').textContent = '選んだ手をStockfishで確認しています…';
      try {
        const original = new chessRules.Chess(question.fen);
        const position = { fen: question.initialFen, moves: question.moves };
        await work.start();
        if (owner.job !== work || view !== owner) return;
        const baseline = await personalEvaluate(work, position, original);
        if (owner.job !== work || view !== owner) return;
        const line = baseline?.move === code ? baseline : await personalEvaluate(work, position, original, code);
        if (owner.job !== work || view !== owner) return;
        evaluated = { baseline, line };
        owner.cache.set(code, evaluated);
        if (owner.cache.size > 24) owner.cache.delete(owner.cache.keys().next().value);
      } catch { /* An engine failure is an ungraded answer. */ }
      finally { if (owner.job === work) { owner.job = null; work.close(); } }
    }
    if (view !== owner) return;
    if (!existing && evaluated) verdict = personalCompare(evaluated.baseline, evaluated.line, question.side).kind;
    showAnswer(owner, code, san, verdict, evaluated);
    if (verdict !== 'hold') {
      try { await store.answer(question.id, verdict, owner.hints); }
      catch { if (view === owner) el('play-status').textContent = '学習記録を保存できませんでした。'; }
    }
  }

  function restart() {
    if (!view) return;
    cancelJob();
    view.phase = 'ask';
    view.board = new chessRules.Chess(view.question.fen);
    view.last = null;
    view.linePly = 0;
    view.hints = 0;
    el('play-status').textContent = '以前の対局に出てきた局面です。次にどの手を指しますか？';
    el('answer').hidden = true;
    board.reset();
    renderBoard();
  }

  function practiceHref(id, daily = false) { return `#personal/${id}${daily ? '/daily' : ''}`; }

  async function openProblem(route) {
    close();
    const token = request;
    showScreen('personal-play', 'personal-play-title');
    el('play-layout').hidden = true;
    el('play-status').textContent = '問題を開いています…';
    try {
      const rows = await store.all();
      if (token !== request) return;
      const found = rows.find(({ question }) => question.id === route.personalId);
      if (!found) { el('play-status').textContent = '問題が見つかりません。登録済みの問題一覧をご確認ください。'; return; }
      view = { question: found.question, rows, daily: route.personalDaily, cache: new Map() };
      const owner = view;
      el('original').hidden = true;
      el('play-layout').hidden = false;
      restart();
      if (owner.question.gameId && await library.get(owner.question.gameId) && view === owner) el('original').hidden = false;
    } catch { if (token === request) el('play-status').textContent = '練習問題を読み込めませんでした。'; }
  }

  el('hint').addEventListener('click', () => {
    if (!view || view.phase !== 'ask' || view.hints >= 2) return;
    view.hints++;
    feedback(view.hints === 1 ? '動かす駒に印を付けました。' : '移動先にも印を付けました。');
    renderBoard();
  });
  el('skip').addEventListener('click', () => { if (view?.phase === 'ask') showAnswer(view); });
  el('stop-answer').addEventListener('click', restart);
  el('retry').addEventListener('click', restart);
  el('line').addEventListener('click', () => {
    const { question } = view;
    const best = question.candidates.find(line => line.move === question.best);
    view.phase = 'line';
    view.linePly = view.linePly >= best.pv.length ? 1 : view.linePly + 1;
    view.board = new chessRules.Chess(question.fen);
    for (const code of best.pv.slice(0, view.linePly)) view.last = studyPlay(view.board, code);
    el('line-note').textContent = `${view.linePly} / ${best.pv.length}手　${best.san.slice(0, view.linePly).join(' ')}`;
    el('line').textContent = view.linePly >= best.pv.length ? '推奨手を最初から見る' : '推奨変化を1手進める';
    renderBoard();
  });
  el('explore').addEventListener('click', () => {
    view.phase = 'explore';
    view.board = new chessRules.Chess(view.question.fen);
    view.last = null;
    view.linePly = 0;
    el('line-note').textContent = '自由検討中です。白と黒の手を盤で試せます。';
    board.reset();
    renderBoard();
  });
  el('original').addEventListener('click', () => {
    const { gameId, ply } = view.question;
    goTo(`game-review/${gameId}`, { gamePly: ply });
  });
  el('cpu').addEventListener('click', () => {
    const { fen, initialFen, moves, gameId, ply, side } = view.question;
    goTo('cpu', { cpuPosition: { fen, initialFen, moves, gameId, ply, color: side } });
  });
  el('next').addEventListener('click', async () => {
    const owner = view;
    try {
      const rows = await store.all();
      if (view !== owner) return;
      const pool = owner.daily ? personalDailyRows(rows, el('daily-mode').value).filter(({ history }) => history?.reviewedDay !== localDay()) : personalDue(rows);
      const next = pool.find(({ question }) => question.id !== owner.question.id);
      goTo(next ? practiceHref(next.question.id, owner.daily).slice(1) : owner.daily ? 'daily' : 'personal');
    } catch { if (view === owner) el('play-status').textContent = '次の問題を開けませんでした。'; }
  });
  window.addEventListener('pagehide', close);
  window.addEventListener('pageshow', event => {
    if (event.persisted && displayedRoute?.personalId) openProblem(displayedRoute);
  });

  function personalDailyRows(rows, mode) {
    if (mode === 'general') return [];
    const day = localDay();
    const completed = rows.filter(({ history }) => history?.reviewedDay === day)
      .sort((a, b) => a.history.lastAt.localeCompare(b.history.lastAt));
    return [...completed, ...personalDue(rows, day)].slice(0, mode === 'personal' ? 10 : 4);
  }

  function trends(rows) {
    const categories = new Map();
    for (const { question, history } of rows) for (const tag of question.tags) {
      const group = categories.get(tag) ?? { tag, games: new Set(), count: 0, correct: 0, wrong: 0, hints: 0 };
      const game = question.sourceKey ?? question.gameId;
      if (game && ((question.loss ?? 0) >= personalRules.meaningful || (tag === 'mate' && question.actual && !question.accepted.includes(question.actual)))) group.games.add(game);
      if (history) { group.count++; group.correct += history.correct; group.wrong += history.wrong; group.hints += history.hints; }
      categories.set(tag, group);
    }
    const groups = [...categories.values()];
    return { games: groups.filter(group => group.games.size >= 3).sort((a, b) => b.games.size - a.games.size),
      practice: groups.filter(group => group.count >= 3 && group.correct + group.wrong >= 5)
        .sort((a, b) => rate(a) - rate(b)) };
  }
  const rate = group => group.correct / (group.correct + group.wrong);
  const learned = history => Boolean(history?.level >= reviewIntervals.length - 1);

  async function list() {
    const token = ++listRequest;
    if (el('').hidden) return;
    try {
      const rows = (await store.all()).sort((a, b) => b.question.created.localeCompare(a.question.created));
      if (token !== listRequest || el('').hidden) return;
      const due = personalDue(rows);
      const dueIds = new Set(due.map(({ question }) => question.id));
      el('counts').textContent = `今日の復習 ${due.length}問 ／ 登録 ${rows.length}問 ／ 習得済み ${rows.filter(({ history }) => learned(history)).length}問`;
      el('start').hidden = !due.length;
      if (due.length) el('start').href = practiceHref(due[0].question.id);
      el('empty').hidden = Boolean(rows.length);
      const insight = trends(rows);
      el('analysis-trend').textContent = insight.games.length ? '対局から登録した改善候補（3局以上）　' + insight.games.map(group => `${personalTags[group.tag]} ${group.games.size}局`).join('、') + '。相手の応手まで盤で確かめてみましょう。'
        : '対局での傾向を示すには、まだ十分なデータがありません。';
      el('learning-trend').textContent = insight.practice.length ? '復習での正答率・ヒント利用　' + insight.practice.map(group =>
        `${personalTags[group.tag]} ${Math.round(rate(group) * 100)}%（${group.correct + group.wrong}回、ヒント ${group.hints}回）`).join('、') + '。'
        : '問題演習での傾向を示すには、まだ十分なデータがありません。';
      const repeated = rows.filter(({ history }) => history?.wrong >= 2);
      el('learning-trend').textContent += repeated.length ? ` 再挑戦が2回以上の問題は${repeated.length}問です。` : '';
      const events = rows.flatMap(({ question, history }) => (history?.events ?? []).map(event => ({ question, event })))
        .sort((a, b) => b.event.at.localeCompare(a.event.at)).slice(0, 12);
      el('recent-history').replaceChildren(...(events.length ? events.map(({ question, event }) => element('li',
        `${event.day} · ${personalTags[question.tags[0]]} · ${personalVerdicts[event.kind]}${event.hints ? '（ヒントあり）' : ''}`)) : [element('li', '学習履歴はまだありません。')]));
      const status = el('filter').value, tag = el('tag').value, source = el('source').value;
      const filtered = rows.filter(({ question, history }) => (source === 'all' || question.source === source)
        && (tag === 'all' || question.tags.includes(tag)) && (status === 'all' || (status === 'due' && dueIds.has(question.id))
          || (status === 'new' && !history) || (status === 'learning' && history && !learned(history)) || (status === 'mastered' && learned(history))));
      el('list').replaceChildren(...filtered.map(({ question, history }) => {
        const li = element('li', null, 'game-card');
        const details = element('details');
        const note = element('textarea');
        note.maxLength = 1000;
        note.rows = 2;
        note.value = question.memo;
        const label = element('label', 'この問題のメモ');
        label.append(note);
        const feedback = element('p');
        feedback.setAttribute('role', 'status');
        details.append(element('summary', '詳細・メモ'), element('p', `${question.ply}手の直後 · 復習予定 ${history?.due ?? '未学習'} · ${question.sourceDate ?? question.created.slice(0, 10)}`),
          label, action('メモを保存', async () => {
            try { await store.memo(question.id, note.value.trim()); feedback.textContent = '保存しました。'; }
            catch { feedback.textContent = 'メモを保存できませんでした。'; }
          }), feedback);
        li.append(element('h3', question.tags.map(key => personalTags[key]).join('、')),
          element('p', `${personalSources[question.source]} · ${chessColorNames[question.side]}番 · ${learned(history) ? '習得済み' : history ? '学習中' : '未学習'}`),
          link('この問題を解く', practiceHref(question.id)), details,
          action('問題を削除', async () => {
            if (!window.confirm('この問題と、その問題の学習記録を削除しますか？')) return;
            try { await store.remove(question.id); list(); }
            catch { feedback.textContent = '削除できませんでした。'; details.open = true; }
          }));
        return li;
      }));
      if (rows.length && !filtered.length) el('list').append(element('li', 'この条件に当てはまる問題はありません。'));
    } catch { if (token === listRequest) el('counts').textContent = '保存した問題を読み込めませんでした。'; }
  }

  for (const [key, names] of [['tag', personalTags], ['source', personalSources]]) {
    for (const [value, text] of Object.entries(names)) {
      const option = element('option', text);
      option.value = value;
      el(key).append(option);
    }
  }
  for (const name of ['filter', 'tag', 'source']) el(name).addEventListener('change', list);
  el('auto').checked = personalPreference(personalAutoKey, false) === true;
  el('auto').addEventListener('change', () => {
    if (!savePersonalPreference(personalAutoKey, el('auto').checked)) {
      el('auto').checked = !el('auto').checked;
      el('counts').textContent = '自動追加の設定を保存できませんでした。';
    }
  });

  function openList() {
    showScreen('personal', 'personal-title');
    list();
  }

  function daily() {
    const token = ++dailyRequest;
    const mode = el('daily-mode').value;
    if (mode === 'general') return;
    store.all().then(rows => {
      if (token !== dailyRequest || displayedRoute?.path !== 'daily') return;
      const featured = personalDailyRows(rows, mode);
      if (!featured.length && mode === 'recommended') return;
      const plan = learningTracker.day();
      const weak = new Set(trends(rows).practice.filter(group => rate(group) < .75).map(group => group.tag));
      const lessons = plan.questions.map(id => introLessons.find(lesson => lesson.id === id)).filter(Boolean);
      const intro = learningTracker.intro();
      const general = mode === 'personal' ? [] : personalGeneralQuestions(lessons, weak,
        lesson => !intro.completed.includes(lesson.id) && !intro.quiz[lesson.id] && !learningTracker.data.questions[lesson.id],
        10 - featured.length);
      const day = localDay();
      const solved = featured.filter(({ history }) => history?.events.some(event => event.day === day && event.kind === 'good')).length
        + general.filter(lesson => plan.checked.includes(lesson.id)).length;
      byId('daily-status').textContent = featured.length || general.length ? `${solved} / ${featured.length + general.length}問 正解済み · 個別 ${featured.length}問` : '今日は復習予定の個別問題がありません。';
      byId('daily-list').replaceChildren(...featured.map(({ question, history }) => {
        const li = element('li');
        li.append(link('自分の対局からの問題', practiceHref(question.id, true)));
        if (history?.reviewedDay === day) li.append(element('span', '復習済み', 'learning-done'));
        return li;
      }), ...general.map(lesson => {
        const li = element('li');
        li.append(link(lesson.title, '#lesson/' + lesson.id));
        if (plan.checked.includes(lesson.id)) li.append(element('span', '正解済み', 'learning-done'));
        return li;
      }));
    }).catch(() => { if (token === dailyRequest && displayedRoute?.path === 'daily') byId('daily-status').textContent += ' 個別問題は読み込めませんでした。'; });
  }
  const mode = personalPreference(personalDailyKey, 'recommended');
  el('daily-mode').value = ['recommended', 'general', 'personal'].includes(mode) ? mode : 'recommended';
  el('daily-mode').addEventListener('change', () => {
    savePersonalPreference(personalDailyKey, el('daily-mode').value);
    learningPages.daily();
  });

  function progress(screen) {
    const node = byId(`${screen}-personal-progress`);
    if (!node) return;
    node.hidden = true;
    store.all().then(rows => {
      const due = personalDue(rows).length;
      if (!rows.length || (screen === 'home' && !due)) return;
      const answered = rows.filter(({ history }) => history).length;
      const recent = rows.flatMap(({ history }) => history?.events ?? []).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 20);
      const clean = recent.filter(event => event.kind === 'good' && !event.hints).length;
      node.replaceChildren(element('p', screen === 'home' ? `自分の対局からの復習が${due}問あります。`
        : `今日の個別問題 ${due}問 · 復習した問題 ${answered}問 · 習得済み ${rows.filter(({ history }) => learned(history)).length}問`
          + (recent.length >= 5 ? ` · 最近${recent.length}回のヒントなし正解 ${Math.round(clean / recent.length * 100)}%` : '')),
      link('自分だけの練習問題', '#personal'));
      node.hidden = false;
    }).catch(() => {});
  }

  return { daily, openList, openProblem, close, progress };
})();

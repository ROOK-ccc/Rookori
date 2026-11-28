const personalPages = (() => {
  const store = createPersonalStore();
  const library = createGameLibrary();
  const el = suffix => byId(suffix ? 'personal-' + suffix : 'personal');
  let view, request = 0, dashboardRequest = 0, listRequest = 0;
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
    explanation: () => view?.diagram,
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
    const best = question.candidates.find(line => line.move === question.best);
    const alternatives = question.candidates.filter(line => line.move !== question.best && question.accepted.includes(line.move));
    practiceFeedback('personal-result-feedback', verdict ? { good: 'correct', close: 'wrong', retry: 'wrong', hold: 'hold' }[verdict] : null,
      verdict === 'close' ? '有力な手です。推奨手と比べてから再挑戦できます。'
        : verdict === 'retry' ? '同じ局面からもう一度試せます。' : '');
    el('answer').hidden = false;
    el('verdict').textContent = '手順と解説';
    el('retry').hidden = verdict === 'good';
    el('next').hidden = false;
    el('answer-move').textContent = code ? `今回の手 ${san}` : '今回はスキップしました。';
    el('answer-best').textContent = `登録時の推奨手 ${best.san[0]}${alternatives.length ? ' · 別の正解候補 ' + alternatives.map(line => line.san[0]).join('、') : ''}`;
    const compared = evaluated?.baseline ?? best;
    el('answer-score').textContent = `評価値（白基準） ${evaluated?.baseline ? '再解析の推奨手' : '登録時の推奨手'} ${studyScoreText(compared.score)}`
      + (evaluated?.line ? ` ／ 今回の手 ${studyScoreText(evaluated.line.score)}` : '');
    const lines = [{ label: '推奨手順', facts: practiceLineFacts(question.fen, best.pv) }];
    if (question.actual) lines.push({ label: '実戦手からの確認', facts: practiceLineFacts(question.fen, question.actualLine ?? [question.actual]) });
    for (const line of alternatives) lines.push({ label: '別解 ' + line.san[0], facts: practiceLineFacts(question.fen, line.pv) });
    showPracticeExplanation(el('answer-explanation'), el('replay'), lines, null, (step, marks) => {
      owner.phase = 'line';
      owner.board.load(step?.fen ?? question.fen);
      owner.last = step?.move;
      owner.diagram = step ? { move: step.move, marks } : null;
      renderBoard();
    });
    if (question.actual) {
      const reply = lines[1].facts.steps[1];
      if (reply?.move.captured && !lines[0].facts.steps[1]?.move.captured) {
        el('answer-explanation').append(chessTermText('p', `実戦手の変化では相手の ${reply.move.san} で${practicePieceNames[reply.move.captured]}を失います。次の実戦では、指す前に相手の取り返しを一手確認しましょう。`));
      } else if (!question.actualLine) {
        el('answer-explanation').append(element('p', 'この記録には実戦手に対する解析の続きが保存されていません。'));
      }
    }
    const old = question.actual && studyPlay(new chessRules.Chess(question.fen), question.actual).san;
    el('answer-actual').textContent = old ? `実戦で指した手 ${old}${question.actualScore ? ' · ' + studyScoreText(question.actualScore) : ''}` : '';
    el('comparison').replaceChildren(...[[question.actual, '実戦'], [question.best, '推奨手']].flatMap(([move, label]) => {
      if (!move) return [];
      const position = new chessRules.Chess(question.fen);
      const san = studyPlay(position, move).san;
      const figure = element('figure');
      const caption = element('figcaption', label + ' ');
      caption.append(chessGlossary.notationTrigger(san));
      figure.append(studyMiniature(position.fen()), caption);
      return [figure];
    }));
    const theme = question.tags.find(tag => practiceThemes[tag]?.[1]);
    el('related').hidden = !theme;
    if (theme) {
      el('related').href = '#general/theme/' + theme;
      el('related').textContent = '一般練習で学ぶ：' + practiceThemes[theme][0];
    }
    el('line-note').textContent = verdict === 'hold' ? '比較に必要な精度がそろわなかったため、学習結果には記録しません。' : '';
    el('play-status').textContent = '';
    renderBoard();
  }

  async function answer(owner, code, san) {
    owner.phase = 'checking';
    const question = owner.question;
    const best = question.candidates.find(line => line.move === question.best);
    const existing = question.candidates.find(line => line.move === code);
    const mate = view.board.isCheckmate();
    let evaluated = existing ? { line: existing } : owner.cache.get(code);
    let verdict = mate || question.accepted.includes(code) ? 'good' : personalCompare(best, existing, question.side).kind;
    if (!mate && !existing && !evaluated) {
      const work = owner.job = createStockfishSession();
      practiceFeedback('personal-result-feedback', 'checking');
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
    if (!mate && !existing && evaluated) verdict = personalCompare(evaluated.baseline, evaluated.line, question.side).kind;
    showAnswer(owner, code, san, verdict, evaluated);
    const correct = verdict === 'good';
    if (verdict !== 'hold' && !owner.completed && (correct || !owner.failed) && !owner.recording) {
      owner.recording = true;
      el('retry').disabled = true;
      try {
        const hints = owner.hints;
        await store.answer(question.id, verdict, hints);
        if (!correct) owner.failed = true;
        if (view === owner && correct) {
          rookoriAnalytics.event(owner.reviewing ? 'personal_review_complete' : 'personal_practice_complete');
          owner.completed = true;
        }
        generalPractice.updateDailyCompletion();
      }
      catch { if (view === owner) el('play-status').textContent = '学習記録を保存できませんでした。'; }
      finally { owner.recording = false; if (view === owner) el('retry').disabled = false; }
    }
  }

  function restart() {
    if (!view) return;
    cancelJob();
    view.phase = 'ask';
    view.board = new chessRules.Chess(view.question.fen);
    view.last = null;
    view.diagram = null;
    view.hints = 0;
    el('play-status').textContent = '以前の対局に出てきた局面です。次にどの手を指しますか？';
    el('answer').hidden = true;
    el('next').hidden = true;
    practiceFeedback('personal-result-feedback');
    el('replay').hidden = true;
    const question = view.question;
    el('play-source').textContent = [personalSources[question.source], question.sourceDate, `対局の${question.ply}手のあと`].filter(Boolean).join(' · ');
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
      view = { question: found.question, daily: route.personalDaily, reviewing: Boolean(found.history), cache: new Map() };
      const owner = view;
      el('original').hidden = true;
      el('play-layout').hidden = false;
      restart();
      rookoriAnalytics.event('personal_practice_start');
      const { gameId, sourceKey } = owner.question;
      let game = gameId ? await library.get(gameId).catch(() => null) : null;
      if (!game && sourceKey) {
        for (const candidate of await library.all().catch(() => [])) {
          if (view !== owner) return;
          if (candidate.positions[owner.question.ply]?.fen === owner.question.fen && await studyContentKey(candidate) === sourceKey) {
            game = candidate;
            break;
          }
        }
      }
      if (game && view === owner) {
        owner.originalGameId = game.id;
        const { white, black } = game.metadata;
        if (white && black) el('play-source').textContent += ` · ${white} 対 ${black}`;
        el('original').hidden = false;
      }
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
  el('retry').addEventListener('click', () => { if (!view?.recording) restart(); });
  el('explore').addEventListener('click', () => {
    view.phase = 'explore';
    view.board = new chessRules.Chess(view.question.fen);
    view.last = null;
    view.diagram = null;
    el('line-note').textContent = '自由検討中です。白と黒の手を盤で試せます。';
    board.reset();
    renderBoard();
  });
  el('original').addEventListener('click', () => {
    if (view?.originalGameId) goTo(`game-review/${view.originalGameId}`, { gamePly: view.question.ply });
  });
  el('cpu').addEventListener('click', () => {
    const { fen, initialFen, moves, gameId, ply, side } = view.question;
    goTo('cpu', { cpuPosition: { fen, initialFen, moves, gameId, ply, color: side } });
  });
  el('next').addEventListener('click', async () => {
    const owner = view;
    if (!owner) return;
    try {
      if (owner.daily) {
        const next = await generalPractice.nextDaily(owner.question.id);
        if (view === owner) goTo(next);
        return;
      }
      const rows = await store.all();
      if (view !== owner) return;
      const next = personalDue(rows).find(({ question }) => question.id !== owner.question.id);
      goTo(next ? practiceHref(next.question.id).slice(1) : 'personal');
    } catch { if (view === owner) el('play-status').textContent = '次の問題を開けませんでした。'; }
  });
  window.addEventListener('pagehide', close);
  window.addEventListener('pageshow', event => {
    if (event.persisted && displayedRoute?.personalId) openProblem(displayedRoute);
  });

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
      const latest = rows[0]?.question;
      const recentCount = latest ? rows.filter(({ question }) => latest.sourceKey ? question.sourceKey === latest.sourceKey
        : latest.gameId && question.gameId === latest.gameId).length : 0;
      el('counts').textContent = rows.length ? `登録 ${rows.length}問 ／ 今日の復習 ${due.length}問 ／ 最後に登録した対局から ${recentCount || 1}問` : '';
      el('start').hidden = !due.length;
      if (due.length) el('start').href = practiceHref(due[0].question.id);
      else if (rows.length) { el('start').hidden = false; el('start').href = practiceHref(rows[0].question.id); }
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
    const loaded = store.all();
    loaded.then(rows => {
      const due = personalDue(rows).length;
      if (!rows.length || (screen === 'home' && !due)) return;
      const answered = rows.filter(({ history }) => history).length;
      const recent = rows.flatMap(({ history }) => history?.events ?? []).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 20);
      const clean = recent.filter(event => event.kind === 'good' && !event.hints).length;
      const action = link('自分専用の練習問題', '#personal');
      if (screen !== 'progress') {
        node.replaceChildren(element('p', '自分の対局からの復習が' + due + '問あります。'), action);
      } else {
        const measures = element('dl', null, 'dashboard-metrics growth-metrics');
        const values = [['専用問題', rows.length + '問'], ['今日の復習', due + '問'], ['解いた問題', answered + '問'],
          ['習得済み', rows.filter(({ history }) => learned(history)).length + '問']];
        if (recent.length >= 5) values.push(['最近' + recent.length + '回のヒントなし正解', Math.round(clean / recent.length * 100) + '％']);
        for (const [label, value] of values) {
          const item = element('div');
          item.append(element('dt', label), element('dd', value));
          measures.append(item);
        }
        node.replaceChildren(measures, action);
      }
      node.hidden = false;
    }).catch(() => {});
    if (screen === 'progress') {
      const general = Object.values(generalHistory());
      byId('progress-general-metrics').textContent = general.length
        ? '一般練習で取り組んだ問題 ' + general.length + '問 ／ 復習予定 ' + general.filter(row => row.due <= localDay()).length + '問'
        : '一般練習の記録はまだありません。';
    }
    if (screen === 'dashboard') {
      loaded.then(personal => {
        const summary = generalPractice.dailySummary(el('daily-mode').value, personal, generalHistory());
        if (summary) byId('dashboard-solved').textContent = summary.join('/');
      }).catch(() => {});
    }
  }

  return { openList, openProblem, close, progress };
})();

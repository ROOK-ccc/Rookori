function studyMiniature(fen) {
  const board = element('div', null, 'study-mini-board');
  board.setAttribute('aria-hidden', 'true');
  const cells = new chessRules.Chess(fen).board().flat();
  for (const [i, piece] of cells.entries()) {
    const square = element('span', null, (i % 2 + Math.floor(i / 8)) % 2 ? 'study-mini-dark' : '');
    if (piece) {
      const img = element('img');
      img.src = `pieces/cburnett/${piece.color}${piece.type.toUpperCase()}.svg`;
      img.alt = '';
      square.append(img);
    }
    board.append(square);
  }
  return board;
}

function createGameStudyUI({ current, goToPly, repaint }) {
  const el = name => byId('game-study-' + name);
  const store = createStudyStore();
  const memory = new Map();
  const tabs = [...byId('review-tabs').querySelectorAll('[role="tab"]')];
  let view, record, key, branch, job, debounce, cachedPosition;
  let write = Promise.resolve();
  let loading = false;
  const personalStore = createPersonalStore();
  let pendingQuestions = [];
  const personalStatus = message => { byId('personal-generate-status').textContent = message; };

  function button(text, onClick, classes = 'text-button') {
    const node = element('button', text, classes);
    node.type = 'button';
    node.addEventListener('click', onClick);
    return node;
  }

  function note(text) { el('status').textContent = text; }

  function selectTab(name, focus = false) {
    for (const tab of tabs) {
      const selected = tab.id === 'review-tab-' + name;
      const panel = byId(tab.getAttribute('aria-controls'));
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panel.hidden = !selected;
      if (selected && focus) tab.focus({ preventScroll: true });
    }
    if (name === 'moves') {
      const list = byId('game-moves');
      const move = list.querySelector('[aria-current]');
      if (move) {
        const viewport = list.getBoundingClientRect();
        const position = move.getBoundingClientRect();
        if (position.top < viewport.top) list.scrollTop -= viewport.top - position.top;
        if (position.bottom > viewport.bottom) list.scrollTop += position.bottom - viewport.bottom;
      }
    }
  }
  function outputPosition() {
    cachedPosition ??= studyPosition(view.game, view.position.ply, branch ? branch.moves.slice(0, branch.step) : []);
    return cachedPosition;
  }
  function sourceColor(game) {
    return game.cpu?.player ?? (game.source?.color === 'white' ? 'w' : game.source?.color === 'black' ? 'b' : null);
  }
  function positionKey() {
    return view.position.ply + ':' + (branch?.moves.slice(0, branch.step).join(' ') ?? '');
  }

  function activeScore() {
    return branch?.step ? record?.single[positionKey()]?.value : studyTimelineScore(record, view.position.ply);
  }
  function canStartCpu() {
    if (!view || (!branch?.step && view.position.ply === view.game.positions.length - 1
      && ['1-0', '0-1', '1/2-1/2'].includes(view.game.metadata.result))) return false;
    return !outputPosition().ended;
  }
  function startCpu() {
    if (!canStartCpu()) return;
    const { game, fen, moves } = outputPosition();
    goTo('cpu', { cpuPosition: { fen: game.fen(), initialFen: fen, moves, gameId: view.game.id ?? null,
      ply: view.position.ply, color: sourceColor(view.game) } });
  }

  function persist() {
    if (!key) return;
    const snapshot = structuredClone({ ...record, gameId: view.game.id ?? null });
    const savedKey = key;
    const owner = view;
    memory.set(savedKey, snapshot);
    write = write.catch(() => {}).then(() => store.put(savedKey, snapshot)).catch(() => {
      if (view === owner) el('storage').textContent = 'このブラウザーに解析や変化を保存できませんでした。このタブ内では利用できます。';
    });
  }

  function stop(message) {
    clearTimeout(debounce);
    if (!job) return;
    const running = job;
    job = null;
    running.engine.close();
    if (running.mode === 'personal') byId('personal-generate-stop').hidden = true;
    if (running.mode === 'batch') persist();
    if (message) note(message);
  }

  function close() {
    stop();
    view = record = key = branch = cachedPosition = null;
    loading = false;
    pendingQuestions = [];
    byId('personal-candidate-list').replaceChildren();
    byId('personal-candidate-actions').hidden = true;
    personalStatus('');
  }

  async function open(next) {
    close();
    view = next;
    byId('personal-generated-first').hidden = true;
    byId('personal-generate-panel').open = false;
    const selected = personalPreference(styleOwnershipKey, {})[next.game.id];
    const known = ['w', 'b'].includes(selected) ? selected : personalSide(next.game);
    byId('personal-source-side').value = known ?? '';
    byId('personal-source-side').disabled = Boolean(known);
    byId('personal-ended-label').hidden = personalEligibility(next.game) !== 'confirm';
    byId('personal-ended').checked = false;
    record = { scores: [], single: {}, variations: [], version: null, mode: null, analyzed: null };
    el('auto').checked = false;
    el('storage').textContent = '';
    note('');
    el('analysis-mode').value = 'analysis-quick';
    el('highlights-section').hidden = true;
    el('highlights-empty').hidden = false;
    el('highlights').replaceChildren();
    selectTab('analysis');
    loading = true;
    try {
      const id = await studyContentKey(next.game);
      if (view !== next) return;
      key = id;
      updatePracticeCount(next, id);
      const saved = memory.get(id) ?? await store.get(id);
      if (view !== next) return;
      if (saved) {
        record.variations = studyVariations(next.game, saved.variations);
        if (Array.isArray(saved.scores)) {
          Object.assign(record, { scores: saved.scores.slice(0, next.game.positions.length),
            version: saved.version, mode: saved.mode, analyzed: saved.analyzed });
        }
        if (['analysis-quick', 'analysis-detail'].includes(record.mode)) el('analysis-mode').value = record.mode;
        if (saved.single && typeof saved.single === 'object') record.single = saved.single;
      }
    } catch {
      if (view === next) el('storage').textContent = 'この環境では解析と変化をブラウザーに保存できません。';
    } finally {
      if (view === next) {
        loading = false;
        if (next.position) { render(); highlights(); }
      }
    }
  }

  function changed() {
    if (!view) return;
    if (job?.mode === 'position') stop();
    clearTimeout(debounce);
    cachedPosition = null;
    if (!job) note('');
    render();
    if (el('auto').checked && !job && !activeScore()) debounce = setTimeout(() => analyzePosition(), 200);
  }

  function newBranch() {
    branch = { id: newCpuGameId(), name: '', ply: view.position.ply, moves: [], step: 0 };
    el('branch-name').value = '';
    selectTab('branch', true);
    changed();
    repaint();
  }

  function resetBranch() { branch = null; }

  function branchStep(step) {
    if (!branch) return;
    branch.step = Math.max(0, Math.min(branch.moves.length, step));
    changed();
    repaint();
  }

  function play(from, to, promotion) {
    if (!branch || branch.step >= 300) return false;
    const code = from + to + (promotion ?? '');
    try { studyPlay(new chessRules.Chess(outputPosition().game.fen()), code); }
    catch { return false; }
    if (branch.step < branch.moves.length) {
      branch = { ...branch, id: newCpuGameId(), name: '', moves: branch.moves.slice(0, branch.step) };
      el('branch-name').value = '';
    }
    branch.moves.push(code);
    branch.step++;
    return true;
  }

  function selectVariation(id) {
    const saved = record.variations.find(entry => entry.id === id);
    if (!saved) return;
    goToPly(saved.ply);
    branch = { ...saved, moves: saved.moves.slice(), step: saved.moves.length };
    el('branch-name').value = saved.name;
    changed();
    repaint();
  }

  function tryMove(ply, code, keepBranch = false) {
    if (!keepBranch) {
      goToPly(ply);
      newBranch();
    }
    if (play(code.slice(0, 2), code.slice(2, 4), code[4])) {
      changed();
      repaint();
    }
  }

  function renderBranch() {
    el('branch-panel').hidden = !branch;
    el('fork').hidden = Boolean(branch);
    el('return').hidden = !branch;
    el('branch-save').disabled = loading || !branch?.moves.length;
    el('branch-delete').disabled = !branch || !record.variations.some(entry => entry.id === branch.id);
    const select = el('variations');
    const options = record.variations.map(entry => {
      const option = element('option', `${entry.ply}手目の直後 · ${entry.name}`);
      option.value = entry.id;
      return option;
    });
    select.replaceChildren(element('option', '保存した変化を選ぶ'), ...options);
    select.options[0].value = '';
    select.value = options.some(option => option.value === branch?.id) ? branch.id : '';
    select.disabled = !options.length;
    if (!branch) return;
    const board = new chessRules.Chess(view.position.fen);
    const moves = branch.moves.map(code => studyPlay(board, code).san);
    el('branch-moves').replaceChildren(...moves.map((move, i) => {
      const item = element('li');
      const link = button(move, () => branchStep(i + 1));
      if (i + 1 === branch.step) link.setAttribute('aria-current', 'step');
      item.append(link);
      return item;
    }));
    const first = studyTimelineScore(record, branch.ply + 1);
    el('compare').textContent = branch.step === 1 && first
      ? `本譜の手 ${view.game.positions[branch.ply + 1]?.move.san ?? ''} ${studyScoreText(first.score)} ／ 試した手 ${activeScore() ? studyScoreText(activeScore().score) : '未解析'}。解析条件が異なる参考値です。` : '';
  }

  function drawGraph() {
    const canvas = el('graph');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width, h = canvas.height;
    const count = Math.max(1, view.game.positions.length - 1);
    const x = ply => 8 + ply / count * (w - 16);
    const y = score => h / 2 - studyGraphValue(score) / studyGraphLimit * (h / 2 - 10);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#f5f1e7';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#8c907d';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    ctx.strokeStyle = '#356054';
    ctx.lineWidth = 3;
    ctx.beginPath();
    let adjacent = false;
    for (let ply = 0; ply <= count; ply++) {
      const point = studyTimelineScore(record, ply);
      if (!point) { adjacent = false; continue; }
      if (adjacent) ctx.lineTo(x(ply), y(point.score));
      else ctx.moveTo(x(ply), y(point.score));
      adjacent = true;
    }
    ctx.stroke();
    for (let ply = 0; ply <= count; ply++) {
      const point = studyTimelineScore(record, ply);
      if (!point) continue;
      const previous = ply > 0 ? studyTimelineScore(record, ply - 1) : null;
      const sx = x(ply), sy = y(point.score);
      ctx.fillStyle = '#775c2b';
      if (point.score.unit === 'mate') {
        ctx.fillRect(sx - 3.5, sy - 3.5, 7, 7);
      } else if (previous && Math.abs(studyGraphValue(point.score) - studyGraphValue(previous.score)) >= studyGradeRules.mistake) {
        ctx.beginPath();
        ctx.moveTo(sx, sy - 5);
        ctx.lineTo(sx + 5, sy);
        ctx.lineTo(sx, sy + 5);
        ctx.lineTo(sx - 5, sy);
        ctx.fill();
      } else ctx.fillRect(sx - 2, sy - 2, 4, 4);
    }
    ctx.fillStyle = '#775c2b';
    ctx.fillRect(x(view.position.ply) - 1, 0, 2, h);
    const current = studyTimelineScore(record, view.position.ply);
    if (current) {
      ctx.beginPath();
      ctx.arc(x(view.position.ply), y(current.score), 5, 0, Math.PI * 2);
      ctx.strokeStyle = '#211e19';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    el('graph-position').value = view.position.ply;
    const description = `${branch ? '本譜の分岐元' : '本譜'} ${view.position.ply}手の直後 · ${current ? studyScoreText(current.score) : '未解析'}`;
    el('graph-current').textContent = description;
    el('graph-position').setAttribute('aria-valuetext', description);
  }

  function highlights() {
    if (!view?.position || !current(view)) return;
    const hasBatch = record.scores.some(Boolean);
    el('highlights-section').hidden = !hasBatch;
    el('highlights-empty').hidden = hasBatch;
    if (!hasBatch) return;
    const known = sourceColor(view.game);
    const positions = view.game.positions;
    const totals = { positive: 0, mistakes: 0, blunders: 0 };
    const events = studyReviewGrades(view.game, record.scores, known);
    for (const { grade } of events) {
      if (grade.kind === 'blunder') totals.blunders++;
      if (grade.kind === 'mistake') totals.mistakes++;
      if (['best', 'excellent', 'good'].includes(grade.kind)) totals.positive++;
    }
    const negative = events.filter(event => event.grade.loss >= studyGradeRules.mistake).sort((a, b) => b.grade.loss - a.grade.loss).slice(0, 4);
    const positive = events.filter(event => ['best', 'excellent'].includes(event.grade.kind))
      .sort((a, b) => Number(b.move.san.endsWith('#')) - Number(a.move.san.endsWith('#'))).slice(0, 2);
    const outcome = gameResults[view.game.metadata.result] ?? '結果未記録';
    const opening = view.game.source?.opening ?? byId('game-opening-name').textContent;
    el('overview').textContent = `${outcome} · ${positions.length - 1}手 · ${known ? chessColorNames[known] + 'の手' : '白黒両方'} · ${opening}。良かった手 ${totals.positive}、ミス ${totals.mistakes}、大きなミス ${totals.blunders}（判定できた手のみ）`;
    el('highlights').replaceChildren(...[...negative, ...positive].map(({ ply, grade, before, after, move }) => {
      const card = element('li', null, 'game-card study-highlight');
      const body = element('div');
      const points = `${studyScoreText(before.score)} → ${studyScoreText(after?.score)}`;
      let why = grade.mate ? '解析ではメイトの可能性が変わりました。候補手の続きを比べてみましょう。'
        : grade.loss >= studyGradeRules.mistake ? 'この手の後、指した側から見た評価が下がりました。推奨手の続きを比べてみましょう。'
          : move.san.endsWith('#') ? 'この手でチェックメイトになりました。'
            : grade.kind === 'best' ? 'エンジンの第一候補と一致しました。実際の続きも振り返ってみましょう。'
              : '解析では、良い評価を保てた手です。';
      if (after?.move && grade.loss >= studyGradeRules.mistake) {
        try {
          const reply = studyPlay(new chessRules.Chess(positions[ply].fen), after.move);
          const piece = cpuPieceLabels[reply.captured];
          if (piece && cpuPieceValues[reply.captured] >= 3) why += ` 推奨される相手の応手 ${reply.san} では${piece}を取られます。`;
        } catch { /* Only mention moves that can be verified on this board. */ }
      }
      const actions = element('div', null, 'study-mode-links');
      actions.append(button('実際の手を見る', () => goToPly(ply)), button('自分で考える', () => { goToPly(ply - 1); newBranch(); }),
        button('ここからCPU対戦', () => { goToPly(ply - 1); startCpu(); }),
        button('この局面を練習問題にする', () => {
          goToPly(ply - 1);
          selectTab('analysis', true);
          generationPanel(true);
          generateQuestions(ply - 1);
        }));
      if (before.move) actions.append(button('推奨手を試す', () => tryMove(ply - 1, before.move)));
      body.append(element('h3', `${move.number}${move.color === 'w' ? '.' : '…'} ${move.san} · ${grade.label}`),
        element('p', `推奨手 ${before.san[0] ?? '—'} ／ ${points}`), element('p', why), actions);
      card.append(studyMiniature(positions[ply - 1].fen), body);
      return card;
    }));
  }

  function render() {
    if (!view?.position || !current(view)) return;
    const evaluation = activeScore();
    const label = evaluation ? studyScoreSummary(evaluation.score) : 'この局面は未解析';
    const known = sourceColor(view.game);
    el('assessment').textContent = evaluation ? `${label} · 白基準 ${studyScoreText(evaluation.score)}` : label;
    const advantage = el('advantage');
    advantage.dataset.evaluated = String(Boolean(evaluation));
    advantage.dataset.flipped = String(view.flipped);
    advantage.setAttribute('aria-label', evaluation ? `局面評価（白視点） ${studyScoreText(evaluation.score)}、${label}` : '局面評価は未解析');
    el('board-eval').textContent = evaluation ? studyScoreText(evaluation.score) : '未解析';
    if (evaluation) {
      advantage.style.setProperty('--white-share', (studyWhiteShare(evaluation.score) * 100) + '%');
      const own = studyGraphValue(evaluation.score) * (known === 'w' ? 1 : -1);
      el('your-color').textContent = known ? `使用色 ${chessColorNames[known]} · ${own > 39 ? '有利' : own < -39 ? '不利' : 'ほぼ互角'}` : '';
    } else el('your-color').textContent = '';
    const single = record.single[positionKey()];
    el('depth').textContent = evaluation
      ? `探索深度 ${evaluation.depth} · Stockfish ${single?.version ?? record.version ?? stockfishEngine.version}` : '';
    const ply = view.position.ply;
    const actual = !branch && ply ? view.position.move : null;
    const before = record.scores[ply - 1];
    const grade = actual && before ? studyMoveGrade(before, record.scores[ply], actual, {
      forced: new chessRules.Chess(view.game.positions[ply - 1].fen).moves().length === 1,
      terminalWinner: actual.san.endsWith('#') ? actual.color : null,
    }) : null;
    el('grade').textContent = actual && (before || record.scores[ply]) ? `${actual.san} · ${grade?.label ?? '判定は未確定'}` : '';
    el('move-grade').textContent = el('grade').textContent;
    el('lines').replaceChildren(...(evaluation?.candidates ?? []).filter(line => line.move).map((line, index) => {
      const li = element('li');
      const name = `${line.san[0]} ${studyScoreText(line.score)}`;
      li.append(button(index ? name : '第一候補 ' + name, () => tryMove(view.position.ply, line.move, Boolean(branch))),
        element('p', `深さ ${line.depth} · ${line.san.join(' ')}`));
      return li;
    }));
    const firstCandidate = evaluation?.candidates.find(line => line.move);
    const fen = firstCandidate ? outputPosition().game.fen() : null;
    const variation = fen ? firstCandidate.pv.slice(0, 3) : [];
    const facts = variation.length && studyPv(fen, variation).length === variation.length ? practiceLineFacts(fen, variation) : null;
    el('line-explanation').replaceChildren(...(facts?.summary ? [element('h3', '第一候補の狙い'),
      element('p', facts.summary), ...facts.details.slice(0, 2).map(text => element('p', text))] : []));
    const partial = record.scores.some(Boolean);
    el('results').hidden = !partial;
    el('graph-empty').hidden = partial;
    el('batch').disabled = loading || Boolean(job);
    el('position').disabled = loading || Boolean(job);
    el('stop').disabled = !job;
    el('stop').hidden = el('stop-local').hidden = !job || job.mode === 'personal';
    el('cpu').disabled = !canStartCpu();
    byId('personal-generate-one').disabled = loading || Boolean(job);
    byId('personal-generate-many').disabled = loading || Boolean(job) || !partial;
    el('graph-position').max = view.game.positions.length - 1;
    el('source-conditions').textContent = partial
      ? `Stockfish ${record.version} · ${record.mode === 'analysis-detail' ? '詳細' : 'クイック'} · ${record.scores.filter(Boolean).length} / ${view.game.positions.length}局面${record.analyzed ? ' · ' + new Date(record.analyzed).toLocaleString('ja-JP') : ''}` : '';
    renderBranch();
    if (partial) drawGraph();
  }

  function begin(mode) {
    if (job || !view || loading) return null;
    const work = { mode, engine: createStockfishSession(), view };
    job = work;
    if (mode !== 'personal') note('Stockfishを準備しています…');
    render();
    return work;
  }

  function generationPanel(scroll = false) {
    const panel = byId('personal-generate-panel');
    panel.open = true;
    if (scroll) panel.scrollIntoView({ block: 'nearest' });
  }

  async function updatePracticeCount(owner, contentKey) {
    try {
      const key = contentKey ?? await studyContentKey(owner.game);
      const rows = (await personalStore.all()).filter(({ question }) => question.sourceKey === key
        || owner.game.id && question.gameId === owner.game.id);
      if (view !== owner) return;
      byId('game-practice-count').textContent = rows.length ? `この対局の練習問題 ${rows.length}問` : '';
      const first = byId('personal-generated-first');
      first.hidden = !rows.length;
      if (rows.length) first.href = '#personal/' + rows[0].question.id;
    } catch { /* Practice remains available if the count is unavailable. */ }
  }

  function showPersonalCandidates() {
    const list = byId('personal-candidate-list');
    list.replaceChildren(...pendingQuestions.map(question => {
      const checkbox = element('input');
      checkbox.type = 'checkbox';
      checkbox.value = question.id;
      checkbox.checked = true;
      const label = element('label');
      label.append(checkbox, document.createTextNode(` ${question.ply}手の直後 · ${question.tags.map(tag => personalTags[tag]).join('、')}`));
      const li = element('li');
      li.append(label, button('本譜の盤面を見る', () => goToPly(question.ply)));
      return li;
    }));
    byId('personal-candidate-actions').hidden = pendingQuestions.length === 0;
    byId('personal-show-candidates').hidden = !list.hidden;
    byId('personal-add-selected').hidden = list.hidden;
    if (!pendingQuestions.length) list.hidden = true;
  }

  async function savePersonalCandidates(selectedOnly = false) {
    const owner = view;
    const selection = new Set([...byId('personal-candidate-list').querySelectorAll('input:checked')].map(input => input.value));
    const chosen = selectedOnly ? pendingQuestions.filter(question => selection.has(question.id)) : pendingQuestions;
    if (!chosen.length) { personalStatus('追加する局面を選んでください。'); return; }
    try {
      const count = await personalStore.merge(chosen.map(question => ({ question, history: null })));
      if (count) rookoriAnalytics.event('personal_practice_generated');
      if (view !== owner) return;
      updatePracticeCount(owner, chosen[0].sourceKey);
      pendingQuestions = [];
      showPersonalCandidates();
      personalStatus(`${count}問を追加しました。${count < chosen.length ? '登録済みの局面とその学習記録を残しました。' : ''}`
        + (owner.game.id ? '' : ' 元の対局へ戻る導線を使うには、この棋譜も履歴に保存してください。'));
    } catch { if (view === owner) personalStatus('問題を保存できませんでした。ブラウザーの空き容量や保存設定を確認してください。'); }
  }

  async function generateQuestions(ply = null, afterAnalysis = false) {
    if (!view || job || !current(view)) return;
    const game = view.game;
    const side = byId('personal-source-side').value;
    const eligibility = personalEligibility(game);
    if (eligibility === 'live' || eligibility === 'sample') {
      if (!afterAnalysis) personalStatus(eligibility === 'live' ? '対局結果のある終了済みのオンライン棋譜を使ってください。' : '自分の終了済み対局から練習問題を作れます。');
      return;
    }
    if (!['w', 'b'].includes(side) || (eligibility === 'confirm' && !byId('personal-ended').checked)) {
      generationPanel(!afterAnalysis);
      personalStatus('自分の駒の色を選び、必要に応じて対局が終了したことを確認してください。');
      return;
    }
    const variation = ply !== null && branch ? branch.moves.slice(0, branch.step) : [];
    const chosenFen = variation.length ? outputPosition().game.fen() : game.positions[ply]?.fen;
    if (ply !== null && chosenFen?.split(' ')[1] !== side) {
      personalStatus('自分の手番の局面を選んでください。');
      return;
    }
    const plies = ply === null ? personalCandidates(game, record.scores, side).map(event => event.ply - 1) : [ply];
    generationPanel(!afterAnalysis);
    pendingQuestions = [];
    byId('personal-candidate-list').hidden = true;
    showPersonalCandidates();
    if (!plies.length) {
      personalStatus(record.scores.some(Boolean) ? 'この対局から、解析で十分な改善が確認できる候補は見つかりませんでした。'
        : '対局全体から探すには、先に「対局全体を解析」を実行してください。');
      return;
    }
    const work = begin('personal');
    if (!work) return;
    byId('personal-generate-stop').hidden = false;
    try {
      const sourceKey = await studyContentKey(game);
      const saved = await personalStore.all();
      const registered = new Set(saved.map(({ question }) => question.id));
      const countFromGame = saved.filter(({ question }) => question.sourceKey === sourceKey).length;
      const limit = ply === null ? Math.max(0, personalRules.perGame - countFromGame) : 1;
      if (job !== work) return;
      if (limit) await work.engine.start();
      for (const [index, start] of plies.entries()) {
        if (job !== work || pendingQuestions.length >= limit) break;
        personalStatus(`候補を確認しています ${index + 1} / ${plies.length}`);
        const id = await personalPositionId(variation.length ? chosenFen : game.positions[start].fen);
        if (job !== work) return;
        if (registered.has(id)) continue;
        const row = await verifyPersonalQuestion(work.engine, game, start, ply === null, () => job === work, variation, sourceKey);
        if (job !== work) return;
        if (row) { registered.add(row.id); pendingQuestions.push(row); }
      }
      if (job !== work) return;
      showPersonalCandidates();
      personalStatus(pendingQuestions.length ? `復習に適した局面が${pendingQuestions.length}つ見つかりました。`
        : '登録済みか、十分な精度で問題にできる局面がありません。別の局面を選ぶか、自由検討で振り返れます。');
      if (ply === null && pendingQuestions.length && personalPreference(personalAutoKey, false)) await savePersonalCandidates();
    } catch { if (job === work) personalStatus('候補の確認が中断されました。必要なら再試行してください。'); }
    finally {
      if (job === work) { stop(); render(); }
    }
  }

  byId('personal-generate-one').addEventListener('click', () => generateQuestions(view?.position.ply));
  byId('game-practice-open').addEventListener('click', () => {
    selectTab('analysis');
    generationPanel(true);
    const generate = byId('personal-generate-many');
    if (generate.disabled) el('batch').focus({ preventScroll: true });
    else generate.focus({ preventScroll: true });
  });
  byId('personal-generate-many').addEventListener('click', () => generateQuestions());
  byId('personal-add-all').addEventListener('click', () => savePersonalCandidates());
  byId('personal-add-selected').addEventListener('click', () => savePersonalCandidates(true));
  byId('personal-show-candidates').addEventListener('click', () => {
    byId('personal-candidate-list').hidden = false;
    byId('personal-show-candidates').hidden = true;
    byId('personal-add-selected').hidden = false;
    byId('personal-candidate-list').querySelector('input')?.focus();
  });
  byId('personal-dismiss-candidates').addEventListener('click', () => {
    pendingQuestions = [];
    showPersonalCandidates();
    personalStatus('今回は問題を追加しませんでした。');
  });
  byId('personal-generate-stop').addEventListener('click', () => {
    pendingQuestions = [];
    stop();
    render();
    showPersonalCandidates();
    personalStatus('問題の生成を中止しました。');
  });

  async function analyzePosition() {
    if (!view || !current(view)) return;
    const work = begin('position');
    if (!work) return;
    const { fen, moves, game } = outputPosition();
    try {
      await work.engine.start();
      if (job !== work) return;
      note('現在の局面を解析しています…');
      const result = await work.engine.search(branch ? 'analysis-branch' : 'analysis', { fen, moves },
        { candidates: Number(el('candidates').value) });
      if (job !== work) return;
      const value = studyEngineResult(result, game.turn(), game.fen());
      if (value) {
        record.single[positionKey()] = { value, version: stockfishEngine.version, date: new Date().toISOString() };
        const keys = Object.keys(record.single);
        if (keys.length > 120) delete record.single[keys[0]];
        persist();
      }
      note(value ? '局面解析が完了しました。' : 'この局面の評価値を取得できませんでした。');
    } catch { if (job === work) note('Stockfishで解析できませんでした。もう一度お試しください。'); }
    finally {
      if (job === work) {
        stop();
        render();
        repaint();
      }
    }
  }

  async function analyzeGame() {
    const work = begin('batch');
    if (!work) return;
    const { game } = view;
    const mode = el('analysis-mode').value;
    if (record.mode !== mode || record.version !== stockfishEngine.version) record.scores = [];
    record.mode = mode;
    record.version = stockfishEngine.version;
    record.analyzed = new Date().toISOString();
    const count = game.positions.length;
    const neededAnalysis = game.positions.some((position, ply) => !record.scores[ply] && ply < count - 1);
    const prefix = game.cpu?.origin?.moves ?? [];
    const moves = [...prefix, ...studyMainMoves(game, count - 1)];
    let completed = false;
    try {
      await work.engine.start();
      for (let ply = 0; ply < count && job === work; ply++) {
        if (record.scores[ply]) continue;
        const fen = game.positions[ply].fen;
        const turn = fen.split(' ')[1];
        note(`解析中 ${ply + 1} / ${count}局面 · ${ply}手の直後`);
        const result = await work.engine.search(mode, { fen: game.cpu?.origin?.initialFen ?? game.initialFen,
          moves: moves.slice(0, prefix.length + ply) });
        if (job !== work) return;
        record.scores[ply] = studyEngineResult(result, turn, fen);
        if ((ply + 1) % 10 === 0) persist();
        render();
      }
      if (job === work) { completed = true; note('対局解析が完了しました。'); }
    } catch { if (job === work) note('解析を続けられませんでした。完了した局面は確認できます。'); }
    finally {
      if (job === work) {
        stop();
        render();
        highlights();
        repaint();
        if (completed && neededAnalysis && personalEligibility(game) === 'finished'
          && game.positions.every((position, ply) => ply === count - 1 || Boolean(record.scores[ply]))) {
          rookoriAnalytics.event('game_review_complete');
        }
        if (completed && !['sample', 'live'].includes(personalEligibility(game))) {
          selectTab('analysis');
          generateQuestions(null, true);
        }
      }
    }
  }

  el('fork').addEventListener('click', newBranch);
  el('return').addEventListener('click', () => {
    goToPly(view.position.ply);
    el('fork').focus({ preventScroll: true });
  });
  el('branch-root').addEventListener('click', () => branchStep(0));
  el('variations').addEventListener('change', event => selectVariation(event.currentTarget.value));
  el('branch-save').addEventListener('click', () => {
    const existing = record.variations.findIndex(entry => entry.id === branch.id);
    if (existing < 0 && record.variations.length >= 100) { note('保存できる変化は1局につき100件です。'); return; }
    branch.name = el('branch-name').value.trim() || `変化 ${record.variations.length + 1}`;
    const saved = { id: branch.id, ply: branch.ply, name: branch.name, moves: branch.moves.slice() };
    if (existing < 0) record.variations.push(saved);
    else record.variations[existing] = saved;
    el('branch-name').value = branch.name;
    persist();
    render();
  });
  el('branch-delete').addEventListener('click', () => {
    if (!window.confirm('保存した変化を削除しますか？')) return;
    record.variations = record.variations.filter(entry => entry.id !== branch.id);
    persist();
    goToPly(view.position.ply);
  });
  el('position').addEventListener('click', analyzePosition);
  el('batch').addEventListener('click', analyzeGame);
  function cancel(event) {
    stop('解析を停止しました。');
    render();
    highlights();
    el(event.currentTarget === el('stop-local') ? 'position' : 'batch').focus({ preventScroll: true });
  }
  el('stop').addEventListener('click', cancel);
  el('stop-local').addEventListener('click', cancel);
  el('auto').addEventListener('change', () => { if (el('auto').checked && !job) analyzePosition(); else clearTimeout(debounce); });
  el('graph-position').addEventListener('change', event => goToPly(Number(event.target.value)));
  el('graph').addEventListener('click', event => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const canvasX = (event.clientX - bounds.left) / bounds.width * event.currentTarget.width;
    goToPly(Math.round((canvasX - 8) / (event.currentTarget.width - 16) * (view.game.positions.length - 1)));
  });
  el('cpu').addEventListener('click', startCpu);
  for (const tab of tabs) {
    const select = (index, focus) => selectTab(tabs[index].id.slice('review-tab-'.length), focus);
    tab.addEventListener('click', () => select(tabs.indexOf(tab), false));
    tab.addEventListener('keydown', event => {
      const index = tabs.indexOf(tab);
      const targets = { ArrowLeft: (index + tabs.length - 1) % tabs.length, ArrowRight: (index + 1) % tabs.length,
        Home: 0, End: tabs.length - 1 };
      if (!Object.hasOwn(targets, event.key)) return;
      event.preventDefault();
      select(targets[event.key], true);
    });
  }
  window.addEventListener('pagehide', () => { stop(); if (view) render(); });
  async function savedProgress(game) {
    try {
      const id = await studyContentKey(game);
      return studyProgressLabel(memory.get(id) ?? await store.get(id), game.positions.length);
    } catch { return '解析状況を確認できません'; }
  }
  return { open, close, changed, play, branchStep, resetBranch, outputPosition, render, highlights,
    savedProgress, branch: () => branch, hints: () => activeScore()?.move ? [activeScore().move] : [] };
}

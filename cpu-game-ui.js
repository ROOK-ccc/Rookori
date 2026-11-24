const cpuPage = (() => {
  const node = id => byId('cpu-' + id);
  const form = node('form');
  const moves = node('moves');
  const confirmDialog = node('confirm');
  const recordLimit = 50;
  const owner = newCpuGameId();
  let settings = normalizeCpuSettings(readStorage(cpuSettingsKey));
  const materialSettings = normalizeCpuMaterialDisplay(readStorage(cpuMaterialKey));
  let match, engine, job, timer, confirmation, interrupted, archive;
  let ready = false;
  let paused = false;
  let failure = '';
  let hint = [];
  let resultShown = false;
  let records = readStorage(cpuResultsKey);
  records = Array.isArray(records) ? records.filter(entry =>
    entry && typeof entry.date === 'string' && Number.isFinite(Date.parse(entry.date))
    && Number.isInteger(entry.level) && cpuLevels[entry.level - 1] && ['w', 'b'].includes(entry.color)
    && typeof entry.time === 'string' && entry.time.length < 30
    && typeof entry.result === 'string' && entry.result.length < 100).slice(0, recordLimit) : [];

  function readStorage(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  }

  function writeStorage(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
  }

  function remember(takeOwnership = false) {
    if (!match || match.outcome) return false;
    const existing = readStorage(cpuResumeKey);
    if (!takeOwnership && (existing?.id !== match.id || existing.owner !== owner)) return false;
    return writeStorage(cpuResumeKey, { ...cpuSnapshot(match), owner });
  }

  function clearSnapshot() {
    const snapshot = readStorage(cpuResumeKey);
    if (snapshot?.id !== match.id || snapshot.owner !== owner) return;
    try { localStorage.removeItem(cpuResumeKey); } catch { /* Storage may be blocked. */ }
  }

  function describe(game) {
    return `${cpuLabels[game.settings.mode]} · ${cpuLevelLabel(game.settings.level)} · ${cpuLabels[game.player]} · ${game.continued ? '時間無制限の継続練習' : cpuTimeLabel(game.settings)}`;
  }

  cpuLevels.forEach((level, index) => {
    const label = element('label');
    const input = element('input');
    input.type = 'radio';
    input.name = 'level';
    input.value = index + 1;
    const image = element('img');
    image.src = `pieces/cburnett/w${level.piece}.svg`;
    image.alt = '';
    image.width = image.height = 30;
    const description = element('span');
    description.append(element('strong', cpuLevelLabel(index + 1)), element('small', level.description));
    label.append(input, image, description);
    node('levels').append(label);
  });
  const timeSelect = node('time');
  for (const [name, values] of Object.entries(cpuTimePresets)) {
    const group = element('optgroup');
    group.label = name;
    for (const value of values) {
      const option = element('option', value.replace('+', '＋'));
      option.value = value;
      group.append(option);
    }
    timeSelect.append(group);
  }
  const custom = element('option', '自由設定');
  custom.value = 'custom';
  timeSelect.append(custom);

  function showSettings() {
    for (const [key, value] of Object.entries(settings)) form.elements.namedItem(key).value = String(value);
    updateSettings();
    node('session').hidden = true;
    node('setup').hidden = false;
    node('record-list').replaceChildren(...records.map(entry => element('li',
      `${new Date(entry.date).toLocaleString('ja-JP')} · ${cpuLevelLabel(entry.level)} · ${cpuLabels[entry.color]} · ${entry.time} · ${entry.result}`)));
    node('records').hidden = records.length === 0;
    interrupted = null;
    const snapshot = readStorage(cpuResumeKey);
    if (snapshot) {
      try { interrupted = restoreCpuSnapshot(snapshot); }
      catch { node('resume-status').textContent = '中断データを読み込めませんでした。新しい対局を始められます。'; }
    }
    node('resume-panel').hidden = !interrupted;
    if (interrupted) node('resume-detail').textContent = `${describe(interrupted)} · ${interrupted.turns.length}手`;
    form.querySelector('[type="submit"]').textContent = interrupted ? '新しい対局を開始する' : '対局を始める';
  }

  function updateSettings() {
    const value = Object.fromEntries(new FormData(form));
    const isCustom = value.time === 'custom';
    const valid = !isCustom || validCpuTime(value.minutes, value.seconds);
    node('custom').hidden = !isCustom;
    node('form-error').textContent = '';
    for (const field of [node('minutes'), node('seconds')]) field.removeAttribute('aria-invalid');
    const time = valid ? cpuTimeLabel(normalizeCpuSettings({ ...value, level: Number(value.level) })) : '持ち時間を入力してください';
    node('summary').textContent = `${cpuLabels[value.mode]} · ${cpuLevelLabel(Number(value.level))} · ${cpuLabels[value.color]} · ${time}`;
    node('show-captures').checked = materialSettings[value.mode].captures;
    node('show-material').checked = materialSettings[value.mode].score;
    return value;
  }

  form.addEventListener('input', event => {
    const field = event.target;
    if (field === node('show-captures') || field === node('show-material')) {
      const preferences = materialSettings[form.elements.namedItem('mode').value];
      preferences[field === node('show-captures') ? 'captures' : 'score'] = field.checked;
      writeStorage(cpuMaterialKey, materialSettings);
    }
    updateSettings();
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (match) return;
    const value = updateSettings();
    if (value.time === 'custom' && !validCpuTime(value.minutes, value.seconds)) {
      node('form-error').textContent = '初期時間は1〜180分、加算は0〜60秒を整数で入力してください。';
      let firstInvalid;
      for (const [field, valid] of [[node('minutes'), validCpuTime(value.minutes, 0)], [node('seconds'), validCpuTime(1, value.seconds)]]) {
        if (!valid) {
          field.setAttribute('aria-invalid', 'true');
          firstInvalid ??= field;
        }
      }
      firstInvalid?.focus();
      return;
    }
    const selected = normalizeCpuSettings({ ...value, level: Number(value.level) });
    const begin = () => {
      settings = selected;
      writeStorage(cpuSettingsKey, settings);
      start();
    };
    if (readStorage(cpuResumeKey)) ask('中断した対局の代わりに、新しい対局を始めますか？', '新しい対局を始める', begin);
    else begin();
  });

  function playable() {
    return Boolean(match && match.anchor !== null && !match.outcome && match.game.turn() === match.player);
  }

  const board = createChessBoard(node('board'), node('promotion'), {
    position: () => match, isFlipped: () => match.player === 'b', canPlay: playable, hints: () => hint,
    feedback: message => { node('feedback').textContent = message; },
    play(from, to, promotion) {
      if (!playable()) return false;
      const played = match.play(from + to + (promotion ?? ''), match.player);
      if (!played && match.outcome) synchronize();
      return played;
    },
    onMove() {
      if (job?.kind === 'hint') disposeEngine();
      hint = [];
      remember();
      synchronize();
    },
  });

  function disposeEngine() {
    const current = engine;
    engine = null;
    job = null;
    ready = false;
    current?.close();
  }

  function stopClock() {
    clearInterval(timer);
    timer = null;
    match?.stop();
  }

  function startClock() {
    match.start();
    if (match.time && !timer) timer = setInterval(tick, 100);
  }

  function tick() {
    if (!match || match.outcome) return;
    if (match.flag()) synchronize();
    else renderClocks();
  }

  function engineFailed() {
    if (!match || match.outcome) return;
    if (match.flag()) { synchronize(); return; }
    disposeEngine();
    stopClock();
    remember();
    board.reset();
    failure = location.protocol === 'file:'
      ? 'このページをファイルから直接開いています。Rookoriの公開サイトかローカルサーバーで開いてください。'
      : 'Stockfishを読み込めないか、通信が途切れました。再読み込みすると同じ局面から続けられます。';
    render();
    node('retry').focus({ preventScroll: true });
  }

  async function loadEngine() {
    failure = '';
    const activeMatch = match;
    const current = engine = createStockfishSession();
    try {
      await current.start();
      if (engine !== current || match !== activeMatch) return;
      ready = true;
      if (!paused) startClock();
      synchronize();
    } catch {
      if (engine === current && match === activeMatch) engineFailed();
    }
  }

  async function requestMove(kind) {
    const purpose = kind === 'hint' ? 'hint' : 'opponent';
    if (!ready || job) return;
    const fen = match.game.fen();
    const remaining = match.clocks()[match.game.turn()];
    const increment = match.time?.increment ?? 0;
    const request = job = { kind, fen, id: match.id };
    try {
      const result = await engine.search(purpose,
        { fen: match.initialFen, moves: match.turns.map(({ move }) => cpuMoveCode(move)) },
        { level: match.settings.level, remaining, increment });
      if (job === request && match.id === request.id) acceptMove(result);
    } catch {
      if (job === request) engineFailed();
    }
  }

  function acceptMove(data) {
    const { kind, fen } = job;
    job = null;
    if (match.flag()) { synchronize(); return; }
    if (match.outcome || match.game.fen() !== fen || match.anchor === null) return;
    const code = kind === 'hint' ? data.move
      : chooseStockfishMove(data, match.settings.level, match.game.moves({ verbose: true }).map(cpuMoveCode));
    if (!match.legalMove(code)) { engineFailed(); return; }
    if (kind === 'hint') {
      match.hintCount++;
      hint = [code];
      const from = code.slice(0, 2);
      const to = code.slice(2, 4);
      const promotion = { q: 'クイーン', r: 'ルーク', b: 'ビショップ', n: 'ナイト' }[code[4]];
      node('feedback').textContent = `ヒント：${from} の駒を ${to} へ。${promotion ? promotion + 'に昇格します。' : ''}`;
    } else {
      match.play(code, otherChessColor(match.player));
    }
    remember();
    synchronize();
  }

  function synchronize() {
    if (!match) return;
    if (match.outcome) {
      disposeEngine();
      stopClock();
      confirmation = null;
      if (confirmDialog.open) confirmDialog.close();
      board.close();
    } else if (!paused && !failure) {
      if (!engine) loadEngine();
      if (ready && match.game.turn() !== match.player) requestMove('cpu');
    }
    render();
  }

  function start(restored = null) {
    close();
    match = restored ?? new CpuMatch(settings);
    settings = match.settings;
    remember(true);
    node('setup').hidden = true;
    node('session').hidden = false;
    board.reset();
    node('title').focus();
    window.scrollTo(0, 0);
    synchronize();
  }

  function close() {
    if (!match) return;
    disposeEngine();
    if (!match.outcome) remember();
    stopClock();
    board.reset();
    confirmation = null;
    if (confirmDialog.open) confirmDialog.close();
    match = null;
    paused = resultShown = false;
    hint = [];
    failure = '';
    archive = null;
    node('pgn').hidden = true;
    node('view-pgn').setAttribute('aria-expanded', 'false');
    node('export-status').textContent = '';
  }

  function open(replay) {
    node('resume-status').textContent = '';
    showSettings();
    showScreen('cpu', 'cpu-title');
    if (!replay) return;
    const begin = () => {
      settings = normalizeCpuSettings(replay);
      writeStorage(cpuSettingsKey, settings);
      start();
    };
    if (readStorage(cpuResumeKey)) ask('中断した対局の代わりに、履歴と同じ設定で対局しますか？', '新しい対局を始める', begin);
    else begin();
  }

  function renderClocks() {
    const clocks = match.clocks();
    for (const [id, color] of [['player-clock', match.player], ['opponent-clock', otherChessColor(match.player)]]) {
      const clock = node(id);
      const seconds = Math.ceil(clocks[color] / 1000);
      const label = Number.isFinite(seconds) ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : '∞';
      if (clock.textContent !== label) clock.textContent = label;
      clock.parentElement.classList.toggle('cpu-turn', !match.outcome && match.game.turn() === color);
    }
  }

  function renderMoves() {
    const rows = [];
    for (let i = 0; i < match.turns.length; i += 2) {
      const white = match.turns[i].move.san;
      const black = match.turns[i + 1]?.move.san ?? '';
      const row = element('li');
      row.append(element('span', black ? white + ' ' : white), element('span', black));
      rows.push(row);
    }
    moves.replaceChildren(...rows);
    moves.scrollTop = moves.scrollHeight;
  }

  function renderMaterial() {
    const { captures, score } = materialSettings[match.settings.mode];
    const totals = captures || score ? cpuMaterial(match) : null;
    for (const [side, color] of [['player', match.player], ['opponent', otherChessColor(match.player)]]) {
      const row = node(side + '-material');
      const difference = totals ? (color === 'w' ? totals.difference : -totals.difference) : 0;
      const pieces = captures ? totals.captures[color] : [];
      row.hidden = !pieces.length && (!score || difference <= 0);
      const icons = pieces.map(piece => {
        const image = element('img');
        image.src = `pieces/cburnett/${otherChessColor(color)}${piece.toUpperCase()}.svg`;
        image.alt = '取った' + cpuPieceLabels[piece];
        image.width = image.height = 20;
        return image;
      });
      if (score && difference > 0) {
        const points = element('span', '+' + difference, 'cpu-material-score');
        points.setAttribute('role', 'img');
        points.setAttribute('aria-label', `駒得 ${difference}点`);
        icons.push(points);
      }
      row.replaceChildren(...icons);
    }
  }

  function resultText(outcome) {
    const prefix = outcome.winner === null ? '引き分け' : outcome.winner === match.player ? '勝利' : '敗北';
    const reason = outcome.reason === 'flag'
      ? (match.game.turn() === match.player ? '時間切れ' : 'コンピューターの時間切れ') : cpuReasons[outcome.reason];
    return prefix + '：' + reason;
  }

  function showResult() {
    if (resultShown) return;
    resultShown = true;
    clearSnapshot();
    node('result-title').textContent = resultText(match.outcome);
    node('result-details').textContent = `${describe(match)} · ${match.turns.length}手${match.resumeCount ? ' · 中断から再開' : ''}`;
    const canContinue = match.settings.mode === 'practice' && match.outcome.reason === 'flag';
    node('continue').hidden = !canContinue;
    node('result-note').textContent = canContinue ? 'この局面から、時間を気にせず練習を続けられます。'
      : match.continued ? '時間切れ後の継続練習として記録します。' : '';
    node('pgn').value = cpuPgn(match);
    node('review').hidden = !match.turns.length;
    node('review').disabled = false;
    if (match.turns.length) {
      try {
        const game = cpuReviewGame(match, stockfishEngine);
        const entry = archive = { game };
        node('save-status').textContent = '対局履歴に保存しています…';
        entry.saved = gameReviewPages.saveCpu(game, match.id).then(record => {
          if (archive === entry) node('save-status').textContent = '対局履歴に保存しました。';
          return record;
        }, () => {
          if (archive === entry) node('save-status').textContent = '対局履歴に保存できませんでした。このタブでは復習できます。';
          return null;
        });
      } catch {
        node('review').hidden = true;
        node('save-status').textContent = '復習用の棋譜を作成できませんでした。';
      }
    } else {
      node('save-status').textContent = 'まだ着手がないため、対局履歴には保存されません。';
    }
    node('result-title').focus();
  }

  function render() {
    const live = !match.outcome;
    const practice = match.settings.mode === 'practice';
    node('opponent').textContent = 'コンピューター · ' + cpuLevelLabel(match.settings.level);
    node('opponent-color').textContent = cpuLabels[otherChessColor(match.player)];
    node('player-color').textContent = cpuLabels[match.player];
    renderMaterial();
    node('retry').hidden = !failure;
    node('controls').hidden = !live;
    node('result').hidden = live;
    node('export').hidden = live;
    node('undo').hidden = node('hint').hidden = !practice;
    node('pause').hidden = !practice || !match.time;
    node('pause').disabled = Boolean(failure || !ready && !paused);
    node('pause').textContent = paused ? '再開' : '一時停止';
    node('undo').disabled = match.undoIndex() < 0;
    node('hint').disabled = !playable() || !ready || Boolean(job);
    node('draw').hidden = !playable() || !match.drawClaim();
    node('resign').disabled = !ready && match.anchor === null && !paused && !failure;
    let status = live ? failure || (paused ? '一時停止中' : !ready && match.anchor === null ? 'Stockfishを読み込み中…'
      : playable() ? job?.kind === 'hint' ? 'ヒントを考えています…' : 'あなたの手番です。'
        : 'コンピューターが考えています…') : '対局が終了しました。';
    if (live && !paused && match.game.isCheck()) status += ' チェックです。';
    if (live && match.resumeCount && match.settings.mode === 'match') status += ' 中断から再開した実戦です。';
    if (live && match.continued) status += ' 時間切れ後の練習中です。';
    if (node('status').textContent !== status) node('status').textContent = status;
    board.render();
    renderClocks();
    renderMoves();
    if (!live) showResult();
  }

  function ask(message, label, action) {
    confirmDialog.returnValue = '';
    node('confirm-message').textContent = message;
    node('confirm-action').textContent = label;
    confirmation = action;
    confirmDialog.showModal();
  }

  confirmDialog.addEventListener('close', () => {
    const action = confirmation;
    confirmation = null;
    if (confirmDialog.returnValue === 'confirm') action?.();
  });

  function leave(action) {
    if (!match || match.outcome) return false;
    const persisted = remember();
    ask(persisted ? '対局を中断します。あとから再開できます。' : 'この対局の中断データを保存できません。ページを離れますか？',
      '対局を中断する', () => {
      close();
      action();
    });
    return true;
  }

  function backToSettings() {
    close();
    showSettings();
    node('title').focus();
    window.scrollTo(0, 0);
  }

  node('retry').addEventListener('click', () => { failure = ''; synchronize(); });
  node('resume').addEventListener('click', () => {
    const snapshot = readStorage(cpuResumeKey);
    if (!snapshot) { showSettings(); return; }
    let restored;
    try { restored = restoreCpuSnapshot(snapshot); }
    catch { showSettings(); return; }
    start(restored);
  });
  node('undo').addEventListener('click', () => {
    if (!match.undo()) { synchronize(); return; }
    disposeEngine();
    hint = [];
    board.reset();
    remember();
    synchronize();
  });
  node('hint').addEventListener('click', () => {
    if (match.flag()) { synchronize(); return; }
    if (!playable() || match.settings.mode !== 'practice' || !ready || job) return;
    requestMove('hint');
    render();
  });
  node('pause').addEventListener('click', () => {
    if (match.flag()) { synchronize(); return; }
    paused = !paused;
    if (paused) {
      stopClock();
      disposeEngine();
      board.reset();
    } else {
      startClock();
    }
    remember();
    synchronize();
  });
  node('draw').addEventListener('click', () => { if (playable()) { match.claim(); synchronize(); } });
  node('resign').addEventListener('click', () => ask('投了すると、この対局はここで終了します。', '投了する', () => {
    if (!match.flag()) match.finish('resign', otherChessColor(match.player));
    synchronize();
  }));
  node('restart').addEventListener('click', () => ask('今の対局を終了し、同じ設定で新しい対局を始めます。', '再戦する', () => start()));
  node('settings-back').addEventListener('click', () => leave(backToSettings));
  node('rematch').addEventListener('click', () => start());
  node('change').addEventListener('click', backToSettings);
  node('continue').addEventListener('click', () => {
    if (!match.continuePractice()) return;
    archive = null;
    resultShown = false;
    hint = [];
    board.reset();
    remember(true);
    startClock();
    synchronize();
    node('title').focus();
  });
  node('review').addEventListener('click', async () => {
    const entry = archive;
    if (!entry) return;
    node('review').disabled = true;
    const record = await entry.saved;
    if (archive === entry) gameReviewPages.openSavedOrPreview(record, entry.game);
  });

  node('view-pgn').addEventListener('click', () => {
    const field = node('pgn');
    field.hidden = !field.hidden;
    node('view-pgn').setAttribute('aria-expanded', String(!field.hidden));
    if (!field.hidden) field.focus();
  });
  node('copy').addEventListener('click', async () => {
    const current = match;
    const field = node('pgn');
    try {
      await navigator.clipboard.writeText(field.value);
      if (match === current) node('export-status').textContent = '棋譜をコピーしました。';
    } catch {
      if (match !== current || !match.outcome) return;
      field.hidden = false;
      node('view-pgn').setAttribute('aria-expanded', 'true');
      field.focus();
      field.select();
      node('export-status').textContent = '棋譜を選択しました。お使いの端末のコピー操作で保存できます。';
    }
  });
  node('download').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([node('pgn').value], { type: 'application/x-chess-pgn' }));
    const link = element('a');
    link.href = url;
    link.download = `rookori-${match.started.toISOString().slice(0, 10)}.pgn`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  document.addEventListener('visibilitychange', () => { tick(); if (document.hidden) remember(); });
  window.addEventListener('pagehide', () => { if (match && !match.outcome) close(); });
  window.addEventListener('pageshow', event => {
    if (event.persisted && location.hash === '#cpu' && !match) open();
  });
  return { open, close, leave };
})();

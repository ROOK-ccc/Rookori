const cpuPage = (() => {
  const node = id => byId('cpu-' + id);
  const form = node('form');
  const moves = node('moves');
  const confirmDialog = node('confirm');
  const workerUrl = new URL('cpu-engine-worker.js', document.currentScript.src);
  const labels = { practice: '練習モード', match: '実戦モード', w: '白番', b: '黒番', random: 'ランダム' };
  const reasons = {
    mate: 'チェックメイト', stalemate: 'ステイルメイト', material: '駒不足',
    threefold: '同一局面の3回出現（請求）', fivefold: '同一局面の5回出現',
    fifty: '50手ルール（請求）', seventyFive: '75手ルール', resign: '投了',
  };
  const recordLimit = 50;
  let settings = normalizeCpuSettings(readStorage(cpuSettingsKey));
  let match, worker, job, watchdog, timer, confirmation;
  let ready = false;
  let paused = false;
  let failure = '';
  let hint = [];
  let saved = false;
  let resultShown = false;
  let timeLimitResult = '';
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

  function timeLabel(value) {
    const time = cpuTimeControl(value);
    return time ? `${time.initial / 60000}分 ＋ ${time.increment / 1000}秒` : '時間無制限';
  }

  function levelLabel(level) {
    return `Lv.${level} ${cpuLevels[level - 1].name}`;
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
    description.append(element('strong', levelLabel(index + 1)), element('small', level.description));
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
      `${new Date(entry.date).toLocaleString('ja-JP')} · ${levelLabel(entry.level)} · ${labels[entry.color]} · ${entry.time} · ${entry.result}`)));
    node('records').hidden = records.length === 0;
  }

  function updateSettings() {
    const value = Object.fromEntries(new FormData(form));
    const isCustom = value.time === 'custom';
    const valid = !isCustom || validCpuTime(value.minutes, value.seconds);
    node('custom').hidden = !isCustom;
    node('form-error').textContent = '';
    for (const field of [node('minutes'), node('seconds')]) field.removeAttribute('aria-invalid');
    const time = valid ? timeLabel(normalizeCpuSettings({ ...value, level: Number(value.level) })) : '持ち時間を入力してください';
    node('summary').textContent = `${labels[value.mode]} · ${levelLabel(Number(value.level))} · ${labels[value.color]} · ${time}`;
    return value;
  }

  form.addEventListener('input', updateSettings);
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
    settings = normalizeCpuSettings({ ...value, level: Number(value.level) });
    writeStorage(cpuSettingsKey, settings);
    start();
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
      if (job?.kind === 'hint') disposeWorker();
      hint = [];
      synchronize();
    },
  });

  function disposeWorker() {
    clearTimeout(watchdog);
    worker?.terminate();
    worker = null;
    job = null;
    ready = false;
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

  function workerFailed() {
    if (!match || match.outcome) return;
    if (match.flag()) { synchronize(); return; }
    disposeWorker();
    stopClock();
    board.reset();
    failure = location.protocol === 'file:'
      ? 'このページをファイルから直接開いています。Rookoriの公開サイトかローカルサーバーで開いてください。'
      : 'エンジンとの通信が途切れました。局面と持ち時間を保持しています。再読み込みすると続けられます。';
    render();
    node('retry').focus({ preventScroll: true });
  }

  function loadWorker() {
    failure = '';
    const activeMatch = match;
    try {
      const current = worker = new Worker(workerUrl);
      const isCurrent = () => worker === current && match === activeMatch;
      watchdog = setTimeout(() => { if (isCurrent()) workerFailed(); }, 8000);
      current.addEventListener('error', event => {
        event.preventDefault();
        if (isCurrent()) workerFailed();
      });
      current.addEventListener('messageerror', () => { if (isCurrent()) workerFailed(); });
      current.addEventListener('message', ({ data }) => {
        if (!isCurrent()) return;
        clearTimeout(watchdog);
        if (!ready && data?.ready === true) {
          ready = true;
          if (!paused) startClock();
          synchronize();
        } else if (job) acceptMove(data);
      });
    } catch {
      workerFailed();
    }
  }

  function requestMove(kind) {
    if (!ready || job) return;
    const fen = match.game.fen();
    const level = kind === 'hint' ? cpuHintLevel : cpuLevels[match.settings.level - 1];
    const remaining = match.clocks()[match.game.turn()];
    const increment = match.time?.increment ?? 0;
    const ms = Math.max(1, Math.min(level.ms, remaining * .08 + increment * .15, remaining * .45));
    job = { kind, fen };
    try {
      watchdog = setTimeout(workerFailed, 8000);
      worker.postMessage({ fen, level: { ...level, ms } });
    } catch { workerFailed(); }
  }

  function acceptMove(data) {
    const { kind, fen } = job;
    job = null;
    if (match.flag()) { synchronize(); return; }
    if (match.outcome || match.game.fen() !== fen || match.anchor === null) return;
    if (!match.legalMove(data?.move)) { workerFailed(); return; }
    if (kind === 'hint') {
      hint = [data.move];
      const from = data.move.slice(0, 2);
      const to = data.move.slice(2, 4);
      const promotion = { q: 'クイーン', r: 'ルーク', b: 'ビショップ', n: 'ナイト' }[data.move[4]];
      node('feedback').textContent = `ヒント：${from} の駒を ${to} へ。${promotion ? promotion + 'に昇格します。' : ''}`;
    } else {
      match.play(data.move, otherChessColor(match.player));
    }
    synchronize();
  }

  function synchronize() {
    if (!match) return;
    if (match.outcome) {
      disposeWorker();
      stopClock();
      confirmation = null;
      if (confirmDialog.open) confirmDialog.close();
      board.close();
    } else if (!paused && !failure) {
      if (!worker) loadWorker();
      if (ready && match.game.turn() !== match.player) requestMove('cpu');
    }
    render();
  }

  function start() {
    close();
    match = new CpuMatch(settings);
    node('setup').hidden = true;
    node('session').hidden = false;
    board.reset();
    node('title').focus();
    window.scrollTo(0, 0);
    synchronize();
  }

  function close() {
    if (!match) return;
    disposeWorker();
    stopClock();
    board.reset();
    confirmation = null;
    if (confirmDialog.open) confirmDialog.close();
    match = null;
    paused = saved = resultShown = false;
    hint = [];
    failure = timeLimitResult = '';
    node('pgn').hidden = true;
    node('view-pgn').setAttribute('aria-expanded', 'false');
    node('export-status').textContent = '';
  }

  function open() {
    showSettings();
    showScreen('cpu', 'cpu-title');
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

  function resultText(outcome) {
    const prefix = outcome.winner === null ? '引き分け' : outcome.winner === match.player ? '勝利' : '敗北';
    const reason = outcome.reason === 'flag'
      ? (match.game.turn() === match.player ? '時間切れ' : 'コンピューターの時間切れ') : reasons[outcome.reason];
    return prefix + '：' + reason;
  }

  function showResult() {
    const result = resultText(match.outcome);
    node('result-title').textContent = result;
    const canContinue = match.settings.mode === 'practice' && match.outcome.reason === 'flag';
    node('continue').hidden = !canContinue;
    let note = canContinue ? 'この局面から、時間を気にせず練習を続けられます。' : '';
    if (match.continued) note = `時間切れ後の練習結果です。継続前の結果は「${timeLimitResult}」でした。`;
    if (match.settings.mode === 'match' && !saved) {
      records.unshift({ date: match.started.toISOString(), level: match.settings.level, color: match.player,
        time: timeLabel(match.settings), result });
      records = records.slice(0, recordLimit);
      note = writeStorage(cpuResultsKey, records) ? 'このブラウザーに実戦結果を保存しました。' : '実戦結果はこのタブを開いている間だけ確認できます。';
      saved = true;
    }
    if (resultShown) return;
    node('result-note').textContent = note;
    node('pgn').value = cpuPgn(match);
    node('result-title').focus();
    resultShown = true;
  }

  function render() {
    const live = !match.outcome;
    const practice = match.settings.mode === 'practice';
    node('opponent').textContent = 'コンピューター · ' + levelLabel(match.settings.level);
    node('opponent-color').textContent = labels[otherChessColor(match.player)];
    node('player-color').textContent = labels[match.player];
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
    let status = live ? failure || (paused ? '一時停止中' : !ready && match.anchor === null ? 'エンジンを読み込み中…'
      : playable() ? job?.kind === 'hint' ? 'ヒントを考えています…' : 'あなたの手番です。'
        : 'コンピューターが考えています…') : '対局が終了しました。';
    if (live && !paused && match.game.isCheck()) status += ' チェックです。';
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
    ask('途中の対局は保存されません。このページを離れますか？', 'ページを離れる', () => {
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
  node('undo').addEventListener('click', () => {
    if (!match.undo()) { synchronize(); return; }
    disposeWorker();
    hint = [];
    board.reset();
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
      disposeWorker();
      board.reset();
    } else {
      startClock();
    }
    synchronize();
  });
  node('draw').addEventListener('click', () => { if (playable()) { match.claim(); synchronize(); } });
  node('resign').addEventListener('click', () => ask('投了すると、この対局はここで終了します。', '投了する', () => {
    if (!match.flag()) match.finish('resign', otherChessColor(match.player));
    synchronize();
  }));
  node('restart').addEventListener('click', () => ask('今の対局を終了し、同じ設定で新しい対局を始めます。', '再戦する', start));
  node('settings-back').addEventListener('click', () => leave(backToSettings));
  node('rematch').addEventListener('click', start);
  node('change').addEventListener('click', backToSettings);
  node('continue').addEventListener('click', () => {
    const result = resultText(match.outcome);
    if (!match.continuePractice()) return;
    timeLimitResult = result;
    resultShown = false;
    hint = [];
    board.reset();
    startClock();
    synchronize();
    node('title').focus();
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

  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  window.addEventListener('pagehide', () => { if (match && !match.outcome) close(); });
  window.addEventListener('pageshow', event => {
    if (event.persisted && location.hash === '#cpu' && !match) open();
  });
  return { open, close, leave };
})();

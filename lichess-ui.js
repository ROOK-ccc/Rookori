const lichessPage = (() => {
  const get = id => byId('lichess-' + id);
  const client = createLichessClient();
  const form = get('form');
  const user = get('username');
  const list = get('list');
  const chosen = new Set();
  const saved = new Set();
  let games = [];
  let controller, cooldownTimer;
  let busy = false;
  let session = 0;
  let loaded = false;
  let initialized = false;
  let savedKnown = false;

  function addFormats(select) {
    for (const [value, label] of Object.entries(lichessFormats)) {
      const option = element('option', label);
      option.value = value;
      select.append(option);
    }
  }
  addFormats(get('format'));
  addFormats(get('filter-format'));

  const visible = () => !byId('external').hidden;
  const status = message => { get('status').textContent = message; };
  const signed = points => points > 0 ? '+' + points : String(points);
  const timeLabel = time => time?.days ? `1手 ${time.days}日`
    : time ? `${time.initial % 60 ? time.initial + '秒' : time.initial / 60 + '分'} ＋ ${time.increment}秒` : null;

  function storeUsername() {
    const value = user.value.trim();
    try {
      if (!value) localStorage.removeItem(lichessUsernameKey);
      else if (lichessUsername.test(value)) localStorage.setItem(lichessUsernameKey, value);
    } catch { /* Fetching still works in this tab. */ }
  }

  function controls() {
    clearTimeout(cooldownTimer);
    const waiting = client.remaining();
    get('submit').disabled = Boolean(controller || busy || waiting);
    get('cancel').hidden = !controller;
    get('forget').disabled = Boolean(controller);
    get('cooldown').textContent = waiting ? `あと約${waiting}秒で再取得できます。` : '';
    if (waiting && visible()) cooldownTimer = setTimeout(controls, 1000);
    if (waiting && !controller) get('submit').setAttribute('aria-describedby', 'lichess-cooldown');
    else get('submit').removeAttribute('aria-describedby');
  }

  function filtered() {
    const result = get('filter-result').value;
    const color = get('filter-color').value;
    const format = get('filter-format').value;
    return games.filter(({ source }) =>
      (result === 'all' || result === source.result) && (color === 'all' || color === source.color)
      && (format === 'all' || format === source.format) && (!get('filter-unsaved').checked || !saved.has(source.id)));
  }

  function makeButton(text, action) {
    const button = element('button', text, 'button secondary');
    button.type = 'button';
    button.disabled = busy;
    button.addEventListener('click', action);
    return button;
  }

  function render() {
    const entries = filtered();
    get('results').hidden = !games.length;
    get('count-status').textContent = entries.length ? `${entries.length}局を表示` : '条件に合う対局はありません。';
    get('select-all').disabled = get('select-new').disabled = busy || !entries.length;
    get('save-selected').disabled = busy || !chosen.size;
    get('selected').textContent = `${chosen.size}局を選択中`;
    list.replaceChildren(...entries.map((game, index) => {
      const { source } = game;
      const item = element('li', null, 'game-card');
      const picker = element('label', null, 'lichess-pick');
      const checkbox = element('input');
      checkbox.type = 'checkbox';
      checkbox.checked = chosen.has(source.id);
      checkbox.disabled = busy;
      checkbox.setAttribute('aria-label', `${index + 1}番目の対局（相手 ${source.opponent ?? '未取得'}）を選択`);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) chosen.add(source.id);
        else chosen.delete(source.id);
        get('save-selected').disabled = !chosen.size;
        get('selected').textContent = `${chosen.size}局を選択中`;
      });
      picker.append(checkbox, element('strong', source.opponent ? `対局相手 ${source.opponent}` : '対局相手は未取得'));
      const date = new Date(source.date).toLocaleString('ja-JP');
      item.append(picker, element('p', [date, lichessResults[source.result], source.color === 'white' ? '白番' : '黒番',
        lichessFormats[source.format], timeLabel(source.time)].filter(Boolean).join(' ／ ')));
      if (source.opening) item.append(element('p', `オープニング ${source.opening}`));
      const ratings = [[ '指定ユーザー', source.rating, source.ratingDiff ], [ '相手', source.opponentRating, source.opponentRatingDiff ]]
        .filter(([, rating, change]) => rating !== null || change !== null)
        .map(([label, rating, change]) => `${label} ${rating ?? '未取得'}${change === null ? '' : '（' + signed(change) + '）'}`);
      if (ratings.length) item.append(element('p', 'レーティング ' + ratings.join(' ／ ')));
      const actions = element('div', null, 'study-mode-links');
      const link = element('a', 'Lichessで対局を開く', 'text-button');
      link.href = source.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      const save = makeButton('棋譜ライブラリに保存する', () => saveGames([game]));
      // Pressing the action on an existing entry returns its original record.
      save.hidden = saved.has(source.id);
      actions.append(makeButton('この対局を復習する', () => saveGames([game], true)), save, link);
      item.append(element('p', saved.has(source.id) ? '取り込み済み' : savedKnown ? '未取り込み' : '保存状況は未確認'), actions);
      return item;
    }));
    controls();
  }

  async function refreshSaved() {
    try {
      const ids = await gameReviewPages.lichessIds();
      saved.clear();
      for (const id of ids) saved.add(id);
      savedKnown = true;
      return true;
    } catch {
      savedKnown = false;
      return false;
    }
  }

  async function fetchGames(event) {
    event.preventDefault();
    if (controller || busy) return;
    const username = user.value.trim();
    if (!lichessUsername.test(username)) {
      status(username ? 'Lichessユーザー名は半角英数字・_・-で入力してください。' : 'Lichessユーザー名を入力してください。');
      user.focus();
      return;
    }
    if (navigator.onLine === false) { status('インターネットに接続されていません。'); return; }
    storeUsername();
    const format = get('format').value;
    const request = controller = new AbortController();
    controls();
    status('Lichessから公開棋譜を取得しています…');
    try {
      const raw = await client.games(username, Number(get('limit').value), format, request.signal);
      if (controller !== request || request.signal.aborted) return;
      const entries = new Map();
      let ignored = 0;
      for (const game of raw) {
        try {
          const entry = normalizeLichessGame(game, username, format);
          if (entry) entries.set(entry.source.id, entry);
          else ignored++;
        } catch { ignored++; }
      }
      games = [...entries.values()].sort((a, b) => b.source.date.localeCompare(a.source.date));
      chosen.clear();
      get('filter-result').value = get('filter-color').value = get('filter-format').value = 'all';
      get('filter-unsaved').checked = false;
      loaded = true;
      const available = await refreshSaved();
      if (controller !== request || request.signal.aborted) return;
      const message = games.length ? `${username}の公開棋譜を${games.length}局取得しました。`
        : '条件に合う公開棋譜はありません。';
      status(message + (ignored ? ` 対応外または読み込めない棋譜を${ignored}局除きました。` : '')
        + (available ? '' : ' 保存状況を確認できませんでした。'));
    } catch (error) {
      if (controller !== request) return;
      status(request.signal.aborted ? '棋譜の取得を取り消しました。'
        : error instanceof TypeError ? 'Lichess APIに接続できませんでした。接続を確認して、もう一度お試しください。' : error.message);
    } finally {
      if (controller === request) {
        controller = null;
        if (visible()) render();
      }
    }
  }

  async function saveGames(entries, review = false) {
    if (busy || !entries.length) return;
    busy = true;
    const activeSession = session;
    const counts = { added: 0, duplicate: 0, failed: 0 };
    let target, preview;
    render();
    status('選んだ棋譜を保存しています…');
    for (const entry of entries) {
      try {
        const [game, extra] = parseReviewGames(entry.pgn);
        if (extra || !game.metadata.hasEndMarker) throw new Error('完成した棋譜を確認できません。');
        game.source = validateReviewExternal(entry.source, game.pgn, game.metadata.result);
        if (review) preview = game;
        const { record, duplicate } = await gameReviewPages.saveExternal(game);
        if (review && sameReviewMainline(record, game)) target = record;
        saved.add(entry.source.id);
        chosen.delete(entry.source.id);
        counts[duplicate ? 'duplicate' : 'added']++;
      } catch { counts.failed++; }
    }
    busy = false;
    if (!visible()) return;
    render();
    if (session !== activeSession) return;
    if (review && preview) {
      gameReviewPages.openSavedOrPreview(target, preview);
      return;
    }
    const summary = `保存 ${counts.added}局、重複 ${counts.duplicate}局、失敗 ${counts.failed}局。`;
    status(summary + (counts.failed ? ' 保存できなかった棋譜があります。棋譜の形式やブラウザーの保存設定を確認してください。' : ''));
  }

  function selectGames(onlyNew) {
    if (onlyNew) chosen.clear();
    for (const { source } of filtered()) {
      if (!onlyNew || !saved.has(source.id)) chosen.add(source.id);
    }
    render();
  }

  form.addEventListener('submit', fetchGames);
  user.addEventListener('change', storeUsername);
  get('forget').addEventListener('click', () => {
    user.value = '';
    storeUsername();
    user.focus();
    status('保存したユーザー名を削除しました。');
  });
  get('cancel').addEventListener('click', () => controller?.abort());
  get('filters').addEventListener('change', render);
  get('select-all').addEventListener('click', () => selectGames(false));
  get('select-new').addEventListener('click', () => selectGames(true));
  get('save-selected').addEventListener('click', () => saveGames(games.filter(({ source }) => chosen.has(source.id))));

  return {
    open() {
      const current = ++session;
      if (!initialized) {
        initialized = true;
        try {
          const username = localStorage.getItem(lichessUsernameKey);
          if (username && lichessUsername.test(username)) user.value = username;
        } catch { /* Storage may be unavailable. */ }
      }
      showScreen('external', 'external-title');
      render();
      if (loaded) refreshSaved().then(() => { if (session === current && visible()) render(); });
    },
    close() {
      session++;
      controller?.abort();
      clearTimeout(cooldownTimer);
    },
  };
})();

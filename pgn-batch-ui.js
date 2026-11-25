const pgnBatchPage = (() => {
  const ui = name => byId('batch-' + name);
  const library = createGameLibrary();
  const yieldToPage = () => new Promise(resolve => setTimeout(resolve, 0));
  let active = null;
  let candidates = [];

  function busy(task) {
    active = task;
    ui('form').disabled = Boolean(task);
    ui('review').disabled = Boolean(task);
    ui('cancel').hidden = !task;
    if (task) ui('cancel').disabled = false;
  }

  function render(rows, known) {
    ui('list').replaceChildren();
    const seen = new Set(known);
    for (const [index, candidate] of rows.entries()) {
      const { game, key } = candidate;
      const { white, black, date, result } = game.metadata;
      const duplicate = seen.has(key);
      seen.add(key);
      const li = element('li', null, 'dashboard-task');
      const checkLabel = element('label', null, 'batch-check');
      const check = element('input');
      check.type = 'checkbox';
      check.checked = !duplicate;
      check.disabled = duplicate;
      checkLabel.append(check, document.createTextNode(`${index + 1}. ${white ?? '白'} 対 ${black ?? '黒'}`));
      const info = element('p', [date, styleFinished(game) ? gameResults[result] : '終了未確認', duplicate ? '重複候補' : null]
        .filter(Boolean).join(' · '));
      li.append(checkLabel, info);
      const side = element('select');
      for (const [value, label] of [['', '選択しない'], ['w', '白番'], ['b', '黒番'], ['exclude', '研究用（集計しない）']]) {
        const option = element('option', label);
        option.value = value;
        side.append(option);
      }
      const sideLabel = element('label', `自分の色（${index + 1}局目） `);
      sideLabel.append(side);
      side.disabled = duplicate || !styleFinished(game);
      if (!side.disabled) li.append(sideLabel);
      ui('list').append(li);
      Object.assign(candidate, { check, side, info });
    }
    ui('review').hidden = !rows.length;
  }

  async function scan(event) {
    event.preventDefault();
    if (active) return;
    const input = ui('text').value.trim();
    const files = [...ui('files').files];
    if (!input && !files.length) {
      ui('status').textContent = '棋譜ファイルを選ぶか、棋譜の文章を貼り付けてください。';
      return;
    }
    const textBytes = new Blob([input]).size;
    if (files.length > batchLimits.files || textBytes + files.reduce((sum, file) => sum + file.size, 0) > batchLimits.total) {
      ui('status').textContent = 'ファイルは最大20個、貼り付け分と合わせて8 MBまでです。分けて読み込んでください。';
      return;
    }
    const task = { cancelled: false };
    busy(task);
    candidates = [];
    render([], []);
    ui('errors').replaceChildren();
    ui('result').hidden = true;
    const failures = [];
    let checked = 0;
    let capped = false;
    try {
      const known = new Set((await library.all()).map(batchGameKey));
      const sources = [...files.map(file => ({ name: file.name, size: file.size, read: () => file.text() })),
        ...(input ? [{ name: '貼り付けた棋譜', size: textBytes, read: () => input }] : [])];
      for (const source of sources) {
        if (task.cancelled || capped) break;
        if (source.size > batchLimits.file) { failures.push(`${source.name}：1件あたり2 MBまでです。`); continue; }
        let contents;
        try { contents = await source.read(); }
        catch { failures.push(`${source.name}：ファイルを読み込めませんでした。`); continue; }
        if (!contents.trim()) { failures.push(`${source.name}：棋譜が空です。`); continue; }
        let index = 0;
        for (const pgn of batchPgnRecords(contents)) {
          if (task.cancelled) break;
          if (checked >= batchLimits.games) { capped = true; break; }
          checked++;
          index++;
          ui('status').textContent = `${checked}局目を確認しています。`;
          await yieldToPage();
          if (task.cancelled) break;
          try {
            const [game, extra] = parseReviewGames(pgn);
            if (extra) throw new Error('対局の区切りを確認してください。');
            candidates.push({ game, key: batchGameKey(game) });
          } catch (error) {
            failures.push(`${source.name} ${index}局目：${error.message.replace(/^\d+局目：/, '')}`);
          }
        }
      }
      render(candidates, known);
      const duplicates = candidates.filter(({ check }) => check.disabled).length;
      ui('status').textContent = `${task.cancelled ? '読み取りを中止しました。' : ''}候補 ${candidates.length}局、読み取りエラー ${failures.length}件。`
        + (duplicates ? ` 重複候補 ${duplicates}局は選択から外しました。` : '')
        + (capped ? ' 200局に達しました。残りは分けて読み込んでください。' : '');
      ui('errors').append(...failures.map(message => element('li', message)));
    } catch {
      ui('status').textContent = '対局履歴を開けませんでした。ブラウザーの保存設定を確認してください。';
    } finally { busy(null); }
  }

  async function save() {
    if (active) return;
    const selected = candidates.filter(({ check }) => check.checked && !check.disabled);
    if (!selected.length) { ui('status').textContent = '保存する対局を選んでください。'; return; }
    const task = { cancelled: false };
    busy(task);
    let saved = 0;
    let duplicates = 0;
    let failed = 0;
    let colorsFailed = 0;
    let full = false;
    let firstId;
    try {
      const known = new Set((await library.all()).map(batchGameKey));
      for (const row of selected) {
        if (task.cancelled) break;
        ui('status').textContent = `${saved + duplicates + failed + 1} / ${selected.length}局目を保存しています。`;
        await yieldToPage();
        if (task.cancelled) break;
        try {
          const id = await batchLocalId(row.key);
          const added = !known.has(row.key) && await library.saveBatchGame(row.game, id);
          if (added) {
            firstId ??= id;
            saved++;
            if (row.side.value) {
              const owned = personalPreference(styleOwnershipKey, {});
              if (!savePersonalPreference(styleOwnershipKey, { ...owned, [id]: row.side.value })) colorsFailed++;
            }
          } else duplicates++;
          known.add(row.key);
          row.check.checked = false;
          row.check.disabled = row.side.disabled = true;
          row.info.append(added ? ' · 保存済み' : ' · 重複');
        } catch (error) {
          failed++;
          if (error.name === 'QuotaExceededError') { full = true; break; }
        }
      }
      ui('status').textContent = `保存 ${saved}局、重複 ${duplicates}局、失敗 ${failed}局、未処理 ${selected.length - saved - duplicates - failed}局。`
        + (task.cancelled ? ' 保存を中止しました。' : '')
        + (full ? ' 保存容量が足りません。保存済みの対局は対局履歴で確認できます。' : '')
        + (colorsFailed ? ` ${colorsFailed}局の使用色を保存できませんでした。「あなたの棋風」で設定できます。` : '');
      if (firstId) { ui('open').href = '#game-review/' + firstId; ui('result').hidden = false; }
    } catch {
      ui('status').textContent = '対局履歴を開けなかったため、保存を開始できませんでした。';
    } finally { busy(null); }
  }

  ui('import').addEventListener('submit', scan);
  ui('save').addEventListener('click', save);
  ui('cancel').addEventListener('click', () => { if (active) active.cancelled = true; ui('cancel').disabled = true; });
  ui('all').addEventListener('click', () => {
    const available = candidates.filter(({ check }) => !check.disabled);
    const select = available.some(({ check }) => !check.checked);
    for (const { check } of available) check.checked = select;
  });
  ui('match').addEventListener('click', () => {
    let matched = 0;
    for (const { game, side } of candidates) {
      const color = batchPlayerColor(game, ui('name').value);
      if (side.disabled || side.value === 'exclude' || !color) continue;
      side.value = color;
      matched++;
    }
    ui('status').textContent = `${matched}局の色を設定しました。候補を確認してから保存してください。`;
  });
})();

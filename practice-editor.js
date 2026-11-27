(() => {
  const get = id => document.getElementById('puzzle-' + id);
  const form = get('edit');
  const draftKey = 'rookori.practice-editor.draft.v1';
  const make = (tag, text = '') => Object.assign(document.createElement(tag), { textContent: text });
  const status = text => { get('status').textContent = text; };
  const fetchJson = async url => {
    const response = await fetch(url);
    if (!response.ok) throw new Error('教材ファイルを読み込めません。');
    return response.json();
  };
  let edits, index, current, original, replay, ply = 0, request = 0, drafts = {};
  try {
    const saved = JSON.parse(localStorage.getItem(draftKey) ?? '{}');
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) drafts = saved;
  } catch { status('下書きを読み込めませんでした。'); }
  const words = value => value.trim() ? value.trim().split(/\s+/) : [];
  function read() {
    const field = form.elements;
    return { published: field.published.checked, fen: field.fen.value.trim(), rating: field.rating.valueAsNumber,
      moves: words(field.moves.value), tags: words(field.tags.value),
      explanationStatus: field.explanationStatus.value,
      alternatives: field.alternatives.value.split('\n').filter(line => line.trim()).map(words),
      ...Object.fromEntries(['title','prompt','hint','explanation','source'].map(key => [key, field[key].value.trim()])) };
  }
  function write(data) {
    for (const [key, value] of Object.entries(data)) {
      if (key === 'published') form.elements[key].checked = value;
      else form.elements[key].value = key === 'alternatives' ? value.map(line => line.join(' ')).join('\n')
        : Array.isArray(value) ? value.join(' ') : value;
    }
  }
  function diff() {
    if (!current) return;
    get('diff').replaceChildren(...Object.entries(read()).flatMap(([key, value]) => {
      if (JSON.stringify(value) === JSON.stringify(original[key] ?? '')) return [];
      const li = make('li');
      const details = make('details');
      details.append(make('summary', form.elements[key].labels[0].textContent.split('\n')[0]),
        make('p', '編集前 ' + JSON.stringify(original[key] ?? '')), make('p', '編集後 ' + JSON.stringify(value)));
      li.append(details);
      return [li];
    }));
  }
  function board() {
    const line = [replay.moves, ...replay.alternatives][Number(get('line').value)];
    const game = new chessRules.Chess(replay.fen);
    const played = line.slice(0, ply).map(move =>
      game.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] }).san);
    get('board').replaceChildren(...game.board().flatMap((rank, row) => rank.map((piece, col) => {
      const square = make('div');
      square.className = 'study-square' + ((row + col) % 2 ? ' dark-square' : '');
      if (piece) square.append(Object.assign(make('img'), { src: `pieces/cburnett/${piece.color}${piece.type.toUpperCase()}.svg`, alt: '' }));
      return square;
    })));
    get('moves').textContent = ply + ' / ' + line.length + '手 ' + played.join(' ');
    get('prev').disabled = ply === 0;
    get('next').disabled = ply >= line.length;
  }
  function validate() {
    const safe = validatePracticeEdit(read(), current, chessRules);
    replay = safe;
    get('line').replaceChildren(new Option('正解手順', '0'),
      ...safe.alternatives.map((_, i) => new Option('別解 ' + (i + 1), String(i + 1))));
    ply = 0;
    board();
    const facts = practiceLineFacts(safe.fen, safe.moves);
    get('facts').replaceChildren(...[facts.summary, ...facts.details].map(value => make('p', value)));
    return safe;
  }
  async function open() {
    const token = ++request, id = get('choice').value;
    get('workspace').hidden = true;
    current = null;
    if (!id) return;
    try {
      const row = (await fetchJson('puzzles/' + index.get(id) + '.json')).find(puzzle => puzzle[0] === id);
      if (request !== token) return;
      current = row;
      original = validatePracticeEdit(edits[id] ?? {}, row, chessRules);
      form.reset();
      write(original);
      get('workspace').hidden = false;
      validate();
      if (drafts[id]) write(drafts[id]);
      diff();
      status(id + ' を開きました。');
    } catch (error) { if (request === token) status(error.message); }
  }
  function search() {
    const query = get('search').value.trim().toLowerCase();
    const missing = get('unwritten').checked;
    const filter = get('filter').value;
    const matches = [...index.keys()].filter(id =>
      (id.toLowerCase().includes(query) || edits[id]?.title?.toLowerCase().includes(query)) && (!missing || !edits[id]?.explanation?.trim())
      && (!filter || filter === (edits[id]?.explanationStatus ?? (edits[id]?.explanation?.trim() ? 'authored' : 'generated'))));
    get('choice').replaceChildren(new Option('問題を選ぶ（' + matches.length + '件）', ''),
      ...matches.slice(0, 200).map(id => new Option(id + (edits[id]?.title ? ' · ' + edits[id].title : ''), id)));
    if (matches.length === 1) get('choice').value = matches[0];
    open();
    status(matches.length > 200 ? '最初の200件を表示中です。問題IDや名前で絞り込めます。' : '');
  }
  get('search').addEventListener('input', () => { if (index) search(); });
  get('unwritten').addEventListener('change', () => { if (index) search(); });
  get('filter').addEventListener('change', () => { if (index) search(); });
  get('choice').addEventListener('change', open);
  form.addEventListener('submit', event => event.preventDefault());
  form.addEventListener('input', event => {
    if (!current) return;
    if (event.target.name === 'explanation' && event.target.value.trim() && form.elements.explanationStatus.value === 'generated') {
      form.elements.explanationStatus.value = 'authored';
    }
    drafts[current[0]] = read();
    diff();
  });
  get('line').addEventListener('change', () => { ply = 0; board(); });
  get('prev').addEventListener('click', () => { ply--; board(); });
  get('next').addEventListener('click', () => { ply++; board(); });
  get('draft').addEventListener('click', () => {
    try { localStorage.setItem(draftKey, JSON.stringify(drafts)); status('このブラウザーに下書きを保存しました。'); }
    catch { status('ブラウザーに下書きを保存できませんでした。'); }
  });
  get('check').addEventListener('click', () => {
    try { validate(); status('局面とすべての手順を検証しました。'); } catch (error) { status(error.message); }
  });
  get('export').addEventListener('click', () => {
    try {
      const safe = validate();
      const url = URL.createObjectURL(new Blob([JSON.stringify({ ...edits, [current[0]]: safe }, null, 2) + '\n'], { type: 'application/json' }));
      const link = Object.assign(make('a'), { href: url, download: 'practice-edits.json' });
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status('書き出しました。差分を確認してから、作業フォルダーの変更ファイルに反映してください。');
    } catch (error) { status(error.message); }
  });
  get('apply').addEventListener('click', async () => {
    if (!current) return;
    const id = current[0];
    try {
      const safe = validate();
      diff();
      if (!get('diff').childElementCount) throw new Error('反映する変更はありません。');
      if (!window.confirm(id + ' の変更を作業フォルダーに反映しますか？ 本番公開には別途GitHub Desktopでの操作が必要です。')) return;
      get('apply').disabled = true;
      const submittedDraft = drafts[id];
      const saved = await applyEditorChange('practice', id, edits[id], safe);
      edits[id] = saved;
      if (drafts[id] === submittedDraft) delete drafts[id];
      try { localStorage.setItem(draftKey, JSON.stringify(drafts)); } catch { /* The worktree has already been saved. */ }
      if (current?.[0] === id) { original = saved; diff(); }
      status('作業フォルダーに反映しました。GitHub Desktopで差分を確認できます。');
    } catch (error) { status(error.message); }
    finally { get('apply').disabled = false; }
  });
  Promise.all([fetchJson('puzzles/catalog.json'), fetchJson('practice-edits.json')]).then(([catalog, changes]) => {
    edits = changes;
    index = new Map(Object.entries(catalog.batches).flatMap(([name, row]) => row.ids.map(id => [id, name])));
    search();
  }).catch(error => status(error.message));
})();

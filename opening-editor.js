const localOpeningEditor = (() => {
  const get = id => document.getElementById('lesson-' + id);
  const make = (tag, text = '') => {
    const node = document.createElement(tag);
    node.textContent = text;
    return node;
  };
  const key = 'rookori.opening-editor.drafts.v1';
  const fields = get('fields');
  const catalog = [...studyOpenings, ...openingVariations].map(row => ({ ...row }));
  const baseCatalog = [...baseStudyOpenings, ...baseOpeningVariations];
  let drafts = {};
  let entry;
  let notation = [];
  try { drafts = validateOpeningEdits(JSON.parse(localStorage.getItem(key) || '{}'), baseCatalog, { draft: true }); }
  catch { get('status').textContent = '既存の下書きを読み込めませんでした。'; }

  function toText(value) {
    return Array.isArray(value) ? value.join('\n') : value ?? '';
  }

  function fieldValue(name) {
    return name === 'aliases' ? entry.aliases ?? openingAliases[entry.id] : entry[name];
  }

  function valueOf(field) {
    if (field.name === 'aliases') return field.value.split('\n').map(value => value.trim()).filter(Boolean);
    return field.value.trim();
  }

  function draft() {
    const changes = {};
    const explanations = [...entry.explanations];
    const missing = [];
    for (const control of fields.elements) {
      const name = control.name;
      const value = valueOf(control);
      if (name.startsWith('ply-')) {
        const i = Number(name.slice(4));
        if (!value) missing.push(notation[i]);
        explanations[i] = value;
      } else {
        if (!value && ['name', 'english', 'description'].includes(name)) missing.push(openingEditFields[name]);
        if (toText(value) !== toText(fieldValue(name))) changes[name] = value;
      }
    }
    if (explanations.some((value, i) => value !== entry.explanations[i])) changes.explanations = explanations;
    return { changes, missing };
  }

  function preview() {
    const { changes, missing } = draft();
    const edited = { ...entry, ...changes };
    const label = openingEditFields;
    const list = make('ol');
    edited.explanations.forEach((explanation, i) => list.append(make('li', notation[i] + ' ' + explanation)));
    get('preview').replaceChildren(make('h3', edited.name), make('p', edited.english), make('p', edited.description), list,
      ...Object.keys(label).filter(name => !['name', 'english', 'description', 'seoTitle', 'seoDescription', 'updated'].includes(name))
        .filter(name => toText(edited[name])).map(name => {
          const section = make('section');
          section.append(make('h4', label[name]), make('p', toText(edited[name])));
          return section;
        }));
    get('diff').replaceChildren(...Object.entries(changes).map(([name, value]) => {
      const row = make('li');
      const details = make('details');
      details.append(make('summary', label[name] ?? '各着手の解説'),
        make('p', '編集前\n' + toText(fieldValue(name))), make('p', '編集後\n' + toText(value)));
      details.style.whiteSpace = 'pre-wrap';
      row.append(details);
      return row;
    }));
    get('missing').textContent = missing.length ? '必須項目の未入力 ' + missing.join('、') : '必須項目は入力済みです。';
  }

  function renderBoard() {
    const study = new OpeningStudy(entry.moves);
    const step = get('ply').selectedIndex;
    for (let i = 0; i < step; i++) if (!study.advance()) throw new Error('棋譜を再生できません。');
    const board = get('board');
    board.setAttribute('aria-label', step ? notation[step - 1] + 'の局面' : '初期局面');
    board.replaceChildren(...study.game.board().flatMap((rank, row) => rank.map((piece, col) => {
      const cell = make('div');
      cell.className = (row + col) % 2 ? 'study-square dark-square' : 'study-square';
      if (piece) {
        const img = make('img');
        img.alt = '';
        img.src = './pieces/cburnett/' + piece.color + piece.type.toUpperCase() + '.svg';
        cell.append(img);
      }
      return cell;
    })));
  }

  function addField(label, name, value) {
    const wrapper = make('label', label);
    const control = make('textarea');
    control.rows = ['description', 'tip', 'faq'].includes(name) ? 3 : 2;
    control.name = name;
    control.value = toText(value);
    if (name.startsWith('ply-')) control.addEventListener('focus', () => {
      get('ply').selectedIndex = Number(name.slice(4)) + 1;
      renderBoard();
    });
    wrapper.append(control);
    fields.append(wrapper);
  }

  function selectLesson() {
    entry = catalog.find(row => row.id === get('variant').value);
    fields.replaceChildren();
    get('save').disabled = get('export').disabled = get('apply').disabled = !entry;
    get('board').parentElement.hidden = !entry;
    if (!entry) return;
    notation = openingNotation(entry);
    const saved = drafts[entry.id] ?? {};
    for (const [name, label] of Object.entries(openingEditFields)) addField(label, name, saved[name] ?? fieldValue(name));
    notation.forEach((san, i) => addField(san + 'の解説', 'ply-' + i, (saved.explanations ?? entry.explanations)[i]));
    get('ply').replaceChildren(...['初期局面', ...notation].map(text => make('option', text)));
    renderBoard();
    preview();
  }

  function selectParent() {
    const parent = get('parent').value;
    get('variant').replaceChildren(...catalog.filter(row => row.id === parent || row.parentId === parent)
      .map(row => Object.assign(make('option', row.name), { value: row.id })));
    selectLesson();
  }

  get('search').addEventListener('input', () => {
    const query = get('search').value.trim().toLowerCase();
    const matches = new Set(catalog.filter(row => [row.id, row.name, row.english, ...(row.aliases ?? openingAliases[row.id] ?? [])]
      .some(value => value?.toLowerCase().includes(query))).map(row => row.parentId ?? row.id));
    get('parent').replaceChildren(...studyOpenings.filter(row => matches.has(row.id))
      .map(row => Object.assign(make('option', row.name), { value: row.id })));
    selectParent();
  });
  fields.addEventListener('submit', event => event.preventDefault());
  fields.addEventListener('input', () => {
    drafts[entry.id] = draft().changes;
    preview();
  });
  get('parent').addEventListener('change', selectParent);
  get('variant').addEventListener('change', selectLesson);
  get('ply').addEventListener('change', renderBoard);
  get('save').addEventListener('click', () => {
    const { changes } = draft();
    const next = { ...drafts, [entry.id]: changes };
    try {
      validateOpeningEdits(next, baseCatalog, { draft: true });
      localStorage.setItem(key, JSON.stringify(next));
      drafts = next;
      get('status').textContent = '下書きを保存しました。';
    } catch {
      get('status').textContent = '下書きを保存できませんでした。この画面を開いたまま内容を控えてください。';
    }
  });
  get('export').addEventListener('click', () => {
    const { changes, missing } = draft();
    try {
      if (missing.length) throw new Error('必須項目を入力してください。');
      const pack = validateOpeningEdits({ ...openingEdits, [entry.id]: { ...openingEdits[entry.id], ...changes } }, baseCatalog);
      const content = 'const openingEdits = ' + JSON.stringify(pack, null, 2) + ';\n';
      const url = URL.createObjectURL(new Blob([content], { type: 'text/javascript;charset=utf-8' }));
      const link = Object.assign(make('a'), { href: url, download: 'opening-edits-data.js' });
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      get('status').textContent = '公開候補を書き出しました。差分を確認して教材データに反映してください。';
    } catch (error) { get('status').textContent = error.message; }
  });
  get('apply').addEventListener('click', async () => {
    const owner = entry;
    const { changes, missing } = draft();
    try {
      if (missing.length) throw new Error('必須項目を入力してください。');
      if (!Object.keys(changes).length) throw new Error('反映する変更はありません。');
      const before = openingEdits[owner.id];
      const edit = { ...before, ...changes };
      validateOpeningEdits({ [owner.id]: edit }, baseCatalog);
      if (!window.confirm(owner.name + 'の変更を作業フォルダーに反映しますか？ 本番公開には別途GitHub Desktopでの操作が必要です。')) return;
      get('apply').disabled = true;
      const saved = await applyEditorChange('opening', owner.id, before, edit);
      openingEdits[owner.id] = saved;
      Object.assign(owner, saved);
      if (entry === owner) drafts[owner.id] = draft().changes;
      else if (JSON.stringify(drafts[owner.id]) === JSON.stringify(changes)) delete drafts[owner.id];
      try { localStorage.setItem(key, JSON.stringify(drafts)); } catch { /* The worktree has already been saved. */ }
      if (entry === owner) preview();
      get('status').textContent = '作業フォルダーに反映しました。GitHub Desktopで差分を確認できます。';
    } catch (error) { get('status').textContent = error.message; }
    finally { get('apply').disabled = !entry; }
  });
  get('search').dispatchEvent(new Event('input'));
})();

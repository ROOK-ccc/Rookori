const byId = (id) => document.getElementById(id);
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

const editorStorageKey = 'chesspath.editor.v1';
const initialFen = chessRules.DEFAULT_POSITION;
const pack = (problems) => ({ schemaVersion: problemSchemaVersion, problems });
const form = byId('problem-form');
const field = (name) => form.elements.namedItem(name);
const formKeys = ['id', 'title', 'chapter', 'difficulty', 'kind', 'mode', 'goal', 'practiceSquare',
  'description', 'prompt', 'hint', 'correct', 'incorrect', 'tags'];
const dialog = byId('editor-promotion');
const castlingFields = [...document.querySelectorAll('[data-castling]')];
const sampleLessons = introLessons.filter(lesson => lesson.moves);
const on = (id, handler) => byId(id).addEventListener('click', handler);
const say = (id, message) => { byId(id).textContent = message; };
let library = [];
let position;
let routes;
let editTool = 'move';
let selected;
let flipped = false;
let answerStudy;
let editingRoute = -1;
let preview;
let stored;
let exportFingerprint;
try {
  library = validateProblemPack(publishedProblemPack, introLessons).problems;
} catch {
  say('draft-status', '公開教材を読み込めません。JSONのバックアップを確認してください。');
}
try {
  stored = JSON.parse(localStorage.getItem(editorStorageKey) ?? 'null');
  if (stored?.library) library = validateProblemPack(stored.library, introLessons).problems;
  exportFingerprint = stored?.exportFingerprint;
} catch {
  say('draft-status', '保存済みの下書きを読み込めません。JSONのバックアップを確認してください。');
}

function report(id, action) {
  try {
    action();
  } catch (error) {
    say(id, error.message);
  }
}

function readDraft() {
  return { ...Object.fromEntries(formKeys.map(key => [key, field(key).value])),
    fen: formatPositionFen(position), lines: routes, flipped, editingRoute,
    building: byId('route-builder').hidden ? null : answerStudy.played.map(move => move.lan),
  };
}

function persist() {
  const draft = readDraft();
  const saved = library.find(problem => problem.id === draft.id);
  const draftTags = [...new Set(draft.tags.split(/[,、]/).map(tag => tag.trim()).filter(Boolean))];
  const same = saved && !draft.building?.length && saved.fen === draft.fen
    && JSON.stringify(saved.lines) === JSON.stringify(draft.lines)
    && JSON.stringify(saved.tags) === JSON.stringify(draftTags)
    && formKeys.every(key => key === 'tags' || (key === 'practiceSquare' && draft.mode === 'standard')
      || saved[key] === draft[key].trim());
  const exported = exportFingerprint === JSON.stringify(library);
  say('editor-edit-state', same ? '問題を保存済み' : '編集中');
  say('editor-export-state', exported ? '公開用ファイル出力済み。教材への反映は置き換え後です。' : '公開用ファイル未出力（現在の保存済み問題）');
  byId('editor-export-steps').hidden = !exported;
  try {
    localStorage.setItem(editorStorageKey, JSON.stringify({ library: pack(library), draft, exportFingerprint }));
    say('draft-status', '下書き保存済み');
  } catch {
    say('draft-status', 'このブラウザーでは下書きを保存できません。JSONファイルで保存してください。');
  }
}

function options(select, values) {
  select.replaceChildren(...values.map(([value, label]) => {
    const option = element('option', label);
    option.value = value;
    return option;
  }));
}

function refreshLibrary(id) {
  options(byId('saved-problems'), library.length ? library.map(problem => [problem.id, problem.title]) : [['', '保存済みなし']]);
  if (library.some(problem => problem.id === id)) byId('saved-problems').value = id;
  for (const name of ['load-saved', 'delete-problem', 'export-all']) byId(name).disabled = !library.length;
}

function newId() {
  let id;
  do {
    id = `problem-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2)}`;
  } while (library.some(problem => problem.id === id) || introLessons.some(lesson => lesson.id === id));
  return id;
}

function blankProblem() {
  return { id: newId(), chapter: 'pieces', difficulty: 'intro', kind: 'square', mode: 'standard',
    goal: 'match', fen: initialFen, lines: [], tags: [] };
}

function loadDraft(draft) {
  position = parsePositionFen(draft.fen);
  byId('fen-input').value = draft.fen;
  routes = draft.lines.map(line => [...line]);
  flipped = Boolean(draft.flipped);
  for (const key of formKeys) field(key).value = key === 'tags' && Array.isArray(draft.tags) ? draft.tags.join('、') : (draft[key] ?? '');
  field('chapter').disabled = introLessons.some(lesson => lesson.id === draft.id);
  byId('practice-field').hidden = field('mode').value !== 'piece';
  closeRoute();
  practiceBoard.close();
  byId('practice-preview').hidden = true;
  editTool = 'move';
  selected = null;
  syncPosition();
  refreshRoutes();
  say('answer-status', '');
  say('position-status', '');
  if (Array.isArray(draft.building)) openRoute(draft.building, draft.editingRoute);
}

function epOptions(turn) {
  return [['-', 'なし'], ...Array.from(positionFiles, file => {
    const square = file + (turn === 'w' ? '6' : '3');
    return [square, square];
  })];
}

function renderTools() {
  for (const button of document.querySelectorAll('[data-tool]')) button.setAttribute('aria-pressed', String(button.dataset.tool === editTool));
}

function syncPosition() {
  byId('position-turn').value = position.turn;
  options(byId('position-ep'), epOptions(position.turn));
  byId('position-ep').value = position.ep;
  byId('position-halfmove').value = position.halfmove;
  byId('position-fullmove').value = position.fullmove;
  for (const checkbox of castlingFields) checkbox.checked = position.castling.includes(checkbox.dataset.castling);
  positionChanged();
}

function updateMetadata() {
  const halfmove = byId('position-halfmove').valueAsNumber;
  const fullmove = byId('position-fullmove').valueAsNumber;
  if (!Number.isSafeInteger(halfmove) || halfmove < 0 || !Number.isSafeInteger(fullmove) || fullmove < 1) {
    throw new Error('50手ルール用の手数は0以上、現在の手数は1以上の整数にしてください。');
  }
  position.turn = byId('position-turn').value;
  position.ep = byId('position-ep').value;
  position.halfmove = halfmove;
  position.fullmove = fullmove;
  position.castling = castlingFields.filter(checkbox => checkbox.checked).map(checkbox => checkbox.dataset.castling).join('') || '-';
}

function positionChanged() {
  closeRoute();
  byId('fen-output').value = formatPositionFen(position);
  renderTools();
  editBoard.render();
  persist();
}

const editBoard = createChessBoard(byId('edit-board'), null, {
  position: () => ({ game: { board: () => positionMatrix(position.squares) } }),
  isFlipped: () => flipped,
  editSelected: () => selected,
  feedback: () => { selected = null; },
  editDrag(from, to) {
    const { squares } = position;
    squares[to] = squares[from];
    delete squares[from];
    selected = null;
    positionChanged();
  },
  editSquare(square) {
    const { squares } = position;
    if (editTool === 'move') {
      if (selected === square) { selected = null; return; }
      if (!selected) { if (squares[square]) selected = square; return; }
      squares[square] = squares[selected];
      delete squares[selected];
      selected = null;
    } else if (editTool === 'remove') {
      delete squares[square];
    } else {
      squares[square] = { color: editTool[0], type: editTool[1] };
    }
    positionChanged();
  },
});

const answerBoard = createChessBoard(byId('answer-board'), dialog, {
  position: () => answerStudy,
  isFlipped: () => flipped,
  canPlay: () => answerStudy.mayMove && (field('kind').value === 'sequence' || answerStudy.step === 0),
  play: (...move) => answerStudy.play(...move),
  onMove() { renderBuilder(); persist(); },
  feedback: message => say('answer-status', message),
});

function closeRoute() {
  answerBoard.close();
  byId('route-builder').hidden = true;
  editingRoute = -1;
}

function openRoute(moves = [], index = -1) {
  updateMetadata();
  const loaded = new ProblemPosition(problemStart(formatPositionFen(position)), field('mode').value);
  for (const [step, move] of moves.entries()) {
    if (!loaded.play(...splitProblemMove(move))) throw new Error(`現在の局面では${step + 1}手目を指せません。手順を削除して登録し直してください。`);
  }
  answerStudy = loaded;
  editingRoute = index;
  answerBoard.reset();
  byId('route-builder').hidden = false;
  renderBuilder();
  persist();
}

function renderBuilder() {
  say('route-turn', answerStudy.mayMove ? `${chessColorNames[answerStudy.game.turn()]}の手番` : '対局終了');
  say('route-notation', answerStudy.played.map(move => move.san).join(' → ') || '盤上で正解手を指してください。');
  byId('undo-route').disabled = !answerStudy.step;
  byId('commit-route').disabled = !answerStudy.step;
  answerBoard.render();
}

function refreshRoutes() {
  byId('registered-routes').replaceChildren(...routes.map((route, index) => {
    const item = element('li', route.join(' → '));
    const edit = element('button', '編集', 'text-button');
    edit.setAttribute('aria-label', `手順${index + 1}を編集`);
    edit.addEventListener('click', () => report('answer-status', () => openRoute(route, index)));
    const remove = element('button', '削除', 'text-button');
    remove.setAttribute('aria-label', `手順${index + 1}を削除`);
    remove.addEventListener('click', () => {
      closeRoute();
      routes.splice(index, 1);
      refreshRoutes();
      persist();
    });
    item.append(edit, remove);
    return item;
  }));
}

function draftProblem(lines = routes) {
  updateMetadata();
  const draft = readDraft();
  return validateProblem({ ...draft, tags: draft.tags.split(/[,、]/), lines }, introLessons);
}

function readyProblem() {
  if (!byId('route-builder').hidden && answerStudy.step) throw new Error('盤で指した手順を登録してから続けてください。');
  return draftProblem();
}

function download(name, data, type) {
  const address = URL.createObjectURL(new Blob([data], { type }));
  const link = element('a');
  link.href = address;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(address), 1000);
}

function writeJson(name, problems) {
  const validated = validateProblemPack(pack(problems), introLessons);
  download(name, JSON.stringify(validated, null, 2) + '\n', 'application/json');
}

const practiceBoard = createChessBoard(byId('preview-board'), dialog, {
  position: () => preview.position,
  isFlipped: () => flipped,
  canPlay: () => !preview.solved,
  canSelect: square => preview.problem.mode !== 'piece' || square === preview.problem.practiceSquare,
  hints: () => byId('preview-hint').hidden ? [] : preview.nextMoves,
  play: (...move) => {
    const correct = preview.play(...move);
    if (!correct) showPreviewError(preview.problem.incorrect);
    return correct;
  },
  onMove() {
    byId('preview-hint').hidden = true;
    renderPreview();
    say('preview-feedback', preview.solved ? `正解！ ${preview.problem.correct}`
      : `相手は ${preview.position.lastMove.san} と応じました。次の手を指しましょう。`);
  },
  feedback: message => { if (message) say('preview-feedback', message); },
  onIllegal: message => showPreviewError(`${message} ${preview.problem.incorrect}`),
});

function showPreviewError(message) {
  say('preview-feedback', `不正解。 ${message}`);
  byId('preview-hint').hidden = false;
}

function renderPreview() {
  say('preview-turn', preview.solved ? '課題クリア' : `${chessColorNames[preview.position.game.turn()]}の手番`);
  byId('preview-undo').disabled = !preview.steps.length;
  byId('preview-undo').hidden = preview.problem.kind !== 'sequence';
  practiceBoard.render();
}

function openPreview(problem) {
  preview = new ProblemPractice(problem);
  practiceBoard.reset();
  say('preview-title', problem.title);
  say('preview-description', problem.description);
  say('preview-prompt', problem.prompt);
  say('preview-hint', problem.hint);
  say('preview-feedback', '');
  byId('preview-hint').hidden = true;
  byId('practice-preview').hidden = false;
  renderPreview();
}

options(field('chapter'), introChapters.map(chapter => [chapter.id, chapter.title]));
options(field('difficulty'), Object.entries(problemLevels));
options(field('kind'), Object.entries(problemKinds));
options(byId('base-problems'), sampleLessons.map(lesson => [lesson.id, lesson.title]));
const palette = byId('piece-palette');
for (const color of ['w', 'b']) {
  for (const [type, name] of Object.entries({ k: 'キング', q: 'クイーン', r: 'ルーク', b: 'ビショップ', n: 'ナイト', p: 'ポーン' })) {
    const button = element('button');
    button.dataset.tool = color + type;
    button.setAttribute('aria-label', `${chessColorNames[color]}の${name}を置く`);
    const image = element('img');
    image.alt = '';
    image.src = `pieces/cburnett/${color}${type.toUpperCase()}.svg`;
    button.append(image);
    palette.append(button);
  }
}
byId('position-move').dataset.tool = 'move';
byId('position-remove').dataset.tool = 'remove';
for (const button of document.querySelectorAll('[data-tool]')) {
  button.addEventListener('click', () => {
    editTool = button.dataset.tool;
    selected = null;
    renderTools();
    editBoard.render();
  });
}

on('position-flip', () => {
  flipped = !flipped;
  editBoard.render();
  if (!byId('route-builder').hidden) answerBoard.render();
  if (!byId('practice-preview').hidden) practiceBoard.render();
  persist();
});
on('position-empty', () => { position = parsePositionFen('8/8/8/8/8/8/8/8 w - - 0 1'); selected = null; syncPosition(); });
on('position-start', () => { position = parsePositionFen(initialFen); selected = null; syncPosition(); });
on('load-fen', () => report('position-status', () => {
  position = parsePositionFen(byId('fen-input').value);
  selected = null;
  syncPosition();
  say('position-status', 'FENを読み込みました。');
}));
on('copy-fen', async () => {
  const input = byId('fen-output');
  try {
    await navigator.clipboard.writeText(input.value);
    say('position-status', 'FENをコピーしました。');
  } catch {
    input.focus();
    input.select();
    say('position-status', 'FENを選択しました。Ctrl+Cなどでコピーしてください。');
  }
});
byId('position-turn').addEventListener('change', () => options(byId('position-ep'), epOptions(byId('position-turn').value)));
byId('position-fields').addEventListener('change', () => report('position-status', () => {
  updateMetadata();
  positionChanged();
  say('position-status', '');
}));
form.addEventListener('submit', event => event.preventDefault());
form.addEventListener('input', event => {
  byId('practice-field').hidden = field('mode').value !== 'piece';
  if (['kind', 'mode'].includes(event.target.name)) closeRoute();
  persist();
});
on('start-route', () => report('answer-status', () => openRoute()));
on('undo-route', () => { answerStudy.undo(); answerBoard.clearSelection(); renderBuilder(); persist(); });
on('cancel-route', () => { closeRoute(); say('answer-status', ''); persist(); });
on('commit-route', () => report('answer-status', () => {
  const line = answerStudy.played.map(move => move.lan);
  const updated = routes.map(route => [...route]);
  if (editingRoute === -1) updated.push(line);
  else updated[editingRoute] = line;
  // 手順の保存時と異なり、タイトルや解説の入力はまだ不要です。
  const draft = readDraft();
  validateProblem({ ...draft, lines: updated, tags: [], title: '確認', prompt: '確認', hint: '確認', correct: '確認', incorrect: '確認' }, introLessons);
  routes = updated;
  closeRoute();
  refreshRoutes();
  persist();
  say('answer-status', '正解手順を登録しました。');
}));

on('new-problem', () => { loadDraft(blankProblem()); say('editor-status', '新しい問題を開きました。'); });
on('load-saved', () => {
  const problem = library.find(item => item.id === byId('saved-problems').value);
  if (problem) { loadDraft(problem); say('editor-status', '保存済みの問題を開きました。'); }
});
on('load-base', () => {
  const lesson = sampleLessons.find(item => item.id === byId('base-problems').value);
  if (lesson) {
    loadDraft(library.find(item => item.id === lesson.id) ?? baseLessonProblem(lesson));
    say('editor-status', '入門教材を開きました。元のIDは維持されます。');
  }
});
on('duplicate-problem', () => {
  const draft = readDraft();
  loadDraft({ ...draft, id: newId(), title: draft.title && `${draft.title}（複製）` });
  say('editor-status', '新しいIDで問題を複製しました。');
});
on('save-problem', () => report('editor-status', () => {
  const problem = readyProblem();
  const updated = [...library.filter(item => item.id !== problem.id), problem];
  library = validateProblemPack(pack(updated), introLessons).problems;
  refreshLibrary(problem.id);
  persist();
  say('editor-status', '問題を保存しました。');
}));
on('delete-problem', () => {
  const problem = library.find(item => item.id === byId('saved-problems').value);
  if (!problem || !window.confirm(`「${problem.title}」を保存済み一覧から削除しますか？`)) return;
  library = library.filter(item => item.id !== problem.id);
  if (field('id').value === problem.id) loadDraft(blankProblem());
  refreshLibrary();
  persist();
  say('editor-status', '保存済みの問題を削除しました。');
});
on('export-one', () => report('editor-status', () => {
  const problem = readyProblem();
  writeJson(`${problem.id}.json`, [problem]);
}));
on('export-all', () => report('editor-status', () => writeJson('chesspath-problems.json', library)));
on('export-course', () => report('editor-status', () => {
  const validated = validateProblemPack(pack(library), introLessons);
  download('course-problems.js', problemCourseScript(validated), 'text/javascript');
  exportFingerprint = JSON.stringify(library);
  persist();
  say('editor-status', '公開教材ファイルを出力しました。ChessPathの同名ファイルと入れ替えてください。');
}));
byId('import-problems').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const raw = JSON.parse(await file.text());
    const imported = validateProblemPack(raw, introLessons).problems;
    const merged = new Map(library.map(problem => [problem.id, problem]));
    for (const problem of imported) merged.set(problem.id, problem);
    library = [...merged.values()];
    if (imported.length) loadDraft(imported[0]);
    refreshLibrary(imported[0]?.id);
    persist();
    say('editor-status', `${imported.length}問を読み込みました。`);
  } catch (error) {
    say('editor-status', error instanceof SyntaxError ? 'JSONを読み込めません。ファイルの形式を確認してください。' : error.message);
  } finally {
    event.target.value = '';
  }
});
on('preview-problem', () => report('editor-status', () => {
  openPreview(readyProblem());
  say('editor-status', 'プレビューを開きました。');
}));
on('preview-reset', () => openPreview(preview.problem));
on('preview-undo', () => {
  preview.back();
  practiceBoard.clearSelection();
  byId('preview-hint').hidden = true;
  say('preview-feedback', '');
  renderPreview();
});
on('preview-show-hint', () => {
  byId('preview-hint').hidden = !byId('preview-hint').hidden;
  practiceBoard.render();
});

try {
  loadDraft(stored?.draft ?? blankProblem());
} catch {
  loadDraft(blankProblem());
}
refreshLibrary(field('id').value);

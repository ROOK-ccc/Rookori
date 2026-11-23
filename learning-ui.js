let learningStorage;
try { learningStorage = window.localStorage; } catch { /* 保存を使えない場合はタブ内で続けます。 */ }
const learningTracker = new LearningTracker(learningStorage, introLessons, openings, findStudyOpening);
const reviewLink = id => '#review-item/' + encodeURIComponent(id);

const learningPages = (() => {
  const section = (title, container) => {
    const block = element('section', null, 'opening-card learning-block');
    block.append(element('h2', title));
    container.replaceChildren(block);
    return block;
  };
  const link = (label, href, style = 'button secondary') => {
    const node = element('a', label, style);
    node.href = href;
    return node;
  };
  const values = entries => {
    const list = element('dl', null, 'learning-values');
    for (const [title, value] of entries) {
      list.append(element('dt', title), element('dd', String(value)));
    }
    return list;
  };

  function todayReview(id, showList = false) {
    const due = learningTracker.due();
    const block = section('今日の復習', byId(id));
    if (!due.length) {
      const hasItems = Object.values(learningTracker.data.items).some(item => learningTracker.item(item.id));
      block.append(element('p', hasItems ? '今日の復習は完了しています。' : 'まずはオープニングを学んでみましょう。'));
      block.append(link('オープニング一覧', '#openings'));
      return;
    }
    block.append(element('p', '今日の復習が' + due.length + '件あります。'),
      link('復習を始める', reviewLink(due[0].id), 'button primary'));
    if (showList) {
      const list = element('ol', null, 'daily-list');
      for (const item of due) {
        const opening = findStudyOpening(item.variationId ?? item.openingId);
        const row = element('li');
        row.append(link(opening.name + '・' + chessColorNames[item.color] + '番 ' +
          (Math.floor(item.ply / 2) + 1) + '手目', reviewLink(item.id), 'text-button'));
        list.append(row);
      }
      block.append(list);
    }
  }

  function targetLink(target) {
    if (!target) return null;
    if (target.type === 'lesson') {
      const lesson = introLessons.find(lesson => lesson.id === target.id);
      if (lesson) return link(lesson.title, '#lesson/' + lesson.id);
    } else {
      const opening = findStudyOpening(target.id);
      if (opening) return link(opening.name, target.type === 'practice'
        ? '#practice/' + opening.id + '/' + target.color : '#study/' + opening.id);
    }
    return null;
  }

  function dashboard() {
    todayReview('dashboard-review');
    const plan = learningTracker.day();
    const doneReview = learningTracker.due().length === 0;
    const donePractice = plan.checked.length === plan.questions.length;
    const newLink = targetLink(plan.target);
    const planBlock = section('今日の学習計画', byId('dashboard-plan'));
    const steps = element('ol', null, 'daily-list');
    for (const [label, action] of [
      [doneReview ? (plan.reviewed.length ? '今日の復習が完了しました' : '期限が来た復習はありません') : '期限が来た手を復習しましょう', link('今日の復習', '#review', 'text-button')],
      [plan.newDone ? '新しい学習が完了しました' : '新しい内容をひとつ学びましょう', newLink],
      ['今日の練習問題 ' + plan.checked.length + ' / ' + plan.questions.length + '問', link('練習問題を開く', '#daily', 'text-button')],
    ]) {
      const li = element('li', label);
      if (action) li.append(action);
      steps.append(li);
    }
    planBlock.append(steps);
    if (doneReview && plan.newDone && donePractice) planBlock.append(element('p', '今日の学習計画が完了しました。'));
    const progress = section('学習進捗', byId('dashboard-progress'));
    progress.append(values([
      ['完了した入門レッスン', learningTracker.intro().completed.length + ' / ' + introLessons.length],
      ['学習したオープニング', learningTracker.learned().size + '件'],
    ]));
    const resume = section('前回の学習の続き', byId('dashboard-continue'));
    const previousLesson = learningTracker.intro().lesson;
    const lastRound = learningTracker.history().sort((a, b) => Date.parse(b.date) - Date.parse(a.date))[0];
    const last = learningTracker.data.last ?? (lastRound
      ? { type: 'practice', id: lastRound.variationId ?? lastRound.openingId, color: lastRound.color }
      : { type: 'lesson', id: previousLesson });
    resume.append(targetLink(last) ?? element('p', 'はじめてのチェスや戦法一覧から学習を始められます。'));
  }

  function daily() {
    const plan = learningTracker.day();
    const lessons = plan.questions.map(id => introLessons.find(lesson => lesson.id === id)).filter(Boolean);
    byId('daily-status').textContent = plan.checked.filter(id => lessons.some(lesson => lesson.id === id)).length
      + ' / ' + lessons.length + '問 正解済み';
    byId('daily-list').replaceChildren(...lessons.map(lesson => {
      const row = element('li');
      row.append(link(lesson.title, '#lesson/' + lesson.id, 'text-button'));
      if (plan.checked.includes(lesson.id)) row.append(element('span', '正解済み', 'learning-done'));
      return row;
    }));
  }

  const normalize = value => value.normalize('NFKC').toLowerCase().trim();
  function catalog(memorize = false) {
    byId('openings-title').textContent = memorize ? 'オープニング暗記' : 'オープニング一覧';
    const query = normalize(byId('catalog-search').value);
    const color = byId('catalog-color').value;
    const level = byId('catalog-level').value;
    const learned = learningTracker.learned();
    const matches = opening => (!query || normalize(opening.name + ' ' + opening.english).includes(query))
      && (!color || openingDefaultColor(opening) === color)
      && (!level || ((opening.traits?.complexity ?? 4) <= 3 ? 'beginner' : 'experienced') === level);
    const links = opening => {
      const actions = element('div', null, 'study-mode-links');
      const explain = link('解説を開く', '#study/' + opening.id, 'text-button');
      explain.id = 'catalog-' + opening.id;
      actions.append(explain, link('暗記する', '#practice/' + opening.id + '/' + openingDefaultColor(opening),
        memorize ? 'button primary' : 'button secondary'));
      return actions;
    };
    const detail = opening => {
      const article = element('div', null, 'catalog-entry');
      const english = element('p', opening.english, 'opening-english');
      english.lang = 'en';
      article.append(element('h3', opening.name), english,
        element('p', openingSlots[opening.slot] + '・' + ((opening.traits?.complexity ?? 4) <= 3 ? '初心者向け' : '経験者向け')
          + '・' + (learned.has(opening.id) ? '学習済み' : '未学習'), 'catalog-meta'),
        element('p', opening.description), links(opening));
      return article;
    };
    let count = 0;
    const cards = openings.flatMap(opening => {
      const children = openingVariations.filter(item => item.parentId === opening.id);
      const visible = children.filter(child => matches(child) || (!query && !color && !level));
      const parentMatches = matches(opening);
      if (!parentMatches && !visible.length) return [];
      const card = element('article', null, 'opening-card');
      if (parentMatches) card.append(detail(opening));
      else card.append(element('h2', opening.name + 'のバリエーション'));
      count += (parentMatches ? 1 : 0) + (color || query || level ? visible.length : 0);
      if (children.length) {
        const details = element('details');
        details.open = Boolean(query || color || level || location.hash.endsWith('/' + opening.id));
        details.append(element('summary', 'バリエーション ' + children.length + '件'));
        for (const variant of visible) details.append(detail(variant));
        if (!visible.length) details.append(element('p', '条件に合うバリエーションはありません。'));
        card.append(details);
      }
      return [card];
    });
    byId('catalog-count').textContent = count + '件' + (color || query || level ? 'が見つかりました' : 'を掲載');
    byId('opening-catalog').replaceChildren(...cards);
  }

  function progress() {
    const rows = learningTracker.activity();
    const history = learningTracker.history();
    const done = learningTracker.intro().completed.length;
    const target = byId('progress-summary');
    target.replaceChildren(values([
      ['記録のある学習日数', rows.length + '日'], ['学習したオープニング', learningTracker.learned().size + '件'],
      ['暗記練習の回数', history.filter(row => row.kind !== 'review').length + '回'],
      ['完了した入門レッスン', done + '件'], ['期限が来た復習', learningTracker.due().length + '件'],
    ]));
    const chart = byId('progress-activity');
    if (!rows.length) {
      chart.replaceChildren(element('p', '日付のある学習記録がたまると、練習成績の推移を確認できます。'));
      return;
    }
    const table = element('table');
    table.append(element('caption', '日ごとの学習記録'));
    const header = element('tr');
    for (const title of ['日付', '練習回数', '初回正解率', 'ヒント', '練習問題の正解', '復習の残り']) {
      const cell = element('th', title);
      cell.scope = 'col';
      header.append(cell);
    }
    const head = element('thead'); head.append(header); table.append(head);
    const body = element('tbody');
    for (const row of rows.slice(-30).reverse()) {
      const line = element('tr');
      const date = element('th', row.day); date.scope = 'row'; line.append(date);
      line.append(element('td', String(row.attempts)));
      const rate = row.moves ? Math.round(row.first / row.moves * 100) : null;
      const cell = element('td', rate === null ? '―' : rate + '%');
      if (rate !== null && rows.length >= 2) {
        const meter = element('meter');
        meter.min = 0; meter.max = 100; meter.value = rate;
        meter.setAttribute('aria-label', row.day + 'の初回正解率 ' + rate + '%');
        cell.append(meter);
      }
      line.append(cell, element('td', String(row.hints)), element('td', String(row.questions)),
        element('td', row.due === null ? '―' : String(row.due)));
      body.append(line);
    }
    table.append(body);
    chart.replaceChildren(table);
  }

  for (const id of ['catalog-search', 'catalog-color', 'catalog-level']) {
    byId(id).addEventListener(id === 'catalog-search' ? 'input' : 'change', () => catalog(displayedRoute?.path === 'memorize'));
  }
  const setHome = mode => {
    learningTracker.data.home = mode;
    learningTracker.save();
    goTo('home');
  };
  byId('home-dashboard-mode').addEventListener('click', () => setHome('dashboard'));
  byId('home-intro-mode').addEventListener('click', () => setHome('intro'));
  for (const button of document.querySelectorAll('.home-auto-mode')) button.addEventListener('click', () => setHome('auto'));

  let stagedBackup;
  const status = message => { byId('backup-status').textContent = message; };
  const confirmation = byId('backup-confirmation');
  byId('backup-export').addEventListener('click', () => {
    try {
      if (!learningStorage) throw new Error('このブラウザーでは学習データを保存できません。');
      const data = learningBackup(learningStorage);
      if (!validateLearningBackup(data)) throw new Error('保存されている学習データを確認してください。');
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const download = link('バックアップ', url);
      download.download = 'ChessPath-' + localDay() + '.json';
      download.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status('学習データをダウンロードします。');
    } catch (error) { status(error.message || '学習データを読み込めませんでした。'); }
  });
  byId('backup-import').addEventListener('change', async event => {
    const file = event.target.files[0];
    event.target.value = '';
    stagedBackup = null;
    confirmation.hidden = true;
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!validateLearningBackup(data)) throw new Error();
      stagedBackup = data;
      status('形式を確認しました。内容の置き換えを確認してください。');
      confirmation.hidden = false;
      byId('backup-cancel').focus();
    } catch { status('このファイルはChessPathの学習バックアップとして読み込めません。'); }
  });
  byId('backup-cancel').addEventListener('click', () => {
    stagedBackup = null;
    confirmation.hidden = true;
    status('復元をキャンセルしました。');
    byId('backup-import').focus();
  });
  byId('backup-restore').addEventListener('click', () => {
    if (!stagedBackup) return;
    try {
      if (!learningStorage) throw new Error('このブラウザーでは学習データを保存できません。');
      restoreLearningBackup(learningStorage, stagedBackup);
      location.reload();
    } catch (error) { status(error.message || '復元できませんでした。'); }
  });

  let currentDay = localDay();
  function checkDay() {
    const day = localDay();
    if (day === currentDay) return;
    currentDay = day;
    const path = displayedRoute?.path;
    if (path === 'dashboard' || path === 'home' && !byId('dashboard').hidden) dashboard();
    if (path === 'review') todayReview('today-review', true);
    if (path === 'daily') daily();
    if (path === 'progress') progress();
  }
  setInterval(checkDay, 30000);
  window.addEventListener('focus', checkDay);
  return { dashboard, todayReview, daily, progress, catalog };
})();

let learningStorage;
try { learningStorage = window.localStorage; } catch { /* 保存を使えない場合はタブ内で続けます。 */ }
const learningTracker = new LearningTracker(learningStorage, introLessons, studyOpenings, findStudyOpening);
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
  function todayReview(id, showList = false) {
    const due = learningTracker.due();
    const block = section('今日の復習', byId(id));
    if (!due.length) {
      const hasItems = Object.values(learningTracker.data.items).some(item => learningTracker.item(item.id));
      block.append(element('p', hasItems ? '今日の復習は完了しています。' : '今日の復習対象はありません。'));
      block.append(link(hasItems ? '今日の練習問題へ' : 'オープニングを学ぶ', hasItems ? '#daily' : '#openings'));
      return;
    }
    const subjects = [...new Set(due.map(item => findStudyOpening(item.variationId ?? item.openingId).name))];
    block.append(element('p', due.length + '手', 'dashboard-review-count'),
      element('p', subjects.slice(0, 3).join('、') + (subjects.length > 3 ? ' ほか' : '')),
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
    const plan = learningTracker.day();
    const questionIds = new Set(plan.questions);
    const solved = new Set(plan.checked.filter(id => questionIds.has(id))).size;
    const today = localDay();
    const week = weekStart(today);
    const days = learningTracker.activity().filter(row => row.day >= week && row.day <= today && activeLearningDay(row)).length;
    byId('dashboard-due').textContent = learningTracker.due().length;
    byId('dashboard-solved').textContent = solved + '/' + questionIds.size;
    byId('dashboard-days').textContent = days;

    const target = targetLink(plan.target);
    const lastRound = learningTracker.history().sort((a, b) => Date.parse(b.date) - Date.parse(a.date))[0];
    const resume = targetLink(learningTracker.data.last)
      ?? (lastRound && targetLink({ type: 'practice', id: lastRound.variationId ?? lastRound.openingId, color: lastRound.color }))
      ?? targetLink({ type: 'lesson', id: learningTracker.intro().lesson });
    const resumeLink = byId('dashboard-resume-link');
    byId('dashboard-resume').hidden = !resume;
    if (resume) {
      resumeLink.href = resume.getAttribute('href');
      resumeLink.querySelector('span').textContent = resume.textContent;
    }
    const next = byId('dashboard-plan');
    next.hidden = !plan.newDone && (!target || target.hash === resume?.hash);
    next.replaceChildren(element('h2', '今日の学習メニュー'));
    if (plan.newDone) next.append(element('p', '今日の新しい教材は学習済みです。', 'dashboard-note'));
    else if (target) {
      setRowAction(target);
      next.append(target);
    }
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
    personalPages.daily();
  }

  const normalize = value => value.normalize('NFKC').toLowerCase()
    .replace(/[\p{Script=Latin}]+/gu, term => term.normalize('NFD').replace(/\p{Mark}/gu, ''))
    .replace(/[\s・'’\-–]+/g, '');
  for (const [value, label] of Object.entries(openingFamilies)) {
    const option = element('option', label);
    option.value = value;
    byId('catalog-family').append(option);
  }
  function catalog(memorize = false, returnOpening) {
    byId('openings-title').textContent = memorize ? 'オープニング暗記' : 'オープニング一覧';
    const query = normalize(byId('catalog-search').value);
    const color = byId('catalog-color').value;
    const level = byId('catalog-level').value;
    const family = byId('catalog-family').value;
    const filtered = Boolean(query || color || level || family);
    const learned = learningTracker.learned();
    const matches = opening => {
      const parent = opening.parentId ? findStudyOpening(opening.parentId) : null;
      const names = [opening.name, opening.english, opening.eco ?? '',
        ...(opening.aliases ?? openingAliases[opening.id] ?? [])];
      if (parent) names.push(parent.name + opening.name, parent.english + opening.english);
      return (!query || names.some(name => normalize(name).includes(query)))
      && (!color || openingDefaultColor(opening) === color)
      && (!family || openingFamily(opening) === family)
      && (!level || ((opening.traits?.complexity ?? 4) <= 3 ? 'beginner' : 'experienced') === level);
    };
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
      article.append(chessTermText('h3', opening.name), english,
        element('p', (opening.slotLabel ?? openingSlots[opening.slot]) + '・' + ((opening.traits?.complexity ?? 4) <= 3 ? '初心者向け' : '経験者向け')
          + '・' + (learned.has(opening.id) ? '学習済み' : '未学習'), 'catalog-meta'),
        chessTermText('p', opening.description), links(opening));
      return article;
    };
    let count = 0;
    const cards = studyOpenings.flatMap(opening => {
      const children = openingVariations.filter(item => item.parentId === opening.id);
      const visible = children.filter(child => !filtered || matches(child));
      const parentMatches = matches(opening);
      if (!parentMatches && !visible.length) return [];
      const card = element('article', null, 'opening-card');
      if (parentMatches) card.append(detail(opening));
      else card.append(element('h2', opening.name + 'のバリエーション'));
      count += (parentMatches ? 1 : 0) + (filtered ? visible.length : 0);
      if (children.length) {
        const details = element('details');
        details.open = filtered || returnOpening?.parentId === opening.id;
        details.append(element('summary', 'バリエーション ' + children.length + '件'));
        for (const variant of visible) details.append(detail(variant));
        if (!visible.length) details.append(element('p', '条件に合うバリエーションはありません。'));
        card.append(details);
      }
      return [card];
    });
    byId('catalog-count').textContent = filtered ? count + '件が見つかりました'
      : `オープニング ${studyOpenings.length}件・バリエーション ${openingVariations.length}件`;
    const last = learningTracker.data.last;
    const recent = last && last.type !== 'lesson' ? findStudyOpening(last.id) : null;
    const recentRow = byId('catalog-recent');
    recentRow.hidden = !recent;
    recentRow.replaceChildren(...(recent ? [link('前回のオープニング：' + recent.name, '#study/' + recent.id, 'text-button')] : []));
    byId('opening-catalog').replaceChildren(...cards);
  }

  function progress() {
    progressReport(learningTracker);
  }

  for (const id of ['catalog-search', 'catalog-color', 'catalog-level', 'catalog-family']) {
    byId(id).addEventListener(id === 'catalog-search' ? 'input' : 'change', () => catalog(displayedRoute?.path === 'memorize'));
  }
  const homeForm = byId('home-preferences');
  function homePreferences() {
    homeForm.elements.home.value = learningTracker.data.home;
    byId('home-preference-status').textContent = learningTracker.data.home === 'auto'
      ? (learningTracker.home() === 'dashboard' ? '現在、自動で学習ダッシュボードを表示します。' : '現在、自動で紹介型ホームを表示します。')
      : '';
  }

  homeForm.addEventListener('change', event => {
    const mode = event.target.value;
    if (!['intro', 'auto', 'dashboard'].includes(mode)) return;
    learningTracker.data.home = mode;
    learningTracker.save();
    homePreferences();
    const status = byId('home-preference-status');
    status.textContent = learningTracker.available ? '設定を保存しました。 ' + status.textContent
      : 'このブラウザーでは設定を保存できません。このタブを開いている間だけ反映します。';
  });

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
      download.download = 'Rookori-' + localDay() + '.json';
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
    } catch { status('このファイルはRookoriの学習バックアップとして読み込めません。'); }
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
  return { dashboard, todayReview, daily, progress, catalog, homePreferences };
})();

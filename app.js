const byId = (id) => document.getElementById(id);

let currentMode;
let questions = [];
let answers = [];
let questionIndex = 0;
let displayedRoute;
let lastOpeningAnswers;

const quizBackLabels = {
  beginner: '初心者向けガイドに戻る',
  improve: '学習案内に戻る',
  'opening-result': '診断結果に戻る',
  'intro-summary': '入門コースのまとめに戻る',
  home: 'トップに戻る',
  mode: 'モード選択に戻る',
};

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function showScreen(id, focusTarget) {
  if (id === 'home' || id === 'dashboard') personalPages.progress(id);
  chessGlossary.close();
  document.querySelectorAll('.screen').forEach((screen) => {
    screen.hidden = screen.id !== id;
  });
  window.scrollTo(0, 0);
  byId(focusTarget).focus({ preventScroll: true });
  rookoriAnalytics.screen(id, displayedRoute?.path);
}

function showQuiz(mode, savedAnswers, savedIndex) {
  currentMode = mode;
  questions = mode === 'opening' ? openingQuestions : getQuestions(mode);
  answers = savedAnswers?.length === questions.length ? savedAnswers.slice() : Array(questions.length).fill(null);
  questionIndex = Number.isInteger(savedIndex) && savedIndex >= 0 && savedIndex < questions.length ? savedIndex : 0;
  renderQuestion();
}

function selectAnswer(index) {
  answers[questionIndex] = index;
  Array.from(byId('answers').children).forEach((button, choice) => {
    button.setAttribute('aria-pressed', String(choice === index));
  });
  byId('next').disabled = false;
  updateEntry({ quizAnswers: answers, questionIndex });
}

function renderQuestion() {
  const question = questions[questionIndex];
  const lastQuestion = questionIndex === questions.length - 1;
  const openingQuiz = currentMode === 'opening';
  byId('quiz-mode').textContent = openingQuiz ? 'オープニング診断' : modes[currentMode].name;
  byId('opening-quiz-intro').hidden = !openingQuiz || questionIndex !== 0;
  byId('question-number').textContent = `${questionIndex + 1} / ${questions.length} 問`;
  byId('quiz-progress').max = questions.length;
  byId('quiz-progress').value = questionIndex + 1;
  byId('question-title').textContent = question.prompt;
  byId('answers').replaceChildren(...question.choices.map((choice, index) => {
    const button = element('button', null, 'answer');
    button.type = 'button';
    button.setAttribute('aria-pressed', String(answers[questionIndex] === index));
    button.append(element('span', ['A', 'B', 'C'][index], 'answer-letter'), element('span', choice));
    button.addEventListener('click', () => selectAnswer(index));
    return button;
  }));
  byId('previous').textContent = questionIndex === 0 ? quizBackLabels[quizBackPath()] : '前の質問に戻る';
  byId('next').textContent = lastQuestion ? '結果を見る' : '次の質問へ';
  byId('next').disabled = answers[questionIndex] === null;
  showScreen('quiz', 'question-title');
}

function resultDetail(title, text, className) {
  const card = element('section', null, className);
  card.append(chessTermText('h2', title), chessTermText('p', text));
  return card;
}

function renderResult(code, mode, fromLink = false) {
  if (!fromLink && !migrationRead(savedTypeResultKey)) rememberDiagnosis(savedTypeResultKey, { code, mode });
  const type = types[code];
  byId('result-mode').textContent = modes[mode].name;
  byId('result-code').textContent = code;
  byId('result-title').textContent = type.name;
  byId('result-description').textContent = type.description;
  byId('result-note').textContent = modes[mode].resultNote;
  byId('shared-note').hidden = !fromLink;
  byId('restart').textContent = fromLink ? '自分も診断する' : 'もう一度診断する';
  byId('result-axes').replaceChildren(...axes.map(({ codes, labels }, index) => {
    const letter = code[index];
    const item = element('li');
    item.append(element('span', letter, 'axis-code'), element('span', labels[codes.indexOf(letter)]));
    return item;
  }));
  const opening = resultDetail('おすすめオープニング', type.opening, 'opening');
  opening.append(element('p', '好みに基づいた序盤の戦い方の提案です。', 'opening-note'));
  byId('result-details').replaceChildren(
    resultDetail('活かしやすい強み', type.strength, 'result-strength'),
    resultDetail('対局で意識したい注意点', type.caution, 'result-caution'),
    opening,
    resultDetail('上達のヒント', type.tip),
  );
  renderShareCard(code);
  const shareBase = document.querySelector('link[rel="canonical"]')?.href ?? location.href;
  const link = makeResultLink(shareBase, code, mode);
  byId('result-link-url').value = link;
  byId('manual-result-link').hidden = true;
  byId('link-status').textContent = '';
  byId('local-link-note').hidden = location.protocol !== 'file:';
  byId('share-result-link').hidden = location.protocol === 'file:'
    || !navigator.share || navigator.canShare?.({ url: link }) === false;
  showScreen('result', 'result-title');
}

function renderOpeningResult(resultAnswers, studyId) {
  if (!migrationRead(savedOpeningResultKey)) rememberDiagnosis(savedOpeningResultKey, resultAnswers);
  lastOpeningAnswers = resultAnswers;
  const ratingLabel = (value) => ['低', '低', '中', '中', '高'][value - 1];
  byId('opening-results').replaceChildren(...scoreOpenings(resultAnswers).map(({ candidate, reason }) => {
    const card = element('article', null, 'opening-card');
    card.dataset.openingId = candidate.id;
    const english = element('p', candidate.english, 'opening-english');
    english.lang = 'en';
    const ratings = element('dl', null, 'opening-ratings');
    for (const [label, value] of [['難易度', candidate.traits.complexity], ['学習負担', candidate.traits.burden]]) {
      const rating = element('div');
      rating.append(element('dt', label), element('dd', ratingLabel(value)));
      ratings.append(rating);
    }
    const learn = element('a', '盤上で学ぶ', 'button secondary opening-learn');
    learn.href = `#study/${candidate.id}`;
    learn.id = `learn-${candidate.id}`;
    learn.setAttribute('aria-label', `${candidate.name}を盤上で学ぶ`);
    card.append(
      element('p', openingSlots[candidate.slot], 'eyebrow'),
      chessTermText('h2', candidate.name),
      english,
      element('h3', 'どんな戦法？'),
      chessTermText('p', candidate.description),
      chessTermText('p', candidate.condition, 'opening-condition'),
      element('h3', 'まず意識すること'),
      chessTermText('p', candidate.tip),
      element('h3', 'おすすめした理由'),
      element('p', reason),
      ratings,
      learn, Object.assign(element('a', 'この定跡からCPUと対戦する', 'text-button'), { href: `#cpu-opening/${candidate.id}` }),
    );
    return card;
  }));
  showWithReturnFocus('opening-result', 'opening-result-title', studyId && `learn-${studyId}`);
}

function updateEntry(data) {
  history.replaceState({ ...history.state, path: displayedRoute.path, ...data }, '');
}

function goTo(path, data = {}) {
  const from = displayedRoute?.path ?? 'home';
  siteMenu.close(path === from);
  if ((from === 'cpu' || displayedRoute?.cpuOpening) && path !== from && cpuPage.leave(() => goTo(path, data))) return;
  if (path === from && !Object.keys(data).length) {
    if (path === 'home' || path === 'learn') renderSite();
    return;
  }
  const entry = { ...data, path, from };
  try {
    history.pushState(entry, '', siteAddress(location.href, path, data));
  } catch (error) {
    // ローカルファイルでは検索パラメーターの変更が制限されることがあります。
    if (error.name !== 'SecurityError' || location.protocol !== 'file:') throw error;
    history.pushState(entry, '', siteAddress(location.href, path, data, true));
  }
  renderSite();
}

function backTo(path, data) {
  if (history.state?.from === path) {
    history.back();
  } else {
    goTo(path, data);
  }
}

function quizBackPath() {
  if (currentMode !== 'opening') return 'mode';
  const path = displayedRoute.returnTo;
  return Object.hasOwn(quizBackLabels, path) ? path : 'home';
}

function showWithReturnFocus(screen, heading, buttonId) {
  const button = buttonId && byId(buttonId);
  showScreen(screen, button ? buttonId : heading);
  if (button) button.scrollIntoView({ block: 'nearest' });
}

function renderSite() {
  updateMigrationLink();
  const previous = displayedRoute;
  const route = readSiteRoute(location.href, history.state);
  const { path } = route;
  displayedRoute = route;
  siteMenu.close(false);
  siteMenu.mark(route);
  if (previous?.opening) openingStudyScreen.close();
  if (previous?.practice || previous?.reviewId) openingMemoryScreen.close();
  if (previous?.lesson) introScreen.close();
  if ((previous?.path === 'cpu' || previous?.cpuOpening) && previous.path !== path) cpuPage.close();
  if (previous?.path === 'external' && path !== 'external') lichessPage.close();
  if (previous?.game && previous.path !== path) gameReviewPages.close();
  if (previous?.personalId && previous.path !== path) personalPages.close();
  if (previous?.path === 'your-style' && path !== 'your-style') stylePage.cancel();

  if (path === 'your-style') {
    stylePage.open();
  } else if (route.personalId) {
    personalPages.openProblem(route);
  } else if (path === 'personal') {
    personalPages.openList();
  } else if (path === 'glossary' || route.termId) {
    chessGlossary.open(route.termId);
  } else if (path === 'external') {
    lichessPage.open();
  } else if (path === 'cpu' || route.cpuOpening) {
    if (previous?.path !== path) {
      if (route.cpuReplay) {
        const { cpuReplay, ...entry } = history.state;
        history.replaceState(entry, '');
      }
      let position = route.cpuPosition;
      if (route.cpuOpening) {
        try { position = cpuOpeningPosition(findStudyOpening(route.cpuOpening), route.cpuOpeningPly); }
        catch { position = {}; }
      }
      cpuPage.open(route.cpuReplay, position);
    }
  } else if (route.game || path === 'game-review' || path === 'game-library') {
    gameReviewPages.open(route);
  } else if (route.reviewId) {
    const item = route.retry ? learningTracker.item(route.reviewId)
      : learningTracker.due().find(item => item.id === route.reviewId);
    if (item) openingMemoryScreen.open(findStudyOpening(item.variationId ?? item.openingId), item.color, item);
    else {
      openingMemoryScreen.review();
      learningPages.todayReview('today-review', true);
    }
  } else if (route.practice) {
    openingMemoryScreen.open(route.practice, route.color);
  } else if (path === 'review') {
    openingMemoryScreen.review();
    learningPages.todayReview('today-review', true);
  } else if (path === 'dashboard' || (path === 'home' && learningTracker.home() === 'dashboard')) {
    learningPages.dashboard();
    stylePage.dashboard();
    dailyLife.dashboard();
    showScreen('dashboard', 'dashboard-title');
  } else if (path === 'daily') {
    learningPages.daily();
    showScreen('daily', 'daily-title');
  } else if (path === 'progress') {
    learningPages.progress();
    showScreen('progress', 'progress-title');
  } else if (route.lesson) {
    introScreen.open(route.lesson);
  } else if (path === 'intro') {
    introScreen.showOverview();
  } else if (path === 'intro-summary') {
    introScreen.showSummary();
  } else if (route.opening) {
    if (route.recommended) lastOpeningAnswers = route.openingAnswers;
    openingStudyScreen.open(route.opening, route);
  } else if (path === 'opening-result') {
    renderOpeningResult(route.openingAnswers, previous?.opening?.id);
  } else if (path === 'result') {
    renderResult(route.code, route.mode, route.fromLink);
  } else if (route.mode) {
    if (location.hash === '#opening-result') history.replaceState({ path }, '', '#opening-quiz');
    showQuiz(route.mode, route.quizAnswers, route.questionIndex);
  } else if (path === 'learn') {
    dailyLife.showGuide(false);
    showScreen('home', siteHeadings.learn);
    byId(siteHeadings.learn).scrollIntoView({ block: 'start' });
  } else if (path === 'welcome') {
    dailyLife.showGuide(true);
    showScreen('home', siteHeadings.welcome);
  } else if (path === 'openings' || path === 'memorize') {
    learningPages.catalog(path === 'memorize');
    showWithReturnFocus('openings', siteHeadings.openings, previous?.opening && `catalog-${previous.opening.id}`);
  } else {
    if (path === 'home') dailyLife.showGuide(false);
    byId('latest-opening-result').hidden = !lastOpeningAnswers;
    showScreen(path, siteHeadings[path]);
  }
}

byId('copy-result-link').addEventListener('click', async () => {
  const field = byId('result-link-url');
  const url = field.value;
  const stillViewingLink = () => field.value === url && !byId('result').hidden;
  try {
    await navigator.clipboard.writeText(url);
    if (stillViewingLink()) {
      byId('link-status').textContent = 'リンクをコピーしました';
    }
  } catch {
    if (!stillViewingLink()) return;
    byId('manual-result-link').hidden = false;
    byId('link-status').textContent = 'URLを選択しました。コピーして共有してください。';
    field.focus();
    field.select();
  }
});

byId('share-result-link').addEventListener('click', async () => {
  try {
    await navigator.share({ url: byId('result-link-url').value });
  } catch (error) {
    if (error.name !== 'AbortError') {
      byId('link-status').textContent = 'リンクを共有できませんでした。「結果のリンクをコピー」をお試しください。';
    }
  }
});

byId('mode-options').replaceChildren(...Object.entries(modes).map(([key, mode]) => {
  const card = element('section', null, 'mode-card');
  const button = element('a', `${mode.name}を始める`, 'button primary');
  button.href = `#quiz-${key}`;
  card.append(element('h2', mode.name), element('p', mode.description), button);
  return card;
}));

document.addEventListener('click', (event) => {
  const link = event.target.closest('a[href^="#"]');
  if (!link || event.defaultPrevented || event.button > 0
      || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  const path = link.getAttribute('href').slice(1);
  const route = displayedRoute;
  if (['study-back', 'study-more'].includes(link.id)) {
    backTo(path, path === 'opening-result' ? { openingAnswers: route.openingAnswers } : undefined);
  } else if (path.startsWith('study/') && route.path === 'opening-result') {
    goTo(path, { openingAnswers: route.openingAnswers });
  } else if (path === 'opening-result') {
    goTo(path, { openingAnswers: lastOpeningAnswers });
  } else if (path === 'opening-quiz' && ['beginner', 'improve', 'intro-summary'].includes(route.path)) {
    goTo(path, { returnTo: route.path });
  } else {
    goTo(path);
  }
});

byId('restart-opening').addEventListener('click', () => goTo('opening-quiz', { returnTo: 'opening-result' }));
byId('home-back').addEventListener('click', () => goTo('home'));
byId('restart').addEventListener('click', () => goTo('mode'));
byId('error-home').addEventListener('click', () => goTo('home'));
byId('previous').addEventListener('click', () => {
  if (questionIndex === 0) {
    backTo(quizBackPath());
    return;
  }
  questionIndex -= 1;
  updateEntry({ questionIndex });
  renderQuestion();
});
byId('next').addEventListener('click', () => {
  if (questionIndex === questions.length - 1) {
    if (currentMode === 'opening') {
      rememberDiagnosis(savedOpeningResultKey, answers);
      goTo('opening-result', { openingAnswers: answers });
      return;
    }
    const code = scoreAnswers(questions, answers);
    rememberDiagnosis(savedTypeResultKey, { code, mode: currentMode });
    goTo('result', { code, mode: currentMode });
    return;
  }
  questionIndex += 1;
  updateEntry({ questionIndex });
  renderQuestion();
});

history.scrollRestoration = 'manual';
window.addEventListener('popstate', renderSite);
window.addEventListener('DOMContentLoaded', renderSite, { once: true });

const dailyLife = (() => {
  const goalForm = byId('learning-goal-form');
  const guide = byId('welcome-guide');
  const games = createGameLibrary();
  const practice = createPersonalStore();
  const link = (label, href, style = 'text-button') => {
    const anchor = element('a', label, style);
    anchor.href = href;
    return anchor;
  };
  let guideDismissed = personalPreference(welcomeKey, false) === true;
  let dashboardRequest = 0;
  for (const [value, label] of Object.entries(learningGoals)) {
    const option = element('option', label);
    option.value = value;
    goalForm.elements.goal.append(option);
  }

  function showGuide(force) {
    guide.hidden = !force && guideDismissed;
    byId('home-learning-choices').hidden = !guide.hidden;
  }

  function dismissGuide() {
    guideDismissed = true;
    savePersonalPreference(welcomeKey, true);
    showGuide(false);
  }

  guide.addEventListener('click', event => {
    if (event.target.closest('a[data-welcome-choice]')) dismissGuide();
  });
  byId('welcome-skip').addEventListener('click', () => {
    dismissGuide();
    if (location.hash === '#welcome') {
      history.replaceState({ path: 'learn' }, '', '#learn');
      renderSite();
    }
    byId('home-start').focus();
  });

  function resumeLink(last) {
    if (!last) return null;
    if (last.type === 'lesson') {
      const lesson = introLessons.find(({ id }) => id === last.id);
      return lesson ? [lesson.title, '#lesson/' + lesson.id] : null;
    }
    const opening = findStudyOpening(last.id);
    if (!opening) return null;
    return [opening.name, last.type === 'practice' ? `#practice/${opening.id}/${last.color}` : '#study/' + opening.id];
  }

  async function dashboard() {
    const request = ++dashboardRequest;
    const value = personalPreference(learningGoalKey, null);
    const settings = validLearningGoal(value) ? value : null;
    for (const key of ['goal', 'minutes', 'days']) goalForm.elements[key].value = settings?.[key] ?? '';
    byId('learning-goal-delete').hidden = !settings;
    byId('learning-goal-summary').textContent = settings ? [learningGoals[settings.goal],
      settings.minutes && `1回 ${settings.minutes}分`, settings.days && `週 ${settings.days}日`].filter(Boolean).join(' · ') : '目標を設定する（任意）';
    const resume = resumeLink(learningTracker.data.last);
    const plan = learningTracker.day();
    const state = { resume: resume?.[1], openingDue: learningTracker.due().length,
      learnedOpening: Boolean(learningTracker.history().length || learningTracker.data.last?.type === 'study'),
      problemsDone: plan.questions.length > 0 && plan.questions.length === plan.checked.length };
    const recommendation = byId('dashboard-next');
    function recommend() {
      const [label, href, detail] = dailyRecommendation(settings?.goal, state);
      recommendation.replaceChildren(element('p', detail), link(label, href, 'button primary'));
      if (resume && resume[1] !== href) recommendation.append(link('前回の続き：' + resume[0], resume[1]));
    }
    recommend();
    const list = byId('dashboard-recent');
    list.replaceChildren();
    await Promise.allSettled([
      practice.all().then(rows => {
        if (request !== dashboardRequest) return;
        state.personalDue = personalDue(rows).length;
        recommend();
      }),
      games.all().then(rows => {
        if (request !== dashboardRequest) return;
        const recent = rows.sort((a, b) => String(reviewRecentDate(b).value).localeCompare(String(reviewRecentDate(a).value))).slice(0, 2);
        state.game = recent[0]?.id;
        recommend();
        for (const game of recent) {
          const { white, black, event } = game.metadata;
          const row = element('li');
          row.append(link(white && black ? `${white} 対 ${black}` : event || '保存した対局', '#game-review/' + game.id));
          list.append(row);
        }
      }),
    ]);
  }

  goalForm.addEventListener('submit', event => {
    event.preventDefault();
    const value = Object.fromEntries(new FormData(goalForm));
    if (!validLearningGoal(value) || !savePersonalPreference(learningGoalKey, value)) {
      byId('learning-goal-status').textContent = '目標を保存できませんでした。目標の選択とブラウザーの保存設定を確認してください。';
      return;
    }
    dashboard();
    byId('learning-goal-status').textContent = '学習目標を保存しました。';
  });
  byId('learning-goal-delete').addEventListener('click', () => {
    try {
      localStorage.removeItem(learningGoalKey);
      dashboard();
      byId('learning-goal-summary').focus();
      byId('learning-goal-status').textContent = '学習目標を削除しました。';
    } catch { byId('learning-goal-status').textContent = '学習目標を削除できませんでした。'; }
  });

  return { showGuide, dashboard };
})();

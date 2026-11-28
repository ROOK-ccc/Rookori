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
  let homeRequest = 0;
  for (const [value, label] of Object.entries(learningGoals)) {
    const option = element('option', label);
    option.value = value;
    goalForm.elements.goal.append(option);
  }

  function showGuide(view = 'home') {
    guide.hidden = view === 'learn' || (view === 'home' && guideDismissed);
    byId('home-learning-choices').hidden = !guide.hidden;
    const next = byId('home-practice-next');
    const current = ++homeRequest;
    const ledger = generalHistory();
    if (view === 'home') {
      practice.all().catch(() => []).then(rows => {
        if (current === homeRequest) renderPracticeNext(next.querySelector('div'), rows, ledger, () => current === homeRequest, next);
      });
    } else next.hidden = true;
  }

  function dismissGuide() {
    guideDismissed = true;
    savePersonalPreference(welcomeKey, true);
    showGuide();
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

  function loadGoal() {
    const value = personalPreference(learningGoalKey, null);
    const settings = validLearningGoal(value) ? value : null;
    for (const key of ['goal', 'minutes', 'days']) goalForm.elements[key].value = settings?.[key] ?? '';
    byId('learning-goal-delete').hidden = !settings;
    byId('learning-goal-summary').textContent = settings ? [learningGoals[settings.goal],
      settings.minutes && `1回 ${settings.minutes}分`, settings.days && `週 ${settings.days}日`].filter(Boolean).join(' · ') : '目標を設定する（任意）';
    return settings;
  }

  async function dashboard() {
    const request = ++dashboardRequest;
    const settings = loadGoal();
    const plan = learningTracker.day();
    const resumeSection = byId('dashboard-resume');
    const resume = resumeSection.hidden ? undefined : byId('dashboard-resume-link').hash;
    const state = { resume, openingDue: learningTracker.due().length,
      learnedOpening: Boolean(learningTracker.history().length || learningTracker.data.last?.type === 'study'),
      problemsDone: plan.questions.length > 0 && plan.questions.length === plan.checked.length };
    const recommendation = byId('dashboard-next');
    const practiceNext = byId('dashboard-practice-next');
    practiceNext.hidden = true;
    function recommend() {
      const [label, href, detail] = dailyRecommendation(settings?.goal, state);
      byId('dashboard-recommendation').hidden = resume === href;
      recommendation.replaceChildren(element('p', detail), link(label, href, 'button primary'));
    }
    recommend();
    await Promise.allSettled([
      practice.all().catch(() => []).then(rows => {
        if (request !== dashboardRequest) return;
        state.personalDue = personalDue(rows).length;
        recommend();
        return renderPracticeNext(practiceNext.querySelector('div'), rows, generalHistory(), () => request === dashboardRequest, practiceNext);
      }),
      games.all().then(rows => {
        if (request !== dashboardRequest) return;
        const recent = rows.sort((a, b) => String(reviewRecentDate(b).value).localeCompare(String(reviewRecentDate(a).value))).slice(0, 2);
        state.game = recent[0]?.id;
        recommend();
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
    loadGoal();
    byId('learning-goal-status').textContent = '学習目標を保存しました。';
  });
  byId('learning-goal-delete').addEventListener('click', () => {
    try {
      localStorage.removeItem(learningGoalKey);
      loadGoal();
      byId('learning-goal-summary').focus();
      byId('learning-goal-status').textContent = '学習目標を削除しました。';
    } catch { byId('learning-goal-status').textContent = '学習目標を削除できませんでした。'; }
  });

  return { showGuide, dashboard, loadGoal };
})();

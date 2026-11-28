const siteHeadings = {
  home: 'home-title',
  roadmap: 'roadmap-title', updates: 'updates-title',
  welcome: 'welcome-title',
  'pgn-import': 'batch-title',
  learn: 'learn-title',
  general: 'general-title',
  discover: 'discover-title', growth: 'growth-title', profile: 'profile-title', goals: 'goals-title', play: 'play-title',
  beginner: 'beginner-title',
  improve: 'improve-title',
  journal: 'journal-title',
  openings: 'openings-title',
  mode: 'mode-title',
  error: 'error-title', dashboard: 'dashboard-title', daily: 'daily-title',
  progress: 'progress-title', backup: 'backup-title', about: 'about-title', memorize: 'openings-title',
  'game-review': 'game-review-title', 'game-library': 'game-library-title',
  external: 'external-title',
  personal: 'personal-title',
  'your-style': 'your-style-title',
  glossary: 'glossary-title', notation: 'notation-title', privacy: 'privacy-title', cpu: 'cpu-title',
};

const quizModes = {
  'opening-quiz': 'opening',
  'quiz-beginner': 'beginner',
  'quiz-experienced': 'experienced',
};

function validOpeningAnswers(answers) {
  return Array.isArray(answers) && answers.length === openingQuestions.length
    && openingQuestions.every(({ choices }, index) =>
      Number.isInteger(answers[index]) && answers[index] >= 0 && answers[index] < choices.length);
}

function readSiteRoute(address, state) {
  const path = new URL(address).hash.slice(1);
  // 履歴の各項目には、その画面の回答や学習の進行だけを保存します。
  const entry = state?.path === path ? state : {};
  const general = /^general\/([A-Za-z0-9]{5})(?:\/(daily|recommended|daily-recommended))?$/.exec(path);
  if (general) return { path, generalId: general[1], generalDaily: general[2]?.startsWith('daily') ?? false,
    generalRecommended: general[2]?.endsWith('recommended') ?? false };
  const theme = /^general\/([A-Za-z0-9]+)$/.exec(path);
  if (theme) return { path, generalTheme: theme[1] };
  const themes = /^general\/theme\/([A-Za-z0-9]+)$/.exec(path);
  if (themes) return { path, generalTheme: themes[1] };
  if (path === 'cpu/setup-opening') return { path, cpuSetup: true };
  if (path === 'cpu') return { path, cpuReplay: entry.cpuReplay, cpuPosition: entry.cpuPosition };
  const openingCpu = /^cpu-opening\/([a-z0-9-]+)(?:\/([0-9]+))?$/.exec(path);
  if (openingCpu) return { path, cpuOpening: openingCpu[1], cpuOpeningPly: openingCpu[2] ? Number(openingCpu[2]) : undefined };
  const personal = /^personal\/([a-f0-9]{64})(\/daily)?$/.exec(path);
  if (personal) return { path, personalId: personal[1], personalDaily: Boolean(personal[2]) };
  const diagnosis = /^diagnosis\/([a-z0-9-]+)$/.exec(path);
  if (diagnosis && diagnosisId.test(diagnosis[1])) {
    const row = entry.temporaryDiagnosis;
    const temporaryDiagnosis = row?.id === diagnosis[1] && validDiagnosisHistory({ version: 1, records: [row], removed: [] }) ? row : undefined;
    return { path, diagnosisId: diagnosis[1], temporaryDiagnosis };
  }
  if (Object.hasOwn(siteHeadings, path)) return { path };
  const term = /^glossary\/([a-z0-9-]+)$/.exec(path);
  if (term) return { path, termId: term[1] };
  if (path === 'intro' || path === 'intro-summary') return { path };
  if (path === 'review') return { path };
  const game = /^game-review\/(sample|preview|[a-f0-9]{32})$/.exec(path);
  if (game) return { path, game: game[1], gamePly: entry.gamePly, gamePreviewId: entry.gamePreviewId };
  const review = /^(review|retry)-item\/(.+)$/.exec(path);
  if (review) {
    try { return { path, reviewId: decodeURIComponent(review[2]), retry: review[1] === 'retry' }; }
    catch { return { path: 'review' }; }
  }
  const practice = /^practice\/([a-z0-9-]+)\/([wb])$/.exec(path);
  if (practice) {
    const opening = findStudyOpening(practice[1]);
    return opening ? { path, practice: opening, color: practice[2] } : { path: 'openings' };
  }
  if (path.startsWith('lesson/')) {
    const lesson = introLessons.find(({ id }) => path === `lesson/${id}`);
    return lesson ? { path, lesson } : { path: 'intro' };
  }
  if (Object.hasOwn(quizModes, path)) return { ...entry, path, mode: quizModes[path] };

  if (path === 'opening-result') {
    return validOpeningAnswers(entry.openingAnswers)
      ? { path, openingAnswers: entry.openingAnswers }
      : { path: 'opening-quiz', mode: 'opening' };
  }

  if (path.startsWith('study/')) {
    const opening = findStudyOpening(path.slice(6));
    if (!opening) return { path: 'openings' };
    const recommended = validOpeningAnswers(entry.openingAnswers);
    return { ...entry, path, opening, recommended };
  }

  const result = readResultLink(address);
  if (path === 'result' && Object.hasOwn(types, entry.code) && Object.hasOwn(modes, entry.mode)) {
    return { path: 'result', code: entry.code, mode: entry.mode, fromLink: false };
  }
  if (result.screen === 'result') {
    const ownResult = !path && state?.path === 'result' && state.code === result.code && state.mode === result.mode;
    return { path: 'result', code: result.code, mode: result.mode, fromLink: !ownResult };
  }
  return { path: result.screen };
}

function siteAddress(address, path, data, hashOnly = false) {
  if (path === 'result' && !hashOnly) {
    const result = new URL(makeResultLink(address, data.code, data.mode));
    return typeof preserveRookoriCampaign === 'function' ? preserveRookoriCampaign(address, result).href : result.href;
  }
  const url = new URL(address);
  if (!hashOnly) {
    url.search = '';
    if (typeof preserveRookoriCampaign === 'function') preserveRookoriCampaign(address, url);
  }
  url.hash = path === 'home' && !hashOnly ? '' : path;
  return url.href;
}

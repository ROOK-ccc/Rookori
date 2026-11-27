const learningKey = 'chesspath.learning.v1';
const reviewIntervals = [1, 3, 7, 14, 30];
const practiceLimit = 10;

function localDay(date = new Date()) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()].map((part, index) =>
    String(part).padStart(index ? 2 : 4, '0')).join('-');
}

function offsetDay(day, days) {
  const [year, month, date] = day.split('-').map(Number);
  return localDay(new Date(year, month - 1, date + days));
}

function reviewItemsFor(opening) {
  const study = new OpeningStudy(opening.moves);
  return opening.moves.map((move, ply) => {
    const fen = study.game.fen();
    const color = study.game.turn();
    const legal = new Set(study.legalMoves().map(entry => entry.lan));
    const answers = [...new Set([move, ...(opening.acceptedMoves?.[ply] ?? [])])].filter(move => legal.has(move));
    study.advance();
    const lineId = opening.id + ':main-v1';
    return {
      id: [lineId, color, fen.split(' ').slice(0, 4).join(' '), move].join('|'),
      openingId: opening.parentId ?? opening.id, variationId: opening.parentId ? opening.id : null,
      lineId, color, fen, ply, move, answers,
      notation: (Math.floor(ply / 2) + 1) + (ply % 2 ? '...' : '.') + study.lastMove.san,
    };
  });
}

function freshLearning() {
  return { schemaVersion: 1, home: 'auto', items: {}, days: {}, questions: {}, explained: [], last: null, migrated: false };
}

function planQuestions(lessons, intro, questions, day) {
  const rank = id => {
    const stats = Object.hasOwn(questions, id) ? questions[id] : null;
    if (stats?.errors || intro.quiz[id]?.firstCorrect === false) return 0;
    if (!intro.completed.includes(id) && !intro.quiz[id] && !stats) return 1;
    if (stats?.solved && stats.solved <= offsetDay(day, -7)) return 2;
    return 3;
  };
  return [...new Set(lessons.map(lesson => lesson.id))].sort((a, b) => rank(a) - rank(b)
    || (questions[a]?.solved ?? '').localeCompare(questions[b]?.solved ?? '')).slice(0, practiceLimit);
}

function nextLearningTarget(lessons, intro, learned, openings) {
  const start = Math.max(0, lessons.findIndex(lesson => lesson.id === intro.lesson));
  const incomplete = lesson => !intro.completed.includes(lesson.id);
  const next = lessons.slice(start).find(incomplete) ?? lessons.find(incomplete);
  if (next) return { type: 'lesson', id: next.id };
  const opening = openings.find(entry => !learned.has(entry.id)) ?? openings[0];
  return opening ? { type: 'opening', id: opening.id } : null;
}

function scheduleReview(previous, quality, day, date, mistakes = 0, hints = 0) {
  const item = { ...previous, mistakes: (previous.mistakes ?? 0) + mistakes, hints: (previous.hints ?? 0) + hints };
  if (item.reviewedDay === day) return item;
  item.lastAt = date.toISOString();
  if (quality === 'interrupted') {
    return { ...item, due: mistakes && item.due > day ? day : item.due, outcome: quality };
  }
  let level = item.level ?? -1;
  if (quality === 'clean') level = Math.min(reviewIntervals.length - 1, level + 1);
  else level = Math.max(0, level - (quality === 'retry' ? 2 : 1));
  const interval = quality === 'clean' ? reviewIntervals[level] : reviewIntervals[0];
  return { ...item, level, interval, reviewedDay: day, due: offsetDay(day, interval), outcome: quality };
}

class LearningTracker {
  constructor(storage, lessons, openings, resolveOpening, clock = () => new Date()) {
    this.storage = storage;
    this.lessons = lessons;
    this.openings = openings;
    this.resolveOpening = resolveOpening;
    this.clock = clock;
    this.cached = new Map();
    this.data = this.read(learningKey) ?? freshLearning();
    if (!validLearning(this.data)) this.data = freshLearning();
    this.available = Boolean(storage);
  }

  read(key) {
    try { return JSON.parse(this.storage?.getItem(key) ?? 'null'); }
    catch { return null; }
  }

  save() {
    try { this.storage?.setItem(learningKey, JSON.stringify(this.data)); this.available = Boolean(this.storage); }
    catch { this.available = false; }
  }

  intro() {
    const value = this.read(introStorageKey);
    return {
      completed: Array.isArray(value?.completed) ? value.completed : [],
      lesson: value?.lesson,
      quiz: value?.quiz ?? {},
    };
  }

  history() {
    const history = this.read(openingHistoryKey);
    return Array.isArray(history?.records) ? history.records.filter(row => row && learningDateTime(row.date)) : [];
  }

  itemList(opening) {
    if (!this.cached.has(opening.id)) this.cached.set(opening.id, reviewItemsFor(opening));
    return this.cached.get(opening.id);
  }

  item(id) {
    const saved = this.data.items[id];
    const opening = saved && this.resolveOpening(saved.variationId ?? saved.openingId);
    return opening && this.itemList(opening).find(item => item.id === id);
  }

  migrate() {
    if (this.data.migrated) return;
    const records = this.history().filter(record => record.kind === undefined)
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    if (!records.length) return;
    for (const row of records) {
      const opening = this.resolveOpening(row.variationId ?? row.openingId);
      if (!opening || !['w', 'b'].includes(row.color) || row.lineId !== opening.id + ':main-v1') continue;
      const items = this.itemList(opening).filter(item => item.color === row.color);
      const date = new Date(row.date);
      const day = localDay(date);
      const errors = Array.isArray(row.errors) ? row.errors : [];
      items.forEach((item, index) => {
        const count = errors.filter(error => error?.ply === item.ply).length;
        const solved = index < row.trained;
        if (!solved && !count) return;
        const previous = this.data.items[item.id];
        this.data.items[item.id] = {
          ...item, level: solved ? 0 : previous?.level ?? -1, interval: solved ? 1 : 0,
          due: solved ? offsetDay(day, 1) : day, reviewedDay: solved ? day : null,
          lastAt: row.date, outcome: solved ? 'legacy' : 'interrupted',
          mistakes: (previous?.mistakes ?? 0) + count, hints: previous?.hints ?? 0,
        };
      });
    }
    this.data.migrated = true;
    if (records.length) this.save();
  }

  learned() {
    return new Set([...this.data.explained,
      ...this.history().filter(row => row.complete && row.kind !== 'review').map(row => row.variationId ?? row.openingId)]);
  }

  home() {
    return this.data.home === 'auto' ? (this.intro().completed.length || this.history().length
      || this.data.last || Object.keys(this.data.items).length || this.data.explained.length ? 'dashboard' : 'intro') : this.data.home;
  }

  due(day = localDay(this.clock())) {
    this.migrate();
    return Object.values(this.data.items)
      .filter(item => item.due <= day && item.reviewedDay !== day && this.item(item.id))
      .sort((a, b) => a.due.localeCompare(b.due) || b.mistakes - a.mistakes || a.id.localeCompare(b.id));
  }

  day() {
    const date = localDay(this.clock());
    if (!this.data.days[date]) {
      const intro = this.intro();
      const learned = this.learned();
      this.data.days[date] = {
        reviewIds: this.due(date).map(item => item.id),
        target: nextLearningTarget(this.lessons, intro, learned, this.openings),
        questions: planQuestions(this.lessons, intro, this.data.questions, date),
        correct: [], checked: [], reviewed: [], newDone: false, reviewRemaining: null,
      };
      this.save();
    }
    return this.data.days[date];
  }

  observe(item, quality, { mistakes = 0, hints = 0, firstTryCorrect } = {}) {
    const date = this.clock();
    const day = localDay(date);
    const plan = this.day();
    const previous = this.data.items[item.id] ?? { ...item, due: day, level: -1, interval: 0, reviewedDay: null };
    const updated = scheduleReview(previous, quality, day, date, mistakes, hints);
    if (previous.reviewedDay !== day && typeof firstTryCorrect === 'boolean') updated.firstTryCorrect = firstTryCorrect;
    this.data.items[item.id] = updated;
    if (quality !== 'interrupted' && plan.reviewIds.includes(item.id) && !plan.reviewed.includes(item.id)) {
      plan.reviewed.push(item.id);
    }
    this.data.last = { type: 'practice', id: item.variationId ?? item.openingId, color: item.color };
    plan.reviewRemaining = this.due(day).length;
    this.save();
  }

  lessonAnswer(id, correct) {
    const day = localDay(this.clock());
    const plan = this.day();
    const stats = Object.hasOwn(this.data.questions, id) ? this.data.questions[id] : { errors: 0, solved: null };
    plan.questionAttempts ??= [...plan.correct];
    if (!plan.questionAttempts.includes(id)) plan.questionAttempts.push(id);
    if (!correct) stats.errors += 1;
    else {
      stats.solved = day;
      if (!plan.correct.includes(id)) plan.correct.push(id);
      if (plan.questions.includes(id) && !plan.checked.includes(id)) plan.checked.push(id);
      if (plan.target?.type === 'lesson' && plan.target.id === id) plan.newDone = true;
    }
    this.data.questions[id] = stats;
    this.data.last = { type: 'lesson', id };
    this.save();
  }

  openingDone(id, type) {
    const plan = this.day();
    if (!this.data.explained.includes(id)) this.data.explained.push(id);
    if (plan.target?.type === 'opening' && plan.target.id === id) plan.newDone = true;
    if (type === 'study') {
      plan.explanations ??= [];
      if (!plan.explanations.includes(id)) plan.explanations.push(id);
      this.data.last = { type, id };
    }
    this.save();
  }

  activity() {
    return summarizeLearningDays(this.history(), this.data.days);
  }
}

const learningDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && offsetDay(value, 0) === value;
const learningDateTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const learningCount = value => Number.isSafeInteger(value) && value >= 0;
const learningIds = value => Array.isArray(value) && value.every(id => typeof id === 'string')
  && new Set(value).size === value.length;
const learningObject = value => value && typeof value === 'object' && !Array.isArray(value);
const learningUci = value => typeof value === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(value);
const learningName = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,100}$/.test(value);
const learningTarget = value => value === null || (learningObject(value)
  && ['lesson', 'opening', 'study', 'practice'].includes(value.type) && learningName(value.id)
  && (value.type !== 'practice' || ['w', 'b'].includes(value.color)));

function validLearning(value) {
  return value?.schemaVersion === 1 && ['auto', 'dashboard', 'intro'].includes(value.home)
    && typeof value.migrated === 'boolean' && learningIds(value.explained) && value.explained.every(learningName)
    && learningTarget(value.last) && learningObject(value.questions) && learningObject(value.items) && learningObject(value.days)
    && Object.entries(value.questions).every(([id, stats]) => learningName(id) && learningCount(stats?.errors)
      && (stats.solved === null || learningDate(stats.solved)))
    && Object.entries(value.items).every(([id, item]) => item?.id === id && id.includes('|')
      && learningName(item.openingId) && (item.variationId === null || learningName(item.variationId))
      && typeof item.lineId === 'string' && ['w', 'b'].includes(item.color) && typeof item.fen === 'string'
      && chessRules.validateFen(item.fen).ok
      && id === [item.lineId, item.color, item.fen.split(' ').slice(0, 4).join(' '), item.move].join('|')
      && learningCount(item.ply) && learningUci(item.move) && Array.isArray(item.answers) && item.answers.length > 0
      && item.answers.every(learningUci) && typeof item.notation === 'string'
      && learningDate(item.due) && (item.reviewedDay === null || learningDate(item.reviewedDay))
      && learningDateTime(item.lastAt) && [0, ...reviewIntervals].includes(item.interval) && learningCount(item.mistakes) && learningCount(item.hints)
      && Number.isInteger(item.level) && item.level >= -1 && item.level < reviewIntervals.length
      && (item.firstTryCorrect === undefined || typeof item.firstTryCorrect === 'boolean')
      && ['clean', 'retry', 'hint', 'interrupted', 'legacy'].includes(item.outcome))
    && Object.entries(value.days).every(([date, plan]) => learningDate(date) && learningObject(plan)
      && ['reviewIds', 'questions', 'correct', 'checked', 'reviewed'].every(key => learningIds(plan[key]))
      && ['questionAttempts', 'explanations'].every(key => plan[key] === undefined || learningIds(plan[key]))
      && plan.questions.length <= practiceLimit && plan.checked.every(id => plan.questions.includes(id))
      && plan.reviewed.every(id => plan.reviewIds.includes(id)) && learningTarget(plan.target)
      && typeof plan.newDone === 'boolean' && (plan.reviewRemaining === null || learningCount(plan.reviewRemaining)));
}

function learningBackup(storage) {
  return { schemaVersion: 1, data: Object.fromEntries([learningKey, introStorageKey, openingHistoryKey]
    .map(key => [key, JSON.parse(storage.getItem(key) ?? 'null')])) };
}

function validateLearningBackup(backup) {
  if (backup?.schemaVersion !== 1 || !learningObject(backup.data)) return false;
  const { data } = backup;
  if (Object.keys(data).length !== 3) return false;
  const intro = data[introStorageKey];
  const history = data[openingHistoryKey];
  const learning = data[learningKey];
  return (learning === null || validLearning(learning))
    && (intro === null || (learningObject(intro) && learningIds(intro.completed) && intro.completed.every(learningName)
      && (intro.chapter === null || learningName(intro.chapter)) && (intro.lesson === null || learningName(intro.lesson))
      && learningObject(intro.quiz) && Object.entries(intro.quiz).every(([id, entry]) => learningName(id)
        && learningCount(entry?.attempts) && typeof entry.firstCorrect === 'boolean' && typeof entry.solved === 'boolean')))
    && (history === null || (history?.schemaVersion === 1 && Array.isArray(history.records) && history.records.every(row =>
      learningObject(row) && typeof row.id === 'string' && learningDateTime(row.date)
      && (row.kind === undefined || ['practice', 'review'].includes(row.kind))
      && learningName(row.openingId) && (row.variationId === null || learningName(row.variationId))
      && typeof row.lineId === 'string' && ['w', 'b'].includes(row.color)
      && ['trained', 'firstCorrect', 'unassistedFirstCorrect', 'hints', 'mistakes'].every(key => learningCount(row[key]))
      && row.unassistedFirstCorrect <= row.firstCorrect && row.firstCorrect <= row.trained && typeof row.complete === 'boolean'
      && (row.activityAt == null || learningDateTime(row.activityAt))
      && (row.answerEvents === undefined || validFirstAnswers(row.answerEvents))
      && Array.isArray(row.errors) && row.errors.every(error => learningObject(error) && learningCount(error.ply)
        && learningUci(error.expected) && (error.played === null || learningUci(error.played))))));
}

function unionLearningValues(a, b) {
  return [...new Set([...a, ...b])];
}

function mergeLearningProgress(current, incoming) {
  const mergeRows = (local, imported, merge) => Object.fromEntries(unionLearningValues(Object.keys(local), Object.keys(imported))
    .map(id => [id, !Object.hasOwn(local, id) ? imported[id]
      : !Object.hasOwn(imported, id) ? local[id] : merge(local[id], imported[id])]));
  const latest = (a, b) => !a || b && b > a ? b : a;
  return {
    ...current,
    migrated: current.migrated || incoming.migrated,
    home: current.home === 'auto' ? incoming.home : current.home,
    last: current.last ?? incoming.last,
    explained: unionLearningValues(current.explained, incoming.explained),
    items: mergeRows(current.items, incoming.items, (a, b) => {
      const newest = Date.parse(b.lastAt) > Date.parse(a.lastAt) ? b : a;
      return { ...newest, hints: Math.max(a.hints, b.hints), mistakes: Math.max(a.mistakes, b.mistakes) };
    }),
    questions: mergeRows(current.questions, incoming.questions, (a, b) =>
      ({ ...a, errors: Math.max(a.errors, b.errors), solved: latest(a.solved, b.solved) })),
    days: mergeRows(current.days, incoming.days, (a, b) => {
      const active = plan => plan.newDone || ['correct', 'checked', 'reviewed', 'questionAttempts', 'explanations']
        .some(key => plan[key]?.length);
      const plan = active(a) || !active(b) ? a : b;
      const sameTarget = a.target?.id === b.target?.id && a.target?.type === b.target?.type;
      return {
        ...plan,
        reviewIds: unionLearningValues(plan.reviewIds, unionLearningValues(a.reviewIds, b.reviewIds)),
        correct: unionLearningValues(a.correct, b.correct),
        checked: unionLearningValues(a.checked, b.checked).filter(id => plan.questions.includes(id)),
        reviewed: unionLearningValues(a.reviewed, b.reviewed),
        questionAttempts: unionLearningValues(a.questionAttempts ?? a.correct, b.questionAttempts ?? b.correct),
        explanations: unionLearningValues(a.explanations ?? [], b.explanations ?? []),
        newDone: plan.newDone || (sameTarget && (a.newDone || b.newDone)),
      };
    }),
  };
}

function mergeIntroProgress(current, incoming) {
  const quiz = { ...current.quiz };
  for (const [id, result] of Object.entries(incoming.quiz)) {
    const previous = quiz[id];
    quiz[id] = previous ? { ...previous, attempts: Math.max(previous.attempts, result.attempts),
      solved: previous.solved || result.solved } : result;
  }
  return { ...current, lesson: current.lesson ?? incoming.lesson,
    chapter: current.lesson ? current.chapter : incoming.chapter,
    completed: unionLearningValues(current.completed, incoming.completed), quiz };
}

function restoreLearningBackup(storage, backup) {
  if (!validateLearningBackup(backup)) throw new Error('学習データの形式を確認してください。');
  const keys = [learningKey, introStorageKey, openingHistoryKey];
  const before = new Map(keys.map(key => [key, storage.getItem(key)]));
  const write = (key, text) => text === null ? storage.removeItem(key) : storage.setItem(key, text);
  const changed = [];
  try {
    for (const key of keys) {
      const value = backup.data[key];
      write(key, value === null ? null : JSON.stringify(value));
      changed.push(key);
    }
  } catch (error) {
    for (const key of changed.reverse()) write(key, before.get(key));
    throw error;
  }
}

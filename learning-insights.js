const learningActivityTypes = [
  ['practice', '暗記'], ['review', '復習'], ['questions', '問題演習'],
  ['study', '解説の学習'], ['unknown', '種別の記録なし'],
];

function validFirstAnswers(events) {
  return Array.isArray(events) && events.every(event => learningCount(event?.ply)
    && learningDateTime(event.at) && typeof event.correct === 'boolean' && typeof event.hinted === 'boolean')
    && new Set(events.map(event => event.ply)).size === events.length;
}

function summarizeLearningDays(history, plans) {
  const rows = new Map();
  function row(day) {
    if (!rows.has(day)) rows.set(day, {
      day, moves: 0, first: 0, hints: 0, questions: 0, due: null,
      counts: Object.fromEntries(learningActivityTypes.map(([key]) => [key, 0])),
    });
    return rows.get(day);
  }

  const firstByDayAndHand = new Map();
  for (const record of history) {
    const start = row(localDay(new Date(learningDateTime(record.activityAt) ? record.activityAt : record.date)));
    const kind = ['practice', 'review'].includes(record.kind) ? record.kind : 'unknown';
    start.counts[kind]++;
    start.hints += Number(record.hints) || 0;
    if (validFirstAnswers(record.answerEvents)) {
      for (const event of record.answerEvents) {
        const day = localDay(new Date(event.at));
        const key = JSON.stringify([day, record.variationId ?? record.openingId, record.lineId, record.color, event.ply]);
        const previous = firstByDayAndHand.get(key);
        if (!previous || Date.parse(event.at) < Date.parse(previous.event.at)) firstByDayAndHand.set(key, { day, event });
      }
    } else if (learningCount(record.trained) && learningCount(record.firstCorrect) && record.firstCorrect <= record.trained) {
      start.moves += record.trained;
      start.first += record.firstCorrect;
    }
  }

  for (const { day, event } of firstByDayAndHand.values()) {
    const current = row(day);
    current.moves++;
    current.first += Number(event.correct);
  }

  for (const [day, plan] of Object.entries(plans)) {
    if (!plan.correct.length && !plan.questionAttempts?.length && !plan.explanations?.length
      && !plan.newDone && !plan.reviewed.length && plan.reviewRemaining === null) continue;
    const current = row(day);
    current.questions = plan.correct.length;
    current.counts.questions = new Set([...plan.correct, ...(plan.questionAttempts ?? [])]).size;
    current.counts.study = plan.explanations?.length ?? 0;
    current.due = plan.reviewRemaining;
    // Older plans record a completed goal, but do not always identify the activity behind it.
    current.planActivity = plan.newDone || plan.reviewed.length > 0;
  }
  return [...rows.values()].sort((a, b) => a.day.localeCompare(b.day));
}

function activityVolume(row) {
  return row ? Object.values(row.counts).reduce((total, count) => total + count, 0) : 0;
}

function activeLearningDay(row) {
  return Boolean(row && (activityVolume(row) || row.moves || row.planActivity));
}

function firstAnswerRate(rows) {
  const answers = rows.reduce((total, row) => total + row.moves, 0);
  return answers ? Math.round(rows.reduce((total, row) => total + row.first, 0) / answers * 100) : null;
}

function weekStart(day) {
  const weekday = new Date(day + 'T12:00:00').getDay();
  return offsetDay(day, -((weekday + 6) % 7));
}

function learningPeriod(rows, today, period, include = activeLearningDay) {
  const dated = rows.filter(row => row.day <= today && include(row));
  const start = period ? offsetDay(today, 1 - period) : dated[0]?.day ?? today;
  return { start, end: today, rows: dated.filter(row => row.day >= start) };
}

function openingMastery(items, total, today) {
  const learned = items.filter(item => item.level >= 0);
  const due = items.filter(item => item.due <= today && item.reviewedDay !== today);
  const observed = learned.filter(item => ['clean', 'retry', 'hint'].includes(item.outcome));
  const stages = learned.reduce((sum, item) => sum + (item.level + 1) / reviewIntervals.length, 0);
  const clean = observed.filter(item => item.outcome === 'clean').length;
  // Before Ver.2.5, a hinted result did not distinguish first answers from retries.
  const hintedFirst = observed.filter(item => item.outcome === 'hint' && item.firstTryCorrect === true).length;
  const known = observed.filter(item => item.outcome !== 'hint' || typeof item.firstTryCorrect === 'boolean').length;
  const quality = known ? (clean + hintedFirst * .35) / known : null;
  const retention = learned.length ? stages / learned.length : 0;
  const overdue = due.filter(item => item.due < today).length;
  const score = learned.length && total ? Math.round(100 * Math.max(0,
    learned.length / total * (quality === null ? retention : .65 * retention + .35 * quality)
      - .2 * overdue / total)) : null;
  return { count: learned.length, total, due, score, status: due.length ? '復習が必要'
    : score === null ? '記録なし' : score >= 60 ? '習得が進んでいる' : '学習を始めた段階' };
}

const reportActivityTypes = [
  ['general', '一般練習'], ['personal', '専用練習'], ['questions', '入門問題'],
  ['study', '定跡の解説'], ['practice', '定跡の暗記'], ['review', '定跡の復習'], ['unknown', '種別の記録なし'],
];

function reportLearningData(tracker, ledger, personal) {
  const history = tracker.history();
  const days = new Map(tracker.activity().map(row => [row.day, {
    ...row, counts: { ...row.counts, general: 0, personal: 0 },
    answers: { opening: { total: row.moves, correct: row.first } }, openings: new Set(), problems: new Set(),
  }]));
  function day(date) {
    if (!days.has(date)) days.set(date, {
      day: date, counts: Object.fromEntries(reportActivityTypes.map(([key]) => [key, 0])),
      answers: { opening: { total: 0, correct: 0 } }, openings: new Set(), problems: new Set(),
    });
    return days.get(date);
  }

  const all = [
    ...Object.entries(ledger).map(([id, history]) => ({ id, kind: 'general', history, first: history.first })),
    ...personal.filter(row => row.history).map(({ question, history }) =>
      ({ id: question.id, kind: 'personal', history, first: history.firstAnswer })),
  ];
  const problemDays = (entry) => new Set([
    ...entry.history.events.map(event => event.day), entry.first?.day,
  ].filter(learningDate));

  for (const entry of all) {
    for (const date of problemDays(entry)) {
      const row = day(date);
      row.counts[entry.kind]++;
      row.problems.add(entry.kind + '/' + entry.id);
    }
    if (!learningDate(entry.first?.day)) continue;
    const rate = day(entry.first.day).answers[entry.kind] ??= { total: 0, correct: 0 };
    rate.total++;
    if (entry.first.correct && (entry.kind === 'personal' || !entry.first.hints)) rate.correct++;
  }

  const touched = new Map();
  function opening(date, id, kind) {
    if (!learningDate(date) || !id) return;
    const row = day(date);
    row.openings.add(id);
    row.planActivity = true;
    if (!touched.has(id)) touched.set(id, []);
    touched.get(id).push({ day: date, kind });
  }
  for (const entry of history) {
    const dates = new Set([entry.activityAt ?? entry.date, ...(validFirstAnswers(entry.answerEvents) ? entry.answerEvents : []).map(event => event.at)]);
    for (const at of dates) if (learningDateTime(at)) opening(localDay(new Date(at)), entry.variationId ?? entry.openingId, 'practice');
  }
  for (const [date, plan] of Object.entries(tracker.data.days)) {
    for (const id of plan.explanations ?? []) opening(date, id, 'study');
  }
  for (const entry of Object.values(tracker.data.items)) {
    if (learningDateTime(entry.lastAt)) opening(localDay(new Date(entry.lastAt)), entry.variationId ?? entry.openingId, 'practice');
  }
  return { rows: [...days.values()].sort((a,b) => a.day.localeCompare(b.day)), all, touched, problemDays };
}

function reportRate(rows, kind) {
  const result = { correct: 0, total: 0 };
  for (const row of rows) {
    const counts = row.answers[kind];
    if (counts) {
      result.total += counts.total;
      result.correct += counts.correct;
    }
  }
  return { ...result, percent: result.total ? Math.round(result.correct * 100 / result.total) : null };
}

function reportSummary(rows) {
  return {
    days: rows.length,
    problems: new Set(rows.flatMap(row => [...row.problems])).size,
    openings: new Set(rows.flatMap(row => [...row.openings])).size,
    accuracy: reportRate(rows, 'general'),
  };
}

function reportThemeStats(entries, start, end, tagsById, today) {
  const themes = new Map();
  for (const entry of entries) {
    const events = entry.history.events.filter(event => event.day >= start && event.day <= end);
    const first = entry.first?.day >= start && entry.first.day <= end ? entry.first : null;
    if (!events.length && !first) continue;
    for (const tag of new Set(tagsById.get(entry.id) ?? [])) {
      if (!themes.has(tag)) themes.set(tag, { tag, count: 0, total: 0, correct: 0, hinted: 0, due: 0 });
      const row = themes.get(tag);
      row.count++;
      if (first) {
        row.total++;
        row.correct += Number(first.correct && !first.hints);
        row.hinted += Number(Boolean(first.hints));
      }
      row.due += Number(entry.history.due <= today && entry.history.reviewedDay !== today);
    }
  }
  return [...themes.values()];
}

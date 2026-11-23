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

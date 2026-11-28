const progressReport = (() => {
  const period = byId('progress-period');
  const accuracy = byId('progress-accuracy-kind');
  const dateFormat = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' });
  const dateLabel = day => dateFormat.format(new Date(day + 'T12:00:00'));
  const note = text => element('p', text, 'report-note');
  const link = (label, path) => diagnosisLink(label, path);
  const areas = { general: '一般練習', personal: '自分専用の練習問題', opening: '定跡の暗記・復習' };
  let state;
  let revision = 0;

  const rateText = (rate, unit) => rate.percent === null ? '初回回答の記録なし'
    : rate.percent + '%（' + rate.correct + ' / ' + rate.total + unit + '）';
  const countsText = row => reportActivityTypes.filter(([key]) => row?.counts[key])
    .map(([key, label]) => label + ' ' + row.counts[key] + (['general', 'personal', 'questions'].includes(key) ? '問' : '件')).join('、');

  function kpis(values) {
    const list = element('dl', null, 'report-kpis');
    for (const [name, value, detail] of values) {
      const pair = element('div');
      pair.append(element('dt', name), element('dd', value));
      if (detail) pair.append(element('small', detail));
      list.append(pair);
    }
    return list;
  }

  function change(now, previous, unit) {
    const difference = now - previous;
    return difference === 0 ? '前の期間と同じ' : '前の期間より' + Math.abs(difference) + unit + (difference > 0 ? '増加' : '減少');
  }

  function summary(rows, previous) {
    const stats = reportSummary(rows);
    const before = reportSummary(previous);
    const { accuracy: rate } = stats;
    const summary = byId('progress-summary');
    summary.replaceChildren(kpis([
      ['学習日数', stats.days + '日', previous.length && change(stats.days, before.days, '日')],
      ['取り組んだ一般・専用問題', stats.problems + '問', previous.length && change(stats.problems, before.problems, '問')],
      ['一般問題の初回ヒントなし正解率', rate.percent === null ? '記録なし' : rate.percent + '%',
        rate.total ? rate.correct + ' / ' + rate.total + '問' + (rate.total >= 5 && before.accuracy.total >= 5
          ? ' · ' + change(rate.percent, before.accuracy.percent, 'ポイント') : '') : ''],
      ['学習したオープニング・変化', stats.openings + '件', previous.length && change(stats.openings, before.openings, '件')],
    ]));
    if (!rows.length) {
      summary.append(note('この期間には学習記録がありません。'), link('練習問題集から始める', 'general'));
      return;
    }
    summary.append(note('問題数と教材数は期間内の重複を除きます。正解率の比較は出題内容や難易度によって変わります。'));
    const goal = personalPreference(learningGoalKey, null);
    if (validLearningGoal(goal) && goal.days) {
      const start = weekStart(state.today);
      const active = state.data.rows.filter(row => row.day >= start && row.day <= state.today && activeLearningDay(row)).length;
      summary.append(note('今週の目標（表示期間にかかわらず） ' + active + ' / ' + goal.days + '日'));
    }
  }

  function calendar(rows, start, end) {
    const target = byId('progress-calendar');
    const dates = new Map(rows.map(row => [row.day, row]));
    const detail = element('p', null, 'report-readout');
    detail.setAttribute('role', 'status');
    const grid = element('div', null, 'learning-calendar');
    const months = element('input');
    months.type = 'month';
    months.min = start.slice(0, 7);
    months.max = end.slice(0, 7);
    months.value = end.slice(0, 7);
    const picker = element('label', '表示する年月 ', 'report-date-picker');
    picker.append(months);
    const heading = element('h3');
    const arrows = element('div', null, 'calendar-controls');
    const earlier = element('button', '前月', 'button secondary');
    const later = element('button', '翌月', 'button secondary');
    earlier.type = later.type = 'button';
    function moveMonth(step) {
      const [year, month] = months.value.split('-').map(Number);
      const date = new Date(year, month - 1 + step, 1, 12);
      months.value = localDay(date).slice(0, 7);
      draw();
    }
    earlier.addEventListener('click', () => moveMonth(-1));
    later.addEventListener('click', () => moveMonth(1));
    arrows.append(earlier, heading, later);
    let selected;
    function draw() {
      if (!/^\d{4}-\d{2}$/.test(months.value) || months.value < months.min || months.value > months.max) return;
      const first = months.value + '-01';
      const [year, month] = months.value.split('-').map(Number);
      heading.textContent = year + '年' + month + '月';
      earlier.disabled = months.value === months.min;
      later.disabled = months.value === months.max;
      detail.textContent = '';
      const length = new Date(year, month, 0).getDate();
      grid.replaceChildren(...[...'月火水木金土日'].map(label => element('span', label, 'calendar-weekday')));
      const leading = (new Date(first + 'T12:00:00').getDay() + 6) % 7;
      for (let index = 0; index < leading; index++) grid.append(element('span'));
      selected = null;
      const today = state.today;
      for (let index = 0; index < length; index++) {
        const day = offsetDay(first, index);
        const row = dates.get(day);
        const cell = element('button', String(index + 1), 'calendar-day');
        cell.type = 'button';
        cell.disabled = day < start || day > end;
        const count = activityVolume(row);
        cell.dataset.intensity = String(Math.min(4, count || Number(activeLearningDay(row))));
        const description = day > today ? '未来の日付' : day < start ? '表示期間外' : countsText(row) || (row ? '学習の記録あり' : '学習記録なし');
        cell.title = description;
        cell.setAttribute('aria-label', dateLabel(day) + '、' + description);
        cell.setAttribute('aria-pressed', 'false');
        if (day > today) cell.dataset.future = '';
        if (day === today) cell.setAttribute('aria-current', 'date');
        function show() {
          selected?.setAttribute('aria-pressed', 'false');
          cell.setAttribute('aria-pressed', 'true');
          selected = cell;
          const rates = row ? Object.entries(areas).filter(([kind]) => row.answers[kind]?.total).map(([kind, title]) =>
            title + 'の初回' + (kind === 'general' ? 'ヒントなし' : '') + '正解率 ' + rateText(reportRate([row], kind), kind === 'opening' ? '手' : '問')) : [];
          detail.textContent = [dateLabel(day) + '　' + description, ...rates].join('。');
        }
        cell.addEventListener('click', show);
        if (day === today || (day <= end && day >= start && !selected)) show();
        grid.append(cell);
      }
    }
    months.addEventListener('change', draw);
    target.replaceChildren(picker, arrows, grid, note('各日の色は記録した件数：薄い順に0、1、2、3、4件以上。金色の枠が今日です。斜線は未来の日付です。'), detail);
    draw();
  }

  function chartRows(rows, start, end) {
    const span = Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
    const width = span <= 35 ? 1 : span <= 365 ? 7 : 30 * Math.ceil(span / 1800);
    const groups = new Map();
    for (const row of rows) {
      const index = Math.floor(Math.round((Date.parse(row.day) - Date.parse(start)) / 86400000) / width);
      if (!groups.has(index)) groups.set(index, []);
      groups.get(index).push(row);
    }
    return { width, slots: Math.ceil(span / width), groups: [...groups].map(([index, group]) => {
      const head = offsetDay(start, index * width);
      const tail = offsetDay(head, Math.min(width, span - index * width) - 1);
      return { index, label: head === tail ? head : head + ' ～ ' + tail, group };
    }) };
  }

  function chart(target, rows, start, end, kind) {
    const { width, groups, slots } = chartRows(rows, start, end);
    const items = groups.map(({ index, label, group }) => {
      const counts = Object.fromEntries(reportActivityTypes.map(([key]) => [key,
        group.reduce((sum, row) => sum + row.counts[key], 0)]));
      const rate = kind ? reportRate(group, kind) : null;
      return { index, label, counts, rate, total: activityVolume({ counts }) };
    }).filter(item => kind ? item.rate.total : item.total);
    if (!items.length) {
      target.replaceChildren(note(kind ? 'この期間には集計に使える初回回答がありません。'
        : 'この期間には件数の分かる学習記録がありません。'));
      return;
    }
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 600 160');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('report-chart');
    function mark(tag, attrs, label) {
      const node = document.createElementNS(svg.namespaceURI, tag);
      for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
      if (label) node.textContent = label;
      svg.append(node);
    }
    const max = kind ? 100 : items.reduce((value, item) => Math.max(value, item.total), 1);
    const y = value => 132 - value * 116 / max;
    for (const tick of new Set([0, Math.round(max / 2), max])) {
      mark('line', { x1: 47, x2: 588, y1: y(tick), y2: y(tick), class: 'chart-rule' });
      mark('text', { x: 44, y: y(tick) + 4, 'text-anchor': 'end' }, String(tick) + (kind ? '%' : ''));
    }
    const slot = 540 / slots;
    const barWidth = Math.min(34, slot * .73);
    for (const item of items) {
      const x = 47 + slot * (item.index + .5);
      if (kind) mark('circle', { cx: x, cy: y(item.rate.percent), r: 4, class: 'chart-point' });
      else {
        let base = 0;
        for (const [key] of reportActivityTypes) {
          const count = item.counts[key];
          if (!count) continue;
          mark('rect', { x: x - barWidth / 2, y: y(base + count), width: barWidth, height: y(base) - y(base + count), class: 'chart-' + key });
          base += count;
        }
      }
    }
    mark('text', { x: 47, y: 153 }, start.slice(5));
    mark('text', { x: 587, y: 153, 'text-anchor': 'end' }, end.slice(5));
    const select = element('select');
    const picker = element('label', '記録の内訳 ', 'report-date-picker');
    picker.append(select);
    const readout = element('p', null, 'report-readout');
    readout.setAttribute('role', 'status');
    const recent = items.slice().reverse();
    for (const [index, item] of recent.entries()) {
      const option = element('option', item.label);
      option.value = index;
      select.append(option);
    }
    function show() {
      const item = recent[Number(select.value)];
      readout.textContent = item.label + '　' + (kind ? rateText(item.rate, kind === 'opening' ? '手' : '問')
        : item.total + '件（' + countsText(item) + '）');
    }
    const legend = element('ul', null, 'report-legend');
    if (!kind) for (const [key, label] of reportActivityTypes.filter(([key]) => items.some(item => item.counts[key]))) {
      const entry = element('li');
      const swatch = element('span', null, 'chart-' + key);
      swatch.setAttribute('aria-hidden', 'true');
      entry.append(swatch, label);
      legend.append(entry);
    }
    select.addEventListener('change', show);
    show();
    target.replaceChildren(note((width === 1 ? '日別' : width + '日ごと') + ' · ' + (kind
      ? areas[kind] + 'の初回回答。分母の単位は' + (kind === 'opening' ? '手' : '問') + 'です。回答のない期間には点が付きません。'
      : '練習問題は同じ日に同じ問題を1問、定跡の暗記・復習は練習した回数を1件として集計します。履歴が残っている範囲で表示します。')),
    svg, legend, picker, readout);
  }

  function personalSection(rows, today) {
    const target = byId('progress-personal');
    if (!rows) { target.replaceChildren(note('専用練習の記録を読み込めませんでした。')); return; }
    const seen = rows.filter(row => row.history).length;
    const mastered = rows.filter(row => (row.history?.level ?? -1) >= reviewIntervals.length - 1).length;
    const due = personalDue(rows, today).filter(row => row.history).length;
    target.replaceChildren(note('現在の累計・復習予定です。表示期間を切り替えても変わりません。'),
      kpis([['作成済み', rows.length + '問'], ['取り組んだ問題', seen + '問'], ['未学習', (rows.length - seen) + '問'],
        ['復習予定', due + '問'], ['習得済み', mastered + '問'], ['習得率（作成済みのうち）', rows.length ? Math.round(mastered * 100 / rows.length) + '%' : '記録なし']]),
      link('自分専用の練習問題を開く', 'personal'));
  }

  async function loadTags(entries, personal) {
    const tags = new Map(personal.map(({ question }) => [question.id, question.tags]));
    const ids = new Set(entries.filter(entry => entry.kind === 'general').map(entry => entry.id));
    if (!ids.size) return tags;
    const catalog = await generalCatalog();
    for (const [name, batch] of Object.entries(catalog.batches)) {
      if (!batch.ids.some(id => ids.has(id))) continue;
      const puzzles = await generalBatch(name, catalog);
      for (const row of puzzles) if (ids.has(row[0])) tags.set(row[0], row[4]);
    }
    return tags;
  }

  function themes(entries, start, end, before, tags) {
    const target = byId('progress-themes');
    if (!tags) { target.replaceChildren(note('テーマを読み込めませんでした。接続を確認してから、もう一度開いてください。')); return; }
    const current = reportThemeStats(entries, start, end, tags, state.today);
    if (!current.length) { target.replaceChildren(note('この期間にはテーマ別に集計できる問題がありません。'), link('テーマ別の問題を選ぶ', 'general/themes')); return; }
    const prior = new Map(reportThemeStats(entries, before.start, before.end, tags, state.today).map(row => [row.tag, row]));
    const ratio = row => row.correct / row.total;
    const observed = current.filter(row => row.total >= 5).sort((a, b) => ratio(b) - ratio(a) || b.total - a.total);
    const strong = observed.find(row => ratio(row) >= .8);
    const focus = observed.slice().reverse().find(row => ratio(row) <= .6);
    const featured = [strong, focus].filter(Boolean);
    const label = tag => practiceThemes[tag]?.[0] ?? personalTags[tag] ?? tag;
    function rowView(row, title) {
      const item = element('li');
      const value = row.total ? Math.round(ratio(row) * 100) : null;
      const old = prior.get(row.tag);
      item.append(element('strong', (title ? title + '　' : '') + label(row.tag)),
        element('p', row.count + '問 ／ 初回ヒントなし正解 ' + (value === null ? '記録なし' : value + '%（' + row.correct + ' / ' + row.total + '問）')),
        note('初回ヒント使用 ' + (row.total ? row.hinted + ' / ' + row.total + '問' : '記録なし') + ' ／ 現在の復習予定 ' + row.due + '問'));
      if (row.total >= 5 && old?.total >= 5) item.append(note(change(value, Math.round(ratio(old) * 100), 'ポイント')));
      if (row.total > 0 && row.total < 5) item.append(note('傾向を出すには初回回答があと' + (5 - row.total) + '問必要です。'));
      item.append(link('関連する練習を開く', practiceThemes[row.tag] ? 'general/theme/' + row.tag : 'personal'));
      return item;
    }
    const highlights = element('ul', null, 'growth-rows');
    if (strong) highlights.append(rowView(strong, '初回で解けた問題が多い'));
    if (focus) highlights.append(rowView(focus, '優先して復習したい'));
    const more = element('details');
    const others = element('ul', null, 'growth-rows');
    for (const item of current.sort((a, b) => b.count - a.count)) if (!featured.includes(item)) others.append(rowView(item));
    more.append(element('summary', 'ほかのテーマを見る（' + others.childElementCount + '件）'), others);
    target.replaceChildren(note('複数のテーマを持つ問題は、各テーマに1問ずつ含めます。傾向の表示には各テーマで初回回答が5問以上必要です。'),
      featured.length ? highlights : note('得意・苦手として取り上げるテーマはまだありません。'));
    if (others.childElementCount) target.append(more);
  }

  function mastery(tracker, today, start, touched) {
    const history = tracker.history();
    const byOpening = new Map();
    const due = new Set(tracker.due(today).map(item => item.id));
    const previous = new Map();
    for (const item of Object.values(tracker.data.items)) {
      const id = item.variationId ?? item.openingId;
      if (!previous.has(id)) previous.set(id, []);
      if (tracker.item(item.id)) previous.get(id).push(item);
    }
    for (const opening of [...studyOpenings, ...openingVariations]) {
      const items = previous.get(opening.id) ?? [];
      const activity = (touched.get(opening.id) ?? []).filter(row => row.day >= start && row.day <= today);
      if (!activity.length) continue;
      const last = activity.map(row => row.day).sort().at(-1);
      const practiced = activity.some(row => row.kind === 'practice');
      const retainedAnswers = history.filter(row => (row.variationId ?? row.openingId) === opening.id)
        .flatMap(row => validFirstAnswers(row.answerEvents) ? row.answerEvents.map(event => ({ ...event, key: [row.lineId, row.color, event.ply].join('/') })) : []);
      const initial = new Map();
      for (const event of retainedAnswers.sort((a, b) => a.at.localeCompare(b.at))) {
        const day = localDay(new Date(event.at));
        const key = day + '/' + event.key;
        if (day >= start && day <= today && !initial.has(key)) initial.set(key, event);
      }
      const rate = { correct: [...initial.values()].filter(event => event.correct).length, total: initial.size };
      rate.percent = rate.total ? Math.round(rate.correct * 100 / rate.total) : null;
      const stats = openingMastery(items, opening.moves.length, today);
      byOpening.set(opening.id, { opening, ...stats, last, practiced, rate });
    }
    const list = element('div', null, 'mastery-list');
    const remaining = element('div', null, 'mastery-list');
    const selected = [...byOpening.values()].sort((a, b) => b.last.localeCompare(a.last));
    for (const [index, { opening, count, total, score, status, due: needed, last, practiced, rate }] of selected.entries()) {
      const article = element('article', null, 'mastery-card');
      const bar = element('progress');
      bar.max = total;
      bar.value = count;
      bar.setAttribute('aria-label', opening.name + 'の練習済み手順 ' + count + ' / ' + total + '手');
      const actions = element('div', null, 'study-mode-links');
      actions.append(link('暗記する', 'practice/' + opening.id + '/' + openingDefaultColor(opening)));
      const next = needed.find(item => due.has(item.id));
      if (next) actions.append(link('復習する', reviewLink(next.id).slice(1)));
      article.append(element('h3', opening.name), element('p', status + (score === null ? '' : '・' + score + '%'), 'mastery-status'),
        bar, element('p', practiced ? '期間内に盤上で練習' : '期間内は解説を学習'),
        element('p', '現在の練習 ' + count + ' / ' + total + '手 ／ 復習予定 ' + needed.length + '手'),
        note('期間内の最終学習日 ' + last + ' ／ ' + (rate.total ? '初回正解率 ' + rateText(rate, '手') : '初回回答の記録なし')), actions);
      (index < 3 ? list : remaining).append(article);
    }
    if (!list.childElementCount) list.append(element('p', 'この期間の定跡学習には、日付付きの記録がありません。'));
    if (remaining.childElementCount) {
      const more = element('details');
      more.append(element('summary', 'ほかのオープニングを見る（' + remaining.childElementCount + '件）'), remaining);
      list.append(more);
    }
    byId('progress-mastery').replaceChildren(note('表示期間内に学んだ教材を掲載します。練習済みの手数・習熟度・復習予定は現在の状態です。'), list, link('オープニング教材を開く', 'openings'));

    const wrongDays = new Map();
    for (const record of history) {
      const id = record.variationId ?? record.openingId;
      const opening = byOpening.get(id)?.opening;
      if (!opening || record.lineId !== id + ':main-v1') continue;
      const mistakes = validFirstAnswers(record.answerEvents) ? record.answerEvents.filter(event => !event.correct)
        : (Array.isArray(record.errors) ? record.errors : []).filter(error => learningCount(error?.ply))
          .map(error => ({ ply: error.ply, at: record.date }));
      for (const mistake of mistakes) {
        const date = localDay(new Date(mistake.at));
        if (date < start || date > today) continue;
        const key = id + '/' + mistake.ply;
        if (!wrongDays.has(key)) wrongDays.set(key, new Set());
        wrongDays.get(key).add(localDay(new Date(mistake.at)));
      }
    }
    const suggestions = [];
    for (const [id, { opening }] of byOpening) {
      for (const item of previous.get(id) ?? []) {
        const overdue = due.has(item.id) && item.due < today;
        const days = wrongDays.get(id + '/' + item.ply)?.size ?? 0;
        if (overdue || days >= 2) suggestions.push({ item, opening, overdue, days });
      }
    }
    suggestions.sort((a, b) => Number(b.overdue) - Number(a.overdue) || b.days - a.days || a.item.due.localeCompare(b.item.due));
    const advice = byId('progress-weakness');
    advice.replaceChildren();
    for (const { item, opening, overdue, days } of suggestions.slice(0, 2)) {
      const entry = element('div', null, 'review-suggestion');
      const reason = overdue ? '復習期限 ' + item.due : '別々の' + days + '日で初回に誤答';
      entry.append(element('p', opening.name + '・' + chessColorNames[item.color] + '番 ' +
        (Math.floor(item.ply / 2) + 1) + '手目　' + reason), link('この手を練習する', due.has(item.id) ? reviewLink(item.id).slice(1) : 'retry-item/' + encodeURIComponent(item.id)));
      advice.append(entry);
    }
  }

  function render() {
    const { tracker, data, personal, today } = state;
    const days = Number(period.value);
    const range = learningPeriod(data.rows, today, days);
    const previous = { start: days ? offsetDay(range.start, -days) : '', end: days ? offsetDay(range.start, -1) : '' };
    const old = days ? data.rows.filter(row => row.day >= previous.start && row.day <= previous.end && activeLearningDay(row)) : [];
    byId('progress-range').textContent = range.start + ' ～ ' + range.end;
    summary(range.rows, old);
    calendar(range.rows, range.start, range.end);
    chart(byId('progress-volume'), range.rows, range.start, range.end);
    chart(byId('progress-accuracy'), range.rows, range.start, range.end, accuracy.value);
    if (state.tags === undefined) byId('progress-themes').textContent = 'テーマを読み込んでいます。';
    else themes(data.all, range.start, range.end, previous, state.tags);
    personalSection(personal, today);
    mastery(tracker, today, range.start, data.touched);
    const due = personalDue(personal ?? [], today).filter(row => row.history).length;
    const next = byId('progress-next');
    next.replaceChildren(due ? link('復習予定の専用問題 ' + due + '問を開く', 'personal') : link('今日の10問を開く', 'daily'));
    if (!range.rows.length) next.append(note('問題に取り組むと、学習記録がここに反映されます。'));
  }

  period.addEventListener('change', () => { if (state) render(); });
  accuracy.addEventListener('change', () => {
    if (!state) return;
    const range = learningPeriod(state.data.rows, state.today, Number(period.value));
    chart(byId('progress-accuracy'), range.rows, range.start, range.end, accuracy.value);
  });
  return async (tracker, today = localDay()) => {
    const request = ++revision;
    const ledger = generalHistory();
    state = { tracker, today, personal: null, data: reportLearningData(tracker, ledger, []) };
    render();
    let personal;
    try { personal = await createPersonalStore().all(); }
    catch { personal = null; }
    if (revision !== request) return;
    Object.assign(state, { personal, data: reportLearningData(tracker, ledger, personal ?? []) });
    render();
    try {
      const tags = await loadTags(state.data.all, personal ?? []);
      if (revision !== request) return;
      state.tags = tags;
    } catch {
      if (revision !== request) return;
      state.tags = null;
    }
    const range = learningPeriod(state.data.rows, state.today, Number(period.value));
    const length = Number(period.value);
    themes(state.data.all, range.start, range.end, { start: length ? offsetDay(range.start, -length) : '',
      end: length ? offsetDay(range.start, -1) : '' }, state.tags);
  };
})();

const progressReport = (() => {
  const node = (tag, value, css) => element(tag, value, css);
  const button = label => {
    const item = node('button', label, 'button secondary');
    item.type = 'button';
    return item;
  };
  const link = (label, href) => {
    const item = node('a', label, 'button secondary');
    item.href = href;
    return item;
  };
  const weekdayNames = [...'月火水木金土日'];
  const dateFormat = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' });
  const dateLabel = day => dateFormat.format(new Date(day + 'T12:00:00'));
  const rateLabel = row => firstAnswerRate([row]) === null ? '回答記録なし'
    : firstAnswerRate([row]) + '%（' + row.first + ' / ' + row.moves + '手）';
  const countsLabel = row => learningActivityTypes.filter(([key]) => row?.counts[key])
    .map(([key, label]) => label + ' ' + row.counts[key] + '件').join('、');
  const dayDescription = row => !activeLearningDay(row) ? '学習記録なし'
    : [countsLabel(row) || '学習の記録あり', row.moves ? '初回正解率 ' + rateLabel(row) : ''].filter(Boolean).join('。');
  const dayIndex = day => Date.parse(day + 'T00:00:00Z') / 86400000;

  function summary(tracker, rows, today) {
    const active = rows.filter(activeLearningDay);
    const rate = firstAnswerRate(rows);
    const list = node('dl', null, 'report-kpis');
    for (const [label, value] of [
      ['累計学習日数', active.length ? active.length + '日' : '記録なし'],
      ['今週の学習日数', active.filter(row => row.day >= weekStart(today)).length + '日'],
      ['学習したオープニング', tracker.learned().size + '件'],
      ['暗記・復習の初回正解率', rate === null ? '記録なし' : rate + '%'],
    ]) {
      const card = node('div', null, 'opening-card');
      card.append(node('dt', label), node('dd', value));
      list.append(card);
    }
    byId('progress-summary').replaceChildren(list);
  }

  function calendar(rows, today) {
    const grid = node('div', null, 'learning-calendar');
    const start = offsetDay(weekStart(today), -49);
    const byDay = new Map(rows.map(row => [row.day, row]));
    const detail = node('p', null, 'report-readout');
    detail.setAttribute('role', 'status');
    let selected;
    function show(day) {
      detail.textContent = dateLabel(day) + '　' + dayDescription(byDay.get(day));
    }
    grid.append(...weekdayNames.map(label => node('span', label, 'calendar-weekday')));
    for (let index = 0; index < 56; index++) {
      const day = offsetDay(start, index);
      if (day > today) break;
      const row = byDay.get(day);
      const cell = button(String(Number(day.slice(-2))));
      cell.className = 'calendar-day';
      cell.dataset.intensity = String(Math.min(4, activityVolume(row) || Number(activeLearningDay(row))));
      cell.setAttribute('aria-label', dateLabel(day) + '、' + dayDescription(row));
      cell.setAttribute('aria-pressed', String(day === today));
      if (day === today) {
        cell.setAttribute('aria-current', 'date');
        selected = cell;
      }
      cell.addEventListener('click', () => {
        selected.setAttribute('aria-pressed', 'false');
        cell.setAttribute('aria-pressed', 'true');
        selected = cell;
        show(day);
      });
      grid.append(cell);
    }
    show(today);
    byId('progress-calendar').replaceChildren(node('p', '今週と過去7週間の記録です。日付を選ぶと、その日の学習を確認できます。'),
      grid, node('p', '色が濃いほど学習量が多く、金色の枠は今日です。', 'report-note'), detail);
  }

  const hasAnswers = row => row.moves > 0;
  const hasVolume = row => activityVolume(row) > 0;
  function svgNode(tag, attributes, label) {
    const item = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attributes)) item.setAttribute(key, value);
    if (label) item.textContent = label;
    return item;
  }

  const chartObservers = new WeakMap();
  function chart(container, rows, today, accuracy) {
    chartObservers.get(container)?.disconnect();
    const include = accuracy ? hasAnswers : hasVolume;
    const description = accuracy
      ? '同じ日の同じ手は、最初の回答を集計します。回答の記録がない日は点が表示されません。'
      : '暗記・復習は練習した回数、問題演習・解説はその日に取り組んだ件数です。';
    const periods = node('div', null, 'report-periods');
    periods.setAttribute('role', 'group');
    periods.setAttribute('aria-label', '表示期間');
    const readout = node('p', null, 'report-readout');
    readout.setAttribute('role', 'status');
    const body = node('div', null, 'report-chart-body');
    const choices = new Map();
    const svg = svgNode('svg', { class: 'report-chart', 'aria-hidden': 'true' });
    const datePicker = node('select');
    const picker = node('label', '日付の記録を確認 ', 'report-date-picker');
    picker.append(datePicker);
    const legend = node('ul', null, 'report-legend');
    let period = 7;
    let range;
    let chosen;
    let xAxis;
    let width = 0;
    function show(row) {
      if (chosen === row && readout.textContent) return;
      chosen = row;
      datePicker.value = row?.day ?? '';
      readout.textContent = row ? row.day + '　' + (accuracy ? rateLabel(row) : countsLabel(row))
        : (accuracy ? 'この期間に初回回答の記録はありません。' : 'この期間に件数のわかる学習記録はありません。');
    }
    datePicker.addEventListener('change', () => show(range.rows.find(row => row.day === datePicker.value)));
    function draw() {
      if (!range.rows.length) return;
      width = Math.max(225, Math.round(body.clientWidth || 300));
      const height = 182;
      const left = 42;
      const right = width - 16;
      const top = 12;
      const bottom = 152;
      const maximum = accuracy ? 100 : Math.max(...range.rows.map(activityVolume));
      const span = Math.max(1, dayIndex(range.end) - dayIndex(range.start) + 1);
      const slot = (right - left) / span;
      const x = day => left + slot * (dayIndex(day) - dayIndex(range.start) + .5);
      const y = value => bottom - value / maximum * (bottom - top);
      xAxis = x;
      svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
      svg.replaceChildren();
      for (const tick of [...new Set([0, Math.round(maximum / 2), maximum])]) {
        svg.append(svgNode('line', { x1: left, x2: right, y1: y(tick), y2: y(tick), class: 'chart-rule' }),
          svgNode('text', { x: left - 7, y: y(tick) + 4, 'text-anchor': 'end' }, tick + (accuracy ? '%' : '')));
      }
      const tickCount = Math.min(span, width > 480 ? 5 : 3);
      for (let index = 0; index < tickCount; index++) {
        const day = offsetDay(range.start, tickCount === 1 ? 0 : Math.round(index * (span - 1) / (tickCount - 1)));
        const label = day.slice(5).split('-').map(Number).join('/');
        const position = Math.max(left, Math.min(right - 6, x(day)));
        svg.append(svgNode('text', { x: position, y: 176, 'text-anchor': 'middle' }, label));
      }
      if (accuracy) {
        let previous;
        const plot = [];
        for (const row of range.rows) {
          const px = x(row.day);
          const py = y(firstAnswerRate([row]));
          if (previous && dayIndex(row.day) - dayIndex(previous.day) === 1) {
            svg.append(svgNode('line', { x1: previous.x, y1: previous.y, x2: px, y2: py, class: 'chart-trend' }));
          }
          plot.push(svgNode('circle', { cx: px, cy: py, r: 3.7, class: 'chart-point' }));
          previous = { day: row.day, x: px, y: py };
        }
        svg.append(...plot);
      } else {
        const barWidth = Math.max(3, Math.min(38, slot * .68));
        for (const row of range.rows) {
          let accumulated = 0;
          for (const [key] of learningActivityTypes) {
            const count = row.counts[key];
            if (!count) continue;
            const old = accumulated;
            accumulated += count;
            svg.append(svgNode('rect', { x: x(row.day) - barWidth / 2, y: y(accumulated), width: barWidth,
              height: y(old) - y(accumulated), class: 'chart-' + key }));
          }
        }
      }
    }
    function point(event) {
      const bounds = svg.getBoundingClientRect();
      const cursor = (event.clientX - bounds.left) / bounds.width * width;
      const closest = range.rows.reduce((best, row) => Math.abs(xAxis(row.day) - cursor)
        < Math.abs(xAxis(best.day) - cursor) ? row : best);
      show(closest);
    }
    svg.addEventListener('pointermove', event => { if (event.pointerType === 'mouse') point(event); });
    svg.addEventListener('click', point);
    function render() {
      range = learningPeriod(rows, today, period, include);
      for (const [key, control] of choices) control.setAttribute('aria-pressed', String(period === key));
      datePicker.replaceChildren(...range.rows.slice().reverse().map(row => {
        const option = node('option', row.day);
        option.value = row.day;
        return option;
      }));
      legend.replaceChildren(...learningActivityTypes.filter(([key]) => range.rows.some(row => row.counts[key]))
        .map(([key, label]) => {
          const item = node('li');
          const swatch = node('span', null, 'chart-' + key);
          swatch.setAttribute('aria-hidden', 'true');
          item.append(swatch, label);
          return item;
        }));
      body.hidden = picker.hidden = !range.rows.length;
      legend.hidden = accuracy || !range.rows.length;
      show(range.rows.at(-1));
      draw();
    }
    for (const [key, label] of [[7, '7日間'], [30, '30日間'], ...(accuracy ? [[0, '全期間']] : [])]) {
      const control = button(label);
      control.addEventListener('click', () => { period = key; render(); });
      choices.set(key, control);
      periods.append(control);
    }
    body.append(svg);
    container.replaceChildren(node('p', description), periods, body, legend, picker, readout);
    render();
    const observer = new ResizeObserver(() => {
      if (!body.hidden && body.clientWidth && body.clientWidth !== width) draw();
    });
    chartObservers.set(container, observer);
    observer.observe(container);
  }

  function mastery(tracker, today) {
    const history = tracker.history();
    const newest = new Map();
    for (const record of history) {
      const id = record.variationId ?? record.openingId;
      const latest = validFirstAnswers(record.answerEvents) ? record.answerEvents.at(-1)?.at : null;
      const day = localDay(new Date(latest ?? (learningDateTime(record.activityAt) ? record.activityAt : record.date)));
      if (day > (newest.get(id) ?? '')) newest.set(id, day);
    }
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
      const last = [newest.get(opening.id), ...items.map(item => localDay(new Date(item.lastAt))),
        ...Object.keys(tracker.data.days).filter(day => tracker.data.days[day].explanations?.includes(opening.id))]
        .filter(Boolean).sort().at(-1);
      const stats = openingMastery(items, opening.moves.length, today);
      byOpening.set(opening.id, { opening, ...stats, last });
    }
    const list = node('div', null, 'mastery-list');
    const other = node('div', null, 'mastery-list');
    for (const { opening, count, total, score, status, due: needed, last } of byOpening.values()) {
      const article = node('article', null, 'mastery-card');
      const bar = node('progress');
      bar.max = total;
      bar.value = count;
      bar.setAttribute('aria-label', opening.name + 'の練習済み手順 ' + count + ' / ' + total + '手');
      const actions = node('div', null, 'study-mode-links');
      actions.append(link('暗記する', '#practice/' + opening.id + '/' + openingDefaultColor(opening)));
      const next = needed.find(item => due.has(item.id));
      if (next) actions.append(link('復習する', reviewLink(next.id)));
      article.append(node('h3', opening.name), node('p', status + (score === null ? '' : '・' + score + '%'), 'mastery-status'),
        bar, node('p', count + ' / ' + total + '手を練習済み・復習 ' + needed.length + '手'),
        node('p', '最終学習日 ' + (last ?? '記録なし'), 'report-note'), actions);
      (last || needed.length ? list : other).append(article);
    }
    if (!list.childElementCount) list.append(node('p', '暗記や復習を始めると、練習した手順の記録が表示されます。'));
    if (other.childElementCount) {
      const group = node('details');
      group.append(node('summary', '日付の記録がないオープニング ' + other.childElementCount + '件'), other);
      list.append(group);
    }
    byId('progress-mastery').replaceChildren(list);

    const wrongDays = new Map();
    for (const record of history) {
      const id = record.variationId ?? record.openingId;
      const opening = byOpening.get(id)?.opening;
      if (!opening || record.lineId !== id + ':main-v1') continue;
      const mistakes = validFirstAnswers(record.answerEvents) ? record.answerEvents.filter(event => !event.correct)
        : (Array.isArray(record.errors) ? record.errors : []).filter(error => learningCount(error?.ply))
          .map(error => ({ ply: error.ply, at: record.date }));
      for (const mistake of mistakes) {
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
    if (!suggestions.length) advice.append(node('p', '復習期限を過ぎた手順や、別の日にも間違えた手順が記録されると、ここから復習できます。'));
    else for (const { item, opening, overdue, days } of suggestions.slice(0, 5)) {
      const entry = node('div', null, 'review-suggestion');
      const reason = overdue ? '復習期限 ' + item.due : '別々の' + days + '日で初回に誤答';
      entry.append(node('p', opening.name + '・' + chessColorNames[item.color] + '番 ' +
        (Math.floor(item.ply / 2) + 1) + '手目　' + reason), link('この手を練習する', due.has(item.id) ? reviewLink(item.id) : '#retry-item/' + encodeURIComponent(item.id)));
      advice.append(entry);
    }
  }

  function details(tracker, rows) {
    byId('progress-totals').textContent = '完了した入門レッスン ' + tracker.intro().completed.length
      + '件・期限が来た復習 ' + tracker.due().length + '手';
    const target = byId('progress-activity');
    if (!rows.length) {
      target.replaceChildren(node('p', '日付のある学習記録はありません。'));
      return;
    }
    const table = node('table');
    const head = table.createTHead().insertRow();
    table.createCaption().textContent = '最近の学習記録（最大30日分）';
    for (const title of ['日付', '内容', '初回正解率', 'ヒント', '問題の正解', '復習の残り']) {
      const cell = node('th', title);
      cell.scope = 'col';
      head.append(cell);
    }
    const body = table.createTBody();
    for (const row of rows.slice(-30).reverse()) {
      const line = body.insertRow();
      const date = node('th', row.day);
      date.scope = 'row';
      line.append(date);
      for (const value of [countsLabel(row) || '件数の記録なし', rateLabel(row), row.hints, row.questions, row.due ?? '記録なし']) {
        line.insertCell().textContent = value;
      }
    }
    target.replaceChildren(table);
  }

  return (tracker, today = localDay()) => {
    const rows = tracker.activity().filter(row => row.day <= today);
    summary(tracker, rows, today);
    calendar(rows, today);
    chart(byId('progress-accuracy'), rows, today, true);
    chart(byId('progress-volume'), rows, today, false);
    mastery(tracker, today);
    details(tracker, rows);
  };
})();

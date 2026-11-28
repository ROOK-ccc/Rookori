// Add only entries reviewed by the site operator. Optional games and lesson IDs can accompany each entry.
const approvedStylePlayers = Object.freeze({});
const diagnosisDate = row => row.at ? new Date(row.at).toLocaleDateString('ja-JP', { dateStyle: 'long' }) : '診断日不明';

function diagnosisLink(label, path, style = 'row-action') {
  const link = element('a', label, style);
  link.href = '#' + path;
  return style === 'row-action' ? setRowAction(link) : link;
}

function diagnosisAxes(code, scores) {
  const list = element('ul', null, 'diagnosis-axes');
  axes.forEach(({ codes, labels }, index) => {
    const item = element('li');
    const pair = scores?.[index];
    item.append(element('strong', codes.join(' / ')), element('span',
      pair ? labels[0] + ' ' + pair[0] + '票 ／ ' + labels[1] + ' ' + pair[1] + '票' : labels[codes.indexOf(code[index])]));
    if (pair) {
      const bar = element('div', null, 'diagnosis-axis-bar');
      bar.setAttribute('aria-hidden', 'true');
      for (const count of pair) {
        const segment = element('span');
        segment.style.flexGrow = count;
        bar.append(segment);
      }
      item.append(bar);
    }
    list.append(item);
  });
  return list;
}

function diagnosisPlayers(code) {
  const section = element('section', null, 'diagnosis-players');
  section.append(element('h3', 'このタイプに近い棋風を持つ棋士'));
  const players = approvedStylePlayers[code] ?? [];
  if (!players.length) section.append(element('p', 'このタイプの棋士紹介は準備中です。'));
  for (const { name, style, similarity, source } of players) {
    const reference = element('a', '出典を読む');
    reference.href = source;
    reference.rel = 'noreferrer';
    section.append(element('h4', name), element('p', style), element('p', similarity), reference);
  }
  if (players.length) section.append(element('p', '公開棋譜や資料をもとに棋風の共通点を紹介しています。選手本人の診断結果を示すものではありません。'));
  return section;
}

function diagnosisResultExtras(row, saved) {
  const nodes = [element('p', saved ? '診断履歴に保存されています。' : 'このブラウザーに保存できませんでした。', 'dashboard-note')];
  if (row.kind === 'type') {
    const detail = element('section');
    detail.append(element('h2', '4つの傾向'), diagnosisAxes(row.code, row.scores),
      element('p', row.scores ? '票数は、各項目で選んだ回答の集計です。' : 'この診断の票数は記録されていません。', 'dashboard-note'));
    nodes.push(detail, diagnosisPlayers(row.code));
  }
  return [...nodes, diagnosisLink('学習プロフィールを見る', 'profile')];
}

function growthDailyVolumes(activity, ledger, personal) {
  const volumes = new Map();
  for (const history of [...Object.values(ledger), ...personal.map(row => row.history)]) {
    const days = new Set((history?.events ?? []).map(event => event.day ?? localDay(new Date(event.at))));
    if (history?.first?.day) days.add(history.first.day);
    for (const day of days) volumes.set(day, (volumes.get(day) ?? 0) + 1);
  }
  for (const row of activity.filter(activeLearningDay)) {
    // The learning tracker counts introductory lessons; general and personal problems have separate ledgers.
    volumes.set(row.day, Math.max(1, activityVolume(row) + (volumes.get(row.day) ?? 0)));
  }
  return volumes;
}

const growthPage = (() => {
  const practice = createPersonalStore();
  const games = createGameLibrary();
  const studies = createStudyStore();
  let revision = 0;
  const latest = (history, kind) => history.find(row => row.kind === kind);

  function typeCard(row, detail) {
    const card = element('div');
    if (!row) {
      card.append(element('p', '診断を受けると、選んだ回答から見えてくる棋風をここで確認できます。'));
      if (!detail) card.append(diagnosisLink('チェス16タイプ診断を始める', 'mode', 'button secondary'));
      return card;
    }
    const type = types[row.code];
    card.className = 'growth-type';
    const art = element('canvas');
    art.width = cardCanvas.width;
    art.height = cardCanvas.height;
    art.setAttribute('aria-hidden', 'true');
    drawCard(art, getCardData(row.code));
    const text = element('div');
    text.append(element('p', row.code, 'eyebrow'), element('h3', type.name), element('p', diagnosisDate(row), 'dashboard-note'));
    if (detail) text.append(chessTermText('p', type.description));
    card.append(art, text);
    return card;
  }

  function profile(message = '', restoreFocus = false) {
    byId('profile-status').textContent = message;
    const history = readDiagnosisHistory().records;
    const type = latest(history, 'type');
    const opening = latest(history, 'opening');
    const typeNode = byId('profile-type');
    typeNode.replaceChildren(typeCard(type, true));
    if (type) {
      const data = types[type.code];
      typeNode.append(diagnosisAxes(type.code, type.scores),
        element('p', type.scores ? '票数は回答を集計したものです。' : '以前の診断には票数の記録がありません。', 'dashboard-note'),
        resultDetail('活かしやすい強み', data.strength, 'profile-detail'),
        resultDetail('対局で意識したい注意点', data.caution, 'profile-detail'),
        resultDetail('次の学習に活かすには', data.tip, 'profile-detail'), diagnosisPlayers(type.code));
    }
    const openingsNode = byId('profile-opening');
    openingsNode.replaceChildren(element('p', opening ? diagnosisDate(opening) : '保存した診断結果はまだありません。'));
    if (opening) {
      const list = element('ul', null, 'growth-rows');
      for (const pick of opening.picks) {
        const candidate = findStudyOpening(pick.id);
        if (!candidate) continue;
        const item = element('li');
        item.append(diagnosisLink(candidate.name, 'study/' + pick.id), chessTermText('p', pick.reason));
        list.append(item);
      }
      openingsNode.append(list);
    }
    const snapshots = personalPreference(styleSnapshotsKey, []);
    const snapshot = validStyleSnapshots(snapshots) ? snapshots[0] : null;
    const style = byId('profile-style');
    style.replaceChildren(element('p', snapshot
      ? '保存した棋風分析：' + snapshot.outline.games + '局を集計（' + new Date(snapshot.date).toLocaleDateString('ja-JP') + '）。'
      : '保存した棋譜から、実戦で選んだ手の傾向を調べられます。'));
    if (snapshot) {
      const facts = snapshot.outline;
      style.append(element('p', 'チェックを選んだ回数 ' + facts.check + ' / 選べた局面 ' + facts.checkOpportunities + '。指し手の選択肢は、相手や局面によって変わります。'));
    }
    const records = byId('profile-history');
    records.replaceChildren();
    if (!history.length) records.append(element('p', '保存した診断結果はまだありません。'));
    else {
      const list = element('ul', null, 'growth-rows');
      for (const row of history) {
        const item = element('li', null, 'diagnosis-history-row');
        const title = row.kind === 'type' ? row.code + ' ' + types[row.code].name : 'オープニング診断';
        const info = element('div');
        info.append(diagnosisLink(title, 'diagnosis/' + row.id), element('p', diagnosisDate(row), 'dashboard-note'));
        const remove = element('button', '削除する', 'button secondary');
        remove.type = 'button';
        remove.setAttribute('aria-label', title + '（' + diagnosisDate(row) + '）を削除する');
        remove.addEventListener('click', () => {
          if (!window.confirm('この診断結果を、このブラウザーから削除しますか？')) return;
          if (deleteDiagnosis(row.id)) profile('診断結果を削除しました。', true);
          else byId('profile-status').textContent = '診断結果を削除できませんでした。';
        });
        item.append(info, remove);
        list.append(item);
      }
      records.append(list);
    }
    if (restoreFocus) (records.querySelector('button') ?? byId('profile-title')).focus();
  }

  function graph(today, volumes) {
    const week = Array.from({ length: 7 }, (_, index) => {
      const day = offsetDay(today, index - 6);
      return { day, count: volumes.get(day) ?? 0 };
    });
    if (!week.some(row => row.count)) {
      byId('growth-week').textContent = '直近7日間の学習記録はまだありません。';
      return;
    }
    const max = Math.max(...week.map(row => row.count));
    const chart = element('ol', null, 'growth-chart');
    for (const { day, count } of week) {
      const bar = element('span', null, 'growth-chart-bar');
      bar.style.blockSize = count / max * 100 + '%';
      const track = element('span', null, 'growth-chart-track');
      track.setAttribute('aria-hidden', 'true');
      track.append(bar);
      const item = element('li');
      const label = day.slice(5).split('-').map(Number).join('/');
      item.append(element('span', count + '件'), track, Object.assign(element('time', label), { dateTime: day }));
      chart.append(item);
    }
    byId('growth-week').replaceChildren(chart, element('p', '定跡学習の活動と、取り組んだ練習問題を日ごとに数えています。', 'dashboard-note'));
  }

  function recentGames(rows, request) {
    const node = byId('growth-games');
    if (!rows?.length) {
      node.textContent = rows ? '保存した対局がここに表示されます。' : '保存した対局を読み込めませんでした。';
      return;
    }
    const list = element('ul', null, 'growth-rows');
    for (const { game, date } of rows.map(game => ({ game, date: reviewRecentDate(game) }))
      .sort((a, b) => Date.parse(b.date.value) - Date.parse(a.date.value)).slice(0, 3)) {
      const { white, black, event, result } = game.metadata;
      const label = { '1-0': '白の勝ち', '0-1': '黒の勝ち', '1/2-1/2': '引き分け' }[result] ?? '結果未記録';
      const item = element('li');
      const status = element('span', '解析状況を確認中');
      item.append(diagnosisLink(white && black ? white + ' 対 ' + black : event || '保存した対局', 'game-review/' + game.id),
        element('p', new Date(date.value).toLocaleDateString('ja-JP') + (date.isSaved ? '（保存日）' : '') + ' ／ ' + label, 'dashboard-note'), status);
      list.append(item);
      studyContentKey(game).then(key => studies.get(key)).then(record => {
        if (request === revision) status.textContent = studyProgressLabel(record, game.positions.length);
      }).catch(() => { status.textContent = '解析状況を取得できません'; });
    }
    node.replaceChildren(list);
  }

  async function open() {
    const request = ++revision;
    byId('growth-card').replaceChildren(typeCard(latest(readDiagnosisHistory().records, 'type'), false));
    const activity = learningTracker.activity();
    const ledger = generalHistory();
    const today = localDay();
    const goal = personalPreference(learningGoalKey, null);
    byId('growth-goal').textContent = validLearningGoal(goal)
      ? [learningGoals[goal.goal], goal.minutes && '1回 ' + goal.minutes + '分', goal.days && '週 ' + goal.days + '日'].filter(Boolean).join(' ／ ')
      : '目標を設定すると、ここで確認できます。';
    const [personal, gameRows] = await Promise.all([practice.all().catch(() => null), games.all().catch(() => null)]);
    if (request !== revision) return;
    const volumes = growthDailyVolumes(activity, ledger, personal ?? []);
    const general = Object.values(ledger);
    const histories = [...general, ...(personal ?? []).map(row => row.history)];
    const days = [...volumes].filter(([day, count]) => day <= today && count > 0).length;
    const values = [
      ['一般練習で取り組んだ問題', general.length + '問'],
      ['一般問題の初回ヒントなし正解率', general.length < 5 ? '記録が集まると表示' : Math.round(100 * general.filter(row => row.first.correct && !row.first.hints).length / general.length) + '％'],
      ['自分専用の練習問題', personal === null ? '取得できません' : personal.length + '問'],
      ['学習した日数（記録あり）', days + '日'],
      ['今日の問題復習', (personalDue(personal ?? []).length + general.filter(row => row.due <= today).length) + '問'],
      ['習得済みの練習問題', histories.filter(row => row?.level >= reviewIntervals.length - 1).length + '問'],
    ];
    byId('growth-metrics').replaceChildren(...values.map(([label, value]) => {
      const item = element('div');
      const output = element('dd', value);
      if (!/^[0-9]/.test(value)) output.dataset.pending = '';
      item.append(element('dt', label), output);
      return item;
    }));
    graph(today, volumes);
    if (validLearningGoal(goal) && goal.days) {
      const start = weekStart(today);
      const active = [...volumes].filter(([day, count]) => day >= start && day <= today && count > 0).length;
      byId('growth-goal').textContent += ' ／ 今週 ' + active + '日 / 目標 ' + goal.days + '日';
    }
    recentGames(gameRows, request);
    const next = byId('growth-weakness');
    next.replaceChildren(element('p', '練習問題や対局の記録が集まると、おすすめの復習テーマを表示します。'),
      diagnosisLink('練習問題集を開く', 'general'));
    if (!personal?.length && !general.length) return;
    try {
      const { rows, evidence } = await generalPractice.pool(personal ?? [], ledger);
      if (!evidence || request !== revision) return;
      const candidate = rows.find(row => row.tags.includes(evidence.tag) && !ledger[row.id]);
      const label = practiceThemes[evidence.tag][0];
      const basis = evidence.games.size >= 2 ? '自分の対局から作った問題で、' + evidence.games.size + '局に共通しています。'
        : evidence.attempted + '問のうち、初回で迷ったかヒントを使った問題が' + evidence.missed + '問あります。';
      next.replaceChildren(chessTermText('h3', label), element('p', basis),
        diagnosisLink(label + 'を練習する', candidate ? 'general/' + candidate.id + '/recommended' : 'general/theme/' + evidence.tag));
    } catch { /* Keep the practice entry available offline. */ }
  }

  byId('play-position-form').addEventListener('submit', event => {
    event.preventDefault();
    const status = byId('play-position-status');
    try {
      const board = new chessRules.Chess(event.currentTarget.elements.fen.value.trim());
      const [king] = board.findPiece({ type: 'k', color: otherChessColor(board.turn()) });
      if (!king || board.isAttacked(king, board.turn())) throw new Error('手番とキングの位置を確認してください。');
      const fen = board.fen();
      const position = { fen, initialFen: fen, moves: [], ply: 0, gameId: null, color: null };
      cpuStartingPosition(position);
      status.textContent = '';
      goTo('cpu', { cpuPosition: position });
    } catch { status.textContent = '対戦を始められる盤面の記録を入力してください。'; }
  });

  return { open, profile };
})();

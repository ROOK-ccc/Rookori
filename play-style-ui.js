const stylePage = (() => {
  const library = createGameLibrary();
  const studyStore = createStudyStore();
  const questions = createPersonalStore();
  const el = id => byId('style-' + id);
  const cache = new Map();
  const filters = () => Object.fromEntries(Object.keys(styleChoices).map(key => [key, el('filter-' + key).value]));
  const link = (text, path) => Object.assign(element('a', text, 'text-button'), { href: '#' + path });
  let games = [], ownership = {}, running, last, page = 0, revision = 0, loading = false, hydrated = false;

  for (const [key, entries] of Object.entries(styleChoices)) for (const [value, label] of Object.entries(entries)) {
    const option = element('option', label);
    option.value = value;
    el('filter-' + key).append(option);
  }
  el('filter-limit').value = '10';

  function snapshots() {
    const rows = personalPreference(styleSnapshotsKey, []);
    return validStyleSnapshots(rows) ? rows : [];
  }

  function list() {
    const eligible = games.filter(styleFinished);
    const all = eligible.length;
    page = Math.max(0, Math.min(page, Math.ceil(all / 15) - 1));
    el('selection-count').textContent = `集計対象 ${eligible.filter(game => styleSide(game, ownership)).length}局 ／ 終了済みの対局 ${all}局`;
    el('games').replaceChildren(...eligible.slice(page * 15, page * 15 + 15).map(game => {
      const li = element('li');
      const value = reviewRecentDate(game).value;
      const timestamp = value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString('ja-JP') : '日付不明';
      const title = `${timestamp} · ${game.cpu ? (game.cpu.origin?.opening ? '定跡指定CPU対戦' : 'CPU対戦') : game.metadata.event ?? '取り込んだ対局'}`;
      const label = element('label', title + ' ');
      const select = element('select');
      const known = game.source?.color === 'white' ? 'w' : game.source?.color === 'black' ? 'b' : null;
      const choices = game.cpu ? [[game.cpu.player, `${chessColorNames[game.cpu.player]}番で集計`]]
        : [['', '未選択'], ['w', '自分は白番'], ['b', '自分は黒番']];
      for (const [value, desc] of [...choices, ['exclude', '集計しない']]) {
        const option = element('option', desc);
        option.value = value;
        select.append(option);
      }
      select.value = ownership[game.id] ?? game.cpu?.player ?? '';
      select.addEventListener('change', () => {
        const current = { ...ownership };
        if (select.value === '' || (game.cpu && select.value !== 'exclude')) delete current[game.id];
        else current[game.id] = select.value;
        if (!savePersonalPreference(styleOwnershipKey, current)) {
          el('status').textContent = '対象の変更を保存できませんでした。';
          list();
          return;
        }
        ownership = current;
        changed();
        list();
      });
      label.append(select);
      li.append(label, link('棋譜を見る', 'game-review/' + game.id));
      if (!game.cpu) li.append(element('p', `${game.metadata.white ?? '白'} 対 ${game.metadata.black ?? '黒'}${known ? ` · 取得時に選択した色 ${chessColorNames[known]}（本人確認なし）` : ''}`));
      return li;
    }));
    el('previous').hidden = page === 0;
    el('next').hidden = (page + 1) * 15 >= all;
  }

  const rate = (count, samples) => samples >= 5 ? `${Math.round(100 * count / samples)}%（${count} / ${samples}手）` : `まだ十分なデータがありません（${samples}手）`;

  function metrics(a) {
    return [
      ['チェックを選んだ割合', rate(a.check, a.checkOpportunities), 'チェックする手としない手が両方あった局面のうち、チェックを選んだ割合です。'],
      ['駒を取る手を選んだ割合', rate(a.capture, a.captureOpportunities), '駒を取る手と取らない手が両方あった局面を数えます。取った後の交換成立までは含めません。'],
      ['キャスリングの時期', a.castled >= 3 ? `中央値 ${a.castleMedian}手目（実行 ${a.castled}局／機会あり ${a.castleChance}局）` : `まだ十分なデータがありません（実行 ${a.castled}局）`, '通常の初期配置から始めた対局で、実際にキャスリングをした手数を数えます。'],
      ['分類できた定跡の種類', a.classified >= 3 ? `${a.openings}種類（分類できた ${a.classified}局）` : `まだ十分なデータがありません（分類できた ${a.classified}局）`, '通常の初期配置から始めた対局を既存の定跡表で照合し、白と黒を区別して数えます。'],
      ['大きな評価低下がなかった手', rate(a.stable, a.graded), '比較できる全体解析の評価がある手のみを集計し、強制手を除きます。持ち時間と相手の違いでも変わります。'],
    ];
  }

  function diagnosis() {
    const result = personalPreference(savedTypeResultKey, null);
    el('diagnosis').replaceChildren();
    if (!validSavedTypeResult(result)) {
      el('diagnosis').append(element('p', '保存された16タイプ診断があると、ここに回答に基づく結果が表示されます。'), link('16タイプ診断を試す', 'mode'));
      return;
    }
    const labels = axes.map(({ codes, labels }, i) => labels[codes.indexOf(result.code[i])]).join('・');
    el('diagnosis').append(element('p', `回答に基づく結果　${result.code} ${types[result.code].name}（${labels}）`),
      element('p', '「攻撃型・堅実型」の回答とチェックの選び方は見比べられます。対局では相手や局面によって選択肢が変わります。戦術・ポジショナル、複雑さ、考える速さは、今回の棋譜指標からタイプを推定できません。'));
  }

  function results(snapshot) {
    const a = snapshot.outline;
    el('results').hidden = false;
    const band = a.games < 5 ? '参考情報' : a.games < 20 ? '暫定的な傾向' : 'より多くの対局に基づく傾向';
    el('overview').textContent = `${a.games}局を集計・解析記録あり ${a.analyzed}局 · ${band}。CPU練習 ${a.practice}局、CPU実戦 ${a.cpu - a.practice}局、取り込んだ対局 ${a.games - a.cpu}局。途中から始めた対局 ${a.positioned}局。`;
    el('metrics').replaceChildren(...metrics(a).map(([label, value, basis]) => {
      const row = element('li', null, 'game-card');
      row.append(element('h3', label), element('p', value), element('p', basis));
      return row;
    }));
    const advice = el('advice');
    advice.replaceChildren();
    if (a.lossGames >= 3) advice.append(element('p', `比較可能な解析で、大きく評価が下がった手が${a.lossGames}局で見つかりました。相手の次の一手を考え、ハイライトで実戦の手と候補手を比べてみましょう。`), link('対局を振り返る', 'game-review'));
    else if (a.castleChance >= 3 && a.castled * 2 < a.castleChance) advice.append(element('p', `キャスリングが可能だった${a.castleChance}局のうち、指したのは${a.castled}局です。王を移すタイミングを、定跡設定で一度試せます。`), link('定跡からCPUと対戦する', 'cpu'));
    else advice.append(element('p', '改善を提案できるだけの対局データはまだありません。終了した対局を一局振り返るところから始められます。'), link('対局を振り返る', 'game-review'));
    const openingAnswers = personalPreference(savedOpeningResultKey, null);
    if (validOpeningAnswers(openingAnswers)) {
      const recommended = scoreOpenings(openingAnswers)[0]?.candidate;
      if (recommended) advice.append(element('p', 'オープニング診断で選んだ戦い方から、おすすめの定跡を試せます。'), link(`${recommended.name}から対戦する`, 'cpu-opening/' + recommended.id));
    }
    questions.all().then(rows => {
      if (last !== snapshot) return;
      const due = personalDue(rows).length;
      if (due) advice.append(element('p', `自分の対局から保存した問題に、復習予定が${due}問あります。`), link('自分だけの練習問題', 'personal'));
    }).catch(() => {});
    const old = snapshots().find(row => row.date !== snapshot.date && Object.keys(styleChoices).every(key => row.filters[key] === snapshot.filters[key]));
    el('past').textContent = old
      ? `${new Date(old.date).toLocaleString('ja-JP')}の同じ条件（${old.outline.games}局）と比較。チェック ${rate(old.outline.check, old.outline.checkOpportunities)} → ${rate(a.check, a.checkOpportunities)}。駒を取る手 ${rate(old.outline.capture, old.outline.captureOpportunities)} → ${rate(a.capture, a.captureOpportunities)}。対象が重なることや、相手と持ち時間の内訳が変わることがあります。`
      : '保存した同じ条件の分析があると、次の分析で選び方の変化を見比べられます。';
    el('save').disabled = false;
  }

  function cancel() {
    if (!running) return;
    running = null;
    el('run').disabled = loading;
    el('cancel').hidden = true;
    el('status').textContent = '分析を中止しました。';
  }

  function changed() {
    cancel();
    last = null;
    el('results').hidden = true;
    el('status').textContent = '「棋風を分析する」で選んだ条件を集計できます。';
  }

  el('run').addEventListener('click', async () => {
    if (loading || running) return;
    const selection = filters();
    const active = running = {};
    const gamesToAnalyze = styleFilterGames(games, ownership, selection);
    el('run').disabled = true;
    el('cancel').hidden = false;
    const rows = [];
    try {
      for (const { game, side } of gamesToAnalyze) {
        el('status').textContent = `棋譜を確認しています（${rows.length + 1} / ${gamesToAnalyze.length}局）`;
        await new Promise(resolve => setTimeout(resolve, 0));
        if (running !== active) return;
        const cached = cache.get(game.id);
        const observed = cached?.pgn === game.pgn && cached.side === side ? cached.observed : styleObserveGame(game, side);
        cache.set(game.id, { pgn: game.pgn, side, observed });
        if (cache.size > 150) cache.delete(cache.keys().next().value);
        const study = await studyStore.get(await studyContentKey(game)).catch(() => null);
        if (running !== active) return;
        rows.push({ game, side, observed, grades: styleGameGrades(game, side, study) });
      }
      if (!rows.length) {
        el('results').hidden = true;
        el('status').textContent = '条件に合う対局はありません。自分の色を指定するか、絞り込みを変えてください。';
        return;
      }
      last = { date: new Date().toISOString(), filters: selection, outline: styleOutline(rows) };
      results(last);
      el('status').textContent = '分析が完了しました。';
    } catch { if (running === active) el('status').textContent = '棋風を集計できませんでした。'; }
    finally { if (running === active) { running = null; el('run').disabled = false; el('cancel').hidden = true; } }
  });
  el('cancel').addEventListener('click', cancel);
  el('save').addEventListener('click', () => {
    if (!last) return;
    const rows = [last, ...snapshots().filter(row => row.date !== last.date)].slice(0, 30);
    if (savePersonalPreference(styleSnapshotsKey, rows)) {
      el('status').textContent = '分析結果をこのブラウザーに保存しました。';
      el('save').disabled = true;
    } else el('status').textContent = '分析結果を保存できませんでした。';
  });
  el('previous').addEventListener('click', () => { page--; list(); });
  el('next').addEventListener('click', () => { page++; list(); });
  for (const key of Object.keys(styleChoices)) el('filter-' + key).addEventListener('change', changed);
  window.addEventListener('pagehide', cancel);

  async function open() {
    const token = ++revision;
    showScreen('your-style', 'your-style-title');
    diagnosis();
    const saved = hydrated ? null : snapshots()[0];
    hydrated = true;
    if (saved) for (const key of Object.keys(styleChoices)) el('filter-' + key).value = saved.filters[key];
    el('status').textContent = '対局履歴を読み込んでいます。';
    el('run').disabled = loading = true;
    try {
      const rows = await library.all();
      if (revision !== token || byId('your-style').hidden) return;
      games = rows.sort((a, b) => String(reviewRecentDate(b).value).localeCompare(String(reviewRecentDate(a).value)));
      const stored = personalPreference(styleOwnershipKey, {});
      ownership = validStyleOwnership(stored) ? stored : {};
      list();
      el('status').textContent = games.some(styleFinished) ? '集計する対局を選んで分析できます。' : '終了済みの棋譜がまだありません。';
      if (saved && Object.keys(styleChoices).every(key => filters()[key] === saved.filters[key])) {
        last = saved;
        results(last);
        el('save').disabled = true;
        el('status').textContent = `${new Date(saved.date).toLocaleString('ja-JP')}に保存した分析です。`;
      }
    } catch { if (token === revision) el('status').textContent = '棋譜を読み込めませんでした。'; }
    finally { if (token === revision) el('run').disabled = loading = false; }
  }

  function dashboard() {
    const saved = snapshots()[0];
    const diagnosisResult = personalPreference(savedTypeResultKey, null);
    const text = saved ? `保存した棋風分析 ${saved.outline.games}局 · 解析記録あり ${saved.outline.analyzed}局` : '対局を振り返ると、自分が選んだ手の傾向を確かめられます。';
    byId('dashboard-style').replaceChildren(element('h2', 'あなたの棋風'), element('p', text + (validSavedTypeResult(diagnosisResult) ? ` ／ 16タイプ診断 ${diagnosisResult.code}` : '')), link('棋風を見る', 'your-style'));
  }

  return { open, cancel, dashboard };
})();

const practiceLevels = ['入門', '初級', '中級', '上級'];
const practiceThemes = {
  fork: ['フォーク（両取り）', '一つの駒で二つ以上の目標を攻撃します。チェックや駒取りの後、同時に何を狙えるかを確認しましょう。'],
  pin: ['ピン', '駒の後ろにキングや価値の高い駒があると、手前の駒は動きづらくなります。ルーク・ビショップ・クイーンの届く直線を見ましょう。'],
  skewer: ['スキュア', '価値の高い駒に先に攻撃をかけ、それが移動したあとで後ろの駒を取ります。前後の駒が同じ線にいるか確かめましょう。'],
  discoveredAttack: ['ディスカバードアタック', '手前の駒を動かして後ろの駒の攻撃線を開きます。動かす駒でも別の脅威を作れるか探しましょう。'],
  doubleCheck: ['ダブルチェック', '一手で二つの駒からチェックがかかります。相手のキングがどこへ逃げられるかを数えましょう。'],
  deflection: ['ディフレクション', '守備駒を別の仕事に引きつけると、もともと守っていたマスや駒を狙えることがあります。'],
  attraction: ['デコイ', '相手の駒を特定のマスへ誘い、次のチェックや駒取りを狙います。相手が誘いを断れるかも確認しましょう。'],
  capturingDefender: ['ディフェンダーの除去', '狙っている駒やマスを誰が守っているかを特定し、その守備駒を先に取る手を考えます。'],
  promotion: ['昇格', 'ポーンが一番奥の列に着くと駒を選んで昇格できます。昇格後にチェックがかかるか、すぐ取られないかを確認しましょう。'],
  mateIn1: ['1手詰め', 'チェックをかけられる手を挙げ、キングの逃げ場、攻撃駒の取り返し、合駒がすべてなくなる手を探します。'],
  mateIn2: ['2手詰め', '自分の二手目で詰ませます。最初の手に対して、相手が使える応手すべてを想像してみましょう。'],
  mateIn3: ['3手詰め', '自分の三手目で詰ませます。チェックの順番と相手キングの逃げ道に注目しましょう。'],
  mateIn4: ['4手詰め'], mateIn5: ['5手詰め'], mate: ['チェックメイト'],
  backRankMate: ['バックランクメイト', '最奥の列で自分のポーンに囲まれたキングに、ルークやクイーンの横からのチェックが届くかを見ます。'],
  pawnEndgame: ['ポーンエンドゲーム', 'キングの位置と、相手のポーンに止められずに進めるポーンに注目しましょう。'],
  rookEndgame: ['ルークエンドゲーム', 'ルークがポーンの後ろや横からどこまで動けるか、相手キングを遠ざけられるかを見ます。'],
  queenEndgame: ['クイーンエンドゲーム', '遠くからのチェックと昇格の競争を比較します。自分のキングに連続でチェックがかからないか注意しましょう。'],
  endgame: ['終盤'], opening: ['序盤の戦術'], middlegame: ['中盤の戦術'],
  defensiveMove: ['守備的な着手', '先に相手の次の狙いを言葉にし、受ける手と反撃する手を比べてみましょう。'],
  advantage: ['有利を広げる'], crushing: ['大きなチャンス'],
  interference: ['利きの遮断'], clearance: ['マスや利きの開放'],
};
const practiceThemeGroups = [
  ['タクティクス', ['fork', 'pin', 'skewer', 'discoveredAttack', 'doubleCheck', 'deflection', 'attraction',
    'capturingDefender', 'promotion', 'interference', 'clearance']],
  ['チェックメイト', ['mateIn1', 'mateIn2', 'mateIn3', 'mateIn4', 'mateIn5', 'backRankMate', 'mate']],
  ['エンドゲーム', ['pawnEndgame', 'rookEndgame', 'queenEndgame', 'endgame']],
  ['実戦練習', ['opening', 'middlegame', 'defensiveMove', 'advantage', 'crushing']],
];
const generalRequests = new Map();

function generalLoad(file) {
  if (!generalRequests.has(file)) generalRequests.set(file, fetch('puzzles/' + file)
    .then(response => {
      if (!response.ok) throw new Error('練習問題データを読み込めませんでした。');
      return response.json();
    }).catch(error => { generalRequests.delete(file); throw error; }));
  return generalRequests.get(file);
}

const generalCatalog = () => generalLoad('catalog.json');
function generalBatch(name, catalog) {
  if (!/^\d-\d+$/.test(name) || !Object.hasOwn(catalog.batches, name)) return Promise.resolve([]);
  return generalLoad(name + '.json?v=' + catalog.batches[name].hash);
}
async function generalFind(id) {
  const catalog = await generalCatalog();
  const name = Object.keys(catalog.batches).find(key => catalog.batches[key].ids.includes(id));
  return name ? (await generalBatch(name, catalog)).find(row => row[0] === id) : null;
}

function generalHistory() {
  const saved = personalPreference(generalHistoryKey, {});
  return learningObject(saved) ? Object.fromEntries(Object.entries(saved).filter(([id, row]) =>
    /^[A-Za-z0-9]{5}$/.test(id) && learningObject(row?.first) && Array.isArray(row.events))) : {};
}

function generalRecord(id, correct, hints, date = new Date()) {
  const rows = generalHistory();
  rows[id] = personalProgress(rows[id], correct ? 'good' : 'retry', hints, date);
  rows[id].first ??= { correct, hints, day: localDay(date) };
  rows[id].events = rows[id].events.slice(-8);
  return savePersonalPreference(generalHistoryKey, rows);
}

function practiceEvidence(personal, general, currentDay = localDay()) {
  const groups = new Map();
  const add = (tags, history, date, game) => {
    for (const tag of tags) {
      if (!Object.hasOwn(practiceThemes, tag)) continue;
      const row = groups.get(tag) ?? { tag, attempted: 0, missed: 0, recent: 0, games: new Set(), early: [], late: [] };
      if (game && date >= offsetDay(currentDay, -30)) row.games.add(game);
      if (history) {
        row.attempted++;
        row.missed += Number(!history.first.correct || Boolean(history.first.hints));
        row.recent += Number(history.first.day >= offsetDay(currentDay, -13));
        for (const event of history.events) {
          const success = Number(event.kind === 'good' && !event.hints);
          if (event.day >= offsetDay(currentDay, -6)) row.late.push(success);
          else if (event.day >= offsetDay(currentDay, -13)) row.early.push(success);
        }
      }
      groups.set(tag, row);
    }
  };
  for (const { question } of personal) add(question.tags, null, question.created.slice(0, 10), question.sourceKey ?? question.gameId);
  for (const { tags, history } of general) if (history?.first) add(tags, history);
  return [...groups.values()].filter(row => row.games.size >= 2 || row.attempted >= 3 && row.missed > 0)
    .sort((a, b) => b.games.size - a.games.size || b.missed - a.missed || b.recent - a.recent || a.tag.localeCompare(b.tag));
}

function buildPracticeMenu(personal, general, history, weak, mode, day = localDay()) {
  const selected = new Map();
  const add = (rows, max, reason) => {
    let added = 0;
    for (const row of rows) {
      if (added >= max) return;
      if (selected.has(row.id)) continue;
      selected.set(row.id, { ...row, reason });
      added++;
    }
  };
  const duePersonal = personalDue(personal, day);
  const todayPersonal = personal.filter(row => row.history?.reviewedDay === day);
  const own = rows => rows.map(({ question }) => ({ id: question.id, type: 'personal' }));
  if (mode === 'personal') {
    add(own([...todayPersonal, ...duePersonal]), 10, '自分の対局');
    return [...selected.values()];
  }
  if (mode !== 'general') add(own([...todayPersonal, ...duePersonal.filter(row => !row.history)]), 4, '自分の対局');
  const due = general.filter(row => history[row.id] && history[row.id].due <= day && history[row.id].reviewedDay !== day)
    .sort((a, b) => history[a.id].due.localeCompare(history[b.id].due));
  if (weak) add(general.filter(row => row.tags.includes(weak) && !history[row.id]), 3, 'おすすめ：' + practiceThemes[weak][0]);
  add([...due, ...(mode === 'general' ? [] : own(duePersonal.filter(row => row.history)))], 2, '復習予定');
  const knownThemes = new Set(general.filter(row => history[row.id]).flatMap(row => row.tags));
  add(general.filter(row => row.tags.some(tag => tag !== weak && !knownThemes.has(tag)) && !history[row.id]), 1, '新しいテーマ');
  add([...general.filter(row => !history[row.id]), ...due, ...general], 10 - selected.size, '一般練習');
  return [...selected.values()];
}

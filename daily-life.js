const welcomeKey = 'rookori.welcome.v1';
const learningGoalKey = 'rookori.learning-goal.v1';
const learningGoals = Object.freeze({
  rules: 'チェスのルールを覚える', cpu: '初めてコンピューターに勝つ', openings: '得意な定跡を見つける',
  pieces: '駒の取りこぼしを減らす', tactics: '戦術を身につける', review: '自分の対局を振り返る',
  enjoy: '自分のペースで楽しむ',
});

function validLearningGoal(value) {
  return value !== null && typeof value === 'object' && typeof value.goal === 'string' && Object.hasOwn(learningGoals, value.goal)
    && ['', '5', '10', '20', '30'].includes(value.minutes) && ['', '1', '2', '3', '7'].includes(value.days);
}

function dailyRecommendation(goal, { resume, openingDue, personalDue, game, learnedOpening, problemsDone }) {
  const personal = personalDue && ['pieces', 'tactics', 'review'].includes(goal);
  if (personal) return ['自分の対局から作った問題を復習する', '#personal', `復習予定の問題が${personalDue}問あります。`];
  if (openingDue && (!goal || ['openings', 'enjoy'].includes(goal))) {
    return ['覚えた定跡を復習する', '#review', `復習予定の手が${openingDue}手あります。`];
  }
  if (goal === 'rules') return ['チェスの基本を学ぶ', '#intro', '駒の動きや基本ルールから始められます。'];
  if (goal === 'cpu') return ['コンピューターと対戦する', '#cpu', 'ポーンレベルや練習モードから選べます。'];
  if (goal === 'openings') return learnedOpening
    ? ['定跡の解説を読む', '#openings', '気になる序盤の指し方を、盤で確かめましょう。']
    : ['オープニング診断を試す', '#opening-quiz', '自分が指してみたい序盤の作戦を探せます。'];
  if (goal === 'review') return game
    ? ['最近の対局を振り返る', '#game-review/' + game, '気になった一手を、盤で確かめましょう。']
    : ['対局の振り返りを試す', '#game-review', 'サンプル対局や、自分で保存した棋譜を開けます。'];
  if (['pieces', 'tactics'].includes(goal)) return problemsDone
    ? ['練習モードで指してみる', '#cpu', '今日の問題は完了しています。練習で手を選んでみましょう。']
    : ['今日の練習問題を解く', '#daily', '駒を取る手や守る手を、一問ずつ考えましょう。'];
  return resume ? ['前回の続きから始める', resume, '前回取り組んだ学習を続けられます。']
    : ['チェスの基本を学ぶ', '#intro', '駒の動きや基本ルールから始められます。'];
}

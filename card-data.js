// 各行は [配色名, 背景色, アクセント色, 駒, カード用の紹介文] の順です。
const cardStyles = {
  ATCI: ['ember', '#551c20', '#f17063', 'knight', 'ひらめきを、盤上の一手に。'],
  ATCD: ['amber', '#493018', '#e3a748', 'queen', '読みを重ね、攻めの瞬間を待つ。'],
  ATLI: ['orange', '#542817', '#ff9f58', 'knight', '好機を見つけたら、すばやく踏み込む。'],
  ATLD: ['crimson', '#401424', '#d34e70', 'bishop', '狙いを定め、手順を組み立てる。'],
  APCI: ['violet', '#422450', '#c18df0', 'knight', '意外な配置から、攻めの糸口を探る。'],
  APCD: ['indigo', '#302951', '#a49af2', 'queen', '駒をつなぎ、じっくり攻めを組み立てる。'],
  APLI: ['turquoise', '#173f43', '#62dfd8', 'knight', '駒を自然に動かし、先に主導権を狙う。'],
  APLD: ['gold', '#443716', '#c7a047', 'rook', '目標を絞り、一手ずつ攻めを進める。'],
  STCI: ['plum', '#321938', '#a367bb', 'bishop', '複雑な局面から、切り返しを探す。'],
  STCD: ['blue', '#1c3253', '#6ca6f3', 'queen', '相手の狙いを読み、反撃を組み立てる。'],
  STLI: ['silver-blue', '#344554', '#b8cfdf', 'knight', '形を保ちながら、相手の動きに応じる。'],
  STLD: ['steel', '#303842', '#8798ad', 'rook', '守りを固め、着実に好機を待つ。'],
  SPCI: ['green', '#25452b', '#86cd83', 'bishop', '選択肢を残して、相手の出方を見る。'],
  SPCD: ['forest', '#18392b', '#4ba478', 'queen', '局面を見比べ、先を見越して駒を置く。'],
  SPLI: ['olive', '#3e4426', '#adb96d', 'pawn', '慣れた形から、一手ずつ整える。'],
  SPLD: ['teal', '#193d3b', '#60b3a7', 'rook', '安定した形から、局面を組み直す。'],
};

function getCardData(typeCode) {
  const type = types[typeCode];
  const [cardTheme, backgroundColor, accentColor, motif, shortTagline] = cardStyles[typeCode];
  return {
    ...type,
    typeCode,
    typeName: type.name,
    shortTagline,
    axesLabels: axes.map(({ codes, labels }, index) => labels[codes.indexOf(typeCode[index])]),
    cardTheme,
    backgroundColor,
    accentColor,
    motif,
    strengths: type.strength,
    studyTip: type.tip,
  };
}

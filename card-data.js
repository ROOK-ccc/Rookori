// 色、駒、背景の模様とキャッチコピーをタイプごとに調整できます。
const cardStyles = {
  ATCI: { color: '#ea654f', motif: 'knight', pattern: 'rays', finish: 'gold', angle: -0.09, tagline: 'ひらめいた一手で、火をつける。' },
  ATCD: { color: '#dd913c', motif: 'queen', pattern: 'lattice', finish: 'gold', angle: 0.03, tagline: '読み切った瞬間、攻めに出る。' },
  ATLI: { color: '#f3bf4a', motif: 'knight', pattern: 'streaks', finish: 'silver', angle: -0.16, tagline: '好機が見えたら、風より速く。' },
  ATLD: { color: '#e35182', motif: 'bishop', pattern: 'rings', finish: 'copper', angle: 0.04, tagline: '狙いはひとつ。手順は確かに。' },
  APCI: { color: '#b476f0', motif: 'knight', pattern: 'rings', finish: 'copper', angle: 0.11, tagline: '思いがけない場所から仕掛ける。' },
  APCD: { color: '#8581f8', motif: 'queen', pattern: 'lattice', finish: 'silver', angle: -0.04, tagline: '駒をつなぎ、攻めの形を描く。' },
  APLI: { color: '#56dbcf', motif: 'pawn', pattern: 'streaks', finish: 'gold', angle: -0.10, tagline: '先に動いて、流れをつくる。' },
  APLD: { color: '#c5a462', motif: 'king', pattern: 'arches', finish: 'gold', angle: 0, tagline: '目標を定め、駒を集める。' },
  STCI: { color: '#c071cc', motif: 'bishop', pattern: 'rays', finish: 'silver', angle: 0.12, tagline: '相手の仕掛けを、切り返す。' },
  STCD: { color: '#5c9af0', motif: 'queen', pattern: 'rings', finish: 'silver', angle: 0.02, tagline: '相手の狙いを読み、反撃へ。' },
  STLI: { color: '#aac4da', motif: 'knight', pattern: 'arches', finish: 'silver', angle: 0.07, tagline: '形を保ち、隙を逃さない。' },
  STLD: { color: '#8496b6', motif: 'rook', pattern: 'lattice', finish: 'silver', angle: 0, tagline: '守りを固め、好機を待つ。' },
  SPCI: { color: '#79c68a', motif: 'bishop', pattern: 'rings', finish: 'gold', angle: -0.08, tagline: '選択肢を残し、流れに合わせる。' },
  SPCD: { color: '#43ab7b', motif: 'king', pattern: 'lattice', finish: 'copper', angle: 0.02, tagline: '先を読み、相手の道を狭める。' },
  SPLI: { color: '#a6b96a', motif: 'pawn', pattern: 'arches', finish: 'copper', angle: -0.04, tagline: 'いつもの形を、一手ずつ磨く。' },
  SPLD: { color: '#53b5a9', motif: 'rook', pattern: 'arches', finish: 'gold', angle: 0.01, tagline: '崩れにくい形を、じっくり築く。' },
};

function getCardData(typeCode) {
  return {
    ...cardStyles[typeCode],
    typeCode,
    typeName: types[typeCode].name,
    traits: axes.map(({ codes, labels }, index) => ({
      letter: typeCode[index],
      label: labels[codes.indexOf(typeCode[index])],
    })),
  };
}

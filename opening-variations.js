const sicilianPrefix = 'e2e4 c7c5 g1f3';
const sicilianOpen = 'd2d4 c5d4 f3d4';
const sicilianMoves = {
  e2e4: '白はキング前のポーンを進め、中央に足場を作ります。',
  c7c5: '黒はcポーンで横からd4を押さえ、中央を争います。',
  g1f3: '白はナイトを出し、dポーンを交換したときに取り返せるようにします。',
  d7d6: '黒はdポーンを控えめに進め、e5を支える準備をします。',
  b8c6: '黒はナイトを出し、中央のd4とe5に利かせます。',
  d2d4: '白はdポーンをぶつけて中央の交換を仕掛けます。',
  c5d4: '黒はcポーンで白のdポーンを取り、c列を使う準備をします。',
  f3d4: '白はナイトで取り返し、中央に駒を置きます。',
  g8f6: '黒はナイトを展開し、白のe4のポーンを攻撃します。',
  b1c3: '白はもう一方のナイトを出し、e4のポーンを守ります。',
};

const sicilianThinking = {
  e2e4: '盤の中央に足場を作ってから、駒を出す準備をしましょう。',
  c7c5: '白の中央に、横から働きかけることを考えましょう。',
  g1f3: '駒を展開して、あとで中央のポーンを交換できるようにしましょう。',
  d7d6: '中央の手前を支え、白の駒が入りにくくなるようにしましょう。',
  b8c6: '駒を新しく出して、盤の中央に利かせましょう。',
  d2d4: 'ポーンの交換を使い、中央へ駒を進める機会を作りましょう。',
  c5d4: '白が差し出した中央のポーンを取り、列を使える形にしましょう。',
  f3d4: '中央で取り返し、相手の陣地に届きやすい位置に駒を置きましょう。',
  g8f6: '駒を出すと同時に、白の中央のポーンを攻撃しましょう。',
  b1c3: '攻撃された中央のポーンを、別の駒を出しながら守りましょう。',
  a7a6: '白の駒がクイーン側に飛び込めるマスを押さえましょう。',
  g7g6: 'キング側から、盤を横切る斜めの線を使う準備をしましょう。',
  e7e5: '中央に進出しながら、白が中央に出した駒に圧力をかけましょう。',
  e7e6: 'すでにあるポーンと並べて、中央を支える形を作りましょう。',
  c2c3: '次の手で中央にポーンを並べられるよう、横から支えましょう。',
};

const sicilianEco = {
  najdorf: 'B90', dragon: 'B70', classical: 'B56', alapin: 'B22',
  'accelerated-dragon': 'B32', sveshnikov: 'B33', scheveningen: 'B80', closed: 'B23',
};

function sicilianVariation(id, name, english, slot, line, lastNote, description, white, black, pawns, weakness, mistake) {
  const moves = line.split(' ');
  return {
    id: `sicilian-${id}`, parentId: 'sicilian-defense', name, english, slot, moves,
    tip: description, description, white, black, pawns, weakness, mistake, eco: sicilianEco[id],
    branchPly: moves.length, source: expandedOpeningSource,
    explanations: moves.map((move, index) => index === moves.length - 1 ? lastNote : sicilianMoves[move]),
    thinkingHints: moves.map(move => id === 'closed' && move === 'b1c3'
      ? '中央のポーンはそのままにして、別の駒を出す準備をしましょう。'
      : sicilianThinking[move]),
  };
}

const openingVariations = [
  sicilianVariation('najdorf', 'ナイドルフ・バリエーション', 'Najdorf Variation', 'blackE4',
    `${sicilianPrefix} d7d6 ${sicilianOpen} g8f6 b1c3 a7a6`,
    '黒はaポーンでb5を押さえ、あとでbポーンを進める準備をします。',
    '黒が…a6で白のナイトの飛び込みを防ぎ、白の駒組みを見て作戦を選ぶ形です。',
    'ビショップを出し、黒の中央の形を見て攻め方を選びます。',
    '…e5や…e6を選び、機会があれば…b5で反撃します。',
    '黒のcポーンと白のdポーンを交換したあと、黒のa6がb5を支えます。',
    '…e5を選ぶと、黒のポーンでは守りにくいd5が生まれます。',
    '…a6のあと、キングの安全を整える前に…b5を急ぎすぎること。'),
  sicilianVariation('dragon', 'ドラゴン・バリエーション', 'Dragon Variation', 'blackE4',
    `${sicilianPrefix} d7d6 ${sicilianOpen} g8f6 b1c3 g7g6`,
    '黒はg7を空け、ビショップを長い斜めの線で働かせる準備をします。',
    '黒ビショップをg7に置き、盤を横切る斜めの線を使う形です。',
    '中央を支えながら駒を出し、黒のキング側を攻める機会を探します。',
    '…Bg7でビショップを展開し、c列にもルークを置いて反撃します。',
    '黒はd6・g6にポーンを置き、c列に黒のポーンがありません。',
    '白にキング側のポーンを進められると、g6付近が攻められます。',
    '…g6を指したあと、ビショップの展開やキングの安全を後回しにすること。'),
  sicilianVariation('classical', 'クラシカル・バリエーション', 'Classical Variation', 'blackE4',
    `${sicilianPrefix} b8c6 ${sicilianOpen} g8f6 b1c3 d7d6`,
    '黒は両方のナイトを出したあと、d6にポーンを置いて中央を支えます。',
    '黒が両方のナイトを自然に展開し、白の次の手を見てビショップの置き場を決める形です。',
    'ビショップを出し、黒のナイトや中央に圧力をかけます。',
    'ビショップを展開してキングを守り、中央の反撃を準備します。',
    '黒のd6のポーンがe5を押さえます。黒のポーンがなくなったc列はルークで使いやすくなります。',
    '白のビショップがg5に出ると、f6のナイトがクイーンの前で動きにくくなります。',
    'ナイトを出しただけで満足し、ビショップやキングの準備が遅れること。'),
  sicilianVariation('alapin', 'アラピン・バリエーション', 'Alapin Variation', 'white',
    'e2e4 c7c5 c2c3',
    '白はcポーンでd4を支え、中央にポーンを並べる準備をします。',
    '白が2.c3を選び、次のd4で中央を広く使おうとする対抗策です。',
    'd4と進め、e4とd4のポーンで中央を取る機会をうかがいます。',
    '…d5をぶつけるか、…Nf6でe4を攻撃して白の中央に対抗します。',
    '白のc3のポーンがd4を支え、交換後に中央へ出ることもあります。',
    '白のc3にはクイーン側のナイトを出せず、黒からe4を狙われることがあります。',
    '黒の反撃を見ずに毎回同じ順番でd4を指すこと。'),
  sicilianVariation('accelerated-dragon', 'アクセラレーテッド・ドラゴン', 'Accelerated Dragon', 'blackE4',
    `${sicilianPrefix} b8c6 ${sicilianOpen} g7g6`,
    '黒はdポーンをまだ動かさずにg7を空け、…d5を一手で指す可能性を残します。',
    '黒が…d6を保留してビショップの展開を急ぎ、中央の…d5を狙う形です。',
    'c4でd5を押さえ、黒の中央反撃を抑える形も選べます。',
    '…Bg7と展開し、白の駒組みに応じて…d5を準備します。',
    '黒のdポーンはd7に残り、白はe4とc4でd5を挟む形にできます。',
    '白にc4でd5を強く押さえられると、黒は中央で動きにくくなります。',
    '…d5を指せる局面か、取り返した後の形を確かめずに進めること。'),
  sicilianVariation('sveshnikov', 'スヴェシニコフ・バリエーション', 'Sveshnikov Variation', 'blackE4',
    `${sicilianPrefix} b8c6 ${sicilianOpen} g8f6 b1c3 e7e5`,
    '黒は…e5で白のナイトを追い、中央で駒が動く機会を作ります。',
    '黒が…e5で中央に進出し、d5をポーンで守れなくなる代わりに活発な駒の動きを狙います。',
    'd5に駒を置ける形を目指し、ときにナイトをb5へ進めて圧力をかけます。',
    '白のナイトに圧力をかけつつ、展開を進めて弱点を補います。',
    '黒のe5と白のe4が向かい合い、黒のcポーンは交換されています。',
    '黒のd5はポーンで追い払いにくく、d6のポーンも標的になり得ます。',
    '白のナイトを追ったあと、d5に別の白駒が入る可能性を見落とすこと。'),
  sicilianVariation('scheveningen', 'シェベニンゲン・バリエーション', 'Scheveningen Variation', 'blackE4',
    `${sicilianPrefix} d7d6 ${sicilianOpen} g8f6 b1c3 e7e6`,
    '黒はe6にポーンを置き、d6と並べて中央のd5・e5を押さえます。',
    '黒がd6とe6のポーンで中央を支え、進める時機を見て反撃する形です。',
    '駒を展開し、黒が中央を動かす前にキング側で攻める機会を探します。',
    'キングを安全にし、…d5や…b5で反撃する機会を待ちます。',
    '黒のd6・e6のポーンが並び、中央の手前を押さえます。',
    '白が早くgポーンを進めると、f6のナイトが追われることがあります。',
    '中央のポーンを前へ出す前に、その後の交換を考えないこと。'),
  sicilianVariation('closed', 'クローズド・シシリアン', 'Closed Sicilian', 'white',
    'e2e4 c7c5 b1c3',
    '白はナイトを出します。早いd4の交換を見送り、駒を整えてから戦う形の入口です。',
    '白が早いd4を見送り、駒を整えてから攻める形です。2.Nc3から別の形に移ることもあります。',
    'g3からビショップをg2に出し、必要に応じてfポーンを使います。',
    '早めに駒を展開し、クイーン側や中央から白の準備に対抗します。',
    '白のe4と黒のc5が残り、すぐに中央の交換が起きにくい形です。',
    '白がキング周りのポーンを進めすぎると、自分のキングも攻められます。',
    '駒を出す前にfポーンやgポーンだけで攻めを始めること。'),
  ...expandedVariations,
];

const studyOpenings = [...openings, ...expandedOpenings];

function findStudyOpening(id) {
  return studyOpenings.find(opening => opening.id === id) ?? openingVariations.find(variation => variation.id === id);
}

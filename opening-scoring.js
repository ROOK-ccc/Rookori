// 質問ごとに、A・B・Cの希望値（1〜5）と、その回答に対応する推薦理由を設定します。
// Q1とQ4は重みを大きくし、難しさの上限にも使います。
const openingPreferences = [
  { weight: 4, choices: [
    [{ complexity: 1, clarity: 5, burden: 1 }, '始めたばかりでも駒の出し方や狙いをつかみやすい戦法を選びました。'],
    [{ complexity: 3, clarity: 4, burden: 3 }, '対局の経験を活かして、基本の形から一歩進める戦法を選びました。'],
    [{ complexity: 4, clarity: 3, burden: 4 }, '日常的に対局しているので、局面に応じた判断を練習できる戦法を選びました。'],
  ] },
  { weight: 3, choices: [
    [{ attack: 5 }, '積極的に攻めたいという回答に合うよう、攻めの機会を作りやすい戦法を選びました。'],
    [{ attack: 1 }, '安全を重視するという回答に合うよう、堅実に形を作りやすい戦法を選びました。'],
    [{ attack: 3, flexibility: 5 }, '相手に合わせて戦いたいという回答に合うよう、展開に応じて方針を選べる戦法を選びました。'],
  ] },
  { weight: 2, choices: [
    [{ tactics: 5 }, '一手で流れを変える勝ち方が好みなので、駒の動きを組み合わせる機会がある戦法を選びました。'],
    [{ tactics: 1 }, '少しずつ有利にしたいという回答に合うよう、長期的な計画を立てやすい戦法を選びました。'],
    [{ attack: 3, tactics: 4, flexibility: 5 }, '反撃する勝ち方が好みなので、相手の出方を見てチャンスを探る戦法を選びました。'],
  ] },
  { weight: 5, choices: [
    [{ theory: 1, burden: 1, clarity: 5 }, '少ない手順で始めたいという回答に合うよう、覚える負担が軽めの戦法を選びました。'],
    [{ theory: 3, burden: 3, clarity: 4 }, 'ある程度の手順を覚えられるという回答から、基本形を押さえて変化も学べる戦法を選びました。'],
    [{ theory: 5, burden: 5, complexity: 5 }, '奥の深い作戦を学びたいという回答から、覚えがいのある戦法を選びました。'],
  ] },
  { weight: 2, choices: [
    [{ flexibility: 1, clarity: 5 }, '予想外の手にも基本方針を守りたいという回答から、狙いを覚えやすい戦法を選びました。'],
    [{ flexibility: 4 }, '状況を見て作戦を変えたいという回答から、相手の手に合わせて対処できる戦法を選びました。'],
    [{ flexibility: 5, complexity: 4 }, '予想外の展開も楽しみたいという回答から、状況ごとの判断を練習できる戦法を選びました。'],
  ] },
  { weight: 3, choices: [
    [{ attack: 5, tactics: 5 }, '序盤から勝負が動く展開が好きという回答に合うよう、早めに局面を動かせる戦法を選びました。'],
    [{ attack: 1, tactics: 1 }, '準備してから勝負したいという回答に合うよう、駒を整えて計画を立てやすい戦法を選びました。'],
    [{ flexibility: 5 }, '展開が大きく変わる対局が好きという回答から、相手の応手で作戦が広がる戦法を選びました。'],
  ] },
  { weight: 2, choices: [
    [{ clarity: 5, burden: 1 }, '実際の対局で使いやすいことを重視するという回答から、基本を覚えやすい戦法を選びました。'],
    [{ flexibility: 4, clarity: 4 }, '長く使い続けたいという回答から、基本を覚えたあとも応用できる戦法を選びました。'],
    [{ originality: 5 }, '個性的な作戦を使いたいという回答に合うよう、特徴のある駒の出し方をする戦法を選びました。'],
  ] },
  { weight: 3, choices: [
    [{ tactics: 5 }, '相手の隙を見つける力を伸ばしたいという回答から、駒の組み合わせでチャンスを探す戦法を選びました。'],
    [{ tactics: 1 }, '計画を立てる力を伸ばしたいという回答から、数手先を考えて駒を整える戦法を選びました。'],
    [{ flexibility: 5 }, '対応力を伸ばしたいという回答から、相手の手を見て計画を調整する戦法を選びました。'],
  ] },
];

function scoreOpenings(answers) {
  if (answers.length !== openingPreferences.length
      || !openingPreferences.every(({ choices }, index) => (
        Number.isInteger(answers[index]) && answers[index] >= 0 && answers[index] < choices.length
      ))) {
    throw new Error('オープニング診断の全問の回答が必要です。');
  }

  const preferences = openingPreferences.map(({ weight, choices }, index) => {
    const [targets, reason] = choices[answers[index]];
    return { weight, targets: Object.entries(targets), reason };
  });
  // 経験（Q1）と覚えたい手順の量（Q4）のうち、控えめな方を上限にする。
  const limit = 3 + Math.min(answers[0], answers[3]);
  const ranked = openings
    .filter(({ traits }) => Math.max(traits.complexity, traits.burden) <= limit)
    .map((candidate) => {
      const matches = preferences.map(({ weight, targets, reason }) => {
        const difference = targets.reduce((total, [trait, target]) => (
          total + Math.abs(candidate.traits[trait] - target)
        ), 0);
        // 特徴が1〜3個の質問の平均差を、最小公倍数の6を掛けて整数で表す。
        const distance = difference * (6 / targets.length);
        return { distance, weight, reason };
      });
      const distance = matches.reduce((total, match) => total + match.distance * match.weight, 0);
      // 候補と最も近かった回答を表示。同程度なら質問の重み、次に出題順を優先。
      const { reason } = matches.sort((a, b) => a.distance - b.distance || b.weight - a.weight)[0];
      return { candidate, distance, reason };
    })
    // 同点なら学習負担、複雑さが小さい順。さらに同じならIDの辞書順。
    .sort((a, b) => a.distance - b.distance
      || a.candidate.traits.burden - b.candidate.traits.burden
      || a.candidate.traits.complexity - b.candidate.traits.complexity
      || a.candidate.id.localeCompare(b.candidate.id, 'en'));

  return Object.keys(openingSlots).map((slot) => ranked.find(({ candidate }) => candidate.slot === slot));
}

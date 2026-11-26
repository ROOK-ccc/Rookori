// Names, ECO identifiers and representative move orders checked against
// https://github.com/lichess-org/chess-openings (CC0 1.0). Japanese lessons are original.
const expandedOpeningSource = 'https://github.com/lichess-org/chess-openings';
const expandedOpeningAnchors = {
  'danish-gambit': 5, 'center-game': 5, 'latvian-gambit': 4, 'bishops-opening': 3,
  'alekhine-defense': 2, 'ponziani-opening': 5, 'philidor-defense': 4, 'two-knights-defense': 6,
  'three-knights-game': 5, 'giuoco-piano': 6, 'evans-gambit': 7, 'vienna-game': 3,
  'nimzowitsch-defense': 2, 'queens-gambit-accepted': 4, 'albin-countergambit': 4,
  'chigorin-defense': 4, 'budapest-gambit': 4, 'benoni-defense': 4, 'bogo-indian': 6,
  'birds-opening': 1, 'larsen-opening': 1, 'sokolsky-opening': 1, 'benko-gambit': 6,
};
const openingFamilies = {
  open: 'オープンゲーム（1.e4 e5）', semi: 'セミオープン（1.e4へのその他の応手）',
  queen: 'クイーンズポーン系', indian: 'インディアン系', flank: 'フランク・その他',
};

// id | recommended side (w/e/d) | ECO | Japanese | English | SAN | plans for White and Black | aliases
const expandedOpeningRows = `kings-gambit|w|C30|キングズ・ギャンビット|King's Gambit|e4 e5 f4|f4でe5を揺さぶり、f列を開く機会を作る|黒はf4を取るか、d5で中央に反撃する
danish-gambit|w|C21|ダニッシュ・ギャンビット|Danish Gambit|e4 e5 d4 exd4 c3 dxc3 Bc4|cポーンを差し出してBc4からf7を狙う|黒はポーンを取った後、d5で中央を開いて展開を急ぐ
center-game|w|C22|センター・ゲーム|Center Game|e4 e5 d4 exd4 Qxd4 Nc6 Qe3|Qxd4で中央のポーンを取り返す|黒はNc6でクイーンを攻撃しながら駒を出す
latvian-gambit|e|C40|ラトビアン・ギャンビット|Latvian Gambit|e4 e5 Nf3 f5 Nxe5 Qf6|白はNxe5で中央を取り、クイーンの出方を見る|黒はf5とQf6でe5のナイトに圧力をかける
bishops-opening|w|C24|ビショップ・オープニング|Bishop's Opening|e4 e5 Bc4 Nf6 d3|白はBc4でf7を見ながらd3でe4を支える|黒はNf6でe4を攻撃して駒を出す
petrov-defense|e|C42|ペトロフ・ディフェンス|Petrov's Defense|e4 e5 Nf3 Nf6|白はNf3でe5を狙い、Nxe5かd4を検討する|黒はNf6でe4を狙い返す|ロシアンゲーム/Russian Game/Petroff Defense
alekhine-defense|e|B02|アレキン・ディフェンス|Alekhine Defense|e4 Nf6 e5 Nd5|白はe5で黒ナイトを追い、d4で中央を支える|黒はNd5から白の前進を誘い、d6でe5を揺さぶる
ponziani-opening|w|C44|ポンチアニ・オープニング|Ponziani Opening|e4 e5 Nf3 Nc6 c3 d5 Qa4|白はc3でd4を準備し、Qa4でc6のナイトに圧力をかける|黒は早いd5で白が中央に並ぶ前に反撃する|ボンチアン/ポンジアニ
philidor-defense|e|C41|フィリドール・ディフェンス|Philidor Defense|e4 e5 Nf3 d6 d4 Nf6|白はd4でe5を攻める|黒はd6でe5を支え、Nf6から駒を出す
two-knights-defense|e|C55|ツー・ナイツ・ディフェンス|Two Knights Defense|e4 e5 Nf3 Nc6 Bc4 Nf6 d3|白はBc4でf7を見ながらd3でe4を守る|黒は二つのナイトをc6とf6に出してe4に圧力をかける
three-knights-game|w|C46|スリー・ナイツ・ゲーム|Three Knights Game|e4 e5 Nf3 Nc6 Nc3 Bc5|白は二つのナイトで中央を支える|黒は四つ目のナイトより先にBc5でf2に利かせる
four-knights-game|w|C47|フォー・ナイツ・ゲーム|Four Knights Game|e4 e5 Nf3 Nc6 Nc3 Nf6|白はNc3でe4を支え、Bb5やd4を検討する|黒はNf6を出して中央の対称形を作る
giuoco-piano|w|C53|ジオコ・ピアノ|Giuoco Piano|e4 e5 Nf3 Nc6 Bc4 Bc5 c3|白はc3でd4を準備する|黒はBc5でf2に利かせ、展開と中央の反撃を両立する|Giuoco Piano, Classical Variation
evans-gambit|w|C52|エバンス・ギャンビット|Evans Gambit|e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Ba5 d4|白はbポーンと引き換えにc3とd4を指す時間を得る|黒はBa5へ引いた後、白の中央にどう反撃するか考える
vienna-game|w|C26|ビエナ・ゲーム|Vienna Game|e4 e5 Nc3 Nf6 Bc4|白はNc3からe4を守り、Bc4をf7に向ける|黒はNf6から中央を争い、d5の機会をうかがう
nimzowitsch-defense|e|B00|ニムゾビッチ・ディフェンス|Nimzowitsch Defense|e4 Nc6 d4 d5|白はd4でポーンを中央に並べる|黒はNc6の支えでd5を突く
queens-gambit-accepted|d|D20|クイーンズ・ギャンビット・アクセプテッド|Queen's Gambit Accepted|d4 d5 c4 dxc4 e3 Nf6 Bxc4|白はe3からビショップでc4を取り返す|黒はc4に固執せず、Nf6から展開する
albin-countergambit|d|D08|アルビン・カウンターギャンビット|Albin Countergambit|d4 d5 c4 e5 dxe5 d4|白はdxe5でポーンを取るがd4の前進を受ける|黒はd4にポーンを置き、白の展開に干渉する
chigorin-defense|d|D07|チゴリン・ディフェンス|Chigorin Defense|d4 d5 c4 Nc6 Nf3 Bg4|白はNf3を出し、c4とd4で中央を争う|黒はNc6とBg4で白のd4を支えるナイトに働きかける
budapest-gambit|d|A52|ブダペスト・ギャンビット|Budapest Gambit|d4 Nf6 c4 e5 dxe5 Ng4|白はdxe5でポーンを取った後、e5をどう守るか決める|黒はNg4でe5を攻めて取り返す機会を作る
benoni-defense|d|A56|ベノニ・ディフェンス|Benoni Defense|d4 Nf6 c4 c5 d5|白はd5で黒の駒の進路を狭める|黒はe6でd5に働きかけ、クイーン側にも反撃を探す
bogo-indian|d|E11|ボゴ・インディアン・ディフェンス|Bogo-Indian Defense|d4 Nf6 c4 e6 Nf3 Bb4+ Bd2|白はBd2でチェックを受け、展開を進める|黒はBb4+で白に応手を求め、交換か維持を選ぶ
birds-opening|w|A02|バード・オープニング|Bird Opening|f4 Nf6 Nf3|白はf4でe5を押さえ、Nf3からe3を検討する|黒はNf6でe4を見ながら、d5で中央を取る機会を探す|Bird's Opening
larsen-opening|w|A01|ラーセン・オープニング|Nimzo-Larsen Attack|b3 e5 Bb2 Nc6|白はBb2を長い斜めに通してe5を狙う|黒はNc6でe5を支え、d5にポーンを並べる機会を探す|ラーセン・アタック/Larsen Opening
sokolsky-opening|w|A00|ソコルスキー・オープニング|Polish Opening|b4 e5 Bb2 Bxb4 Bxe5|白はb4からBb2を出し、e5を取れる形を作る|黒はBxb4の後に展開を急ぎ、出過ぎた白ビショップに働きかける|オランウータン/Sokolsky Opening
benko-gambit|d|A57|ベンコー・ギャンビット|Benko Gambit|d4 Nf6 c4 c5 d5 b5 cxb5 a6|白はポーンを取るか、中央を優先して受け流す|黒はa6で交換を促し、a列とb列を使う|ヴォルガ・ギャンビット/Volga Gambit`;

// parent ID | id | side | ECO | Japanese | English | SAN | plans for White and Black | defining ply | aliases
const expandedVariationRows = `kings-gambit|kings-gambit-accepted|w|C34|キングズ・ギャンビット・アクセプテッド|King's Gambit Accepted|e4 e5 f4 exf4 Nf3|白はNf3でh4を押さえ、開いたf列を生かす|黒は取ったf4を維持するか中央を固める|4
kings-gambit|kings-gambit-falkbeer|e|C31|ファルクビア・カウンターギャンビット|Falkbeer Countergambit|e4 e5 f4 d5 exd5 e4|白はexd5の後、e4を攻めてNf3の場所を確保する|黒はd5からe4へポーンを進め、白ナイトの展開を妨げる|4
petrov-defense|petrov-classical|e|C42|クラシカル・アタック、チゴリン・バリエーション|Classical Attack, Chigorin Variation|e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4 d4 d5 Bd3 Be7 O-O Nc6 Re1 Bg4 c4 Nf6|白はd4からBd3、Re1、c4で中央に働きかける|黒はd5で中央を支え、Bg4でf3を見た後にナイトをf6へ戻す|15
petrov-defense|petrov-center|e|C43|モダン・アタック、センター・アタック|Modern Attack, Center Attack|e4 e5 Nf3 Nf6 d4 exd4 e5 Ne4 Qxd4 d5 exd6 Nxd6|白はQxd4で中央を回収し、直後にアンパッサンでd6へ取る|黒はNe4を経由してd6のポーンをナイトで取り返す|9
alekhine-defense|alekhine-four-pawns|e|B03|フォー・ポーンズ・アタック|Four Pawns Attack|e4 Nf6 e5 Nd5 d4 d6 c4 Nb6 f4|白はc4・d4・e5・f4の四つのポーンで空間を取る|黒はd6を使って白のe5を攻め、進みすぎたポーンに反撃する|9
pirc-defense|pirc-quiet-czech|e|B08|クラシカル、クワイエット・システム（…c6から…Nbd7）|Classical Variation, Quiet System, Czech Defense line|e4 d6 d4 g6 Nc3 Nf6 Nf3 Bg7 Be2 O-O O-O c6 a4 Nbd7|白はBe2とキャスリングで固め、a4で黒のb5を牽制する|黒はBg7、c6、Nbd7で中央を支え、e5やb5の機会を待つ|12
pirc-defense|pirc-byrne|w|B07|バーン・バリエーション|Byrne Variation|e4 d6 d4 g6 Nc3 Nf6 Bg5 Bg7 Qd2 c6 f4 O-O|白はBg5でf6に働きかけ、Qd2とf4を組み合わせる|黒はBg7とキャスリングを済ませ、c6から中央を支える|7
pirc-defense|pirc-weiss|w|B09|オーストリアン・アタック、ワイス・バリエーション|Austrian Attack, Weiss Variation|e4 d6 d4 Nf6 Nc3 g6 f4 Bg7 Nf3 O-O Bd3|白はf4でe5を支え、Bd3をh7方向に向ける|黒はBg7を展開して先にキングを守り、c5などで中央を崩す|11
ruy-lopez|ruy-bird|e|C61|バード・ディフェンス|Bird Variation|e4 e5 Nf3 Nc6 Bb5 Nd4 Nxd4 exd4|白はNxd4で黒ナイトを交換し、残るd4のポーンに対処する|黒はNd4でb5を攻撃し、交換後はd4に足場を作る|6
ruy-lopez|ruy-berlin|e|C65|ベルリン・ディフェンス|Berlin Defense|e4 e5 Nf3 Nc6 Bb5 Nf6 O-O|白は早めにキャスリングし、e4を取られた場合にd4で反撃する|黒はNf6でe4を狙い、白の中央の支え方を見る|6
ruy-lopez|ruy-classical|e|C64|クラシカル・ディフェンス|Classical Variation|e4 e5 Nf3 Nc6 Bb5 Bc5 c3|白はc3からd4を準備してc5のビショップに当てる|黒はBc5でf2に利かせ、中央で押し返す機会を探す|6
ruy-lopez|ruy-steinitz|e|C62|シュタイニッツ・ディフェンス|Steinitz Defense|e4 e5 Nf3 Nc6 Bb5 d6 d4|白はd4を指して黒のe5を攻める|黒はd6でe5を固め、Bd7などでナイト周辺の圧力を解く|6
ruy-lopez|ruy-schliemann|e|C63|シュリーマン・ディフェンス|Schliemann Defense|e4 e5 Nf3 Nc6 Bb5 f5 Nc3|白はNc3でe4を守り、黒のfポーン交換に備える|黒はf5でe4に当たり、中央付近を早く開こうとする|6|イェーニッシュ・ギャンビット/Jaenisch Gambit
ruy-lopez|ruy-exchange|w|C68|エクスチェンジ・バリエーション|Exchange Variation|e4 e5 Nf3 Nc6 Bb5 a6 Bxc6 dxc6|白はBxc6で黒のポーン構造を変え、キング側の多数派を生かす|黒はdxc6で取り返し、二つのビショップの利きを生かす|7
ruy-lopez|ruy-open|e|C80|オープン・バリエーション|Open Ruy Lopez|e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Nxe4 d4 b5 Bb3 d5 dxe5 Be6|白はd4で中央を開き、e5に進んで黒のf6付近を圧迫する|黒はNxe4でポーンを取り、d5とBe6で中央の駒を支える|10
ruy-lopez|ruy-marshall|e|C89|マーシャル・アタック|Marshall Attack|e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 O-O c3 d5 exd5 Nxd5 Nxe5 Nxe5 Rxe5 c6|白は交換後、e5のルークとキングの安全を考える|黒はd5で開き、ポーンと引き換えに駒の活動を得る|16
ruy-lopez|ruy-closed|e|C88|クローズド・バリエーション|Closed Ruy Lopez|e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6|白はRe1でe4を守り、c3とd4を準備する|黒はd6とBe7でe5を支え、キングを安全にする|10
caro-kann|caro-kann-main|e|B18|クラシカル・メインライン|Classical Variation|e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5|白はNxe4で取り返し、黒ビショップの進路を見て展開する|黒はBf5をポーンの外へ出してからe6を指す|8
caro-kann|caro-kann-panov|w|B13|パノフ・ボトヴィニク・アタック|Panov–Botvinnik Attack|e4 c6 d4 d5 exd5 cxd5 c4 Nf6 Nc3|白はc4でd5に圧力をかけて駒の活動を得る|黒はNf6でd5を支え、白の孤立しやすいdポーンを狙う|7
french-defense|french-classical|e|C11|クラシカル・バリエーション|Classical Variation|e4 e6 d4 d5 Nc3 Nf6|白はNc3でe4を支え、Bg5かe5を検討する|黒はNf6でe4を攻め、中央の交換を迫る|6
french-defense|french-main|e|C13|クラシカル、バーン・メインライン|Classical Variation, Burn Variation, Main Line|e4 e6 d4 d5 Nc3 Nf6 Bg5 dxe4 Nxe4 Be7 Bxf6 Bxf6 Nf3 O-O|白はBg5でf6に圧力をかけ、交換後はNf3を出す|黒はdxe4で中央を解き、Bxf6とキャスリングで整える|8
french-defense|french-tarrasch|w|C03|タラシュ・バリエーション|Tarrasch Variation|e4 e6 d4 d5 Nd2|白はNd2でe4を支え、cポーンを動かせるままにする|黒はc5などでd4を揺さぶり、白が中央を固める前に反撃する|5
sicilian-defense|sicilian-richter-rauzer|w|B60|リヒター・ラウザー・バリエーション|Richter–Rauzer Variation|e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 Nc6 Bg5|白はBg5でf6に圧力をかけ、Qd2と長いキャスリングも検討する|黒はe6やBd7を選び、d6を守りつつ展開する|11|ラウザー
sicilian-defense|sicilian-kan|e|B41|カン・バリエーション|Kan Variation|e4 c5 Nf3 e6 d4 cxd4 Nxd4 a6|白はNc3かc4を選び、黒のb5を意識する|黒はa6でb5を用意し、b8のナイトを出す場所を保留する|8|ポウルセン・カン
queens-gambit-declined|qgd-orthodox|d|D60|オーソドックス・ディフェンス|Orthodox Defense|d4 Nf6 c4 e6 Nf3 d5 Nc3 Be7 Bg5 O-O e3 Nbd7|白はBg5でf6に圧力をかけ、c列にルークを置く機会を探す|黒はBe7とNbd7で守り、c5かe5で反撃する機会を待つ|12
queens-gambit-declined|qgd-tartakower|d|D58|タルタコワー・ディフェンス|Tartakower Defense|d4 Nf6 c4 e6 Nf3 d5 Nc3 Be7 Bg5 h6 Bh4 O-O e3 b6|白はcxd5の交換方法を見てc列の使い方を考える|黒はb6でc8のビショップをb7へ出す道を作る|14|ボンダレフスキー/タルタコワー・マコゴノフ・ボンダレフスキー/Tartakower–Makogonov–Bondarevsky
queens-gambit-declined|qgd-cambridge|d|D52|ケンブリッジ・スプリングス・ディフェンス|Cambridge Springs Defense|d4 d5 c4 e6 Nc3 Nf6 Bg5 Nbd7 e3 c6 Nf3 Qa5|白はc3のナイトとg5のビショップが同時に狙われないよう注意する|黒はQa5でc3をピンし、Bb4やNe4を組み合わせる|12
queens-gambit-declined|qgd-tarrasch|d|D32|タラシュ・ディフェンス|Tarrasch Defense|d4 d5 c4 e6 Nc3 c5 cxd5 exd5|白はcxd5の交換で孤立しやすいd5を狙う|黒はc5で中央を開き、孤立ポーンと引き換えに活動的な駒を得る|6
queens-gambit-declined|qgd-ragozin|d|D38|ラゴズィン・ディフェンス|Ragozin Defense|d4 Nf6 c4 e6 Nf3 d5 Nc3 Bb4|白はc3のナイトが動きにくい点を考えて展開する|黒はBb4でc3をピンし、白の中央の支えを弱める|8
queens-gambit-declined|qgd-vienna|d|D39|ビエナ・バリエーション（ラゴズィン系）|Ragozin Defense, Vienna Variation|d4 Nf6 c4 e6 Nf3 d5 Nc3 Bb4 Bg5 dxc4|白はBg5の後、c4を取り返すかe4を先に指すか考える|黒はc4を取り、Bb4でc3を押さえて白の中央に干渉する|10
dutch-defense|dutch-main|d|A81|ダッチ・メインライン（2.g3）|Dutch Defense, 2.g3|d4 f5 g3 Nf6 Bg2|白はg3とBg2で長い斜めから中央に利かせる|黒はf5とNf6でe4を押さえ、次の駒組みを選ぶ|3
dutch-defense|dutch-staunton|w|A83|スタウトン・ギャンビット|Staunton Gambit|d4 f5 e4 fxe4 Nc3 Nf6 Bg5|白はe4を差し出し、Nc3とBg5で黒の中央に圧力をかける|黒はfxe4の後、Nf6でe4を支えながら展開を急ぐ|3
kings-indian|kid-classical|d|E91|クラシカル・バリエーション|Classical Variation|d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2|白はNf3・Be2を出し、e4とd4を維持する|黒は先にキャスリングしてからe5で中央を争う|9
kings-indian|kid-samisch|w|E80|ゼーミッシュ・バリエーション|Sämisch Variation|d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 f3|白はf3でe4を支え、Be3やQd2を考える|黒はキャスリングを済ませ、e5かc5で白の中心に当てる|9
kings-indian|kid-fianchetto|w|E60|フィアンケット・バリエーション|Fianchetto Variation|d4 Nf6 c4 g6 Nf3 Bg7 g3 O-O Bg2 d6 Nc3|白はBg2で長い斜めからd5に働きかける|黒もBg7を使い、e5やc5で中央の形を変える|9
nimzo-indian|nimzo-samisch|w|E24|ゼーミッシュ・バリエーション|Sämisch Variation|d4 Nf6 c4 e6 Nc3 Bb4 a3 Bxc3+ bxc3|白はa3で交換を迫り、二つのビショップを得る|黒はBxc3+で白のcポーンを重ね、c4を狙う|7
nimzo-indian|nimzo-rubinstein|d|E47|ルビンスタイン・バリエーション（4.e3）|Rubinstein Variation|d4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Bd3|白はe3とBd3でキング側を整え、Nf3を準備する|黒はキャスリングからd5かc5で中央を争う|7
nimzo-indian|nimzo-leningrad|w|E30|レニングラード・バリエーション|Leningrad Variation|d4 Nf6 c4 e6 Nc3 Bb4 Bg5 h6 Bh4|白はBg5でf6に利かせ、黒のピンにピンで応じる|黒はh6でビショップを問い、c5からd4を狙う|7
grunfeld-defense|grunfeld-main|d|D85|エクスチェンジ・バリエーション（基本のメインライン）|Exchange Variation|d4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5 e4 Nxc3 bxc3 Bg7|白はe4とd4で広い中央を作る|黒はBg7でd4に利かせ、c5で中央を攻める|7
grunfeld-defense|grunfeld-smyslov|d|D98|ロシアン、スミスロフ・バリエーション|Russian Variation, Smyslov Variation|d4 Nf6 c4 g6 Nc3 d5 Nf3 Bg7 Qb3 dxc4 Qxc4 O-O e4 Bg4|白はQb3でd5とb7を狙い、e4で中央を固める|黒はBg4でf3をピンし、白のd4の支えに働きかける|14
benoni-defense|benoni-main|d|A73|クラシカル・メインライン|Classical Variation, Main Line|d4 Nf6 c4 c5 d5 e6 Nc3 exd5 cxd5 d6 e4 g6 Nf3 Bg7 Be2 O-O O-O|白はd5・e4で空間を取り、Be2とキャスリングで整える|黒はBg7を通し、a6からb5やRe8からe4を狙う|15
benoni-defense|benoni-fianchetto|w|A61|フィアンケット・バリエーション|Fianchetto Variation|d4 Nf6 c4 e6 Nf3 c5 d5 exd5 cxd5 d6 Nc3 g6 g3|白はg3からBg2を出してd5の足場を支える|黒はBg7を出し、クイーン側のb5を準備する|13
birds-opening|bird-main|w|A03|バード・メインライン（1...d5）|Bird Opening, 1...d5|f4 d5 Nf3 Nf6 e3|白はNf3とe3を加えe5への利きを増やす|黒はNf6から駒を出し、c5などで中央を争う|2
birds-opening|bird-from|d|A02|フロム・ギャンビット|From Gambit|f4 e5 fxe5 d6 exd6 Bxd6|白はポーンを取った後、Nf3などでh4を守る|黒はBxd6で展開し、白キング側に利きを集める|2`;

function expandedOpeningLesson(row, variation = false) {
  const fields = row.split('|');
  const parentId = variation ? fields.shift() : undefined;
  const [id, side, eco, name, english, notation, white, black, extra, variantAliases] = fields;
  const aliases = ((variation ? variantAliases : extra) ?? '').split('/').filter(Boolean);
  const board = new chessRules.Chess();
  const history = notation.split(' ').map(san => board.move(san, { strict: true }));
  const branchPly = variation ? Number(extra) : expandedOpeningAnchors[id] ?? history.length;
  const pieceNames = { p: 'ポーン', n: 'ナイト', b: 'ビショップ', r: 'ルーク', q: 'クイーン', k: 'キング' };
  const keyMove = history[branchPly - 1];
  const plan = keyMove.color === 'w' ? white : black;
  const opposingPlan = keyMove.color === 'w' ? black : white;
  const description = `${keyMove.san}が目印です。${plan}のが狙いです。`;
  return {
    id, parentId, name, english, eco, aliases, branchPly, source: expandedOpeningSource,
    slot: { w: 'white', e: 'blackE4', d: 'blackD4' }[side],
    ...(id === 'bird-from' && { slotLabel: '黒番（後手）・対1.f4' }),
    moves: history.map(move => move.lan), description, tip: 'もう一方の狙いも見てみましょう。' + opposingPlan + '。',
    white: white + '。', black: black + '。',
    weakness: '相手側の狙いも確認しましょう。' + opposingPlan + '。',
    placement: ['w', 'b'].map(color => {
      const pieces = board.board().flat().filter(piece => piece?.color === color
        && history.some(move => move.color === color && move.to === piece.square && move.piece === piece.type));
      return (color === 'w' ? '白 ' : '黒 ') + (pieces.map(piece => pieceNames[piece.type] + ' ' + piece.square).join('、') || '配置を維持');
    }).join(' ／ '),
    explanations: history.map((move, index) => {
      const color = move.color === 'w' ? '白' : '黒';
      if (index + 1 === branchPly) return description;
      const action = move.san.startsWith('O-O') ? 'キャスリングでキングとルークを動かす'
        : `${pieceNames[move.piece]}を${move.from}から${move.to}へ${move.captured ? '移して駒を取る' : '動かす'}`;
      return `${color}は${action}手です。${/[+#]$/.test(move.san) ? '相手のキングにチェックがかかります。' : ''}`;
    }),
  };
}

const expandedOpenings = expandedOpeningRows.split('\n').map(row => expandedOpeningLesson(row));
const expandedVariations = expandedVariationRows.split('\n').map(row => expandedOpeningLesson(row, true));

const openingAliases = {
  'ruy-lopez': ['ルイロペス', 'スパニッシュ・オープニング', 'Spanish Opening'],
  'scandinavian-defense': ['センターカウンター', 'センター・カウンター・ディフェンス', 'Center Counter Defense'],
  'pirc-defense': ['ピルク・ディフェンス'],
  'grunfeld-defense': ['グリュエンフェルド・ディフェンス', 'Grunfeld Defense'],
  'slav-defense': ['スラブ・ディフェンス'],
};

function openingFamily(entry) {
  const parent = entry.parentId ? findStudyOpening(entry.parentId) : entry;
  const [first, second] = parent.moves;
  if (first === 'e2e4') return second === 'e7e5' ? 'open' : 'semi';
  if (first === 'd2d4') return second === 'g8f6' ? 'indian' : 'queen';
  return 'flank';
}

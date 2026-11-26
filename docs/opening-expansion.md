# オープニング拡充の照合結果

## A. 実装概要

v4.4.2 から v4.4.3「一手目から、広がる世界。」に更新。定跡データ、対局解説と一覧、学習記録とCPU対戦の定跡選択、公開用ビルド、更新履歴を更新しました。従来の20件を診断候補として使い、新規データは学習一覧・練習用に追加しました。

- データと学習画面 — `opening-expansion.js`、`opening-variations.js`、`opening-study-ui.js`、`learning-ui.js`、`learning-progress-ui.js`、`cpu-game-ui.js`、`app.js`、`index.html`
- ビルド、履歴、報告 — `publish.cjs`、`journey.js`、`README.md`、`docs/opening-expansion.md`
- テスト — `opening-memory.test.cjs`、`game-review.test.cjs`、`learning.test.cjs`、`navigation.test.cjs`、`play-style.test.cjs`、`publish.test.cjs`

## B. 件数

- 調査対象は親42項目と、指定バリエーション49項目です。
- 新規は親26件、バリエーション44件です。
- 親16件とバリエーション3件は既存データを再利用しました。親16件には、既存のスカンジナビアンに別名として対応したセンターカウンターを含みます。
- 公開保留はバリエーション2件です。
- 登録総数は親20件・バリエーション8件の計28件から、親46件・バリエーション52件の計98件になりました。

## C. 全項目の処理結果

ECOは代表手順の分類を掲載しています。既存の親は序盤の基本分類です。オープニング名は、同じ戦法でも駒を出す順や分岐によって資料上の細分類が変わる場合があります。

### オープニング42項目

| 指定名称 | 登録名称 | 英語名称 | 親オープニング | ECO | 処理結果 | 備考 |
|---|---|---|---|---|---|---|
| 01 キングズギャンビット | キングズ・ギャンビット | King's Gambit | — | C30 | 新規登録 | `kings-gambit` |
| 02 ダニッシュギャンビット | ダニッシュ・ギャンビット | Danish Gambit | — | C21 | 新規登録 | `danish-gambit` |
| 03 センターゲーム | センター・ゲーム | Center Game | — | C22 | 新規登録 | `center-game` |
| 04 ラトビアンギャンビット | ラトビアン・ギャンビット | Latvian Gambit | — | C40 | 新規登録 | `latvian-gambit` |
| 05 ビショップオープニング | ビショップ・オープニング | Bishop's Opening | — | C24 | 新規登録 | `bishops-opening` |
| 06 ペトロフディフェンス | ペトロフ・ディフェンス | Petrov's Defense | — | C42 | 新規登録 | `petrov-defense` |
| 07 アレキンディフェンス | アレキン・ディフェンス | Alekhine Defense | — | B02 | 新規登録 | `alekhine-defense` |
| 08 ピルツディフェンス | ピルツ・ディフェンス | Pirc Defense | — | B07 | バリエーションのみ追加 | `pirc-defense` |
| 09 ボンチアン | ポンチアニ・オープニング | Ponziani Opening | — | C44 | 新規登録 | 指定名も検索別名に追加 |
| 10 フィリドールディフェンス | フィリドール・ディフェンス | Philidor Defense | — | C41 | 新規登録 | `philidor-defense` |
| 11 スコッチゲーム | スコッチ・ゲーム | Scotch Game | — | C45 | 既存登録済み | `scotch-game` |
| 12 ツーナイツディフェンス | ツー・ナイツ・ディフェンス | Two Knights Defense | — | C55 | 新規登録 | `two-knights-defense` |
| 13 スリーナイツゲーム | スリー・ナイツ・ゲーム | Three Knights Game | — | C46 | 新規登録 | `three-knights-game` |
| 14 フォーナイツゲーム | フォー・ナイツ・ゲーム | Four Knights Game | — | C47 | 新規登録 | `four-knights-game` |
| 15 ジオコピアノ | ジオコ・ピアノ | Giuoco Piano | — | C53 | 新規登録 | `giuoco-piano` |
| 16 エバンスギャンビット | エバンス・ギャンビット | Evans Gambit | — | C52 | 新規登録 | `evans-gambit` |
| 17 ルイロペス | ルイ・ロペス | Ruy Lopez | — | C60 | バリエーションのみ追加 | `ruy-lopez` |
| 18 センターカウンターディフェンス | スカンジナビアン・ディフェンス | Scandinavian Defense | — | B01 | 別名として対応 | `scandinavian-defense` |
| 19 ビエナゲーム | ビエナ・ゲーム | Vienna Game | — | C26 | 新規登録 | `vienna-game` |
| 20 ニムゾビッチディフェンス | ニムゾビッチ・ディフェンス | Nimzowitsch Defense | — | B00 | 新規登録 | `nimzowitsch-defense` |
| 21 カロカンディフェンス | カロ・カン・ディフェンス | Caro-Kann Defense | — | B12 | バリエーションのみ追加 | `caro-kann` |
| 22 フレンチディフェンス | フレンチ・ディフェンス | French Defense | — | C00 | バリエーションのみ追加 | `french-defense` |
| 23 シシリアンディフェンス | シシリアン・ディフェンス | Sicilian Defense | — | B20 | バリエーションのみ追加 | `sicilian-defense` |
| 24 クイーンズギャンビットアクセプテッド | クイーンズ・ギャンビット・アクセプテッド | Queen's Gambit Accepted | — | D20 | 新規登録 | `queens-gambit-accepted` |
| 25 クイーンズギャンビット | クイーンズ・ギャンビット | Queen's Gambit | — | D06 | バリエーションのみ追加 | 6分岐は既存のディクラインドに配置 |
| 26 スラブディフェンス | スラヴ・ディフェンス系の駒組み | Slav Defense | — | D10 | 既存登録済み | `slav-defense` |
| 27 アルビンカウンターギャンビット | アルビン・カウンターギャンビット | Albin Countergambit | — | D08 | 新規登録 | `albin-countergambit` |
| 28 チゴリンディフェンス | チゴリン・ディフェンス | Chigorin Defense | — | D07 | 新規登録 | `chigorin-defense` |
| 29 ブダペストギャンビット | ブダペスト・ギャンビット | Budapest Gambit | — | A52 | 新規登録 | `budapest-gambit` |
| 30 ダッチディフェンス | ダッチ・ディフェンス | Dutch Defense | — | A80 | バリエーションのみ追加 | `dutch-defense` |
| 31 キングズインディアンディフェンス | キングズ・インディアン・ディフェンス | King's Indian Defense | — | E60 | バリエーションのみ追加 | `kings-indian` |
| 32 クイーンズインディアンディフェンス | クイーンズ・インディアン・ディフェンス | Queen's Indian Defense | — | E12 | 既存登録済み | `queens-indian` |
| 33 ニムゾインディアンディフェンス | ニムゾ・インディアン・ディフェンス | Nimzo-Indian Defense | — | E20 | バリエーションのみ追加 | `nimzo-indian` |
| 34 グリュエンフェルドディフェンス | グリュンフェルド・ディフェンス | Grünfeld Defense | — | D80 | バリエーションのみ追加 | `grunfeld-defense` |
| 35 ベノニディフェンス | ベノニ・ディフェンス | Benoni Defense | — | A56 | 新規登録 | `benoni-defense` |
| 36 ボゴ・インディアンディフェンス | ボゴ・インディアン・ディフェンス | Bogo-Indian Defense | — | E11 | 新規登録 | `bogo-indian` |
| 37 イングリッシュオープニング | イングリッシュ・オープニング | English Opening | — | A10 | 既存登録済み | `english-opening` |
| 38 レティオープニング | レティ・オープニング | Réti Opening | — | A04 | 既存登録済み | `reti-opening` |
| 39 バードオープニング | バード・オープニング | Bird Opening | — | A02 | 新規登録 | `birds-opening` |
| 40 ラーセンオープニング | ラーセン・オープニング | Nimzo-Larsen Attack | — | A01 | 新規登録 | `larsen-opening` |
| 41 ソコルスキーオープニング | ソコルスキー・オープニング | Polish Opening | — | A00 | 新規登録 | `sokolsky-opening` |
| 42 ベンコーギャンビット | ベンコー・ギャンビット | Benko Gambit | — | A57 | 新規登録 | `benko-gambit` |

### 指定バリエーション49項目

| 指定名称 | 登録名称 | 英語名称 | 親オープニング | ECO | 処理結果 | 備考 |
|---|---|---|---|---|---|---|
| アクセプテッド | キングズ・ギャンビット・アクセプテッド | King's Gambit Accepted | キングズ・ギャンビット | C34 | 新規登録 | `kings-gambit-accepted` |
| ファルクビア | ファルクビア・カウンターギャンビット | Falkbeer Countergambit | キングズ・ギャンビット | C31 | 新規登録 | `kings-gambit-falkbeer` |
| ペトロフ「イ」 | クラシカル・アタック、チゴリン・バリエーション | Classical Attack, Chigorin Variation | ペトロフ・ディフェンス | C42 | 新規登録 | `petrov-classical` |
| ペトロフ「ロ」 | モダン・アタック、センター・アタック | Modern Attack, Center Attack | ペトロフ・ディフェンス | C43 | 新規登録 | `petrov-center` |
| フォーポーンアタック | フォー・ポーンズ・アタック | Four Pawns Attack | アレキン・ディフェンス | B03 | 新規登録 | `alekhine-four-pawns` |
| ピルツ「ニ」 | クラシカル、クワイエット・システム（…c6から…Nbd7） | Classical Variation, Quiet System, Czech Defense line | ピルツ・ディフェンス | B08 | 新規登録 | `pirc-quiet-czech` |
| ピルツ「ホ」 | バーン・バリエーション | Byrne Variation | ピルツ・ディフェンス | B07 | 新規登録 | `pirc-byrne` |
| ピルツ「ヘ」 | オーストリアン・アタック、ワイス・バリエーション | Austrian Attack, Weiss Variation | ピルツ・ディフェンス | B09 | 新規登録 | `pirc-weiss` |
| バード・ディフェンス | バード・ディフェンス | Bird Variation | ルイ・ロペス | C61 | 新規登録 | `ruy-bird` |
| ベルリン・ディフェンス | ベルリン・ディフェンス | Berlin Defense | ルイ・ロペス | C65 | 新規登録 | `ruy-berlin` |
| クラシカル・ディフェンス | クラシカル・ディフェンス | Classical Variation | ルイ・ロペス | C64 | 新規登録 | `ruy-classical` |
| シュタイニッツ・ディフェンス | シュタイニッツ・ディフェンス | Steinitz Defense | ルイ・ロペス | C62 | 新規登録 | `ruy-steinitz` |
| シュリーマン・ディフェンス | シュリーマン・ディフェンス | Schliemann Defense | ルイ・ロペス | C63 | 新規登録 | イェーニッシュ・ギャンビット/Jaenisch Gambit |
| エクスチェンジ・バリエーション | エクスチェンジ・バリエーション | Exchange Variation | ルイ・ロペス | C68 | 新規登録 | `ruy-exchange` |
| オープン・バリエーション | オープン・バリエーション | Open Ruy Lopez | ルイ・ロペス | C80 | 新規登録 | `ruy-open` |
| マーシャル・アタック | マーシャル・アタック | Marshall Attack | ルイ・ロペス | C89 | 新規登録 | `ruy-marshall` |
| クローズド・バリエーション | クローズド・バリエーション | Closed Ruy Lopez | ルイ・ロペス | C88 | 新規登録 | `ruy-closed` |
| カロ・カンのメインライン | クラシカル・メインライン | Classical Variation | カロ・カン・ディフェンス | B18 | 新規登録 | `caro-kann-main` |
| パノフ・ボトヴィニク | パノフ・ボトヴィニク・アタック | Panov–Botvinnik Attack | カロ・カン・ディフェンス | B13 | 新規登録 | `caro-kann-panov` |
| フレンチのクラシカル | クラシカル・バリエーション | Classical Variation | フレンチ・ディフェンス | C11 | 新規登録 | `french-classical` |
| フレンチのメインライン | クラシカル、バーン・メインライン | Classical Variation, Burn Variation, Main Line | フレンチ・ディフェンス | C13 | 新規登録 | `french-main` |
| フレンチのタラシュ | タラシュ・バリエーション | Tarrasch Variation | フレンチ・ディフェンス | C03 | 新規登録 | `french-tarrasch` |
| ラウザー | リヒター・ラウザー・バリエーション | Richter–Rauzer Variation | シシリアン・ディフェンス | B60 | 新規登録 | ラウザー |
| ポウルセン・カン | カン・バリエーション | Kan Variation | シシリアン・ディフェンス | B41 | 新規登録 | ポウルセン・カン |
| オーソドックス・ディフェンス | オーソドックス・ディフェンス | Orthodox Defense | クイーンズ・ギャンビット・ディクラインド | D60 | 新規登録 | `qgd-orthodox` |
| ボンダレフスキー | タルタコワー・ディフェンス | Tartakower Defense | クイーンズ・ギャンビット・ディクラインド | D58 | 新規登録 | ボンダレフスキー/タルタコワー・マコゴノフ・ボンダレフスキー/Tartakower–Makogonov–Bondarevsky |
| ケンブリッジ・スプリングス・ディフェンス | ケンブリッジ・スプリングス・ディフェンス | Cambridge Springs Defense | クイーンズ・ギャンビット・ディクラインド | D52 | 新規登録 | `qgd-cambridge` |
| タラシュ・ディフェンス | タラシュ・ディフェンス | Tarrasch Defense | クイーンズ・ギャンビット・ディクラインド | D32 | 新規登録 | `qgd-tarrasch` |
| ラゴズィン・ディフェンス | ラゴズィン・ディフェンス | Ragozin Defense | クイーンズ・ギャンビット・ディクラインド | D38 | 新規登録 | `qgd-ragozin` |
| ビエナ・バリエーション（ラゴズィン系） | ビエナ・バリエーション（ラゴズィン系） | Ragozin Defense, Vienna Variation | クイーンズ・ギャンビット・ディクラインド | D39 | 新規登録 | `qgd-vienna` |
| ダッチ・メインライン（2.g3） | ダッチ・メインライン（2.g3） | Dutch Defense, 2.g3 | ダッチ・ディフェンス | A81 | 新規登録 | `dutch-main` |
| スタウトン・ギャンビット | スタウトン・ギャンビット | Staunton Gambit | ダッチ・ディフェンス | A83 | 新規登録 | `dutch-staunton` |
| クラシカル・バリエーション | クラシカル・バリエーション | Classical Variation | キングズ・インディアン・ディフェンス | E91 | 新規登録 | `kid-classical` |
| ゼーミッシュ・バリエーション | ゼーミッシュ・バリエーション | Sämisch Variation | キングズ・インディアン・ディフェンス | E80 | 新規登録 | `kid-samisch` |
| フィアンケット・バリエーション | フィアンケット・バリエーション | Fianchetto Variation | キングズ・インディアン・ディフェンス | E60 | 新規登録 | `kid-fianchetto` |
| ゼーミッシュ・バリエーション | ゼーミッシュ・バリエーション | Sämisch Variation | ニムゾ・インディアン・ディフェンス | E24 | 新規登録 | `nimzo-samisch` |
| ルビンスタイン・バリエーション（4.e3） | ルビンスタイン・バリエーション（4.e3） | Rubinstein Variation | ニムゾ・インディアン・ディフェンス | E47 | 新規登録 | `nimzo-rubinstein` |
| レニングラード・バリエーション | レニングラード・バリエーション | Leningrad Variation | ニムゾ・インディアン・ディフェンス | E30 | 新規登録 | `nimzo-leningrad` |
| グリュンフェルドのメインライン | エクスチェンジ・バリエーション（基本のメインライン） | Exchange Variation | グリュンフェルド・ディフェンス | D85 | 新規登録 | `grunfeld-main` |
| ロシアン、スミスロフ・バリエーション | ロシアン、スミスロフ・バリエーション | Russian Variation, Smyslov Variation | グリュンフェルド・ディフェンス | D98 | 新規登録 | `grunfeld-smyslov` |
| ベノニのメインライン | クラシカル・メインライン | Classical Variation, Main Line | ベノニ・ディフェンス | A73 | 新規登録 | `benoni-main` |
| フィアンケット・バリエーション | フィアンケット・バリエーション | Fianchetto Variation | ベノニ・ディフェンス | A61 | 新規登録 | `benoni-fianchetto` |
| バードのメインライン | バード・メインライン（1...d5） | Bird Opening, 1...d5 | バード・オープニング | A03 | 新規登録 | `bird-main` |
| フロムギャンビット | フロム・ギャンビット | From Gambit | バード・オープニング | A02 | 新規登録 | `bird-from` |
| ドラゴン | ドラゴン・バリエーション | Dragon Variation | シシリアン・ディフェンス | B70 | 既存登録済み | 既存IDと棋譜を使用 |
| ナイドルフ | ナイドルフ・バリエーション | Najdorf Variation | シシリアン・ディフェンス | B90 | 既存登録済み | 同上 |
| クローズドシシリアン | クローズド・シシリアン | Closed Sicilian | シシリアン・ディフェンス | B23 | 既存登録済み | 同上 |
| アレキン「ハ」 | — | — | アレキン・ディフェンス | B05系 | 公開保留 | 7.e4が非合法 |
| ホルド | — | — | ベノニ・ディフェンス | — | 公開保留 | 正式名・棋譜未確定 |

## D. 名称不明だった棋譜の調査

全局面をchess.jsで初期配置から検証しました。ペトロフは共通の `1.e4 e5 2.Nf3 Nf6`、ピルツは `1.e4 d6` を補完しました。下表の表記修正はSANへの変換です。照合では合法な指し手から位置を比較し、同じ系統の手順前後も確認しました。

| 指定 | 元の棋譜 | 判定・出典・登録 |
|---|---|---|
| イ | `3 N:e5 d6 4 Nf3 N;e4 5 d4 d5 6 Bd3 Be7 7 o-o Nc6 8 Re1 Bg4 9 c4 Nf6` | **C42、クラシカル・アタック、チゴリン・バリエーション**。Lichess C42の8.Re1まで一致。捕獲を `Nxe5`・`Nxe4`、キャスリングを `O-O` と表記し、9...Nf6まで全手合法で登録。最終手順固有の別名は確認していません。 |
| ロ | `3 d4 ed 4 e5 Ne4 5 Q:d4 d5 6 ed N:d6` | **C43、モダン・アタック、センター・アタック**。Lichess C43の5.Qxd4まで一致。 `3...exd4`、`5.Qxd4`、`6.exd6 Nxd6` に正規化。5...d5の直後なので6.exd6はアンパッサンとして合法。最終手まで登録。 |
| ハ | `2 e5 Nd5 3 d4 d6 4 Nf3 Bg4 5 Be2 Nc6 6 o-o e6 7 e4 Nb6 8 ed cd` | **B05、モダン・バリエーション、メインライン系**（Lichess B05の4...Bg4と一致）。7.e4は白eポーンがe5にいるため非合法。 `7.c4 Nb6 8.exd6 cxd6` とした候補は合法ですが、その先まで一致する資料を確認できず、元の着手を推測で置き換えず公開保留。 |
| ニ | `2 d4 g6 3 Nc3 Nf6 4 Nf3 Bg7 5 Be2 o-o 6 o-o c6 7 a4 Nbd7` | **B08、クラシカル、クワイエット・システム**。6...c6まで Lichessの *Czech Defense*（同じ局面への手順前後あり）。`O-O` に正規化し、7...Nbd7まで合法。最終局面固有名は確認できないため、表示名に具体的な着手を添えて登録。 |
| ホ | `2 d4 g6 3 Nc3 Nf6 4 Bg5 Bg7 5 Qd2 c6 6 f4 o-o` | **B07、バーン・バリエーション**。Lichessの4.Bg5の局面と一致。`6...O-O` に正規化して最終手まで登録。 |
| ヘ | `2 d4 Nf6 3 Nc3 g6 4 f4 Bg7 5 Nf3 o-o 6 Bd3` | **B09、オーストリアン・アタック、ワイス・バリエーション**。Lichessと最終手6.Bd3まで一致。`5...O-O` に正規化して登録。 |

## E. テスト結果

- 自動テスト119件成功、失敗0件。追加70手順のSANとFEN、全98手順の合法性、白黒の定跡練習、ID・親参照・重複を確認しました。既存の診断とGA4同意管理のテストも通過しました。
- GitHub Pages用、Cloudflare検証用、Cloudflare正式用のビルドが成功しました。Wrangler 4.167.0の本番設定で `deploy --env production --dry-run` が成功しました。
- ローカルChromeでは検索、系統絞り込み、ルイ・ロペスの分岐切り替え、ペトロフ「ロ」のアンパッサンと定跡練習、間隔反復への登録と期日を進めた復習、定跡指定CPU対戦、複数候補の局面解析、別オリジンへの学習記録のバックアップ・復元を確認しました。
- GitHub Pages相当とWrangler配信の両方で、320・390・1440px幅の表示、Service Worker制御下の再読み込み各10回、新規バリエーションのオフライン表示を確認しました。
- 本番反映後の表示と実機での確認は残っています。

## F. 残っている確認

- アレキン「ハ」は元の棋譜の再確認が必要です。ベノニ「ホルド」は元資料の綴り、ECOまたは着手順が必要です。
- 「ポウルセン・カン」は4...a6の *Kan Variation*（B41）として公開しました。資料でポウルセンの名称が使われる別の分岐まで同一名として扱いません。
- 「ボンダレフスキー」はD58のタルタコワー・ディフェンスに紐づけました。タルの対局注釈に使われる三者名は系統の別名として検索できます。
- フレンチのメインラインは、クラシカル全体（C11）と区別できるバーン・メインライン（C13）を採用しました。クイーンズ・ギャンビットの6分岐は既存ディクラインドの下に置きました。

### 参照資料

確認日 2026年11月26日。日本語解説はRookori向けに作成しています。

- [Lichess Chess Openings](https://github.com/lichess-org/chess-openings) · [定跡データのCC0 1.0](https://github.com/lichess-org/chess-openings/blob/master/COPYING.txt)
- 指定棋譜の照合データ [B分類](https://github.com/lichess-org/chess-openings/blob/master/b.tsv) · [C分類](https://github.com/lichess-org/chess-openings/blob/master/c.tsv) · [D分類](https://github.com/lichess-org/chess-openings/blob/master/d.tsv)
- [ミハイル・タルによる1969年世界選手権第14局の注釈](https://dgriffinchess.wordpress.com/wp-content/uploads/2021/07/petrosian-spassky-14th-match-game-world-championship-moscow-1969.pdf)

# RookoriをCloudflare Workersに移す手順

正式公開先は `https://rookrori.com/` です。旧サイト `https://rook-ccc.github.io/Rookori/` は、学習データのバックアップと引き続き利用できるサイトとして維持します。GitHub DesktopとCodexの作業フォルダー、およびGitHub Pagesの既存Actionsはそのまま使えます。

## 手元で確認する

| 対象 | コマンド | 内容 |
| --- | --- | --- |
| GitHub Pages | `node publish.cjs --print-output` | 出力先の `chesspath-public-*` を `/Rookori/` 配下で配信する既存構成 |
| Cloudflare検証用 | `node publish.cjs --target cloudflare-preview` | `.rookori-cloudflare-assets` に出力。URLルートで動作し、正式サイトをcanonicalに指定。`noindex` と計測タグなし |
| Cloudflare正式公開用 | `node publish.cjs --target cloudflare-live` | 同じ専用出力先に生成。canonical、サイトマップ、robots.txt、OGPを `https://rookrori.com/` に統一 |

Node.js 24環境で `node --test` を実行します。検証用ビルドを作成した後、`npx --yes wrangler@4.167.0 dev --ip 127.0.0.1` を実行し、ターミナルに表示されたローカルURLを開きます。Wranglerは `wrangler.jsonc` の `assets.directory` で公開用ファイルのみにアクセスします。Nodeのビルドは公開対象を列挙してコピーします。エディター、テスト、設定ファイル、認証情報は配信対象外です。 [Static Assetsのセットアップ](https://developers.cloudflare.com/workers/static-assets/get-started/)

## Cloudflareで検証し、ドメインを接続する

1. 運営者がCloudflareにログインし、無料プランのまま **Workers & Pages** で検証用Workerを作ります。検証用の名前は `rookori-preview` です。GitHubから自動公開する場合は **Create application → Import a repository** で `ROOK-ccc/Rookori` を選び、リポジトリルートを使います。接続にはGitHub側の承認が必要です。**Build command** は `node publish.cjs --target cloudflare-preview`、**Deploy command** は `npx --yes wrangler@4.167.0 deploy` です。この設定で公開されるのはnoindexの検証用ビルドです。Git連携を使わない場合は、運営者がWranglerにログインした後に同じ2つのコマンドを手元で実行できます。 [Workers Buildsの設定](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/) · [GitHubとの連携](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/)
2. Cloudflareが表示した検証用URLを開き、CPU対戦、棋譜解析、自由検討、一括バックアップの復元を確認します。開発者ツールのNetworkで `.wasm` が `application/wasm` で取得でき、対応ソースのダウンロードも機能することを確認します。検証用URLへの学習データ投入にはテストデータを使います。本番予定のドメインとはブラウザーの保存領域が異なります。
3. 正式Workerの **Workers & Pages → rookori → Settings → Domains & Routes** で、既存の Custom Domain が `rookrori.com` であることを確認します。接続は管理画面で管理します。`wrangler.jsonc` の `production` は `route` と `routes` を省略します。空配列も指定しません。通常のデプロイにドメインの再追加は不要です。自動デプロイのAPIトークンを使う場合は、対象アカウントに限定した **Workers Scripts: Edit** を使います。管理画面での接続変更は、対象ゾーンとWorkerを管理できる運営者が行います。 [Wranglerの設定管理](https://developers.cloudflare.com/workers/wrangler/configuration/#source-of-truth) · [Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) · [デプロイ用トークン](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)
4. `www` も受け付けるには、**DNS → Records** で `www` のプロキシ済みレコードを作ります。新規で既存レコードがない場合、公式例は種類 **A**、名前 `www`、IPv4 `192.0.2.0`、**Proxied** です。続いて **Rules → Redirects → Create rule → Single Redirect** で、`http.host eq "www.rookrori.com"` に対して Dynamic URL `concat("https://rookrori.com", http.request.uri.path)`、ステータス **301**、**Preserve query string** を有効にします。**SSL/TLS → Edge Certificates** で証明書を確認し、**Always Use HTTPS** を有効にします。HTTPとHTTPSの両方、www付きとなしの両方で確認します。 [Cloudflareのwwwリダイレクト例](https://developers.cloudflare.com/rules/url-forwarding/examples/redirect-www-to-root/) · [プロキシ済みDNSレコード](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/#redirect-between-www-and-root-domain)
5. ドメイン接続後の公開許可を得て、`node publish.cjs --target cloudflare-live`、`npx --yes wrangler@4.167.0 deploy --env production` の順で実行します。正式公開用Workerは `workers.dev` とバージョン用プレビューURLを無効にします。ドメイン接続に先立って正式Workerを用意する必要がある場合は、検証用ビルドを使い、確認完了時に正式ビルドへ切り替えます。

## 利用者のデータと検索の切り替え

1. 旧サイトにも一括バックアップが利用できる版が公開されていることを確認します。利用者は旧サイトのメニューから **設定・学習データのバックアップ → 一括バックアップをダウンロード** を押し、JSONを端末に保存します。新サイトで学習を始める前に、同じメニューの **一括バックアップを選ぶ → 既存データを残して追加する → 再読み込みして反映する** を実行します。両サイトでネットワークへの送信はありません。現在の保存形式が異なるため、以前の学習JSONと対局履歴JSONはそれぞれ従来の復元欄を使います。
2. 一括復元では、学習履歴を既存データに統合します。同じ棋譜が別IDで保存済みなら、移行先の対局にメモ、使用色、関連する解析・個別練習問題を紐づけます。同じ局面に異なるメモがある場合は両方を残し、使用色や設定が競合する場合は移行先を優先します。失敗時は、すでに追加した分を保ったまま同じファイルで再試行できます。GA4の同意は新サイトで選択します。過去に端末に保存されていなかった診断は、元の表示や16タイプ共有リンクがあれば確認できます。保存前の棋譜に紐づく解析を後から開くには同じ棋譜が必要なので、移行前に対局履歴へ保存してください。書き出し上限は64 MiBです。
3. 正式ドメインの接続後、Search Consoleの **プロパティを追加 → ドメイン** に `rookrori.com` を入力し、指定されたTXTレコードをCloudflareの **DNS → Records** に追加します。URLプレフィックス方式を選ぶ場合は、`https://rookrori.com/` を入力し、新しい確認タグの `content` だけを `site-config.cloudflare.json` の `googleSearchVerification` に設定して再ビルドします。確認後、**サイトマップ** で `sitemap.xml` を送信し、**URL検査** で正式トップページを確認します。 [Search Consoleのプロパティ追加](https://support.google.com/webmasters/answer/34592?hl=ja)
4. 正式用ビルドではGitHub Pagesと同じGA4測定IDを使い、検証用ビルドでは計測を無効にします。デプロイ後、GA4の **管理 → データ ストリーム → ウェブ** で対象ストリームを開き、拡張計測とGoogleタグの自動イベント検出を確認します。Networkとリアルタイムレポートで同意前・同意後・撤回後の挙動を確認します。 [Googleタグの設定](https://support.google.com/analytics/answer/12131703?hl=ja)
5. 旧サイト用の `site-config.json` に `"migrationUrl": "https://rookrori.com/"` を設定しています。旧サイトにバックアップ案内と新サイトへのリンクが表示され、旧ページのcanonicalとOGPが新サイトを指します。移行案内のリンクは有効な16タイプ結果のクエリや共有可能なハッシュを引き継ぎます。保存棋譜のURLは、移行先で復元した対局を開けます。同じ棋譜が別IDで保存済みの場合も元のIDを記録します。元のIDが移行先の別の対局に使われている場合は、移行先のIDを優先します。旧サイトの自動遷移は設定しないので、利用者は旧サイトでデータを取り出せます。GitHub Pagesで旧URLの任意のサーバー側301を設定できない間はSearch Consoleのアドレス変更ツールを前提にせず、新サイトのサイトマップと旧サイトの案内・canonicalで移行を示します。旧サイトを停止する時期はバックアップの利用状況を確認してから判断します。 [Google検索のサイト移行](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes) · [アドレス変更ツール](https://support.google.com/webmasters/answer/9370220?hl=ja)

## 無料枠、Stockfish、プライバシー

- 静的配信は無料でリクエスト数に上限がありません。無料枠の静的ファイルは1バージョン20,000件、1件25 MiBまでです。Workers Buildsは月3,000分、同時1件、1ビルド20分です。将来Workerのコードを実行する部分には無料枠の1日100,000リクエストとCPU時間の上限が別途適用されます。 [静的配信の課金](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) · [無料枠の上限](https://developers.cloudflare.com/workers/platform/limits/) · [Buildsの制限](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/)
- Stockfishは同一オリジンのブラウザーWeb Workerで動きます。シングルスレッド版に必要なJSとWASM、対応するソース、GPLv3、ライセンス案内、評価ネットワークを同じ配信先に含めます。Stockfish用ファイルはブラウザーで最大1時間キャッシュします。更新時はバイナリ名とソースの対応を確認し、同じ配布ファイル名で内容だけを差し替える場合はキャッシュを更新してください。HTMLは再検証、JS/CSSのHTML参照は内容ハッシュ付きです。
- Workerによるログ保存、サーバー側のユーザーデータ保存、認証、外部APIを追加していません。レスポンスには埋め込み防止・MIMEスニッフィング防止・参照元制限のヘッダーを設定しています。正式公開時はCloudflareのホスティングによる通常の通信と、運営者が設定するログ・解析に合わせてポリシーを確認してください。
- Lichess直接取得は停止したままです。再開する場合は、固定の公式APIに限定したエンドポイントの設計、識別用User-Agent、複数利用者で共有する直列化と429の待機、公開終了済み棋譜の検証、入力・件数制限、濫用対策を別途検証します。任意URLへの中継は行いません。 [Lichess APIの仕様](https://lichess-org.github.io/api/) · [API利用ガイド](https://lichess.org/page/api-tips)

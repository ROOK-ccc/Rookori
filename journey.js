const journeyReleases = [
  { version: '4.4.2', updated: '2026-11-26', title: 'これまでと、これから',
    changes: { '新機能': ['開発の歩み、今後の構想、詳細な更新履歴をサイト内で読めるようにしました。'],
      '改善': ['ホーム、メニュー、「Rookoriについて」、フッターから開発の歩みを開けます。'] } },
  { version: '4.4.1', date: '2026-11-26', title: '新しい場所で、旅の続きを。',
    changes: { '新機能': ['独自ドメイン rookrori.com へ移行し、Cloudflareでの正式公開を開始しました。旧サイトには移転案内とバックアップへの入口を用意しました。'],
      '改善': ['学習履歴と棋譜のメモを移行先の記録に追加できるよう、バックアップの復元を改善しました。'],
      '不具合修正': ['ホーム画面から起動できるWebアプリ（PWA）で、再読み込みに失敗する問題を修正しました。'] } },
  { version: '4.4.0', title: '日常にチェスを',
    changes: { '新機能': ['初回利用ガイド、棋譜（PGN）の一括取り込み、学習目標、ホーム画面から起動できるWebアプリ（PWA）を追加しました。'],
      '改善': ['ダッシュボードに今日のおすすめと前回の続きが表示されるようになりました。'] } },
  { version: '4.3.0', title: '自分らしいチェス',
    changes: { '新機能': ['終了した対局から棋風を振り返る機能、棋風別CPU、定跡指定対戦を追加しました。'],
      '改善': ['棋風分析の記録を保存し、過去の結果と比較できます。'] } },
  { version: '4.2.0', title: '自分だけの練習問題',
    changes: { '新機能': ['自分の対局から練習問題を作成し、分野別の傾向を確認できるようにしました。'],
      '改善': ['自分の対局から作った問題を毎日の練習や間隔反復で復習できます。'] } },
  { version: '4.1.1', changes: { '改善': ['対局復習の入口を整理し、ハイライト、解析、棋譜、検討を切り替えられるようにしました。評価値バーとグラフの配置も改善しました。'] } },
  { version: '4.1.0', title: '一局から学ぶ',
    changes: { '新機能': ['Stockfishによる棋譜解析、評価値グラフ、自由検討、局面指定対戦を追加しました。'],
      '改善': ['解析結果と検討した手順をブラウザーに保存できます。'] } },
  { version: '4.0.0', title: 'チェスの世界とつながる',
    changes: { '新機能': ['Lichessの公開棋譜を取得して対局履歴に追加できるようにしました。直接取得は現在一時停止中です。'],
      '改善': ['対局履歴に取得元の絞り込み、CPU対戦に取った駒と駒得の表示を追加しました。'] } },
  { version: '3.2.2', title: '対局の記録',
    changes: { '新機能': ['Stockfishを導入しました。終了したCPU対局を保存し、棋譜の振り返りに進めます。'] } },
  { version: '3.2.1', title: 'はじめての対局',
    changes: { '新機能': ['コンピューター対戦に練習モードと実戦モードを追加しました。'] } },
  { version: '3.2.0', title: 'はじめの一歩',
    changes: { '改善': ['「Rookoriについて」に理念を掲載し、ホームから初心者向けの学習へ進みやすくしました。'] } },
  { version: '3.1.2', changes: { '改善': ['チェス16タイプ診断の結果カードを刷新しました。'] } },
  { version: '3.1.1', changes: { '改善': ['読みやすさを改善し、チェス用語集を拡充しました。'] } },
  { version: '3.1', changes: { '新機能': ['棋譜から序盤の戦法を判定し、学習中に用語の注釈を開けるようにしました。'] } },
  { version: '3.0', changes: { '新機能': ['棋譜を取り込み、保存した対局を振り返れるようにしました。'] } },
  { version: '2.5', changes: { '当時の機能': ['チェス16タイプ診断、オープニング診断、日本語の定跡解説、初心者コース、間隔反復学習がありました。'] } },
];

const journeyPast = [
  { period: 'ChessPath v2.5まで', title: 'すべては、一つの診断から。',
    items: ['チェス16タイプ診断', 'オープニング診断', '日本語の定跡解説', '初心者コースと間隔反復学習'] },
  { period: 'v3.x', title: 'はじめの一歩',
    items: ['初心者向けの案内とチェス用語集', '棋譜の振り返り', 'CPU対戦（v3.2.1）', 'StockfishとCPU対局の保存（v3.2.2）'] },
  { period: 'v4.0', title: 'チェスの世界とつながる',
    items: ['外部棋譜を対局履歴に取り込む機能', '対局履歴で取り込み元を確認'] },
  { period: 'v4.1', title: '一局から学ぶ',
    items: ['棋譜解析と評価値グラフ', '自由検討', '局面指定対戦'] },
  { period: 'v4.2', title: '自分だけの練習問題',
    items: ['自分の対局に基づく練習問題と復習', '苦手分野の分析'] },
  { period: 'v4.3', title: '自分らしいチェス',
    items: ['実際の対局に基づく棋風分析', '棋風別CPU', '定跡指定対戦'] },
  { period: 'v4.4', title: '日常にチェスを',
    items: ['初回利用ガイドと棋譜（PGN）の一括取り込み', '学習目標とダッシュボード', 'ホーム画面から起動できるWebアプリ（PWA）'] },
  { period: '2026年11月26日・v4.4.1', title: '新しい場所で、旅の続きを。',
    items: ['独自ドメイン・Cloudflareへの移行', '学習データ移行機能の改善', 'PWAの再読み込み障害の修正'],
    note: 'v4.2.1で準備した運営基盤の刷新が、この移行で完了しました。' },
];

const journeyPlans = [
  { status: '現在の取り組み', title: 'もっと多くの人へ。',
    items: ['品質改善', 'チェスの普及活動', '利用者の意見に基づく改善'] },
  { period: 'v4.5', status: '開発予定', title: '安全な運営基盤の構築',
    items: ['アカウント機能', '学習データの同期', '安全な利用環境'] },
  { period: 'v5.0', status: '開発予定', title: '一人ではないチェス',
    items: ['初心者コミュニティと質問広場', '局面研究と対局の振り返り', '教材共有と共同学習'],
    note: '安全管理、通報、ブロック、個人情報保護の仕組みを整えたうえでの提供を目指します。' },
  { period: 'v5.x', status: '将来構想', title: '仲間とチェスを楽しむ',
    items: ['フレンド機能', '招待制対人戦'] },
  { status: '将来構想', title: '学校にも、チェスを。',
    items: ['学校やチェス同好会の活動支援', '部内大会の運営支援', '初心者の学習とチェスクラブの運営支援'],
    note: '「Rookori for Schools」は仮称です。' },
  { period: 'v6.0', status: '将来構想', title: '新たなチェスの居場所',
    items: ['オンライン対人戦とマッチメイキング', '独自レーティング', '大会機能'] },
  { period: '長期構想', status: '将来構想', title: 'チェスを、もっと身近に。',
    items: ['ネイティブアプリ化', '日本でのチェス普及活動', '学校やチェス団体との連携'] },
];

function renderJourney() {
  const list = items => {
    const ul = element('ul');
    for (const item of items) ul.append(element('li', item));
    return ul;
  };
  const timeline = (id, entries) => {
    for (const { period, status, title, items, note } of entries) {
      const row = element('li', null, 'journey-card');
      const heading = element('div', null, 'journey-entry-heading');
      if (period) heading.append(element('span', period));
      heading.append(element('span', status ?? '公開済み', 'journey-status'));
      row.append(heading, element('h3', title), list(items));
      if (note) row.append(element('p', note));
      byId(id).append(row);
    }
  };
  const latest = journeyReleases[0];
  document.querySelectorAll('[data-site-version]').forEach(node => { node.textContent = 'v' + latest.version; });
  byId('journey-latest-title').textContent = latest.title;
  const updated = byId('journey-updated');
  updated.dateTime = latest.updated;
  const dateText = date => {
    const [year, month, day] = date.split('-').map(Number);
    return `${year}年${month}月${day}日`;
  };
  updated.textContent = dateText(latest.updated);
  timeline('journey-past', journeyPast);
  timeline('journey-plans', journeyPlans);
  for (const [index, release] of journeyReleases.entries()) {
    const details = element('details', null, 'journey-card journey-release');
    details.open = index === 0;
    const heading = ['v' + release.version, release.title, release.date && dateText(release.date)].filter(Boolean).join(' · ');
    details.append(element('summary', heading));
    for (const [category, items] of Object.entries(release.changes)) {
      details.append(element('h3', category), list(items));
    }
    byId('journey-releases').append(details);
  }
}

renderJourney();

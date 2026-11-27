const articles = require('./learning-articles.cjs');

const escapeHtml = value => String(value).replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function staticLearning(config, preview, entries) {
  const site = new URL(config.siteUrl);
  const files = {};
  const locations = [{ url: site.href }];
  const e = escapeHtml;
  const catalog = 'オープニング教材';
  const link = (url, label) => `<a href="${e(url)}">${e(label)}</a>`;
  const app = route => '/' + '#' + route;
  const actions = items => `<ul class="reading-links">${items.map(([href, label]) => `<li>${link(href, label)}</li>`).join('')}</ul>`;
  const publicArticles = articles.filter(article => article.status === 'public');
  const practiceArticles = require('./practice-articles.cjs');
  const index = new Map(entries.map(entry => [entry.id, entry]));
  if (index.size !== entries.length || new Set(publicArticles.map(article => article.id)).size !== publicArticles.length
    || [...index.keys(), ...publicArticles.map(article => article.id)].some(id => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))) {
    throw new Error('静的教材のURLに使うIDが不正か、重複しています。');
  }
  const openingPath = id => '/openings/' + id + '/';
  function page(route, name, description, body, parents = [], updated, opening = false, seoTitle) {
    const url = new URL(route, site).href;
    const trail = [['/', 'Rookori'], ...parents, [route, name]];
    const breadcrumb = { '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: trail.map(([href, name], i) => ({ '@type': 'ListItem', position: i + 1, name, item: new URL(href, site).href })) };
    const title = seoTitle || name + ' | Rookori';
    files[route.slice(1) + 'index.html'] = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(title)}</title><meta name="description" content="${e(description)}"><link rel="canonical" href="${e(url)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Rookori"><meta property="og:title" content="${e(title)}">
<meta property="og:description" content="${e(description)}"><meta property="og:url" content="${e(url)}"><meta property="og:image" content="${e(new URL('brand/rookori-share.jpg', site).href)}">
<meta name="twitter:card" content="summary">
<link rel="icon" href="/brand/rookori.png"><link rel="stylesheet" href="/styles.css">
${preview ? '<meta name="robots" content="noindex">' : config.ga4MeasurementId ? `<meta name="rookori-ga4-measurement-id" content="${e(config.ga4MeasurementId)}"><script src="/analytics.js" defer></script>` : ''}
<script type="application/ld+json">${JSON.stringify(breadcrumb).replace(/</g, '\\u003c')}</script>
</head><body>
<header class="site-header reading-header"><div class="shell header-inner"><a class="brand" href="/"><img class="brand-mark" src="/brand/rookori.png" width="36" height="36" alt="">Rookori</a><p>チェスの勉強、もう迷わない。</p></div></header>
<main class="shell reading-page" id="static-learning" data-kind="${opening ? 'opening' : 'guide'}">
<nav aria-label="パンくずリスト"><ol class="reading-crumbs">${trail.map(([href, name], i) => i === trail.length - 1
    ? `<li aria-current="page">${e(name)}</li>` : `<li>${link(href, name)}</li>`).join('')}</ol></nav>
<h1>${e(name)}</h1>${body}
<aside id="analytics-notice" hidden><p>アクセス解析に同意しますか？</p><button type="button" data-analytics-choice="granted">同意する</button> <button type="button" data-analytics-choice="denied">同意しない</button></aside>
<details id="analytics-settings" hidden><summary>アクセス解析の設定</summary><p id="analytics-status"></p><button type="button" data-analytics-choice="granted">同意する</button> <button type="button" data-analytics-choice="denied">同意しない</button> ${link(app('privacy'), 'プライバシー')}</details>
</main></body></html>`;
    locations.push({ url, updated });
  }
  const parents = entries.filter(entry => !entry.parentId);
  page('/openings/', catalog, '日本語の定跡解説を読み、気になるオープニングをチェス盤で練習できます。',
    `<p>序盤の狙いと代表手順を日本語で確認できます。</p>${actions(parents.map(entry => [openingPath(entry.id), entry.name]))}
    <p>${link(app('openings'), '検索・絞り込みができる学習一覧')}</p><p>${link('/guides/', 'チェスの学習ガイド')}</p>`);
  for (const entry of entries) {
    const breadcrumbs = [['/openings/', catalog]];
    if (entry.parentId) breadcrumbs.push([openingPath(entry.parentId), index.get(entry.parentId).name]);
    const related = entry.parentId ? entries.filter(row => row.parentId === entry.parentId && row.id !== entry.id)
      : entries.filter(row => row.parentId === entry.id);
    if (!related.length && !entry.parentId) related.push(...parents.filter(row => row.id !== entry.id && row.slot === entry.slot).slice(0, 4));
    const fields = ['level', 'prerequisites', 'tip', 'white', 'black', 'placement', 'strengths', 'weakness', 'mistake', 'practical', 'faq', 'references'];
    const labels = ['対象レベル', '前提知識', '基本の狙い', '白番の狙い', '黒番の狙い', '駒の配置', '長所', '短所・注意点', 'よくあるミス', '実戦で意識する点', 'よくある疑問', '参考文献'];
    page(openingPath(entry.id), entry.name, entry.seoDescription || entry.description,
      `<p lang="en">${e(entry.english)}</p><p>${e(entry.description)}</p>
      ${entry.aliases?.length ? `<p>別名 ${e(entry.aliases.join('、'))}</p>` : ''}
      ${entry.eco ? `<p>ECOコード ${e(entry.eco)}</p>` : ''}
      <h2>代表手順と各着手の意味</h2><ol class="reading-moves">${entry.notation.map((san, i) => `<li><strong>${e(san)}</strong> ${e(entry.explanations[i])}</li>`).join('')}</ol>
      ${fields.map((key, i) => entry[key] ? `<section><h2>${labels[i]}</h2><p class="reading-text">${e(entry[key])}</p></section>` : '').join('')}
      ${entry.source ? `<p>${link(entry.source, '定跡名と手順の出典（Lichess）')}</p>` : ''}
      <h2>チェス盤で試す</h2>${actions([[app('study/' + entry.id), '盤で手順を再生'], [app('practice/' + entry.id + '/' + entry.color), '定跡の反復練習'], [app('cpu-opening/' + entry.id), '定跡指定CPU対戦']])}
      ${related.length ? `<h2>関連するオープニング</h2>${actions(related.map(row => [openingPath(row.id), row.name]))}` : ''}
      <h2>次の学習を選ぶ</h2>${actions([[app('opening-quiz'), 'オープニング診断'], [app('dashboard'), '学習ダッシュボード'], ['/guides/', '初心者向け学習ガイド']])}`,
      breadcrumbs, entry.updated, true, entry.seoTitle);
  }
  page('/guides/', 'チェスの学習ガイド', 'チェスのルールと序盤を日本語で学べます。',
    actions(publicArticles.map(article => ['/guides/' + article.id + '/', article.title])));
  for (const { id, title, description, sections, action, updated, references = [] } of publicArticles) {
    page('/guides/' + id + '/', title, description, `<p>${e(description)}</p>${sections.map(([title, body]) =>
      `<section><h2>${e(title)}</h2><p>${e(body)}</p></section>`).join('')}<p>${link(app(action[1]), action[0])}</p>
      ${references.length ? '<h2>参考資料</h2>' + actions(references) : ''}`,
    [['/guides/', 'チェスの学習ガイド']], updated);
  }
  for (const { route, title, description, sections, action, related = [] } of practiceArticles) {
    page(route, title, description, `<p>${e(description)}</p>${sections.map(([label, body]) =>
      `<section><h2>${e(label)}</h2><p>${e(body)}</p></section>`).join('')}
      <h2>盤で練習する</h2>${actions(action.map(([label, hash]) => [app(hash), label]))}
      ${related.length ? '<h2>関連するガイド</h2>' + actions(related) : ''}`,
    route === '/practice/' ? [] : [['/practice/', 'チェスの練習']], '2026-11-27');
  }
  files['sitemap.xml'] = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + locations.map(({ url, updated }) => `  <url><loc>${e(url)}</loc>${updated ? `<lastmod>${e(updated)}</lastmod>` : ''}</url>`).join('\n')
    + '\n</urlset>\n';
  return files;
}

module.exports = { staticLearning };

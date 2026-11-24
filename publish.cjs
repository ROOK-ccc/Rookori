const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { parseArgs } = require('node:util');
const siteConfig = require('./site-config.json');

function versionPublicAssets(html, folder) {
  return html.replace(/\b(src|href)="([\w./-]+\.(?:js|css))"/g, (_, attr, file) => {
    const bytes = fs.readFileSync(path.join(folder, file));
    const version = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
    return `${attr}="${file}?v=${version}"`;
  });
}

function publicSiteFiles(config) {
  const site = new URL(config.siteUrl);
  if (site.protocol !== 'https:' || site.username || site.password
    || site.search || site.hash || !site.pathname.endsWith('/')) {
    throw new Error('site-config.json の siteUrl には末尾が / の公開用 HTTPS URL を指定してください。');
  }
  const verification = config.googleSearchVerification;
  const measurement = config.ga4MeasurementId;
  const migration = config.migrationUrl;
  if (migration !== undefined && migration !== 'https://rookori.com/') throw new Error('移行案内のURLを確認してください。');
  const canonical = migration ? new URL(migration) : site;
  if (typeof verification !== 'string' || !/^[A-Za-z0-9_-]*$/.test(verification)) {
    throw new Error('googleSearchVerification には確認タグの content の値だけを指定してください。');
  }
  if (typeof measurement !== 'string' || (measurement && !/^G-[A-Z0-9]+$/.test(measurement))) {
    throw new Error('ga4MeasurementId には G- で始まる測定 ID を指定してください。');
  }
  const escape = value => value.replace(/[&<>"']/g, char =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
  const metadata = [
    `<link rel="canonical" href="${escape(canonical.href)}">`,
    `<meta property="og:url" content="${escape(canonical.href)}">`,
    `<meta property="og:image" content="${escape(new URL('brand/rookori-share.jpg', canonical).href)}">`,
  ];
  if (migration) metadata.push(`<meta name="rookori-migration-url" content="${migration}">`);
  if (verification) metadata.push(`<meta name="google-site-verification" content="${verification}">`);
  if (measurement && !migration) metadata.push(`<meta name="rookori-ga4-measurement-id" content="${measurement}">`);
  const template = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const marker = '<!-- PUBLIC_SITE_METADATA -->';
  if (template.split(marker).length !== 2) throw new Error('公開メタ情報の差し込み箇所を確認してください。');
  return {
    'index.html': template.replace(marker, () => metadata.join('\n  ')),
    'robots.txt': `User-agent: *\nDisallow:\n\nSitemap: ${new URL('sitemap.xml', site)}\n`,
    'sitemap.xml': '<?xml version="1.0" encoding="UTF-8"?>\n'
      + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
      + `  <url><loc>${escape(site.href)}</loc></url>\n</urlset>\n`,
  };
}

try {
  const { values, positionals: [input] } = parseArgs({
    options: { 'print-output': { type: 'boolean' }, target: { type: 'string', default: 'pages' } },
    allowPositionals: true,
  });
  const target = values.target;
  if (!['pages', 'cloudflare-preview', 'cloudflare-live'].includes(target)) throw new Error('公開先の指定を確認してください。');
  const cloudflare = target !== 'pages';
  const preview = target === 'cloudflare-preview';
  const sourceFiles = ['vendor/chess.js', 'opening-study.js', 'intro-data.js', 'problem-data.js'];
  if (!input) sourceFiles.push('course-problems.js');
  const source = sourceFiles.map(file => fs.readFileSync(path.join(__dirname, file), 'utf8')).join('\n');
  const context = vm.createContext({});
  if (input) context.publishedProblemPack = JSON.parse(fs.readFileSync(path.resolve(input), 'utf8'));
  const courseScript = vm.runInContext(`${source}\nproblemCourseScript(validateProblemPack(publishedProblemPack, introLessons))`, context);
  const generated = publicSiteFiles(target === 'cloudflare-live' ? require('./site-config.cloudflare.json')
    : preview ? { ...siteConfig, migrationUrl: undefined, googleSearchVerification: '', ga4MeasurementId: '' } : siteConfig);
  generated['index.html'] = generated['index.html'].replace('<!-- CLOUDFLARE_PRIVACY -->', cloudflare
    ? '<p>このサイトの配信にはCloudflareを利用しており、表示時の通信はCloudflareを経由します。通信に伴い、IPアドレスなどの情報は配信事業者に伝わります。詳しくは<a href="https://www.cloudflare.com/privacypolicy/" rel="noreferrer">Cloudflareのプライバシーポリシー</a>をご覧ください。</p>'
    : '');
  if (cloudflare) {
    if (preview) generated['index.html'] = generated['index.html'].replace('</head>', '  <meta name="robots" content="noindex">\n</head>');
    generated._headers = '/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n'
      + "  Content-Security-Policy: frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'\n"
      + (preview ? '  X-Robots-Tag: noindex\n' : '')
      + '/\n  Cache-Control: no-cache\n/vendor/stockfish/*\n  Cache-Control: public, max-age=3600\n'
      + '/vendor/stockfish/*.nnue\n  Content-Type: application/octet-stream\n';
    generated._redirects = '/Rookori / 301\n/Rookori/ / 301\n';
  }
  const files = [
    'styles.css', 'app.js', 'navigation.js', 'analytics.js',
    'cpu-game.js', 'cpu-game-ui.js', 'cpu-game.css', 'uci-engine.js',
    ...['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm', 'stockfish.js-19.0.0-source.tar.gz',
      'nn-61e7af4bb97d.nnue', 'Copying.txt', 'AUTHORS', 'NOTICE.txt'].map(file => 'vendor/stockfish/' + file),
    'brand/rookori.png', 'brand/rookori-share.jpg',
    'data.js', 'scoring.js', 'card-data.js', 'cards.js', 'result-links.js',
    'opening-data.js', 'opening-scoring.js', 'opening-study.js', 'opening-study-ui.js',
    'opening-variations.js', 'opening-memory.js', 'opening-memory-ui.js',
    'learning.js', 'learning-insights.js', 'learning-progress-ui.js', 'learning-ui.js', 'site-menu.js',
    'game-review.js', 'opening-classification.js', 'game-library.js', 'game-review-ui.js', 'game-review.css',
    'game-study.js', 'game-study-ui.js', 'game-study.css',
    'lichess-api.js', 'lichess-ui.js', 'migration.js', 'personal-practice.js', 'personal-ui.js',
    'chess-terms.js', 'chess-glossary.js',
    'intro-data.js', 'intro-course.js', 'intro-ui.js', 'chess-board.js',
    'problem-data.js', 'problem-curriculum.js',
    'vendor/chess.js', 'vendor/chess.LICENSE.txt',
    ...['w', 'b'].flatMap(color => [...'KQRBNP'].map(piece => `pieces/cburnett/${color}${piece}.svg`)),
    'pieces/cburnett/LICENSE.txt',
  ];
  const output = fs.mkdtempSync(path.join(__dirname, 'chesspath-public-'));
  for (const file of files) {
    const target = path.join(output, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(__dirname, file), target);
  }
  fs.writeFileSync(path.join(output, 'course-problems.js'), courseScript);
  generated['index.html'] = versionPublicAssets(generated['index.html'], output);
  for (const [file, content] of Object.entries(generated)) fs.writeFileSync(path.join(output, file), content);
  let published = output;
  if (cloudflare) {
    const assets = fs.readdirSync(output, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile());
    if (assets.length > 20_000 || assets.some(entry => fs.statSync(path.join(entry.parentPath, entry.name)).size > 25 * 1024 ** 2)) {
      throw new Error('Cloudflareの静的ファイル上限を超えています。公開対象を確認してください。');
    }
    published = path.join(fs.realpathSync(__dirname), '.rookori-cloudflare-assets');
    const previous = fs.lstatSync(published, { throwIfNoEntry: false });
    if (previous) {
      const headers = path.join(published, '_headers');
      if (!previous.isDirectory() || previous.isSymbolicLink() || !fs.existsSync(headers)
        || !fs.readFileSync(headers, 'utf8').startsWith('/*\n  X-Content-Type-Options: nosniff\n')) {
        throw new Error('既存のCloudflare出力を確認できません。別の場所へ移動してから再実行してください。');
      }
      fs.rmSync(published, { recursive: true });
    }
    fs.renameSync(output, published);
  }
  console.log(values['print-output'] ? published : `公開用フォルダーを作成しました。 ${published}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

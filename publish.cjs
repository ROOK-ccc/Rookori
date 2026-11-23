const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parseArgs } = require('node:util');
const siteConfig = require('./site-config.json');

function publicSiteFiles(config) {
  const site = new URL(config.siteUrl);
  if (site.protocol !== 'https:' || site.username || site.password
    || site.search || site.hash || !site.pathname.endsWith('/')) {
    throw new Error('site-config.json の siteUrl には末尾が / の公開用 HTTPS URL を指定してください。');
  }
  const verification = config.googleSearchVerification;
  const measurement = config.ga4MeasurementId;
  if (typeof verification !== 'string' || !/^[A-Za-z0-9_-]*$/.test(verification)) {
    throw new Error('googleSearchVerification には確認タグの content の値だけを指定してください。');
  }
  if (typeof measurement !== 'string' || (measurement && !/^G-[A-Z0-9]+$/.test(measurement))) {
    throw new Error('ga4MeasurementId には G- で始まる測定 ID を指定してください。');
  }
  const escape = value => value.replace(/[&<>"']/g, char =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
  const metadata = [
    `<link rel="canonical" href="${escape(site.href)}">`,
    `<meta property="og:url" content="${escape(site.href)}">`,
    `<meta property="og:image" content="${escape(new URL('brand/rookori-share.jpg', site).href)}">`,
  ];
  if (verification) metadata.push(`<meta name="google-site-verification" content="${verification}">`);
  if (measurement) metadata.push(`<meta name="rookori-ga4-measurement-id" content="${measurement}">`);
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
    options: { 'print-output': { type: 'boolean' } },
    allowPositionals: true,
  });
  const sourceFiles = ['vendor/chess.js', 'opening-study.js', 'intro-data.js', 'problem-data.js'];
  if (!input) sourceFiles.push('course-problems.js');
  const source = sourceFiles.map(file => fs.readFileSync(path.join(__dirname, file), 'utf8')).join('\n');
  const context = vm.createContext({});
  if (input) context.publishedProblemPack = JSON.parse(fs.readFileSync(path.resolve(input), 'utf8'));
  const courseScript = vm.runInContext(`${source}\nproblemCourseScript(validateProblemPack(publishedProblemPack, introLessons))`, context);
  const generated = publicSiteFiles(siteConfig);
  const files = [
    'styles.css', 'app.js', 'navigation.js', 'analytics.js',
    'brand/rookori.png', 'brand/rookori-share.jpg',
    'data.js', 'scoring.js', 'card-data.js', 'cards.js', 'result-links.js',
    'opening-data.js', 'opening-scoring.js', 'opening-study.js', 'opening-study-ui.js',
    'opening-variations.js', 'opening-memory.js', 'opening-memory-ui.js',
    'learning.js', 'learning-insights.js', 'learning-progress-ui.js', 'learning-ui.js', 'site-menu.js',
    'game-review.js', 'opening-classification.js', 'game-library.js', 'game-review-ui.js', 'game-review.css',
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
  for (const [file, content] of Object.entries(generated)) fs.writeFileSync(path.join(output, file), content);
  fs.writeFileSync(path.join(output, 'course-problems.js'), courseScript);
  console.log(values['print-output'] ? output : `公開用フォルダーを作成しました。 ${output}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

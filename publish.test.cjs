const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { appendFileSync, copyFileSync, cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');
const siteConfig = require('./site-config.json');
const cloudflareSiteConfig = require('./site-config.cloudflare.json');

test('公開用ビルドに学習レポート・自作問題・対局復習が入り、エディターを含まない', t => {
  const scratch = mkdtempSync(join(tmpdir(), 'chesspath-publish-test-'));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  for (const file of readdirSync(__dirname).filter(name => /\.(cjs|css|html|js|webmanifest)$/.test(name))) {
    copyFileSync(join(__dirname, file), join(scratch, file));
  }
  for (const dir of ['brand', 'pieces', 'vendor']) cpSync(join(__dirname, dir), join(scratch, dir), { recursive: true });
  const configFile = join(scratch, 'site-config.json');
  copyFileSync(join(__dirname, 'site-config.cloudflare.json'), join(scratch, 'site-config.cloudflare.json'));
  writeFileSync(configFile, JSON.stringify({ ...siteConfig, migrationUrl: undefined, googleSearchVerification: '', ga4MeasurementId: '' }));
  // Keep an earlier build in place to verify that CI receives the new directory.
  const manualResult = execFileSync(process.execPath, ['publish.cjs'], { cwd: scratch, encoding: 'utf8' });
  const published = execFileSync(process.execPath, ['publish.cjs', '--print-output'], {
    cwd: scratch, encoding: 'utf8',
  }).trim();
  assert.ok(published.startsWith(join(scratch, 'chesspath-public-')));
  assert.ok(!manualResult.includes(published));
  assert.equal(readdirSync(scratch).filter(name => name.startsWith('chesspath-public-')).length, 2);
  const artifacts = readdirSync(published);
  const html = readFileSync(join(published, 'index.html'), 'utf8');
  assert.match(html, /<title>Rookori（ルーコリ）/);
  assert.match(html, /src="journey\.js\?v=/);
  assert.match(html, /id="roadmap-title"/);
  assert.match(html, /id="updates-title"/);
  assert.match(readFileSync(join(published, 'journey.js'), 'utf8'), /version: '4\.4\.4'/);
  assert.match(html, /src="opening-expansion\.js\?v=/);
  assert.match(html, /src="play-style-ui\.js\?v=/);
  assert.match(html, /rel="manifest" href="app\.webmanifest"/);
  const manifest = JSON.parse(readFileSync(join(published, 'app.webmanifest'), 'utf8'));
  assert.deepEqual([manifest.start_url, manifest.scope, manifest.display], ['./', './', 'standalone']);
  for (const icon of manifest.icons) {
    const image = readFileSync(join(published, icon.src));
    assert.equal(`${image.readUInt32BE(16)}x${image.readUInt32BE(20)}`, icon.sizes);
  }
  const serviceWorker = folder => readFileSync(join(folder, 'sw.js'), 'utf8');
  const workerBuild = folder => JSON.parse(/^const build = (.*);/m.exec(serviceWorker(folder))[1]);
  const initialWorker = workerBuild(published);
  assert.ok(initialWorker.assets.includes('./'));
  assert.ok(initialWorker.assets.some(file => /^journey\.js\?v=/.test(file)));
  assert.ok(!initialWorker.assets.includes('index.html'));
  assert.ok(initialWorker.assets.some(file => /^pgn-batch-ui\.js\?v=/.test(file)));
  assert.ok(initialWorker.assets.every(file => !file.startsWith('/') && !file.includes('stockfish')));
  assert.match(html, /id="external-title"/);
  assert.match(html, /id="lichess-form"[^>]*data-browser-api-approved="false"[^>]*\bhidden\b/);
  assert.match(html, /id="lichess-api-paused"/);
  assert.match(html, /Rookori プライバシーポリシー/);
  assert.doesNotMatch(html, /www\.cloudflare\.com\/privacypolicy/);
  assert.match(html, /rel="icon"[^>]*href="brand\/rookori\.png"/);
  const site = new URL(siteConfig.siteUrl);
  assert.ok(html.includes(`rel="canonical" href="${site}"`));
  assert.ok(html.includes(`property="og:url" content="${site}"`));
  assert.ok(html.includes(`property="og:image" content="${new URL('brand/rookori-share.jpg', site)}"`));
  assert.doesNotMatch(html, /google-site-verification|rookori-ga4-measurement-id|googletagmanager\.com/);
  assert.doesNotMatch(html, /<meta[^>]+name="robots"[^>]*noindex/);
  assert.equal(readFileSync(join(published, 'robots.txt'), 'utf8'),
    `User-agent: *\nDisallow:\n\nSitemap: ${new URL('sitemap.xml', site)}\n`);
  assert.ok(readFileSync(join(published, 'sitemap.xml'), 'utf8').includes(`<url><loc>${site}</loc></url>`));
  assert.ok(!artifacts.includes('site-config.json'));
  for (const file of ['rookori.png', 'rookori-share.jpg']) {
    assert.deepEqual(readFileSync(join(published, 'brand', file)), readFileSync(join(__dirname, 'brand', file)));
  }
  for (const [, reference] of html.matchAll(/<(?:script|link|img|a)\b[^>]*\b(?:src|href)="([^"]+)"/g)) {
    if (reference.startsWith('#') || /^https?:\/\//.test(reference)) continue;
    const { pathname, searchParams } = new URL(reference, site);
    assert.ok(pathname.startsWith(site.pathname), reference);
    const bytes = readFileSync(join(published, pathname.slice(site.pathname.length)));
    assert.ok(bytes.length, reference);
    if (/\.(js|css)$/.test(pathname)) {
      assert.equal(searchParams.get('v'), createHash('sha256').update(bytes).digest('hex').slice(0, 12), reference);
    }
  }
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(([, id]) => id);
  assert.equal(ids.length, new Set(ids).size, '画面内のIDは重複しない');
  assert.match(html, /src="learning-insights\.js\?v=/);
  assert.match(html, /src="learning-progress-ui\.js\?v=/);
  assert.match(html, /src="personal-practice\.js\?v=/);
  assert.match(html, /src="personal-ui\.js\?v=/);
  assert.doesNotMatch(html, /class="site-nav"/);
  assert.match(html, /id="review-tabs"[^>]*role="tablist"/);
  for (const file of ['game-review.js', 'game-library.js', 'game-review-ui.js', 'game-review.css',
    'opening-classification.js', 'chess-terms.js', 'chess-glossary.js',
    'cpu-game.js', 'cpu-game-ui.js', 'cpu-game.css', 'uci-engine.js', 'lichess-api.js', 'lichess-ui.js',
    'game-study.js', 'game-study-ui.js', 'game-study.css']) {
    assert.ok(artifacts.includes(file));
  }
  const engine = ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm', 'stockfish.js-19.0.0-source.tar.gz',
    'nn-61e7af4bb97d.nnue', 'Copying.txt', 'AUTHORS', 'NOTICE.txt'];
  for (const file of engine) {
    assert.deepEqual(readFileSync(join(published, 'vendor', 'stockfish', file)),
      readFileSync(join(__dirname, 'vendor', 'stockfish', file)));
  }
  const engineDir = join(published, 'vendor', 'stockfish');
  const notice = readFileSync(join(engineDir, 'NOTICE.txt'), 'utf8');
  const hashes = [...notice.matchAll(/^(\S+)\s+([a-f0-9]{64})$/gm)];
  assert.equal(hashes.length, 4);
  for (const [, file, expected] of hashes) {
    assert.equal(createHash('sha256').update(readFileSync(join(engineDir, file))).digest('hex'), expected, file);
  }
  assert.doesNotMatch(html, /<script[^>]+stockfish-19-lite-single/);
  assert.ok(!artifacts.some(file => file.startsWith('editor.')));
  assert.ok(!artifacts.some(file => file.endsWith('.test.cjs')));
  const pack = folder => runInNewContext(readFileSync(join(folder, 'course-problems.js'), 'utf8')
    + '\nJSON.stringify(publishedProblemPack)');
  assert.deepEqual(JSON.parse(pack(published)), JSON.parse(pack(__dirname)));
  writeFileSync(configFile, JSON.stringify({
    siteUrl: 'https://example.test/preview/',
    googleSearchVerification: 'verification-for-test',
    ga4MeasurementId: 'G-TEST000000',
  }));
  const configured = execFileSync(process.execPath, ['publish.cjs', '--print-output'], {
    cwd: scratch, encoding: 'utf8',
  }).trim();
  const head = readFileSync(join(configured, 'index.html'), 'utf8').split('</head>')[0];
  assert.notEqual(workerBuild(configured).version, initialWorker.version);
  assert.ok(head.includes('name="google-site-verification" content="verification-for-test"'));
  assert.ok(head.includes('name="rookori-ga4-measurement-id" content="G-TEST000000"'));
  assert.ok(head.includes('rel="canonical" href="https://example.test/preview/"'));
  assert.ok(head.includes('property="og:image" content="https://example.test/preview/brand/rookori-share.jpg"'));

  const cloudflareBuild = target => execFileSync(process.execPath, ['publish.cjs', '--target', target, '--print-output'], {
    cwd: scratch, encoding: 'utf8',
  }).trim();
  const preview = cloudflareBuild('cloudflare-preview');
  const previewHtml = readFileSync(join(preview, 'index.html'), 'utf8');
  assert.match(previewHtml, /name="robots" content="noindex"/);
  assert.match(previewHtml, /www\.cloudflare\.com\/privacypolicy/);
  assert.match(previewHtml, /rel="canonical" href="https:\/\/rookrori\.com\/"/);
  assert.doesNotMatch(previewHtml, /id="site-migration-notice"/);
  assert.doesNotMatch(previewHtml, /google-site-verification|rookori-ga4-measurement-id|name="rookori-migration-url"/);
  assert.match(readFileSync(join(preview, '_headers'), 'utf8'), /X-Robots-Tag: noindex/);
  const lesson = join('openings', 'caro-kann', 'index.html');
  const previewLesson = readFileSync(join(preview, lesson), 'utf8');
  assert.match(previewLesson, /noindex/);
  assert.doesNotMatch(previewLesson, /rookori-ga4-measurement-id/);
  assert.match(readFileSync(join(preview, '_headers'), 'utf8'), /\/sw\.js\n  Cache-Control: no-cache/);
  assert.ok(workerBuild(preview).assets.includes('app.webmanifest'));
  assert.match(readFileSync(join(preview, '_headers'), 'utf8'), /\*\.nnue\n  Content-Type: application\/octet-stream/);
  assert.match(readFileSync(join(preview, '_redirects'), 'utf8'), /^\/Rookori\/ \/ 301/m);
  assert.equal(cloudflareBuild('cloudflare-live'), preview);
  assert.doesNotMatch(readFileSync(join(preview, '_headers'), 'utf8'), /noindex/);
  assert.match(readFileSync(join(preview, 'sitemap.xml'), 'utf8'), /<loc>https:\/\/rookrori\.com\/<\/loc>/);
  const liveHtml = readFileSync(join(preview, 'index.html'), 'utf8');
  assert.equal(cloudflareSiteConfig.ga4MeasurementId, siteConfig.ga4MeasurementId);
  assert.ok(liveHtml.includes(`name="rookori-ga4-measurement-id" content="${siteConfig.ga4MeasurementId}"`));
  assert.doesNotMatch(liveHtml, /name="robots"[^>]*noindex|name="rookori-migration-url"/);
  assert.doesNotMatch(liveHtml, /id="site-migration-notice"/);
  assert.match(liveHtml, /property="og:url" content="https:\/\/rookrori\.com\/"/);
  assert.match(liveHtml, /rel="canonical" href="https:\/\/rookrori\.com\/"/);
  assert.match(liveHtml, /property="og:image" content="https:\/\/rookrori\.com\/brand\/rookori-share\.jpg"/);
  assert.match(readFileSync(join(preview, 'robots.txt'), 'utf8'), /Sitemap: https:\/\/rookrori\.com\/sitemap\.xml/);
  const liveLesson = readFileSync(join(preview, lesson), 'utf8');
  assert.match(liveLesson, /<h1>カロカン・ディフェンス<\/h1>|<h1>カロ・カン・ディフェンス<\/h1>/);
  assert.match(liveLesson, /代表手順と各着手の意味/);
  assert.match(liveLesson, /https:\/\/rookrori\.com\/openings\/caro-kann\//);
  assert.match(liveLesson, /BreadcrumbList/);
  assert.doesNotMatch(liveLesson, /noindex/);
  assert.ok(!readdirSync(preview).includes('opening-editor.html'));
  const sitemap = readFileSync(join(preview, 'sitemap.xml'), 'utf8');
  for (const [, address] of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const logicalPath = new URL(address).pathname.slice(1);
    const body = readFileSync(join(preview, logicalPath, 'index.html'), 'utf8');
    assert.ok(body.includes(`rel="canonical" href="${address}"`));
    for (const [, href] of body.matchAll(/href="(\/(?:openings|guides)\/[^"#]*)"/g)) {
      assert.ok(readFileSync(join(preview, href.slice(1), 'index.html'), 'utf8').includes('<h1>'), href);
    }
  }
  assert.doesNotMatch(html, /name="rookori-migration-url"/);
  const liveUrl = 'https://rookrori.com/';
  assert.equal(siteConfig.migrationUrl, liveUrl);
  writeFileSync(configFile, JSON.stringify(siteConfig));
  const migrated = readFileSync(join(cloudflareBuild('pages'), 'index.html'), 'utf8');
  assert.ok(migrated.includes(`name="rookori-migration-url" content="${liveUrl}"`));
  assert.ok(migrated.includes(`property="og:url" content="${liveUrl}"`));
  assert.ok(migrated.includes(`rel="canonical" href="${liveUrl}"`));
  assert.ok(migrated.includes(`name="google-site-verification" content="${siteConfig.googleSearchVerification}"`));
  assert.ok(migrated.includes(`name="rookori-ga4-site-url" content="${siteConfig.siteUrl}"`));
  assert.match(migrated, /id="site-migration-notice" aria-labelledby="site-migration-title">/);
  assert.match(migrated, /id="site-migration-link" href="https:\/\/rookrori\.com\/"/);
  assert.match(migrated, /id="migration-export"/);
  assert.ok(!readdirSync(preview).includes('wrangler.jsonc'));

  writeFileSync(join(scratch, 'opening-edits-data.js'), 'const openingEdits = ' + JSON.stringify({
    'caro-kann': { description: '編集した教材 <script>試験</script>', seoTitle: '検証用タイトル & 教材', updated: '2026-11-27' },
  }) + ';');
  appendFileSync(join(scratch, 'learning-articles.cjs'), '\nmodule.exports.push({ id: "private-draft", status: "draft" });');
  const edited = cloudflareBuild('cloudflare-live');
  const editedLesson = readFileSync(join(edited, lesson), 'utf8');
  assert.match(editedLesson, /<title>検証用タイトル &amp; 教材<\/title>/);
  assert.match(editedLesson, /編集した教材 &lt;script&gt;試験&lt;\/script&gt;/);
  assert.match(readFileSync(join(edited, 'sitemap.xml'), 'utf8'),
    /caro-kann\/<\/loc><lastmod>2026-11-27<\/lastmod>/);
  assert.match(readFileSync(join(edited, 'opening-edits-data.js'), 'utf8'), /編集した教材/);
  assert.doesNotMatch(readFileSync(join(edited, 'sitemap.xml'), 'utf8'), /private-draft/);
  assert.ok(!readdirSync(join(edited, 'guides')).includes('private-draft'));
});

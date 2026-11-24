const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { copyFileSync, cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');
const siteConfig = require('./site-config.json');

test('公開用ビルドに学習レポート・自作問題・対局復習が入り、エディターを含まない', t => {
  const scratch = mkdtempSync(join(tmpdir(), 'chesspath-publish-test-'));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  for (const file of readdirSync(__dirname).filter(name => /\.(cjs|css|html|js)$/.test(name))) {
    copyFileSync(join(__dirname, file), join(scratch, file));
  }
  for (const dir of ['brand', 'pieces', 'vendor']) cpSync(join(__dirname, dir), join(scratch, dir), { recursive: true });
  const configFile = join(scratch, 'site-config.json');
  writeFileSync(configFile, JSON.stringify({ ...siteConfig, googleSearchVerification: '', ga4MeasurementId: '' }));
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
    const { pathname } = new URL(reference, site);
    assert.ok(pathname.startsWith(site.pathname), reference);
    assert.ok(readFileSync(join(published, pathname.slice(site.pathname.length))).length, reference);
  }
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(([, id]) => id);
  assert.equal(ids.length, new Set(ids).size, '画面内のIDは重複しない');
  assert.match(html, /src="learning-insights\.js"/);
  assert.match(html, /src="learning-progress-ui\.js"/);
  for (const file of ['game-review.js', 'game-library.js', 'game-review-ui.js', 'game-review.css',
    'opening-classification.js', 'chess-terms.js', 'chess-glossary.js',
    'cpu-game.js', 'cpu-game-ui.js', 'cpu-game.css', 'uci-engine.js']) {
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
  assert.ok(head.includes('name="google-site-verification" content="verification-for-test"'));
  assert.ok(head.includes('name="rookori-ga4-measurement-id" content="G-TEST000000"'));
  assert.ok(head.includes('rel="canonical" href="https://example.test/preview/"'));
  assert.ok(head.includes('property="og:image" content="https://example.test/preview/brand/rookori-share.jpg"'));
});

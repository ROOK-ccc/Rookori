const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { copyFileSync, cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

test('公開用ビルドに学習レポート・自作問題・対局復習が入り、エディターを含まない', t => {
  const scratch = mkdtempSync(join(tmpdir(), 'chesspath-publish-test-'));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  for (const file of readdirSync(__dirname).filter(name => /\.(cjs|css|html|js)$/.test(name))) {
    copyFileSync(join(__dirname, file), join(scratch, file));
  }
  for (const dir of ['brand', 'pieces', 'vendor']) cpSync(join(__dirname, dir), join(scratch, dir), { recursive: true });
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
  assert.match(html, /property="og:image" content="https:\/\/rook-ccc\.github\.io\/ChessPath\/brand\/rookori-share\.jpg"/);
  for (const file of ['rookori.png', 'rookori-share.jpg']) {
    assert.deepEqual(readFileSync(join(published, 'brand', file)), readFileSync(join(__dirname, 'brand', file)));
  }
  for (const [, file] of html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+\.(?:js|css))"/g)) {
    assert.ok(artifacts.includes(file) || file === 'vendor/chess.js', file);
    assert.ok(readFileSync(join(published, file)).length, file);
  }
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(([, id]) => id);
  assert.equal(ids.length, new Set(ids).size, '画面内のIDは重複しない');
  assert.match(html, /src="learning-insights\.js"/);
  assert.match(html, /src="learning-progress-ui\.js"/);
  for (const file of ['game-review.js', 'game-library.js', 'game-review-ui.js', 'game-review.css',
    'opening-classification.js', 'chess-terms.js', 'chess-glossary.js']) {
    assert.ok(artifacts.includes(file));
  }
  assert.ok(!artifacts.some(file => file.startsWith('editor.')));
  assert.ok(!artifacts.some(file => file.endsWith('.test.cjs')));
  const pack = folder => runInNewContext(readFileSync(join(folder, 'course-problems.js'), 'utf8')
    + '\nJSON.stringify(publishedProblemPack)');
  assert.deepEqual(JSON.parse(pack(published)), JSON.parse(pack(__dirname)));
});

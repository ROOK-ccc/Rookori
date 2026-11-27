const { createServer } = require('node:http');
const { createReadStream, readFileSync, writeFileSync, renameSync, unlinkSync, existsSync } = require('node:fs');
const { extname, join } = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const { isDeepStrictEqual } = require('node:util');
const { runInNewContext } = require('node:vm');

const host = '127.0.0.1';
const args = process.argv.slice(2);
const port = Number(args.find(arg => arg !== '--open') ?? 8000);
if (typeof fetch !== 'function') {
  console.error('起動できません。Node.js 18以降をインストールしてください。');
  process.exit(1);
}
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  console.error('起動できません。1024〜65535のポート番号を指定してください。');
  process.exit(1);
}
const authority = host + ':' + port;
const origin = 'http://' + authority;
const token = randomUUID();
const workspace = createHash('sha256').update(__dirname.toLowerCase()).digest('hex');
const required = ['opening-editor.html', 'practice-editor.html', 'editor-local.js'];
const missing = required.find(file => !existsSync(join(__dirname, file)));
if (missing) {
  console.error(`起動できません。作業フォルダーに ${missing} がありません。`);
  process.exit(1);
}

const files = new Set([
  'opening-editor.html', 'styles.css', 'editor.css', 'vendor/chess.js', 'opening-data.js',
  'opening-expansion.js', 'opening-edits-data.js', 'opening-edits.js', 'opening-variations.js',
  'opening-study.js', 'opening-memory.js', 'opening-editor.js',
  'practice-editor.html', 'practice-editor.js', 'practice-editor-validate.js', 'practice-edits.json',
  'game-study.js', 'practice-explanation.js', 'editor-local.js',
]);
const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

const read = file => readFileSync(join(__dirname, file), 'utf8');
const evaluate = (files, expression) => runInNewContext(files.map(read).join('\n') + '\n' + expression, {}, { timeout: 3000 });
const json = (response, code, value) => response.writeHead(code, {
  'Content-Type': mime['.json'], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
}).end(JSON.stringify(value));

function apply({ kind, id, before, edit }) {
  if (typeof id !== 'string' || !edit || typeof edit !== 'object' || Array.isArray(edit)) throw new Error('反映する教材データを確認してください。');
  let file, pack, validate, openingPrefix;
  if (kind === 'opening' && /^[a-z0-9-]+$/.test(id)) {
    file = 'opening-edits-data.js';
    const source = read(file);
    const match = /^((?:\s*\/\/[^\n]*\n)*\s*)const openingEdits = (\{[\s\S]*\});\s*$/.exec(source);
    if (!match) throw new Error('オープニング変更ファイルの形式を確認してください。');
    openingPrefix = match[1];
    pack = JSON.parse(match[2]);
    const { entries, validateOpeningEdits } = evaluate(['vendor/chess.js', 'opening-data.js', 'opening-expansion.js', 'opening-edits.js', 'opening-variations.js'],
      '({ entries: [...baseStudyOpenings, ...baseOpeningVariations], validateOpeningEdits })');
    validate = () => { validateOpeningEdits({ ...pack, [id]: edit }, entries); return edit; };
  } else if (kind === 'practice' && /^[A-Za-z0-9]{5}$/.test(id)) {
    file = 'practice-edits.json';
    pack = JSON.parse(read(file));
    const catalog = JSON.parse(read('puzzles/catalog.json'));
    const batch = Object.keys(catalog.batches).find(name => /^[0-3]-\d+$/.test(name) && catalog.batches[name].ids.includes(id));
    if (!batch) throw new Error('問題IDが見つかりません。');
    const row = JSON.parse(read('puzzles/' + batch + '.json')).find(row => row[0] === id);
    const { chessRules, validatePracticeEdit } = evaluate(['vendor/chess.js', 'practice-editor-validate.js'], '({ chessRules, validatePracticeEdit })');
    validate = () => validatePracticeEdit(edit, row, chessRules);
  } else throw new Error('教材の種類またはIDが正しくありません。');
  if (!isDeepStrictEqual(Object.hasOwn(pack, id) ? pack[id] : null, before)) {
    throw Object.assign(new Error('この教材は別の画面で変更されました。編集中の文章を控え、再読み込みして差分を確認してください。'), { status: 409 });
  }
  const saved = validate();
  const serialized = JSON.stringify({ ...pack, [id]: saved }, null, 2);
  const destination = join(__dirname, file);
  const temp = destination + '.' + randomUUID() + '.tmp';
  try {
    writeFileSync(temp, kind === 'opening' ? openingPrefix + 'const openingEdits = ' + serialized + ';\n' : serialized + '\n', { flag: 'wx' });
    renameSync(temp, destination);
  } finally { if (existsSync(temp)) unlinkSync(temp); }
  return saved;
}

const server = createServer(async (request, response) => {
  if (request.headers.host !== authority) { response.writeHead(403).end(); return; }
  const file = request.url.split('?')[0].slice(1);
  if (request.method === 'GET' && file === 'editor-health') { json(response, 200, { workspace }); return; }
  if (request.method === 'GET' && file === 'editor-session' && [undefined, 'same-origin'].includes(request.headers['sec-fetch-site'])) {
    json(response, 200, { token });
    return;
  }
  if (request.method === 'POST' && file === 'editor-apply') {
    if (request.headers.origin !== origin || request.headers['x-rookori-editor'] !== token
      || request.headers['content-type'] !== 'application/json') {
      json(response, 403, { error: 'エディターから操作をやり直してください。' });
      return;
    }
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 512 * 1024) { json(response, 413, { error: '反映するデータが大きすぎます。' }); return; }
        chunks.push(chunk);
      }
      json(response, 200, { edit: apply(JSON.parse(Buffer.concat(chunks).toString('utf8'))) });
    } catch (error) {
      json(response, error.status ?? 400, { error: error.code ? '作業フォルダーに書き込めません。ファイルの使用状況と権限を確認してください。'
        : error instanceof SyntaxError ? '教材データの書式を確認してください。' : error.message });
    }
    return;
  }
  if (request.method !== 'GET' || !files.has(file) && !/^pieces\/cburnett\/[wb][KQRBNP]\.svg$/.test(file)
    && !/^puzzles\/(catalog|[0-3]-\d+)\.json$/.test(file)) {
    response.writeHead(404).end();
    return;
  }
  const stream = createReadStream(join(__dirname, file));
  stream.on('error', () => response.writeHead(404).end());
  stream.on('open', () => {
    response.writeHead(200, { 'Content-Type': mime[extname(file)], 'Cache-Control': 'no-store' });
    stream.pipe(response);
  });
});

function openEditor() {
  const url = origin + '/opening-editor.html';
  console.log('教材編集 ' + url);
  if (!args.includes('--open')) return;
  const browser = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `$ErrorActionPreference = 'Stop'; Start-Process '${url}'`], { stdio: 'ignore', windowsHide: true });
  const failed = () => {
    console.error('ブラウザーを開けませんでした。Windowsの既定のブラウザーを確認し、上のURLを手動で開いてください。');
    process.exitCode = 1;
  };
  browser.on('error', failed);
  browser.on('exit', code => { if (code !== 0) failed(); });
}

server.on('error', async error => {
  if (error.code === 'EADDRINUSE') {
    try {
      const result = await fetch(origin + '/editor-health', { signal: AbortSignal.timeout(2000), redirect: 'error' });
      if (result.ok && (await result.json()).workspace === workspace) {
        console.log('すでに起動している教材編集サーバーを使います。');
        openEditor();
        return;
      }
    } catch { /* The port belongs to a different service. */ }
    console.error(`起動できません。ポート ${port} は別のアプリで使用中です。そのアプリを終了するか、node opening-editor-server.cjs 8001 --open を実行してください。`);
  } else {
    console.error(`ローカルサーバーを起動できません。ポート ${port} とWindowsの権限を確認してください（${error.code || '詳細不明'}）。`);
  }
  process.exitCode = 1;
}).listen(port, host, () => openEditor());

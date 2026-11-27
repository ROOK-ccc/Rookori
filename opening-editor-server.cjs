const { createServer } = require('node:http');
const { createReadStream } = require('node:fs');
const { extname, join } = require('node:path');

const host = '127.0.0.1';
const port = Number(process.argv[2] ?? 8000);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('1024〜65535のポート番号を指定してください。');

const files = new Set([
  'opening-editor.html', 'styles.css', 'editor.css', 'vendor/chess.js', 'opening-data.js',
  'opening-expansion.js', 'opening-edits-data.js', 'opening-edits.js', 'opening-variations.js',
  'opening-study.js', 'opening-memory.js', 'opening-editor.js',
  'practice-editor.html', 'practice-editor.js', 'practice-editor-validate.js', 'practice-edits.json',
]);
const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

createServer((request, response) => {
  const file = request.url.split('?')[0].slice(1);
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
}).on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? 'このポートは使用中です。node opening-editor-server.cjs 8001 を試してください。' : error.message);
  process.exitCode = 1;
}).listen(port, host, () => console.log(`オープニング教材編集 http://${host}:${port}/opening-editor.html`));

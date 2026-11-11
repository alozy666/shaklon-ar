// خادم محلي صغير للتطوير والاختبار فقط (لا يُستخدم في النشر).
// التشغيل: node shaklon-ar/tools/serve.mjs [port]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || process.argv[2] || 8377);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg', '.mind': 'application/octet-stream', '.md': 'text/plain; charset=utf-8',
};

// أدوات tools/ تحفظ مخرجاتها عبر هذا المسار، في هذه المجلدات فقط:
// assets/targets (السجادة وملف التتبّع)، assets/360 (صورة 360)،
// و .capture (لقطات وصوت تسجيل الفيديو التجريبي من tools/dev-capture.js: خارج git ولا يُنشر).
const SAVE_DIRS = {
  targets: path.join(root, 'assets', 'targets'),
  360: path.join(root, 'assets', '360'),
  capture: path.join(root, '.capture'),
};

function send(res, code, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'POST' && url.pathname === '/__save') {
    const name = path.basename(url.searchParams.get('name') || '');
    const dir = SAVE_DIRS[url.searchParams.get('dir') || 'targets'];
    if (!dir || !/^[\w.-]+\.(png|mind|jpg|wav)$/.test(name)) return send(res, 400, 'bad name');
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, name), Buffer.concat(chunks));
      send(res, 200, 'saved ' + name);
    });
    return;
  }

  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(root, rel);
  if (!file.startsWith(root)) return send(res, 403, 'forbidden');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'not found');
    send(res, 200, data, TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
  });
}).listen(port, '127.0.0.1', () => {
  console.log(`shaklon-ar: http://localhost:${port}/`);
});

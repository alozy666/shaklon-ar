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

// أدوات tools/ تحفظ مخرجاتها (صور البطاقات وملف التتبّع) عبر هذا المسار، داخل assets/targets فقط.
const SAVE_DIR = path.join(root, 'assets', 'targets');

function send(res, code, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'POST' && url.pathname === '/__save') {
    const name = path.basename(url.searchParams.get('name') || '');
    if (!/^[\w.-]+\.(png|mind)$/.test(name)) return send(res, 400, 'bad name');
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      fs.mkdirSync(SAVE_DIR, { recursive: true });
      fs.writeFileSync(path.join(SAVE_DIR, name), Buffer.concat(chunks));
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

// Tiny static server for the generated Allure report (Allure 2 needs http://, file:// does not work).
// Started by allure-teardown.ts as a detached, windowless node process:
//   node scripts/serve-report.cjs <dir> <preferredPort> <infoFile>
// It listens on the preferred port (or the next free one) and writes { pid, port } to <infoFile>.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || 'allure-report');
const preferred = Number(process.argv[3]) || 5050;
const infoFile = process.argv[4];

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.webm': 'video/webm', '.mp4': 'video/mp4', '.zip': 'application/zip', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.map': 'application/json',
};

const server = http.createServer((req, res) => {
  try {
    let rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(root, rel);
    if (!file.startsWith(root + path.sep)) return void res.writeHead(403).end();
    const stat = fs.statSync(file);
    if (!stat.isFile()) return void res.writeHead(404).end();
    const headers = { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (range && (range[1] || range[2])) { // video seeking
      const start = range[1] ? Number(range[1]) : Math.max(0, stat.size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
      if (start > end || start >= stat.size) return void res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end();
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1 });
      return void fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { ...headers, 'Content-Length': stat.size });
    fs.createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404).end();
  }
});

function listen(port, attemptsLeft) {
  server.once('error', (error) => {
    if (error.code === 'EADDRINUSE' && attemptsLeft > 0) listen(port + 1, attemptsLeft - 1);
    else process.exit(1);
  });
  server.listen(port, '127.0.0.1', () => {
    if (infoFile) fs.writeFileSync(infoFile, JSON.stringify({ pid: process.pid, port: server.address().port }));
  });
}
listen(preferred, 30);

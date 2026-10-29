import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const allowed = new Set(['index.html', 'app.js', 'core.js', 'storage.js', 'styles.css', 'icon.svg']);
const server = http.createServer(async (req, res) => {
  try {
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\//, '') || 'index.html';
    if (!allowed.has(name)) { res.writeHead(404); res.end('Not found'); return; }
    const body = await readFile(path.join(root, name));
    res.writeHead(200, { 'Content-Type': types[path.extname(name)], 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' }); res.end(body);
  } catch { res.writeHead(500); res.end('Server error'); }
});
server.listen(Number(process.env.PORT || 4173), '127.0.0.1', () => console.log(`Local: http://localhost:${server.address().port}`));

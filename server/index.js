// Minimal HTTP server for the label recognition API.
// Dev:  node server/index.js            (Vite proxies /api here)
// Prod: node server/index.js            (also serves dist/ when it exists)
// Expose through Tailscale: `tailscale serve --bg <port>` on the machine running this.
// Product photos are forwarded to the model provider and are not written to disk or logged.

import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { buildPrompt, createGeminiCaller, createRecognizeHandler } from './recognize.js';

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '127.0.0.1';
const MAX_BODY_BYTES = 6 * 1024 * 1024;
const DIST = resolve(process.cwd(), 'dist');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };

const apiKey = process.env.GEMINI_API_KEY;
const handler = apiKey
  ? createRecognizeHandler({ callModel: createGeminiCaller({ apiKey, model: process.env.GEMINI_MODEL || undefined, thinkingLevel: process.env.GEMINI_THINKING ?? 'low', fallbackModel: process.env.GEMINI_FALLBACK_MODEL || undefined }), prompt: buildPrompt() })
  : async () => ({ status: 503, body: { ok: false, code: 'not-configured', message: '분석 서버에 API 키가 설정되지 않았습니다.' } });

function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(payload);
}

function readJson(req) {
  return new Promise((resolveBody, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(Object.assign(new Error('bad json'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res) {
  if (!existsSync(DIST)) return send(res, 404, { ok: false, message: 'dist/ 가 없습니다. npm run build 후 다시 실행하거나 Vite dev 서버를 사용하세요.' });
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(DIST, path);
  if (!file.startsWith(DIST)) return send(res, 403, { ok: false });
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/health') return send(res, 200, { ok: true, configured: Boolean(apiKey) });
  if (url.pathname === '/api/recognize') {
    if (req.method !== 'POST') return send(res, 405, { ok: false, message: 'POST only' }, { allow: 'POST' });
    try {
      const body = await readJson(req);
      const { status, body: out } = await handler(body);
      return send(res, status, out);
    } catch (error) {
      return send(res, error.status ?? 500, { ok: false, code: 'bad-request', message: error.status === 413 ? '요청이 너무 큽니다.' : '요청을 읽지 못했습니다.' });
    }
  }
  if (req.method === 'GET') return serveStatic(req, res);
  send(res, 404, { ok: false });
});

server.listen(PORT, HOST, () => {
  console.log(`SunGuard recognition server on http://${HOST}:${PORT} (model ${apiKey ? 'configured' : 'NOT configured'})`);
});

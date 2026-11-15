import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import app from '../api/index.js';

test('Vercel entry serves the existing API routes without starting a development server', async t => {
  const server = createServer(app).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;

  assert.equal((await (await fetch(`${base}/api/health`)).json()).ok, true);
  for (const path of ['/api/uv', '/api/uv/current']) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 400);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  const response = await fetch(`${base}/api/recognize`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{invalid',
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, 'bad-request');
  assert.equal((await fetch(`${base}/api/unknown`)).status, 404);
});

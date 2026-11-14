import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createApp, createRecognizer } from '../server/app.js';

const fixture = name => readFileSync(new URL(`./fixtures/recognition/${name}`, import.meta.url), 'utf8');
const jpeg = { mimeType: 'image/jpeg', data: Buffer.alloc(12, 1).toString('base64') };

async function listen(t, app) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

const post = (url, body) => fetch(`${url}/api/recognize`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });

test('recognize route answers 503 and health reports unconfigured without a key', async t => {
  const url = await listen(t, createApp({ getUv: async () => ({}), recognizer: createRecognizer({ apiKey: '' }) }));
  const health = await (await fetch(`${url}/api/health`)).json();
  assert.equal(health.recognitionConfigured, false);
  const response = await post(url, { images: [jpeg] });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'not-configured');
});

test('recognize route returns the parsed result from the handler', async t => {
  const recognizer = { configured: true, handle: async body => ({ status: 200, body: { ok: true, result: JSON.parse(fixture('front-only.json')), echoed: body.images.length } }) };
  const url = await listen(t, createApp({ getUv: async () => ({}), recognizer }));
  const response = await post(url, { images: [jpeg, jpeg] });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.equal(body.result.brand, 'Biore');
  assert.equal(body.echoed, 2);
});

test('recognize route rejects malformed JSON and oversized bodies', async t => {
  const url = await listen(t, createApp({ getUv: async () => ({}), recognizer: { configured: true, handle: async () => ({ status: 200, body: { ok: true } }) } }));
  const bad = await post(url, '{not json');
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).code, 'bad-request');
  const huge = await post(url, { images: [{ mimeType: 'image/jpeg', data: 'A'.repeat(7 * 1024 * 1024) }] });
  assert.equal(huge.status, 413);
  assert.equal((await huge.json()).code, 'request-too-large');
});

test('other API paths still return the shared 404', async t => {
  const url = await listen(t, createApp({ getUv: async () => ({}), recognizer: createRecognizer({ apiKey: '' }) }));
  assert.equal((await fetch(`${url}/api/nothing`)).status, 404);
});

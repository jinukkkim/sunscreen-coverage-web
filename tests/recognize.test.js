import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MAX_IMAGE_BYTES, RESPONSE_SCHEMA, buildPrompt, createGeminiCaller, createRecognizeHandler, parseModelOutput, validateImages,
} from '../server/recognize.js';

const fixture = name => readFileSync(new URL(`./fixtures/recognition/${name}`, import.meta.url), 'utf8');
const jpeg = (bytes = 12) => ({ mimeType: 'image/jpeg', data: Buffer.alloc(bytes, 1).toString('base64') });

test('parseModelOutput keeps a complete label as-is with normalised ingredients', () => {
  const r = parseModelOutput(fixture('full-label.json'));
  assert.equal(r.brand, '라운드랩');
  assert.equal(r.sellerName, '주식회사 서린컴퍼니');
  assert.equal(r.spf, 50);
  assert.equal(r.spfPlus, true);
  assert.equal(r.paGrade, 4);
  assert.equal(r.form, 'cream');
  assert.deepEqual(r.ingredients, ['정제수', '에칠헥실메톡시신나메이트', 'butyl methoxydibenzoylmethane', '징크옥사이드', '글리세린']);
  assert.deepEqual(r.notVisible, ['waterResistance']);
  assert.equal(r.confidence.spf, 0.98);
});

test('parseModelOutput leaves unreadable fields null for a front-only photo', () => {
  const r = parseModelOutput(fixture('front-only.json'));
  assert.equal(r.sellerName, null);
  assert.deepEqual(r.ingredients, []);
  assert.equal(r.form, 'unknown');
  assert.equal(r.confidence.ingredients, 0);
  assert.ok(r.notVisible.includes('ingredients'));
});

test('parseModelOutput neutralises out-of-range or off-schema values', () => {
  const r = parseModelOutput(fixture('out-of-range.json'));
  assert.equal(r.brand, null);
  assert.equal(r.spf, null);
  assert.equal(r.spfPlus, false, 'spfPlus cannot be true without a valid spf');
  assert.equal(r.confidence.spf, 0);
  assert.equal(r.paGrade, null);
  assert.equal(r.confidence.paGrade, 0);
  assert.equal(r.form, 'unknown');
  assert.equal(r.waterResistance, 'unknown');
  assert.deepEqual(r.ingredients, ['water', 'octocrylene']);
  assert.deepEqual(r.notVisible, ['brand']);
  for (const value of Object.values(r.confidence)) assert.ok(value >= 0 && value <= 1);
});

test('parseModelOutput strips markdown fences and rejects non-JSON', () => {
  const wrapped = '```json\n' + fixture('front-only.json') + '\n```';
  assert.equal(parseModelOutput(wrapped).brand, 'Biore');
  assert.throws(() => parseModelOutput(fixture('malformed.txt')), { code: 'bad-model-output', status: 502 });
  assert.throws(() => parseModelOutput('[1,2]'), { code: 'bad-model-output' });
});

test('validateImages enforces count, mime type and size', () => {
  assert.throws(() => validateImages([]), { code: 'no-images' });
  assert.throws(() => validateImages([jpeg(), jpeg(), jpeg()]), { code: 'too-many-images' });
  assert.throws(() => validateImages([{ mimeType: 'image/gif', data: 'AAAA' }]), { code: 'bad-mime' });
  assert.throws(() => validateImages([{ mimeType: 'image/jpeg', data: 'not base64!' }]), { code: 'bad-image' });
  assert.throws(() => validateImages([jpeg(MAX_IMAGE_BYTES + 10)]), { code: 'image-too-large', status: 413 });
  assert.equal(validateImages([jpeg(), jpeg()]).length, 2);
});

test('handler returns a parsed result and passes prompt and images to the model', async () => {
  let seen;
  const handle = createRecognizeHandler({
    callModel: async ({ prompt, images }) => { seen = { prompt, images }; return fixture('full-label.json'); },
  });
  const response = await handle({ images: [jpeg(), jpeg()] });
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.result.productName, '자작나무 수분 선크림');
  assert.equal(seen.images.length, 2);
  assert.match(seen.prompt, /Never guess/);
});

test('handler maps recognition errors to status codes and hides internal errors', async () => {
  const bad = createRecognizeHandler({ callModel: async () => 'garbage' });
  const r1 = await bad({ images: [jpeg()] });
  assert.equal(r1.status, 502);
  assert.equal(r1.body.code, 'bad-model-output');
  const r2 = await bad({ images: [] });
  assert.equal(r2.status, 400);
  assert.equal(r2.body.code, 'no-images');
  const crash = createRecognizeHandler({ callModel: async () => { throw new Error('secret stack'); } });
  const r3 = await crash({ images: [jpeg()] });
  assert.equal(r3.status, 500);
  assert.equal(r3.body.code, 'internal');
  assert.doesNotMatch(JSON.stringify(r3.body), /secret/);
});

test('gemini caller sends the key in a header, requests JSON and extracts the text part', async () => {
  let captured;
  const call = createGeminiCaller({
    apiKey: 'k', model: 'test-model',
    fetch: async (url, init) => {
      captured = { url, init };
      return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"a":' }, { text: '1}' }] } }] }) };
    },
  });
  const text = await call({ prompt: 'p', images: [jpeg()] });
  assert.equal(text, '{"a":1}');
  assert.match(captured.url, /models\/test-model:generateContent$/);
  assert.doesNotMatch(captured.url, /key=/, 'api key must not be in the URL');
  assert.equal(captured.init.headers['x-goog-api-key'], 'k');
  const body = JSON.parse(captured.init.body);
  assert.equal(body.generationConfig.response_mime_type, 'application/json');
  assert.deepEqual(body.generationConfig.response_schema, RESPONSE_SCHEMA);
  assert.equal(body.generationConfig.thinking_config.thinking_level, 'low');
  assert.equal(body.contents[0].parts[0].text, 'p');
  assert.equal(body.contents[0].parts[1].inline_data.mime_type, 'image/jpeg');
});

test('gemini caller converts provider failures into recognition errors', async () => {
  const limited = createGeminiCaller({ apiKey: 'k', fetch: async () => ({ ok: false, status: 429, text: async () => 'quota' }), log: () => {}, sleep: async () => {} });
  await assert.rejects(limited({ prompt: 'p', images: [jpeg()] }), { code: 'model-unavailable', status: 429, providerStatus: 429 });
  const logged = [];
  const notFound = createGeminiCaller({ apiKey: 'secret-key', model: 'm', fetch: async () => ({ ok: false, status: 404, text: async () => '{"error":{"message":"model not found"}}' }), log: m => logged.push(m) });
  await assert.rejects(notFound({ prompt: 'p', images: [jpeg()] }), { code: 'model-unavailable', status: 502, providerStatus: 404, message: /GEMINI_MODEL/ });
  assert.match(logged[0], /404/);
  assert.match(logged[0], /model not found/);
  assert.doesNotMatch(logged[0], /secret-key/);
  const forbidden = createGeminiCaller({ apiKey: 'k', fetch: async () => ({ ok: false, status: 403, text: async () => '' }), log: () => {} });
  await assert.rejects(forbidden({ prompt: 'p', images: [jpeg()] }), { message: /API 키/ });
  const down = createGeminiCaller({ apiKey: 'k', fetch: async () => { throw new TypeError('fetch failed'); } });
  await assert.rejects(down({ prompt: 'p', images: [jpeg()] }), { code: 'model-unavailable', status: 502 });
  const empty = createGeminiCaller({ apiKey: 'k', fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }) });
  await assert.rejects(empty({ prompt: 'p', images: [jpeg()] }), { code: 'bad-model-output' });
  assert.throws(() => createGeminiCaller({ apiKey: '' }), /GEMINI_API_KEY/);
});

test('prompt forbids guessing and documents every enum', () => {
  const prompt = buildPrompt();
  assert.match(prompt, /Never guess/);
  for (const token of ['cream', 'spray', '40min', '80min', 'notVisible', '책임판매업자']) assert.ok(prompt.includes(token), token);
});

test('parseModelOutput keeps at most three distinct candidates, best first', () => {
  const r = parseModelOutput(fixture('full-label.json'));
  assert.equal(r.candidates.length, 3);
  assert.equal(r.candidates[0].productName, '자작나무 수분 선크림');
  assert.equal(r.candidates[0].label, '한글 표기');
  assert.equal(r.candidates[0].score, 0.9);
  assert.equal(r.candidates[1].brand, 'ROUND LAB');
  assert.equal(r.candidates[2].spf, 30, 'duplicate reading is skipped so the SPF 30 reading fits');
  assert.equal(r.candidates[2].spfPlus, false);
  assert.ok(!r.candidates.some(c => c.brand === 'X'));
});

test('parseModelOutput synthesises one candidate when the model returns none', () => {
  const r = parseModelOutput(fixture('front-only.json'));
  assert.equal(r.candidates.length, 1);
  assert.equal(r.candidates[0].brand, 'Biore');
  assert.equal(r.candidates[0].label, '');
  assert.ok(r.candidates[0].score > 0 && r.candidates[0].score <= 1);
});

test('parseModelOutput puts the top-level reading first when candidates disagree with it', () => {
  const text = JSON.stringify({ ...JSON.parse(fixture('front-only.json')), candidates: [{ brand: 'Other', productName: 'Thing', spfPlus: false, form: 'gel', waterResistance: 'unknown', score: 0.9 }] });
  const r = parseModelOutput(text);
  assert.equal(r.candidates.length, 2);
  assert.equal(r.candidates[0].brand, 'Biore');
  assert.equal(r.candidates[1].brand, 'Other');
  assert.equal(r.candidates[1].form, 'gel');
});


test('gemini caller falls back to the lite model when the primary is busy', async () => {
  const calls = [];
  const fetch = async url => {
    calls.push(url);
    if (url.includes('gemini-3.8-flash')) return { ok: false, status: 503, text: async () => 'high demand' };
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"ok":1}' }] } }] }) };
  };
  const call = createGeminiCaller({ apiKey: 'k', fetch, log: () => {}, sleep: async () => {} });
  assert.equal(await call({ prompt: 'p', images: [jpeg()] }), '{"ok":1}');
  assert.equal(calls.length, 2);
  assert.match(calls[0], /gemini-3\.8-flash/);
  assert.match(calls[1], /gemini-3\.5-flash-lite/);
});

test('gemini caller falls back when the primary times out', async () => {
  const calls = [];
  const fetch = (url, init) => {
    calls.push(url);
    if (url.includes('gemini-3.8-flash')) return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"ok":2}' }] } }] }) });
  };
  const logged = [];
  const call = createGeminiCaller({ apiKey: 'k', fetch, timeoutMs: 5, log: m => logged.push(m), sleep: async () => {} });
  assert.equal(await call({ prompt: 'p', images: [jpeg()] }), '{"ok":2}');
  assert.equal(calls.length, 2);
  assert.match(logged[0], /timed out/);
});

test('gemini caller does not retry non-transient failures', async () => {
  let n = 0;
  const call = createGeminiCaller({ apiKey: 'k', fetch: async () => { n += 1; return { ok: false, status: 404, text: async () => '' }; }, log: () => {}, sleep: async () => {} });
  await assert.rejects(call({ prompt: 'p', images: [jpeg()] }), { providerStatus: 404 });
  assert.equal(n, 1);
});

test('gemini caller gives up after the fallback is also busy', async () => {
  let n = 0;
  const call = createGeminiCaller({ apiKey: 'k', fetch: async () => { n += 1; return { ok: false, status: 503, text: async () => 'busy' }; }, log: () => {}, sleep: async () => {} });
  await assert.rejects(call({ prompt: 'p', images: [jpeg()] }), { providerStatus: 503, message: /혼잡/ });
  assert.equal(n, 2);
});

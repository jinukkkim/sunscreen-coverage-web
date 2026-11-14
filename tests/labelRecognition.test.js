import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { candidateTitle, candidatesFromRecognition, createVisionAdapter, draftFromRecognition, needsReview, recognizeLabel } from '../src/lib/labelRecognition.js';
import { validateProfile } from '../src/lib/product.js';
import { parseModelOutput } from '../server/recognize.js';

const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/recognition/${name}`, import.meta.url), 'utf8'));
const image = { mimeType: 'image/jpeg', data: 'AAAA' };
const jsonResponse = (status, body) => ({ ok: status < 400, status, json: async () => body });

test('vision adapter posts images and returns the server result', async () => {
  let captured;
  const adapter = createVisionAdapter({ fetch: async (url, init) => { captured = { url, init }; return jsonResponse(200, { ok: true, result: fixture('full-label.json') }); } });
  const result = await recognizeLabel([image], { adapter });
  assert.equal(result.productName, '자작나무 수분 선크림');
  assert.equal(captured.url, '/api/recognize');
  assert.deepEqual(JSON.parse(captured.init.body), { images: [image] });
});

test('vision adapter surfaces server error codes and network failures', async () => {
  const down = createVisionAdapter({ fetch: async () => jsonResponse(503, { ok: false, code: 'not-configured', message: '키 없음' }) });
  await assert.rejects(recognizeLabel([image], { adapter: down }), { code: 'not-configured', message: '키 없음' });
  const html = createVisionAdapter({ fetch: async () => ({ ok: false, status: 502, json: async () => { throw new Error('html'); } }) });
  await assert.rejects(recognizeLabel([image], { adapter: html }), { code: 'http-502' });
  const offline = createVisionAdapter({ fetch: async () => { throw new TypeError('Failed to fetch'); } });
  await assert.rejects(recognizeLabel([image], { adapter: offline }), { code: 'network' });
  await assert.rejects(recognizeLabel([image], {}), { code: 'no-adapter' });
});

test('vision adapter reports cancellation separately from timeout', async () => {
  const controller = new AbortController();
  const adapter = createVisionAdapter({
    fetch: (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))),
  });
  const pending = recognizeLabel([image], { adapter, signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { code: 'cancelled' });
  const slow = createVisionAdapter({ timeoutMs: 5, fetch: (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))) });
  await assert.rejects(recognizeLabel([image], { adapter: slow }), { code: 'timeout' });
});

test('draftFromRecognition yields a valid, photo-sourced profile from a full label', () => {
  const draft = draftFromRecognition(parseModelOutput(JSON.stringify(fixture('full-label.json'))));
  assert.equal(draft.name, '라운드랩 자작나무 수분 선크림');
  assert.equal(draft.source, 'photo-ai');
  assert.equal(draft.spf, 50);
  assert.equal(draft.spfPlus, true);
  assert.equal(draft.paGrade, 4);
  assert.ok(draft.ingredients.includes('징크옥사이드'));
  assert.equal(validateProfile(draft).ok, true);
  assert.equal(needsReview(draft, 'spf'), false);
  assert.equal(needsReview(draft, 'waterResistance'), true);
});

test('draftFromRecognition flags unread fields for review', () => {
  const draft = draftFromRecognition(parseModelOutput(JSON.stringify(fixture('front-only.json'))));
  assert.equal(draft.name, 'Biore UV Aqua Rich Watery Essence');
  assert.equal(draft.sellerName, '');
  assert.deepEqual(draft.ingredients, []);
  assert.equal(needsReview(draft, 'ingredients'), true);
  assert.equal(needsReview(draft, 'form'), true);
  assert.equal(needsReview(draft, 'paGrade'), false);
});

test('draftFromRecognition never produces an invalid profile from bad model output', () => {
  const draft = draftFromRecognition(parseModelOutput(JSON.stringify(fixture('out-of-range.json'))));
  assert.equal(draft.name, '선스틱');
  assert.equal(draft.spf, null);
  assert.equal(draft.form, 'unknown');
  assert.equal(validateProfile(draft).ok, true);
});

test('candidatesFromRecognition exposes ranked readings and draft follows the pick', () => {
  const result = parseModelOutput(JSON.stringify(fixture('full-label.json')));
  const list = candidatesFromRecognition(result);
  assert.equal(list.length, 3);
  assert.equal(candidateTitle(list[1]), 'ROUND LAB Birch Juice Moisturizing Sun Cream');
  const english = draftFromRecognition(result, 1);
  assert.equal(english.name, 'ROUND LAB Birch Juice Moisturizing Sun Cream');
  assert.equal(english.spf, 50);
  assert.deepEqual(english.ingredients, draftFromRecognition(result, 0).ingredients, 'ingredients are shared across candidates');
  const spf30 = draftFromRecognition(result, 2);
  assert.equal(spf30.spf, 30);
  assert.equal(spf30.form, 'lotion');
  assert.equal(validateProfile(spf30).ok, true);
  assert.equal(draftFromRecognition(result, 99).name, draftFromRecognition(result, 0).name, 'out-of-range index falls back to best');
});

test('candidatesFromRecognition falls back to the top-level reading for old servers', () => {
  const list = candidatesFromRecognition({ brand: 'B', productName: 'P', spf: 50, spfPlus: true, paGrade: 2, form: 'stick', waterResistance: '40min', ingredients: [] });
  assert.equal(list.length, 1);
  assert.equal(candidateTitle(list[0]), 'B P');
  assert.equal(list[0].score, null);
});

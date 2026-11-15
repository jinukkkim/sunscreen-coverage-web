import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { UvError } from '../server/uv.js';
import { currentUvDetails, formatUvTime, KMA_UV_SOURCE_URL, uvLevel } from '../src/lib/uv-details.js';
import { emptyCare, policyAt, recordApplication, nextDue } from '../src/lib/reapplication.js';

const at = value => Date.parse(`2026-11-14T${value}:00+09:00`);
const now = () => at('10:00');
const forecast = (value = 0) => ({
  source: '기상청', location: { name: '서울특별시', areaNo: '1100000000', distanceKm: 0.2 },
  publishedAt: new Date(at('09:00')).toISOString(), fetchedAt: new Date(now()).toISOString(),
  slots: [{ value, validFrom: new Date(at('09:00')).toISOString(), validTo: new Date(at('12:00')).toISOString() }],
});

test('current UV and reminder policy select the same KMA slot, including zero', () => {
  const state = recordApplication(emptyCare(), at('09:00'), now(), 'applied');
  for (const [value, minutes] of [[0, null], [3, 150], [4, 120], [7, 80], [8, 60]]) {
    const data = forecast(value), details = currentUvDetails(data, now());
    assert.equal(details.value, value);
    assert.equal(details.source, '기상청');
    assert.equal(details.sourceUrl, KMA_UV_SOURCE_URL);
    assert.equal(details.region.name, data.location.name);
    assert.equal(policyAt(data, now(), now()).minutes, minutes);
    if (minutes !== null) assert.equal(nextDue(state, now(), data).at, at('09:00') + minutes * 60000);
  }
  assert.match(formatUvTime(forecast().publishedAt), /09:00/);
});

test('UV card shows the KMA band and station distance', () => {
  assert.deepEqual([0, 2.9, 3, 5, 6, 7, 8, 10, 11, 15].map(uvLevel), ['낮음', '낮음', '보통', '보통', '높음', '높음', '매우 높음', '매우 높음', '위험', '위험']);
  assert.equal(uvLevel(-1), null);
  assert.equal(uvLevel(NaN), null);
  const details = currentUvDetails(forecast(7), now());
  assert.equal(details.level, '높음');
  assert.equal(details.region.distanceKm, 0.2);
  assert.equal(currentUvDetails(forecast(7), now() + 60 * 60000 + 1), null);
});

test('stale, future, missing and invalid forecast slots never become current UV', () => {
  assert.equal(currentUvDetails(null, now()), null);
  assert.equal(currentUvDetails({ ...forecast(), fetchedAt: new Date(at('08:59')).toISOString() }, now()), null);
  assert.equal(currentUvDetails({ ...forecast(), fetchedAt: new Date(at('10:02')).toISOString() }, now()), null);
  assert.equal(currentUvDetails({ ...forecast(), slots: [] }, now()), null);
  assert.equal(currentUvDetails(forecast(-1), now()), null);
  assert.equal(currentUvDetails(forecast(), at('12:00')), null);
});

async function start(t, options) {
  const server = createApp({ now, ...options }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('forecast and current API both delegate to the KMA service without Safemap or VWorld', async t => {
  const calls = [], data = forecast(7);
  const base = await start(t, { getUv: async (...coords) => { calls.push(coords); return data; } });
  const query = '?latitude=37.567&longitude=126.978';
  assert.deepEqual(await (await fetch(`${base}/api/uv${query}`)).json(), data);
  const reply = await fetch(`${base}/api/uv/current${query}`);
  assert.equal(reply.status, 200);
  assert.equal(reply.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await reply.json(), currentUvDetails(data, now()));
  assert.deepEqual(calls, [[37.567, 126.978], [37.567, 126.978]]);
  for (const invalid of ['', '?latitude=&longitude=127', '?latitude=91&longitude=127', '?latitude=37&latitude=38&longitude=127']) {
    assert.equal((await fetch(`${base}/api/uv/current${invalid}`)).status, 400);
  }
  assert.equal(calls.length, 2);
});

test('KMA key, empty data and unexpected service failures have safe API errors', async t => {
  for (const [getUv, status, code] of [
    [async () => { throw new UvError('KMA_SERVICE_KEY를 설정해 주세요.', 503, 'KEY_REQUIRED'); }, 503, 'KEY_REQUIRED'],
    [async () => forecast(-1), 502, 'NO_DATA'],
    [async () => { throw new Error('secret serviceKey=private'); }, 502, 'UPSTREAM_ERROR'],
  ]) {
    const base = await start(t, { getUv });
    const reply = await fetch(`${base}/api/uv/current?latitude=37.567&longitude=126.978`);
    assert.equal(reply.status, status);
    const body = await reply.json();
    assert.equal(body.code, code);
    assert.doesNotMatch(JSON.stringify(body), /secret|private/);
  }
});

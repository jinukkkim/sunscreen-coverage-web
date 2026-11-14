import test from 'node:test';
import assert from 'node:assert/strict';
import { createUvService, parseForecast, nearestLocation } from '../server/uv.js';
import { createApp } from '../server/app.js';
const now = () => Date.parse('2026-11-14T10:00:00+09:00');
const location = { areaNo: '1100000000', name: '서울특별시', latitude: 37.56, longitude: 126.98 };
const item = { areaNo: location.areaNo, date: '2026111409', h0: '0', h3: '4', h6: '', h9: '-999' };
const reply = data => new Response(JSON.stringify({ response: { header: { resultCode: '00' }, body: { items: { item: [data] } } } }));
test('forecast retains valid zero, publication time, gaps and three-hour intervals', () => {
  const data = parseForecast(item, now());
  assert.equal(data.slots.length, 2); assert.equal(data.slots[0].value, 0);
  assert.equal(data.slots[0].validTo, data.slots[1].validFrom);
  assert.throws(() => parseForecast({ ...item, date: '2026010100' }, now()), { code: 'NO_DATA' });
  assert.throws(() => parseForecast({ ...item, date: '2026111412' }, now()), { code: 'NO_DATA' });
});
test('nearest official station reports distance and rejects unsupported location', () => {
  assert.equal(nearestLocation(37.56, 126.98, [location]).distanceKm, 0);
  assert.throws(() => nearestLocation(35, 129, [location]), { code: 'OUTSIDE_COVERAGE' });
});
test('missing key fails explicitly without an upstream call', async () => {
  const service = createUvService({ fetcher: () => { throw new Error('must not call'); } });
  await assert.rejects(service(37.56, 126.98), { status: 503, code: 'KEY_REQUIRED' });
});
test('provider caches requests by station and release, keeps keys and exact coordinates private', async () => {
  let calls = 0;
  const service = createUvService({ key: 'test%2Bkey%3D', now, locations: [location], fetcher: async url => {
    calls++; assert.equal(url.searchParams.get('serviceKey'), 'test+key=');
    assert.equal(url.searchParams.has('latitude'), false);
    return reply(item);
  } });
  const result = await service(37.56, 126.98);
  await service(37.561, 126.981);
  assert.equal(calls, 1);
  assert.equal(JSON.stringify(result).includes('test+key'), false);
  assert.equal(result.location.latitude, undefined);
});
test('empty newest release retries a previous release and selects correct slots', async () => {
  let calls = 0;
  const service = createUvService({ key: 'test', now, locations: [location], fetcher: async () => {
    calls++; return reply(calls === 1 ? { ...item, h0: '' } : { ...item, date: '2026111406', h0: '1', h3: '5' });
  } });
  const result = await service(37.56, 126.98);
  assert.equal(calls, 2); assert.equal(result.slots[1].value, 5);
});
test('provider does not leak raw responses or keys on invalid upstream data', async () => {
  const service = createUvService({ key: 'secret', now, locations: [location], fetcher: async () => new Response('<xml>secret</xml>') });
  await assert.rejects(service(37.56, 126.98), error => error.code === 'UPSTREAM_ERROR' && !error.message.includes('secret'));
});
test('API validates coordinates and exposes meaningful configuration failures', async t => {
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  for (const query of ['', '?latitude=&longitude=126', '?latitude=90&longitude=0', '?latitude=NaN&longitude=127']) assert.equal((await fetch(`${url}/api/uv${query}`)).status, 400);
  const response = await fetch(`${url}/api/uv?latitude=37.56&longitude=126.98`);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'KEY_REQUIRED');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createCurrentUvService, normalizeProvince, parseOccurrence, parseSafemapPage } from '../server/safemap-uv.js';
import { createApp } from '../server/app.js';
import { locate } from '../src/lib/location.js';
import { requestCurrentUv, formatCurrentUvTime } from '../src/lib/current-uv.js';

// Synthetic fixtures, modeled from the documented fields; not captured live responses.
const now = () => Date.parse('2026-11-14T10:00:00+09:00');
const coords = [37.583, 127.055];
const row = (overrides = {}) => ({ ctprvn_nm: '서울', signgu_nm: '동대문구', ulvry_index: '0', occrrnc_dt: '2026111409', ...overrides });
const geocode = (overrides = {}) => ({ response: { status: 'OK', result: [{ structure: { level1: '서울특별시', level2: '동대문구', level3: '', ...overrides } }] } });
const page = (rows, pageNo = 1, total = rows.length, size = 1000) => ({ response: { header: { resultCode: '00', resultMsg: 'NORMAL SERVICE' }, body: { items: { item: rows }, totalCount: total, pageNo, numOfRows: size } } });
const json = data => new Response(JSON.stringify(data));
function service({ pages = [page([row()])], address = geocode(), ...options } = {}) {
  const calls = [];
  const get = createCurrentUvService({ vworldKey: 'test-vworld', safemapKey: 'test%2Bkey%3D', now, fetcher: async url => {
    calls.push(url);
    if (url.hostname === 'api.vworld.kr') return json(address);
    assert.equal(url.origin + url.pathname, 'https://www.safemap.go.kr/openapi2/IF_0113');
    assert.deepEqual([...url.searchParams.keys()].sort(), ['numOfRows', 'pageNo', 'returnType', 'serviceKey']);
    assert.equal(url.searchParams.get('serviceKey'), 'test+key=');
    return json(pages[Number(url.searchParams.get('pageNo')) - 1]);
  }, ...options });
  return { get, calls };
}

test('current UV matches Dongdaemun exactly, retains zero and keeps coordinates/keys private', async () => {
  const { get, calls } = service();
  const data = await get(...coords);
  assert.equal(data.region.name, '서울특별시 동대문구');
  assert.equal(data.value, 0);
  assert.equal(data.occurredAt, '2026-11-14T00:00:00.000Z');
  assert.equal(data.stale, false);
  assert.equal(calls[0].searchParams.get('point'), '127.055,37.583');
  assert.equal(calls[0].searchParams.get('crs'), 'EPSG:4326');
  assert.equal(data.slots, undefined);
  assert.doesNotMatch(JSON.stringify(data), /test-vworld|test\+key|37\.583|127\.055/);
});
test('province aliases and renamed provinces are explicit, not fuzzy', () => {
  for (const names of [['서울', '서울특별시'], ['경기', '경기도'], ['강원', '강원도', '강원특별자치도'], ['전북', '전라북도', '전북특별자치도']]) {
    assert.ok(names.every(name => normalizeProvince(name) === normalizeProvince(names[0])));
  }
  assert.equal(normalizeProvince('해외'), null);
});
test('all pages are scanned and latest valid matching row wins over earlier nonzero values', async () => {
  const { get, calls } = service({ pages: [
    page([row({ ulvry_index: '8', occrrnc_dt: '2026111407' })], 1, 3, 1),
    page([row({ signgu_nm: '중랑구', ulvry_index: '7' })], 2, 3, 1),
    page([row()], 3, 3, 1),
  ] });
  assert.equal((await get(...coords)).value, 0);
  assert.equal(calls.length, 4);
});
test('general district whitespace matches, while a different gu or province never substitutes', async () => {
  const address = geocode({ level1: '경기도', level2: '수원시', level3: '영통구' });
  const { get } = service({ address, pages: [page([row({ ctprvn_nm: '경기', signgu_nm: '수원시영통구' })])] });
  assert.equal((await get(...coords)).region.district, '수원시 영통구');
  for (const candidate of [row({ ctprvn_nm: '부산' }), row({ signgu_nm: '서대문구' }), row({ signgu_nm: '' })]) {
    await assert.rejects(service({ pages: [page([candidate])] }).get(...coords), { code: 'CURRENT_UV_NO_DATA' });
  }
});
test('object geocode result and singleton item are accepted', async () => {
  const address = geocode(); address.response.result = address.response.result[0];
  const single = page([]); single.response.body.items.item = row(); single.response.body.totalCount = 1;
  assert.equal((await service({ address, pages: [single] }).get(...coords)).value, 0);
});
test('empty data, invalid UV, invalid dates and future timestamps do not create values', async () => {
  for (const rows of [[], [row({ ulvry_index: '' })], [row({ ulvry_index: '-999' })], [row({ occrrnc_dt: '2026023009' })], [row({ occrrnc_dt: '2026111412' })]]) {
    await assert.rejects(service({ pages: [page(rows)] }).get(...coords), { code: 'CURRENT_UV_NO_DATA' });
  }
});
test('old occurrence remains dated and explicitly marked stale', async () => {
  const data = await service({ pages: [page([row({ occrrnc_dt: '2026111309' })])] }).get(...coords);
  assert.equal(data.stale, true); assert.equal(data.staleAfterHours, 6);
  assert.equal(data.occurredAt, '2026-11-13T00:00:00.000Z');
});
test('KST occurrence parser rejects rollover and is independent of host timezone', () => {
  assert.equal(parseOccurrence('2026111409'), Date.parse('2026-11-14T09:00:00+09:00'));
  assert.equal(parseOccurrence('2026-11-14 09:30:12'), parseOccurrence('20261114093012'));
  for (const input of ['', '2026023009', '2026111424', '202611140960', 'random']) assert.equal(parseOccurrence(input), null);
  assert.match(formatCurrentUvTime('2026-11-14T00:00:00Z'), /09:00/);
});
test('both missing and placeholder keys prevent any upstream call', async () => {
  for (const [vworldKey, safemapKey] of [['', 'test'], ['test', ''], ['[지역명 인증키]', 'test'], ['test', '[자외선 인증키]']]) {
    let calls = 0;
    const get = createCurrentUvService({ vworldKey, safemapKey, fetcher: () => { calls++; } });
    await assert.rejects(get(...coords), { code: 'CURRENT_UV_KEY_REQUIRED', status: 503 });
    assert.equal(calls, 0);
  }
});
test('unsupported coordinates, NOT_FOUND, VWorld error and auth failures are distinguished', async () => {
  const { get, calls } = service();
  await assert.rejects(get(40, -73), { code: 'CURRENT_UV_UNSUPPORTED_REGION' }); assert.equal(calls.length, 0);
  for (const [response, code] of [
    [{ status: 'NOT_FOUND' }, 'CURRENT_UV_UNSUPPORTED_REGION'],
    [{ status: 'ERROR', error: { code: 'INVALID_KEY', text: 'secret' } }, 'CURRENT_UV_AUTH_FAILED'],
    [{ status: 'ERROR', error: { code: 'SYSTEM_ERROR' } }, 'CURRENT_UV_GEOCODE_ERROR'],
    [{ status: 'OK', result: [{ structure: { level1: '海外', level2: 'test' } }] }, 'CURRENT_UV_UNSUPPORTED_REGION'],
  ]) await assert.rejects(service({ address: { response } }).get(...coords), { code });
});
test('Safemap auth errors and unknown envelopes fail explicitly without leaking raw data', () => {
  const data = page([]); data.response.header = { resultCode: '30', resultMsg: 'secret' };
  assert.throws(() => parseSafemapPage(data), { code: 'CURRENT_UV_AUTH_FAILED' });
  assert.throws(() => parseSafemapPage({ secret: 'secret' }), { code: 'CURRENT_UV_RESPONSE_ERROR' });
});
test('later page failure and inconsistent metadata never return a partial latest value', async () => {
  const second = page([row()], 1, 2, 1);
  await assert.rejects(service({ pages: [page([row()], 1, 2, 1), second] }).get(...coords), { code: 'CURRENT_UV_RESPONSE_ERROR' });
  second.response.body.pageNo = 2; second.response.body.totalCount = 3;
  await assert.rejects(service({ pages: [page([row()], 1, 2, 1), second] }).get(...coords), { code: 'CURRENT_UV_RESPONSE_ERROR' });
});
test('network errors, HTTP auth, malformed JSON and hard timeout are sanitized', async () => {
  for (const [fetcher, code] of [
    [async () => { throw new Error('secret URL'); }, 'CURRENT_UV_NETWORK_ERROR'],
    [async () => new Response('secret', { status: 403 }), 'CURRENT_UV_AUTH_FAILED'],
    [async () => new Response('secret', { status: 500 }), 'CURRENT_UV_NETWORK_ERROR'],
    [async () => new Response('<xml>secret</xml>'), 'CURRENT_UV_RESPONSE_ERROR'],
    [async () => new Promise(() => {}), 'CURRENT_UV_TIMEOUT'],
  ]) await assert.rejects(service({ fetcher, timeoutMs: 10 }).get(...coords), error => error.code === code && !error.message.includes('secret'));
});
test('browser permission denial sends no server request and location errors remain actionable', async () => {
  let calls = 0;
  const locatePosition = () => locate({ getCurrentPosition(_ok, fail) { fail({ code: 1 }); } });
  await assert.rejects(requestCurrentUv({ locatePosition, fetcher: () => { calls++; } }), { code: 'CURRENT_UV_LOCATION_DENIED' });
  assert.equal(calls, 0);
  await assert.rejects(requestCurrentUv({ locatePosition: async () => { throw new Error('위치 확인 시간이 초과되었습니다.'); } }), { code: 'CURRENT_UV_LOCATION_ERROR' });
});
test('browser query rounds coordinates, retains zero, and handles server errors', async () => {
  const data = await service().get(...coords);
  const locatePosition = async () => ({ latitude: 37.58312, longitude: 127.05534 });
  const result = await requestCurrentUv({ locatePosition, fetcher: async (url, options) => {
    assert.match(url, /^\/api\/uv\/current\?latitude=37\.583&longitude=127\.055$/);
    assert.equal(options.cache, 'no-store'); return json(data);
  } });
  assert.equal(result.value, 0);
  await assert.rejects(requestCurrentUv({ locatePosition, fetcher: async () => new Response(JSON.stringify({ code: 'CURRENT_UV_NO_DATA', error: '해당 지역 자료 없음' }), { status: 404 }) }), { code: 'CURRENT_UV_NO_DATA' });
});
test('Express current route coexists with unchanged KMA forecast route', async t => {
  const expected = { source: '기상청', slots: [{ value: 4 }] };
  const current = await service().get(...coords);
  const server = createApp({ getUv: async () => expected, getCurrentUv: async () => current }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const forecast = await fetch(`${base}/api/uv?latitude=37.583&longitude=127.055`);
  assert.deepEqual(await forecast.json(), expected);
  const reply = await fetch(`${base}/api/uv/current?latitude=37.583&longitude=127.055`);
  assert.equal(reply.headers.get('cache-control'), 'no-store'); assert.deepEqual(await reply.json(), current);
  for (const query of ['', '?latitude=&longitude=127', '?latitude=91&longitude=127', '?latitude=NaN&longitude=127', '?latitude=37&latitude=38&longitude=127']) assert.equal((await fetch(`${base}/api/uv/current${query}`)).status, 400);
});

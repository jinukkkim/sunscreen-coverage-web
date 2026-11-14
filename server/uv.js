import { readFileSync } from 'node:fs';
const LOCATIONS = JSON.parse(readFileSync(new URL('./data/kma-locations.json', import.meta.url), 'utf8'));
const HOUR = 3600000;
export class UvError extends Error {
  constructor(message, status = 502, code = 'UPSTREAM_ERROR') { super(message); this.status = status; this.code = code; }
}
const stamp = time => new Date(time + 9 * HOUR).toISOString().replace(/[-:T]/g, '').slice(0, 10);
export function parseForecast(item, now) {
  const value = String(item.date);
  if (!/^\d{10}$/.test(value)) throw new UvError('예보 발표 시각이 올바르지 않습니다.', 502, 'NO_DATA');
  const published = Date.parse(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(8, 10)}:00:00+09:00`);
  if (!Number.isFinite(published) || stamp(published) !== value || published > now) throw new UvError('유효한 예보가 없습니다.', 502, 'NO_DATA');
  const slots = [];
  for (let h = 0; h <= 75; h += 3) {
    const raw = item[`h${h}`];
    const uv = raw === null || raw === undefined || String(raw).trim() === '' ? NaN : Number(raw);
    if (!Number.isFinite(uv) || uv < 0 || uv > 30) continue;
    slots.push({ value: uv, validFrom: new Date(published + h * HOUR).toISOString(), validTo: new Date(published + (h + 3) * HOUR).toISOString() });
  }
  if (!slots.some(slot => now >= Date.parse(slot.validFrom) && now < Date.parse(slot.validTo))) throw new UvError('현재 시간대 자외선 예보가 없습니다.', 502, 'NO_DATA');
  return { publishedAt: new Date(published).toISOString(), slots };
}

export function nearestLocation(latitude, longitude, locations = LOCATIONS) {
  let nearest = null, distance = Infinity;
  for (const location of locations) {
    const d = ((latitude - location.latitude) * 111) ** 2 + ((longitude - location.longitude) * 111 * Math.cos(latitude * Math.PI / 180)) ** 2;
    if (d < distance) { distance = d; nearest = location; }
  }
  if (!nearest || distance > 50 ** 2) throw new UvError('주변 기상청 지점을 찾지 못했습니다. 국내 위치를 사용해 주세요.', 400, 'OUTSIDE_COVERAGE');
  return { areaNo: nearest.areaNo, name: nearest.name, distanceKm: Math.round(Math.sqrt(distance) * 10) / 10 };
}

export function createUvService({ key = '', fetcher = fetch, now = Date.now, locations = LOCATIONS } = {}) {
  const cache = new Map(), pending = new Map();
  async function request(areaNo, time) {
    const cacheKey = `${areaNo}:${time}`;
    const previous = cache.get(cacheKey);
    if (previous && previous.expires > now()) return previous.item;
    if (pending.has(cacheKey)) return pending.get(cacheKey);
    const work = (async () => {
      try {
        let decodedKey;
        try { decodedKey = decodeURIComponent(key.trim()); } catch { decodedKey = key.trim(); }
        const url = new URL('https://apis.data.go.kr/1360000/LivingWthrIdxServiceV5/getUVIdxV5');
        url.search = new URLSearchParams({ serviceKey: decodedKey, dataType: 'JSON', numOfRows: '100', pageNo: '1', areaNo, time });
        const response = await fetcher(url, { signal: AbortSignal.timeout(5500) });
        if (!response.ok) throw new UvError('기상청 연결 또는 활용 승인 상태를 확인해 주세요.');
        const data = await response.json();
        const root = data.response;
        const code = String(root?.header?.resultCode);
        if (code !== '00' && code !== '0') throw new UvError(code === '03' ? '예보가 아직 없습니다.' : '기상청 인증키·활용 승인·호출 한도를 확인해 주세요.', 502, code === '03' ? 'NO_DATA' : 'UPSTREAM_ERROR');
        const raw = root?.body?.items?.item;
        const item = (Array.isArray(raw) ? raw : raw ? [raw] : []).find(item => String(item.areaNo) === areaNo);
        if (!item) throw new UvError('현재 지점의 예보가 없습니다.', 502, 'NO_DATA');
        parseForecast(item, now());
        if (cache.size >= 256) cache.delete(cache.keys().next().value);
        cache.set(cacheKey, { item, expires: now() + 10 * 60000 });
        return item;
      } catch (error) {
        if (error instanceof UvError) throw error;
        throw new UvError('기상청 응답을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      } finally { pending.delete(cacheKey); }
    })();
    pending.set(cacheKey, work);
    return work;
  }
  return async (latitude, longitude) => {
    if (!key.trim()) throw new UvError('서버에 KMA_SERVICE_KEY를 설정해 주세요. 알림과 도포 기록은 키 없이 사용할 수 있습니다.', 503, 'KEY_REQUIRED');
    const location = nearestLocation(latitude, longitude, locations);
    const time = now(), delayed = time - 20 * 60000;
    const hour = Number(stamp(delayed).slice(8, 10));
    const base = Math.floor(delayed / HOUR) * HOUR - (hour % 3) * HOUR;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const item = await request(location.areaNo, stamp(base - attempt * 3 * HOUR));
        return { source: '기상청', location, ...parseForecast(item, time), fetchedAt: new Date(time).toISOString() };
      } catch (error) { if (error.code !== 'NO_DATA' || attempt === 1) throw error; }
    }
  };
}

import { CurrentUvError, fetchCurrentUvJson, requireCurrentUvKeys } from './current-uv-common.js';
import { reverseGeocode } from './vworld.js';

const provinceGroups = [
  ['서울', '서울특별시'], ['부산', '부산광역시'], ['대구', '대구광역시'], ['인천', '인천광역시'],
  ['광주', '광주광역시'], ['대전', '대전광역시'], ['울산', '울산광역시'], ['세종', '세종특별자치시'],
  ['경기', '경기도'], ['강원', '강원도', '강원특별자치도'], ['충북', '충청북도'], ['충남', '충청남도'],
  ['전북', '전라북도', '전북특별자치도'], ['전남', '전라남도'], ['경북', '경상북도'], ['경남', '경상남도'], ['제주', '제주도', '제주특별자치도'],
];
const compact = value => typeof value === 'string' ? value.normalize('NFC').replace(/\s/g, '') : '';
export function normalizeProvince(value) { return provinceGroups.find(names => names.includes(compact(value)))?.[0] || null; }
function sameRegion(row, region) {
  const province = normalizeProvince(row.ctprvn_nm);
  if (!province || province !== normalizeProvince(region.province)) return false;
  const a = compact(row.signgu_nm), b = compact(region.district);
  if (province === '세종') return ['', '세종시', '세종특별자치시'].includes(a) && ['', '세종시', '세종특별자치시'].includes(b);
  return Boolean(a && b && a === b);
}

// Official grid displays YYYYMMDDHH. Also accept explicit minute/second and local ISO forms.
export function parseOccurrence(value) {
  const text = String(value ?? '').trim();
  let parts = /^(\d{4})(\d{2})(\d{2})(\d{2})(?:(\d{2})(?:(\d{2}))?)?$/.exec(text);
  if (!parts) parts = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\+09:00)?$/.exec(text);
  if (!parts) return null;
  const [, y, m, d, h, min = '00', sec = '00'] = parts;
  const stamp = `${y}-${m}-${d}T${h}:${min}:${sec}+09:00`;
  const time = Date.parse(stamp);
  if (!Number.isFinite(time) || Number(h) > 23 || Number(min) > 59 || Number(sec) > 59) return null;
  const local = new Date(time + 9 * 3600000).toISOString().slice(0, 19);
  return local === stamp.slice(0, 19) ? time : null;
}

// These envelope variants are adapters, not captured live fixtures. Reject unknown shapes explicitly.
export function parseSafemapPage(data) {
  const envelope = data?.response || data;
  const header = envelope?.header;
  const body = envelope?.body;
  if (!header || !body || header.resultCode === undefined) throw new CurrentUvError('CURRENT_UV_RESPONSE_ERROR', '생활안전지도 JSON 응답 구조를 확인할 수 없습니다. 운영자가 실제 응답을 확인해야 합니다.');
  const code = String(header.resultCode);
  if (!['00', '0', 'NORMAL_SERVICE'].includes(code)) {
    const auth = ['20', '21', '22', '30', '31', '32'].includes(code) || /KEY|AUTH|ACCESS_DENIED|인증/i.test(`${code} ${header.resultMsg || ''}`);
    throw new CurrentUvError(auth ? 'CURRENT_UV_AUTH_FAILED' : 'CURRENT_UV_UPSTREAM_ERROR', auth ? '생활안전지도 API 인증에 실패했습니다. 인증키와 이용 승인을 확인해 주세요.' : '생활안전지도 API가 조회 오류를 반환했습니다.');
  }
  const total = Number(body.totalCount), pageNo = Number(body.pageNo), pageSize = Number(body.numOfRows);
  if (body.totalCount === undefined || !Number.isSafeInteger(total) || total < 0 || !Number.isSafeInteger(pageNo) || pageNo < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1) throw new CurrentUvError('CURRENT_UV_RESPONSE_ERROR', '생활안전지도 페이지 정보를 확인할 수 없습니다.');
  const items = body.items;
  const raw = Array.isArray(items) ? items : items?.item;
  const rows = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : [];
  if (rows.some(row => !row || typeof row !== 'object') || (total > 0 && !rows.length)) throw new CurrentUvError('CURRENT_UV_RESPONSE_ERROR', '생활안전지도 자료 목록을 확인할 수 없습니다.');
  return { total, pageNo, pageSize, rows };
}

export function createCurrentUvService({ vworldKey = process.env.VWORLD_API_KEY, safemapKey = process.env.SAFEMAP_SERVICE_KEY, fetcher = fetch, now = Date.now, timeoutMs = 8000, budgetMs = 25000, staleAfterMs = 6 * 3600000 } = {}) {
  return async (latitude, longitude) => {
    requireCurrentUvKeys(vworldKey, safemapKey);
    const deadline = Date.now() + budgetMs;
    const remaining = () => {
      const left = deadline - Date.now();
      if (left <= 0) throw new CurrentUvError('CURRENT_UV_TIMEOUT', '현재 지역 자외선지수 전체 조회 시간이 초과되었습니다.', 504);
      return Math.min(timeoutMs, left);
    };
    const region = await reverseGeocode(latitude, longitude, { key: vworldKey, fetcher, timeoutMs: remaining() });
    let newest = null, received = 0, total = null;
    const checkedAt = now();
    for (let pageNo = 1; pageNo <= 100; pageNo++) {
      const url = new URL('https://www.safemap.go.kr/openapi2/IF_0113');
      // Accept either encoded or decoded service keys without double encoding.
      let key = safemapKey.trim();
      try { key = decodeURIComponent(key); } catch { /* URLSearchParams safely encodes the original key. */ }
      url.search = new URLSearchParams({ serviceKey: key, pageNo: String(pageNo), numOfRows: '1000', returnType: 'json' }).toString();
      const page = parseSafemapPage(await fetchCurrentUvJson(url, { fetcher, timeoutMs: remaining() }));
      if (page.pageNo !== pageNo || (total !== null && page.total !== total)) throw new CurrentUvError('CURRENT_UV_RESPONSE_ERROR', '조회 중 생활안전지도 페이지 정보가 변경되었습니다. 다시 조회해 주세요.');
      total = page.total;
      received += page.rows.length;
      if (page.rows.length > page.pageSize || received > total) throw new CurrentUvError('CURRENT_UV_RESPONSE_ERROR', '생활안전지도 페이지 개수가 일치하지 않습니다.');
      for (const row of page.rows) {
        if (!sameRegion(row, region)) continue;
        const rawValue = String(row.ulvry_index ?? '').trim();
        const value = /^\d+(?:\.\d+)?$/.test(rawValue) ? Number(rawValue) : NaN;
        const at = parseOccurrence(row.occrrnc_dt);
        if (!Number.isFinite(value) || at === null || at > checkedAt + 5 * 60000) continue;
        if (!newest || at > newest.at) newest = { at, value };
      }
      if (received === total) {
        if (!newest) throw new CurrentUvError('CURRENT_UV_NO_DATA', '해당 지역에 일치하는 유효한 자외선지수 자료가 없습니다.', 404);
        return { region, value: newest.value, occurredAt: new Date(newest.at).toISOString(), fetchedAt: new Date(checkedAt).toISOString(), stale: checkedAt - newest.at > staleAfterMs, staleAfterHours: staleAfterMs / 3600000, source: '행정안전부 생활안전지도', sourceUrl: 'https://www.safemap.go.kr/opna/data/dataViewRenew.do?objtId=232' };
      }
    }
    throw new CurrentUvError('CURRENT_UV_PAGE_LIMIT', '생활안전지도 전체 자료를 제한 시간·페이지 범위에서 확인하지 못했습니다. 최신 자료를 확정할 수 없습니다.');
  };
}

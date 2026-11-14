import { CurrentUvError, fetchCurrentUvJson } from './current-uv-common.js';
import { normalizeProvince } from './safemap-uv.js';

export async function reverseGeocode(latitude, longitude, { key, fetcher, timeoutMs } = {}) {
  // Bounding box is only an early exclusion; the returned administrative region is authoritative.
  if (latitude < 32 || latitude > 39.5 || longitude < 124 || longitude > 132) {
    throw new CurrentUvError('CURRENT_UV_UNSUPPORTED_REGION', '대한민국 내 지원 지역에서만 조회할 수 있습니다.', 422);
  }
  const url = new URL('https://api.vworld.kr/req/address');
  url.search = new URLSearchParams({ service: 'address', request: 'getAddress', version: '2.0', key: key.trim(), format: 'json', point: `${longitude},${latitude}`, crs: 'EPSG:4326', type: 'BOTH', simple: 'false' }).toString();
  const data = await fetchCurrentUvJson(url, { fetcher, timeoutMs });
  const response = data?.response;
  if (response?.status === 'NOT_FOUND') throw new CurrentUvError('CURRENT_UV_UNSUPPORTED_REGION', '해외 위치 또는 지원하지 않는 지역으로 주소를 확인할 수 없습니다.', 422);
  if (response?.status === 'ERROR') {
    const code = String(response.error?.code || '');
    if (/KEY|AUTH|DOMAIN|PERMISSION/i.test(code)) throw new CurrentUvError('CURRENT_UV_AUTH_FAILED', 'VWorld 인증에 실패했습니다. 인증키와 허용 도메인을 확인해 주세요.');
    throw new CurrentUvError('CURRENT_UV_GEOCODE_ERROR', 'VWorld 지역명 조회에 실패했습니다. 잠시 후 다시 조회해 주세요.');
  }
  if (response?.status !== 'OK') throw new CurrentUvError('CURRENT_UV_GEOCODE_ERROR', 'VWorld 지역명 응답을 확인할 수 없습니다.');
  const results = Array.isArray(response.result) ? response.result : [response.result];
  for (const address of results) {
    const structure = address?.structure;
    if (!structure || !normalizeProvince(structure.level1)) continue;
    const province = structure.level1.trim();
    const district = typeof structure.level2 === 'string' ? structure.level2.trim() : '';
    const subdistrict = typeof structure.level3 === 'string' ? structure.level3.trim() : '';
    // level3 may also be a town; only an explicit general district belongs in signgu_nm.
    const generalGu = /구$/.test(subdistrict) && !district.replace(/\s/g, '').endsWith(subdistrict.replace(/\s/g, '')) ? subdistrict : '';
    if (!district && normalizeProvince(province) !== '세종') continue;
    return { province, district: [district, generalGu].filter(Boolean).join(' '), name: [province, district, generalGu].filter(Boolean).join(' ') };
  }
  throw new CurrentUvError('CURRENT_UV_UNSUPPORTED_REGION', '대한민국 시도·시군구를 확인할 수 없는 위치입니다.', 422);
}

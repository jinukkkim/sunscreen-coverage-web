import { locate } from './location.js';

export async function requestCurrentUv({ locatePosition = locate, fetcher = fetch, signal } = {}) {
  let position;
  try { position = await locatePosition(); }
  catch (cause) {
    const error = new Error(cause?.message || '현재 위치를 확인하지 못했습니다.');
    error.code = /거부/.test(error.message) ? 'CURRENT_UV_LOCATION_DENIED' : 'CURRENT_UV_LOCATION_ERROR';
    throw error;
  }
  signal?.throwIfAborted();
  const query = new URLSearchParams({ latitude: position.latitude.toFixed(3), longitude: position.longitude.toFixed(3) });
  const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000);
  let response, data;
  try {
    response = await fetcher(`/api/uv/current?${query}`, { signal: requestSignal, cache: 'no-store' });
    data = await response.json();
  } catch (cause) {
    if (signal?.aborted) throw cause;
    const error = new Error(requestSignal.aborted ? '현재 지역 자외선 API 응답 시간이 초과되었습니다. 다시 조회해 주세요.' : '현재 지역 자외선 API 통신에 실패했습니다. 다시 조회해 주세요.');
    error.code = requestSignal.aborted ? 'CURRENT_UV_TIMEOUT' : 'CURRENT_UV_NETWORK_ERROR';
    throw error;
  }
  if (!response.ok) {
    const error = new Error(typeof data.error === 'string' ? data.error : '현재 지역 자외선지수를 조회하지 못했습니다.');
    error.code = data.code || 'CURRENT_UV_NETWORK_ERROR';
    throw error;
  }
  if (typeof data.value !== 'number' || !Number.isFinite(data.value) || data.value < 0 || !data.region?.name || !Number.isFinite(Date.parse(data.occurredAt)) || typeof data.stale !== 'boolean' || !Number.isFinite(data.staleAfterHours) || data.staleAfterHours <= 0) {
    const error = new Error('현재 지역 자외선지수 응답 형식을 확인할 수 없습니다.');
    error.code = 'CURRENT_UV_RESPONSE_ERROR';
    throw error;
  }
  return data;
}

export function formatCurrentUvTime(value) {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
}

export function locate(geolocation = globalThis.navigator?.geolocation) {
  if (!geolocation) return Promise.reject(new Error('위치 기능을 사용할 수 없습니다. HTTPS 또는 localhost에서 접속해 주세요.'));
  return new Promise((resolve, reject) => {
    const guard = setTimeout(() => reject(new Error('위치 확인 시간이 초과되었습니다.')), 9000);
    geolocation.getCurrentPosition(position => {
      clearTimeout(guard);
      const { latitude, longitude, accuracy } = position.coords;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return reject(new Error('올바른 위치를 받지 못했습니다.'));
      resolve({ latitude, longitude, accuracy, measuredAt: position.timestamp });
    }, error => {
      clearTimeout(guard);
      reject(new Error(error.code === 1 ? '위치 권한이 거부되었습니다.' : '현재 위치를 확인하지 못했습니다.'));
    }, { maximumAge: 0, timeout: 8000, enableHighAccuracy: true });
  });
}

export async function getForecast(position, fetcher = fetch) {
  // Round before transmission. Precise device coordinates are never persisted.
  const query = new URLSearchParams({ latitude: position.latitude.toFixed(3), longitude: position.longitude.toFixed(3) });
  const response = await fetcher(`/api/uv?${query}`, { signal: AbortSignal.timeout(15000), cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '자외선 예보를 가져오지 못했습니다.');
  if (!Array.isArray(data.slots) || !data.slots.length) throw new Error('현재 위치의 자외선 예보가 없습니다.');
  return data;
}

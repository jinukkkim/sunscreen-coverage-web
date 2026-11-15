import { uvAt } from './reapplication.js';

export const KMA_UV_SOURCE_URL = 'https://www.data.go.kr/data/15085288/openapi.do';

// KMA UV index bands (생활기상지수 단계).
export function uvLevel(value) {
  if (!Number.isFinite(value) || value < 0) return null;
  if (value < 3) return '낮음';
  if (value < 6) return '보통';
  if (value < 8) return '높음';
  if (value < 11) return '매우 높음';
  return '위험';
}

// Both the current-period display and reminders select the same valid KMA slot.
export function currentUvDetails(forecast, now = Date.now()) {
  const slot = uvAt(forecast, now, now);
  if (!slot || !forecast.location?.name) return null;
  return {
    source: '기상청', sourceUrl: KMA_UV_SOURCE_URL,
    region: { name: forecast.location.name, distanceKm: forecast.location.distanceKm ?? null }, value: slot.value, level: uvLevel(slot.value),
    validFrom: slot.validFrom, validTo: slot.validTo,
    publishedAt: forecast.publishedAt, fetchedAt: forecast.fetchedAt,
  };
}

export function formatUvTime(value) {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
}

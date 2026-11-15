import { uvAt } from './reapplication.js';

export const KMA_UV_SOURCE_URL = 'https://www.data.go.kr/data/15085288/openapi.do';

// Both the current-period display and reminders select the same valid KMA slot.
export function currentUvDetails(forecast, now = Date.now()) {
  const slot = uvAt(forecast, now, now);
  if (!slot || !forecast.location?.name) return null;
  return {
    source: '기상청', sourceUrl: KMA_UV_SOURCE_URL,
    region: { name: forecast.location.name }, value: slot.value,
    validFrom: slot.validFrom, validTo: slot.validTo,
    publishedAt: forecast.publishedAt, fetchedAt: forecast.fetchedAt,
  };
}

export function formatUvTime(value) {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
}

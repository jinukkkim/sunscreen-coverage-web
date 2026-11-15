import { test, expect } from '@playwright/test';

test('one KMA query updates current UV, reminders and the daily timeline together', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-14T09:00:00+09:00') });
  await page.addInitScript(() => {
    window.uvGeoCalls = 0;
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition(success) {
      window.uvGeoCalls++;
      success({ coords: { latitude: 37.567, longitude: 126.978, accuracy: 30 }, timestamp: Date.now() });
    } } });
  });
  let value = 7, queries = 0, legacyQueries = 0;
  await page.route('**/api/uv/current?**', route => { legacyQueries++; return route.abort(); });
  await page.route('**/api/uv?**', route => {
    queries++;
    return route.fulfill({ json: {
      source: '기상청', location: { name: '서울특별시', distanceKm: 0.2 },
      publishedAt: '2026-11-14T00:00:00.000Z', fetchedAt: '2026-11-14T00:00:00.000Z',
      slots: [{ value, validFrom: '2026-11-14T00:00:00.000Z', validTo: '2026-11-14T12:00:00.000Z' }],
    } });
  });
  await page.goto('/');
  expect(await page.evaluate(() => window.uvGeoCalls)).toBe(0);
  await expect(page.getByText(/생활안전지도|VWorld/)).toHaveCount(0);
  await page.getByRole('button', { name: '지금 발랐어요', exact: true }).click();
  await page.getByRole('checkbox', { name: '알림마다 새 위치를 확인해 UV 예보 갱신' }).check();
  const gauge = page.getByRole('meter', { name: '현재 시간대 자외선지수' });
  await expect(gauge).toHaveAttribute('aria-valuenow', '7');
  const details = page.getByLabel('예보 정보');
  await expect(details.getByText('서울특별시 인근 지점 · 0.2km', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '높음 · 80분마다 덧바르기', exact: true })).toBeVisible();
  await expect(page.getByRole('list', { name: '하루 도포 타임라인' }).getByText('10:20 · 다음 재도포', { exact: true })).toBeVisible();
  expect(queries).toBe(1);
  expect(legacyQueries).toBe(0);
  value = 0;
  await page.getByRole('button', { name: '현재 위치·예보 다시 확인' }).click();
  await expect(gauge).toHaveAttribute('aria-valuenow', '0');
  await expect(page.getByRole('heading', { name: '낮음 · 재도포 알림 대기', exact: true })).toBeVisible();
  await page.screenshot({ path: '.pr-review/kma-uv-desktop.png', fullPage: true });
  await page.clock.fastForward(61 * 60000);
  await expect(gauge).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '현재 시간대 예보를 확인하지 못했어요' })).toBeVisible();
  await expect(page.getByRole('list', { name: '하루 도포 타임라인' }).getByText('11:00 · 다음 재도포', { exact: true })).toBeVisible();
});

test('location denial does not request KMA or invent a current UV value', async ({ page }) => {
  let queries = 0;
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition(_success, fail) { fail({ code: 1 }); } } });
  });
  await page.route('**/api/uv?**', route => { queries++; return route.abort(); });
  await page.goto('/');
  await page.getByRole('checkbox', { name: '알림마다 새 위치를 확인해 UV 예보 갱신' }).check();
  await expect(page.getByText('위치 권한이 거부되었습니다.', { exact: true })).toBeVisible();
  expect(queries).toBe(0);
  await expect(page.getByRole('heading', { name: '현재 시간대 예보를 확인하지 못했어요', exact: true })).toBeVisible();
});

import { test, expect } from '@playwright/test';

test('current UV waits for independent consent and click, and displays zero without changing forecast policy', async ({ page }) => {
  await page.addInitScript(() => {
    window.currentUvGeoCalls = 0;
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition(success) {
      window.currentUvGeoCalls++;
      success({ coords: { latitude: 37.583, longitude: 127.055, accuracy: 30 }, timestamp: Date.now() });
    } } });
  });
  await page.route('**/api/uv/current?**', route => route.fulfill({ json: {
    region: { name: '서울특별시 동대문구' }, value: 0, occurredAt: '2026-11-13T00:00:00Z', stale: true, staleAfterHours: 6,
  } }));
  await page.goto('/');
  const query = page.getByRole('button', { name: '현재 위치 기반 UV 조회', exact: true });
  await expect(query).toBeDisabled();
  expect(await page.evaluate(() => window.currentUvGeoCalls)).toBe(0);
  await page.getByRole('checkbox', { name: '현재 지역 UV 조회를 위한 위치 전달에 동의' }).check();
  expect(await page.evaluate(() => window.currentUvGeoCalls)).toBe(0);
  await query.click();
  await expect(page.getByText('조회된 지역명: 서울특별시 동대문구')).toBeVisible();
  await expect(page.getByText('자외선지수: 0 (오래된 자료)', { exact: true })).toBeVisible();
  await expect(page.getByText('조회 데이터의 기준시각이 오래됨', { exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: '알림마다 새 위치를 확인해 UV 예보 갱신' })).not.toBeChecked();
  await expect(page.getByText('적용 주기: 120분', { exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: '현재 지역 UV 조회를 위한 위치 전달에 동의' }).uncheck();
  await expect(page.getByText('조회된 지역명: 서울특별시 동대문구')).toHaveCount(0);
});

test('permission denial is shown and no current UV server request is made', async ({ page }) => {
  let apiCalls = 0;
  await page.route('**/api/uv/current?**', route => { apiCalls++; return route.abort(); });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition(_success, fail) { fail({ code: 1 }); } } });
  });
  await page.goto('/');
  await page.getByRole('checkbox', { name: '현재 지역 UV 조회를 위한 위치 전달에 동의' }).check();
  await page.getByRole('button', { name: '현재 위치 기반 UV 조회', exact: true }).click();
  await expect(page.getByText('위치 권한이 거부되었습니다.', { exact: true })).toBeVisible();
  expect(apiCalls).toBe(0);
});

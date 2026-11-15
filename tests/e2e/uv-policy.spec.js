import { test, expect } from '@playwright/test';
const fixedTime = new Date('2026-11-14T09:00:00+09:00');

async function setup(page, currentUv) {
  await page.clock.install({ time: fixedTime });
  await page.addInitScript(() => {
    window.geoCalls = 0;
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition(success) {
      window.geoCalls++;
      success({ coords: { latitude: 37.5665, longitude: 126.978, accuracy: 30 }, timestamp: Date.now() });
    } } });
  });
  let requests = 0;
  await page.route('**/api/uv?**', route => {
    requests++;
    return route.fulfill({ json: {
      source: '기상청', fetchedAt: fixedTime.toISOString(), publishedAt: fixedTime.toISOString(),
      location: { name: '서울특별시', distanceKm: 0.2 },
      slots: [{ value: currentUv(), validFrom: new Date(+fixedTime - 3 * 3600000).toISOString(), validTo: new Date(+fixedTime + 15 * 3600000).toISOString() }],
    } });
  });
  await page.goto('/');
  return () => requests;
}

for (const [uv, time, label, heading] of [[0, '알림 대기', '알림 대기', '낮음 · 재도포 알림 대기'], [2, '알림 대기', '알림 대기', '낮음 · 재도포 알림 대기'], [3, '10:30', '150분', '보통 · 150분마다 덧바르기'], [5, '10:00', '120분', '보통 · 120분마다 덧바르기'], [7, '09:20', '80분', '높음 · 80분마다 덧바르기'], [8, '09:00', '60분', '매우 높음 · 60분마다 덧바르기']]) {
  test(`UV ${uv} applies ${label} to the timer and timeline`, async ({ page }) => {
    await setup(page, () => uv);
    await page.getByLabel('오늘 이전에 바른 시각 (한국 시간)').fill('08:00');
    await page.getByRole('button', { name: '입력한 시각 저장' }).click();
    await page.getByRole('checkbox', { name: '알림마다 새 위치를 확인해 UV 예보 갱신' }).check();
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    if (uv < 3) {
      await page.getByRole('button', { name: '오늘 야외활동 알림 켜기' }).click();
      await expect(page.getByText('재도포할 시간입니다', { exact: true })).toHaveCount(0);
      await expect(page.getByText(/· 다음 재도포/)).toHaveCount(0);
    } else {
      await expect(page.getByText(`${time} · 다음 재도포`, { exact: true })).toBeVisible();
      const upcoming = page.getByRole('region', { name: '앞으로 바를 시각' });
      await expect(upcoming.getByText('08:00 · 첫 도포 기록', { exact: true })).toHaveCount(0);
      await expect(upcoming.getByText(`${time} · 다음 재도포`, { exact: true })).toBeVisible();
      if (uv === 7) await upcoming.screenshot({ path: '.pr-review/dayline-desktop.png' });
    }
  });
}

test('a new UV value immediately recalculates the timer and alert text', async ({ page }) => {
  let uv = 3;
  await setup(page, () => uv);
  await page.getByLabel('오늘 이전에 바른 시각 (한국 시간)').fill('08:00');
  await page.getByRole('button', { name: '입력한 시각 저장' }).click();
  await page.getByRole('checkbox', { name: '알림마다 새 위치를 확인해 UV 예보 갱신' }).check();
  await expect(page.getByRole('list', { name: '하루 도포 타임라인' }).getByText('10:30 · 다음 재도포', { exact: true })).toBeVisible();
  uv = 7;
  await page.getByRole('button', { name: '현재 위치·예보 다시 확인' }).click();
  await expect(page.getByRole('list', { name: '하루 도포 타임라인' }).getByText('09:20 · 다음 재도포', { exact: true })).toBeVisible();
  uv = 2;
  await page.getByRole('button', { name: '현재 위치·예보 다시 확인' }).click();
  await expect(page.getByRole('heading', { name: '낮음 · 재도포 알림 대기', exact: true })).toBeVisible();
  uv = 8;
  await page.getByRole('button', { name: '현재 위치·예보 다시 확인' }).click();
  await expect(page.getByRole('list', { name: '하루 도포 타임라인' }).getByText('09:00 · 다음 재도포', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '오늘 야외활동 알림 켜기' }).click();
  await expect(page.getByText(/UV 8 기준 60분 알림 시각/)).toBeVisible();
  await page.screenshot({ path: '.pr-review/uv-policy.png', fullPage: true });
});

test('automatic UV refresh uses the last position and updates the active interval', async ({ page }) => {
  let uv = 3;
  const requests = await setup(page, () => uv);
  await page.getByRole('button', { name: '지금 발랐어요', exact: true }).click();
  await page.getByRole('checkbox', { name: '알림마다 새 위치를 확인해 UV 예보 갱신' }).check();
  await expect(page.getByRole('list', { name: '하루 도포 타임라인' }).getByText('11:30 · 다음 재도포', { exact: true })).toBeVisible();
  uv = 8;
  // The app checks every 10 seconds, so cross the first tick after 30 minutes.
  await page.clock.runFor(30 * 60000 + 10000);
  await expect.poll(requests).toBe(2);
  await expect(page.getByRole('list', { name: '하루 도포 타임라인' }).getByText('10:00 · 다음 재도포', { exact: true })).toBeVisible();
  await page.clock.runFor(60000);
  expect(await page.evaluate(() => window.geoCalls)).toBe(1);
});

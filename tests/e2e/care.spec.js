import { test, expect } from '@playwright/test';
const fixedTime = new Date('2026-11-14T09:00:00+09:00');
test.beforeEach(async ({ page }) => { await page.clock.install({ time: fixedTime }); });

test('records an application, recalculates the timeline and survives a reload', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: '지금 발랐어요', exact: true }).click();
  await expect(page.getByRole('heading', { name: '09:00', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '11:00', exact: true })).toBeVisible();
  await expect(page.getByText('09:00 · 첫 도포 기록')).toBeVisible();
  await page.reload();
  await expect(page.getByText('09:00 · 첫 도포 기록')).toBeVisible();
  await page.getByLabel('오늘 이전에 바른 시각 (한국 시간)').fill('10:00');
  await page.getByRole('button', { name: '입력한 시각 저장' }).click();
  await expect(page.getByText(/미래 시각은 기록할 수 없습니다/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('due alert refreshes location, keeps incomplete plans, and does not repeat on reload', async ({ page }) => {
  await page.addInitScript(() => {
    window.geoCalls = 0;
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition(success, _error, options) {
      window.geoCalls++; window.geoOptions = options;
      success({ coords: { latitude: 37.5665, longitude: 126.978, accuracy: 30 }, timestamp: Date.now() });
    } } });
  });
  await page.route('**/api/uv?**', route => route.fulfill({ json: {
    source: '기상청', fetchedAt: fixedTime.toISOString(), publishedAt: fixedTime.toISOString(),
    location: { name: '서울특별시', distanceKm: 0.2 },
    slots: [{ value: 4, validFrom: fixedTime.toISOString(), validTo: new Date(+fixedTime + 3 * 3600000).toISOString() }],
  } }));
  await page.goto('/');
  await page.getByLabel('오늘 이전에 바른 시각 (한국 시간)').fill('07:01');
  await page.getByRole('button', { name: '입력한 시각 저장' }).click();
  await page.getByRole('checkbox', { name: '알림마다 새 위치를 확인해 UV 예보 갱신' }).check();
  await expect.poll(() => page.evaluate(() => window.geoCalls)).toBe(1);
  await page.getByRole('button', { name: '오늘 야외활동 알림 켜기' }).click();
  await page.clock.runFor(70000);
  await expect(page.getByText('재도포할 시간입니다', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.geoCalls)).toBe(2);
  expect(await page.evaluate(() => window.geoOptions.maximumAge)).toBe(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sunguard.care.v1')).records.length)).toBe(1);
  await page.reload();
  await expect(page.getByText('재도포할 시간입니다', { exact: true })).toHaveCount(0);
  await expect(page.getByText('07:01 · 첫 도포 기록')).toBeVisible();
});

test('foreground alert still works without location or notification permission', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition(_success, failure) { failure({ code: 1 }); } } });
  });
  await page.goto('/');
  await page.getByLabel('오늘 이전에 바른 시각 (한국 시간)').fill('07:00');
  await page.getByRole('button', { name: '입력한 시각 저장' }).click();
  await page.getByRole('checkbox', { name: '알림마다 새 위치를 확인해 UV 예보 갱신' }).check();
  await page.getByRole('button', { name: '오늘 야외활동 알림 켜기' }).click();
  await expect(page.getByText('재도포할 시간입니다', { exact: true })).toBeVisible();
  await expect(page.getByText(/위치·예보 갱신 실패/)).toBeVisible();
  await page.getByRole('button', { name: '지금 바르고 기록하기' }).click();
  await expect(page.getByRole('heading', { name: '11:00', exact: true })).toBeVisible();
});

test('mobile layout keeps controls and timeline inside the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: '지금 발랐어요', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const dayline = page.getByRole('list', { name: '하루 도포 타임라인' });
  await expect(dayline.getByText('09:00 · 도포 완료', { exact: true })).toBeVisible();
  await expect(dayline.getByText('11:00 · 다음 재도포', { exact: true })).toBeVisible();
  await expect(dayline.getByText('20:00 · 오늘 알림 종료', { exact: true })).toBeVisible();
  await expect(dayline.locator('[aria-current="time"]')).toHaveCount(1);
  await page.getByRole('region', { name: '앞으로 바를 시각' }).screenshot({ path: '.pr-review/dayline-mobile.png' });
  await page.screenshot({ path: '.pr-review/care-mobile.png', fullPage: true });
});

test('storage failure retains in-memory records when reminders are enabled', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new Error('quota exceeded'); };
  });
  await page.goto('/');
  await page.getByRole('button', { name: '지금 발랐어요', exact: true }).click();
  await page.getByRole('button', { name: '오늘 야외활동 알림 켜기' }).click();
  await expect(page.getByText('09:00 · 첫 도포 기록')).toBeVisible();
  await expect(page.getByText(/기록을 기기에 저장하지 못했습니다/)).toBeVisible();
});

test('two tabs claim only one due reminder', async ({ page, context }) => {
  await page.goto('/');
  await page.getByLabel('오늘 이전에 바른 시각 (한국 시간)').fill('07:01');
  await page.getByRole('button', { name: '입력한 시각 저장' }).click();
  await page.getByRole('button', { name: '오늘 야외활동 알림 켜기' }).click();
  const peer = await context.newPage();
  await peer.clock.install({ time: fixedTime });
  await peer.goto('/');
  await page.clock.runFor(70000);
  await peer.clock.runFor(70000);
  await expect.poll(async () =>
    await page.getByText('재도포할 시간입니다', { exact: true }).count()
    + await peer.getByText('재도포할 시간입니다', { exact: true }).count(),
  ).toBe(1);
});

import { test, expect } from '@playwright/test';

test('recognition stays above care and a camera error does not lose application records', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-14T09:00:00+09:00') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied for test', 'NotAllowedError'); };
  });
  await page.goto('/');
  const recognition = await page.getByRole('heading', { name: '얼굴 스캔과 동작 관찰', exact: true }).boundingBox();
  const results = await page.getByRole('heading', { name: '부위별 도포 동작', exact: true }).boundingBox();
  const care = await page.getByRole('heading', { name: '다음 재도포 일정', exact: true }).boundingBox();
  expect(recognition.y).toBeLessThan(care.y);
  expect(results.y).toBeLessThan(care.y);
  await expect(page.getByText('아직 감지되지 않음', { exact: true })).toHaveCount(5);
  await page.getByRole('button', { name: '지금 발랐어요', exact: true }).click();
  await page.locator('#motion').getByRole('button', { name: '카메라 켜기', exact: true }).click();
  await expect(page.getByText('카메라 권한이 허용되지 않았어요. 브라우저 설정을 확인해 주세요.', { exact: true })).toBeVisible();
  await expect(page.getByText('09:00 · 첫 도포 기록', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '11:00', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.pr-review/merge-mobile.png', fullPage: true });
});

test('local vision models run on a synthetic stream and camera stop releases it', async ({ page }) => {
  test.setTimeout(60000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 640; canvas.height = 480;
      const context = canvas.getContext('2d');
      let frame = 0;
      const draw = () => { context.fillStyle = frame++ % 2 ? 'gray' : 'silver'; context.fillRect(0, 0, canvas.width, canvas.height); };
      draw();
      const timer = setInterval(draw, 100);
      const stream = canvas.captureStream(10);
      window.syntheticCamera = stream;
      for (const track of stream.getTracks()) {
        const stop = track.stop.bind(track);
        track.stop = () => { clearInterval(timer); stop(); };
      }
      return stream;
    };
  });
  await page.goto('/');
  await page.locator('#motion').getByRole('button', { name: '카메라 켜기', exact: true }).click();
  await expect(page.getByText('얼굴 스캔 중', { exact: true })).toBeVisible({ timeout: 45000 });
  await expect(page.getByRole('button', { name: '부위 확인 후 시작', exact: true })).toHaveCount(0);
  await expect(page.getByText('5구역 중 0구역에서 동작 감지', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '기록 없음', exact: true })).toBeVisible();
  const video = page.locator('#motion').getByLabel('카메라 미리보기');
  expect((await video.boundingBox()).height).toBeGreaterThan(0);
  await page.locator('#motion').getByRole('button', { name: '카메라 끄기', exact: true }).click();
  await expect(page.getByText('카메라를 껐어요.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.syntheticCamera.getTracks().every(track => track.readyState === 'ended'))).toBe(true);
  expect(errors).toEqual([]);
});

test('the face-dose guide runs inside the main SUNFIT screen', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('사용량 확인과 도포 동작 관찰');
  await expect(page.locator('#workspace').getByRole('button', { name: '카메라 켜기', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '사용량 확인과 도포 동작 관찰', exact: true })).toBeVisible();
  await expect(page.locator('a[href="/face-dose.html"]')).toHaveCount(0);
  await page.goto('/face-dose.html');
  await expect(page).toHaveURL(/\/#workspace$/);
});

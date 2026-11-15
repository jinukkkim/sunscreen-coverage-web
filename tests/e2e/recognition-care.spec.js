import { test, expect } from '@playwright/test';
import { seedProduct, mockMeasurement, enterScan } from './helpers/flow.js';

test.beforeEach(async ({ page }) => { await seedProduct(page); await mockMeasurement(page); });

test('recognition stays above care and a camera error does not lose application records', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-14T09:00:00+09:00') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied for test', 'NotAllowedError'); };
  });
  await page.goto('/');
  const recognition = await page.getByRole('heading', { name: '선케어 카메라', exact: true }).boundingBox();
  const care = await page.getByRole('heading', { name: '오늘의 선케어 타임라인', exact: true }).boundingBox();
  expect(recognition.y).toBeLessThan(care.y);
  await page.getByRole('button', { name: '지금 발랐어요', exact: true }).click();
  await page.getByRole('button', { name: '카메라 켜기', exact: true }).click();
  await expect(page.getByText('카메라 권한을 허용한 후 다시 시도해 주세요.', { exact: true })).toBeVisible();
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
  await enterScan(page);
  await expect(page.getByText('얼굴 스캔 중', { exact: true })).toBeVisible({ timeout: 45000 });
  await expect(page.getByRole('button', { name: '부위 확인 후 시작', exact: true })).toBeDisabled();
  await expect(page.getByText('5구역 중 0구역에서 동작 감지', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '기록 없음', exact: true })).toBeVisible();
  const video = page.getByLabel('카메라 미리보기');
  expect((await video.boundingBox()).height).toBeGreaterThan(0);
  await page.getByRole('button', { name: '카메라 끄기', exact: true }).click();
  await expect(page.getByText('카메라 꺼짐', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.syntheticCamera.getTracks().every(track => track.readyState === 'ended'))).toBe(true);
  expect(errors).toEqual([]);
});

test('face measurement opens inside the main SunGuard screen', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '다음 단계로', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: '얼굴 크기 측정', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '카메라 켜기' })).toBeVisible();
});

import { test, expect } from '@playwright/test';
import { face, regionHand } from '../helpers/landmarks.js';
import { formatTime } from '../../src/lib/reapplication.js';

test('partial motion progresses, completion records once and starts the UV timer', async ({ page }) => {
  test.setTimeout(60000);
  await page.clock.install({ time: new Date('2026-11-14T09:00:00+09:00') });
  const frames = ['forehead', 'nose', 'leftCheek', 'rightCheek', 'chin'].flatMap((id, index) =>
    Array.from({ length: index === 0 ? 40 : 30 }, (_, frame) => regionHand(id, frame * 100)));
  await page.addInitScript(fixture => {
    window.motionFixture = { ...fixture, index: 0, limit: 8, closed: 0, geoCalls: 0 };
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1000; canvas.height = 1000;
      const context = canvas.getContext('2d');
      let frame = 0;
      const draw = () => { context.fillStyle = frame++ % 2 ? 'gray' : 'silver'; context.fillRect(0, 0, 1000, 1000); };
      draw();
      const timer = setInterval(draw, 50);
      const stream = canvas.captureStream(20);
      for (const track of stream.getTracks()) {
        const stop = track.stop.bind(track);
        track.stop = () => { clearInterval(timer); stop(); };
      }
      return stream;
    };
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition(success) {
      window.motionFixture.geoCalls++;
      success({ coords: { latitude: 37.5665, longitude: 126.978, accuracy: 30 }, timestamp: Date.now() });
    } } });
  }, { face: face(), frames });
  // Replace only the lazy SDK chunk with synthetic landmarks. The actual app,
  // vision-session, rubbing tracker, progress UI and persistence run unchanged.
  await page.route('**/assets/vision_bundle-*.js', route => route.fulfill({
    contentType: 'application/javascript', body: `
      export const FilesetResolver = {forVisionTasks: async () => ({})};
      export const FaceLandmarker = {FACE_LANDMARKS_TESSELATION: [{start: 345, end: 348}], createFromOptions: async () => ({
        detectForVideo: () => ({faceLandmarks: window.motionFixture.faceVisible === false ? [] : [window.motionFixture.face]}),
        close: () => {window.motionFixture.closed++;}
      })};
      export const HandLandmarker = {createFromOptions: async () => ({
        detectForVideo: () => {
          const f = window.motionFixture;
          if (f.index >= f.limit) return {landmarks: []};
          const hand = f.frames[f.index++];
          return {landmarks: hand ? [hand] : []};
        },
        close: () => {window.motionFixture.closed++;}
      })};`,
  }));
  let uv = 7;
  await page.route('**/api/uv?**', async route => route.fulfill({ json: {
    source: '기상청', fetchedAt: new Date(await page.evaluate(() => Date.now())).toISOString(), publishedAt: '2026-11-14T00:00:00.000Z',
    location: { name: '서울특별시', distanceKm: 0.2 },
    slots: [{ value: uv, validFrom: '2026-11-14T00:00:00.000Z', validTo: '2026-11-14T12:00:00.000Z' }],
  } }));
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('checkbox', { name: '알림마다 새 위치를 확인해 UV 예보 갱신' }).check();
  await expect(page.getByText('적용 주기: 80분', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '카메라 켜기', exact: true }).click();
  await expect(page.getByRole('button', { name: '부위 확인 후 시작', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '부위 확인 후 시작', exact: true }).click();
  const overall = page.getByRole('progressbar', { name: '전체 동작 진행률', exact: true });
  await expect.poll(async () => Number(await overall.getAttribute('aria-valuenow'))).toBeGreaterThan(0);
  expect(Number(await overall.getAttribute('aria-valuenow'))).toBeLessThan(100);
  await expect(page.getByRole('heading', { name: '기록 없음', exact: true })).toBeVisible();
  await page.screenshot({ path: '.pr-review/motion-partial.png', fullPage: true });
  const overlay = page.locator('canvas[aria-hidden="true"]');
  const hasOverlay = () => overlay.evaluate(canvas =>
    canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.some((value, index) => index % 4 === 3 && value > 0));
  await expect.poll(hasOverlay).toBe(true);
  const creamPixels = () => overlay.evaluate(canvas => {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > pixels[i + 1] + 1 && pixels[i + 1] > pixels[i + 2] + 1 && pixels[i + 3] > 20) count++;
    return count;
  });
  const partialCream = await creamPixels();
  const partialProgress = await overall.getAttribute('aria-valuenow');
  await page.evaluate(() => { window.motionFixture.faceVisible = false; });
  await expect(page.getByText('인식 복구 대기', { exact: true })).toBeVisible();
  await expect(overall).toHaveAttribute('aria-valuenow', partialProgress);
  await expect.poll(hasOverlay).toBe(false);
  await expect(page.getByRole('button', { name: '다시 시작', exact: true })).toBeVisible();
  await page.evaluate(() => { window.motionFixture.faceVisible = true; });
  await expect(page.getByText('동작 관찰 중', { exact: true })).toBeVisible();
  await expect(overall).toHaveAttribute('aria-valuenow', partialProgress);
  // Sustained loss requires confirmation but keeps the same accumulated progress.
  await page.evaluate(() => { window.motionFixture.faceVisible = false; });
  await expect(page.getByText('얼굴 스캔 중', { exact: true })).toBeVisible({ timeout: 6000 });
  await page.evaluate(() => { window.motionFixture.faceVisible = true; });
  await expect(page.getByRole('button', { name: '부위 확인 후 시작', exact: true })).toBeEnabled();
  await expect(overall).toHaveAttribute('aria-valuenow', partialProgress);
  await page.getByRole('button', { name: '부위 확인 후 시작', exact: true }).click();
  await expect(overall).toHaveAttribute('aria-valuenow', partialProgress);
  await expect(page.getByRole('heading', { name: '기록 없음', exact: true })).toBeVisible();
  const before = await page.evaluate(() => Date.now());
  await page.evaluate(() => { window.motionFixture.limit = Infinity; });
  await expect(overall).toHaveAttribute('aria-valuenow', '100', { timeout: 35000 });
  await expect(page.getByText('동작 완료 시각을 기록했습니다', { exact: true })).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('sunguard.care.v1')));
  expect(stored.records).toHaveLength(1);
  expect(stored.records[0].source).toBe('motion');
  expect(stored.records[0].at).toBeGreaterThanOrEqual(before);
  expect(stored.enabled).toBe(true);
  await expect(page.getByRole('heading', { name: formatTime(stored.records[0].at + 80 * 60000), exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.motionFixture.geoCalls)).toBe(2);
  expect(await page.evaluate(() => window.motionFixture.closed)).toBe(2);
  await expect.poll(hasOverlay).toBe(true);
  await expect.poll(creamPixels).toBeGreaterThan(partialCream);
  expect(await page.locator('video').evaluate(video => video.paused)).toBe(true);
  await page.screenshot({ path: '.pr-review/motion-completed.png', fullPage: true });
  await page.clock.fastForward(80 * 60000);
  await expect(page.getByText('재도포할 시간입니다', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.motionFixture.geoCalls)).toBe(3);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sunguard.care.v1')).records.length)).toBe(1);
  uv = 0;
  await page.getByRole('button', { name: '현재 위치·예보 다시 확인', exact: true }).click();
  await expect(page.getByRole('heading', { name: '알림 대기', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '새 도포 시작', exact: true }).click();
  await expect(overall).toHaveAttribute('aria-valuenow', '0');
  await expect.poll(() => page.locator('video').evaluate(video => video.paused)).toBe(false);
  await page.getByRole('button', { name: '카메라 끄기', exact: true }).click();
  await expect.poll(hasOverlay).toBe(false);
  await page.reload();
  await expect(page.getByText(/동작 완료 자동 기록/).first()).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sunguard.care.v1')).records.length)).toBe(1);
  expect(errors).toEqual([]);
});

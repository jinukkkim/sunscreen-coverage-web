import { test, expect } from '@playwright/test';
import { face } from '../helpers/landmarks.js';

async function syntheticCamera(page, { pending = false, pendingModels = false } = {}) {
  await page.addInitScript(pending => {
    window.cameraStreams = [];
    window.cameraRequests = [];
    navigator.mediaDevices.getUserMedia = () => {
      const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 1000;
      const context = canvas.getContext('2d'); context.fillStyle = 'silver'; context.fillRect(0, 0, 1000, 1000);
      let frame = 0;
      const timer = setInterval(() => { context.fillStyle = frame++ % 2 ? 'gray' : 'silver'; context.fillRect(0, 0, 1000, 1000); }, 50);
      const stream = canvas.captureStream(20);
      for (const track of stream.getTracks()) { const stop = track.stop.bind(track); track.stop = () => { clearInterval(timer); stop(); }; }
      window.cameraStreams.push(stream);
      return pending ? new Promise(resolve => window.cameraRequests.push(() => resolve(stream))) : Promise.resolve(stream);
    };
  }, pending);
  await page.addInitScript(block => { window.blockVisionModel = block; window.closedVisionModels = 0; }, pendingModels);
  const landmarks = face();
  for (const center of [.43, .57]) {
    landmarks.push({ x: center, y: .42, z: 0 }, { x: center + .02, y: .42, z: 0 },
      { x: center, y: .44, z: 0 }, { x: center - .02, y: .42, z: 0 }, { x: center, y: .40, z: 0 });
  }
  await page.addInitScript(landmarks => { window.guideLandmarks = landmarks; }, landmarks);
  await page.route('**/assets/vision_bundle-*.js', route => route.fulfill({ contentType: 'application/javascript', body: `
    export const FilesetResolver = {forVisionTasks: async () => ({})};
    export const FaceLandmarker = {FACE_LANDMARKS_TESSELATION: [], createFromOptions: async (_, options) => {
      if (options.runningMode === 'VIDEO' && window.blockVisionModel) await new Promise(resolve => { window.releaseVisionModel = resolve; });
      return ({
      detect: () => ({faceLandmarks: [window.guideLandmarks]}),
      detectForVideo: () => ({faceLandmarks: [window.guideLandmarks]}), close() { window.closedVisionModels++; }
    }); }};
    export const HandLandmarker = {createFromOptions: async () => ({detectForVideo: () => ({landmarks: []}), close() { window.closedVisionModels++; }})};
  ` }));
}

test('home guide produces a local result and continues to motion without recording an application', async ({ page }) => {
  await syntheticCamera(page);
  await page.goto('/');
  const guide = page.locator('#workspace');
  await guide.getByRole('button', { name: '카메라 켜기', exact: true }).click();
  await expect(guide.locator('video')).toBeVisible();
  await expect(page.locator('#result-content')).toBeVisible();
  await expect(page.locator('#dose-value')).toHaveText(/\d+\.\d{2}/);
  const before = await page.locator('#joint-value').innerText();
  await page.locator('#joint-length').fill('40');
  await page.locator('#joint-length').dispatchEvent('input');
  await expect(page.locator('#joint-value')).not.toHaveText(before);
  await expect(page.getByRole('heading', { name: '기록 없음', exact: true })).toBeVisible();
  await page.getByRole('link', { name: '같은 카메라에서 도포 동작 관찰', exact: true }).click();
  await expect(page).toHaveURL(/\/#motion$/);
  await page.locator('#reset').click();
  await expect(page.locator('#result-content')).toBeHidden();
  await expect(page.locator('#result-empty')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.cameraStreams.every(s => s.getTracks().every(t => t.readyState === 'ended')))).toBe(true);
});

test('one camera provides a dose then starts motion without reopening the stream', async ({ page }) => {
  await syntheticCamera(page);
  await page.goto('/');
  await expect(page.locator('video')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: '오늘의 선크림', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '카메라 켜기', exact: true }).click();
  await expect(page.locator('#result-content')).toBeVisible();
  expect(await page.locator('canvas[aria-hidden="true"]').evaluate(canvas => getComputedStyle(canvas).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  await expect(page.getByRole('button', { name: '부위 확인 후 시작', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '부위 확인 후 시작', exact: true }).click();
  await expect(page.getByText('동작 관찰 중', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.cameraStreams.length)).toBe(1);
  expect(await page.evaluate(() => window.cameraStreams[0].getTracks()[0].readyState)).toBe('live');
  await page.getByRole('button', { name: '카메라 끄기', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.cameraStreams[0].getTracks()[0].readyState)).toBe('ended');
  await expect(page.getByText('카메라 대기', { exact: true })).toBeVisible();
});

test('cancelling pending camera permission releases its late stream', async ({ page }) => {
  await syntheticCamera(page, { pending: true });
  await page.goto('/');
  await page.locator('#start-camera').click();
  await page.getByRole('button', { name: '연결 취소', exact: true }).click();
  await page.evaluate(() => window.cameraRequests[0]());
  await expect.poll(() => page.evaluate(() => window.cameraStreams[0].getTracks()[0].readyState)).toBe('ended');
  await expect(page.locator('video')).toBeHidden();
});

test('guide validates uploaded files and home reflows on mobile and desktop', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.locator('#upload-tab').click();
  await page.locator('#photo-input').setInputFiles({ name: 'wrong.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') });
  await expect(page.locator('#capture-error')).toContainText('JPG, PNG, WebP 또는 AVIF');
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    const hero = await page.locator('.hero').boundingBox();
    expect(hero.height).toBeLessThan(700);
    const capture = await page.locator('.capture-panel').boundingBox();
    expect(capture.width).toBeGreaterThan(width === 390 ? 300 : 500);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `.pr-review/unified-home-${width}.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
});


test('photo upload estimates a dose without opening the camera or recording motion', async ({ page }) => {
  await syntheticCamera(page);
  await page.goto('/');
  await page.locator('#upload-tab').click();
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1000;
    canvas.getContext('2d').fillRect(0, 0, 1000, 1000);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.locator('#photo-input').setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') });
  await expect(page.locator('#result-content')).toBeVisible();
  await expect(page.locator('#live-dose-value')).toContainText('g');
  expect(await page.evaluate(() => window.cameraStreams.length)).toBe(0);
  await expect(page.getByRole('progressbar', { name: '전체 동작 진행률', exact: true })).toHaveAttribute('aria-valuenow', '0');
  await expect(page.getByRole('heading', { name: '기록 없음', exact: true })).toBeVisible();
  await page.locator('#photo-input').setInputFiles({ name: 'wrong.txt', mimeType: 'text/plain', buffer: Buffer.from('invalid') });
  await expect(page.locator('#result-content')).toBeHidden();
});

test('stopping during model loading closes late models without resuming observation', async ({ page }) => {
  await syntheticCamera(page, { pendingModels: true });
  await page.goto('/');
  await page.locator('#start-camera').click();
  await expect.poll(() => page.evaluate(() => typeof window.releaseVisionModel)).toBe('function');
  await page.locator('#stop-camera').click();
  await page.evaluate(() => window.releaseVisionModel());
  await expect.poll(() => page.evaluate(() => window.closedVisionModels)).toBe(2);
  await expect(page.getByText('카메라 대기', { exact: true })).toBeVisible();
  await expect(page.locator('video')).toBeHidden();
});


test('hiding the page cancels outstanding camera permission and releases its late stream', async ({ page }) => {
  await syntheticCamera(page, { pending: true });
  await page.goto('/');
  await page.locator('#start-camera').click();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    window.cameraRequests[0]();
  });
  await expect.poll(() => page.evaluate(() => window.cameraStreams[0].getTracks()[0].readyState)).toBe('ended');
  await expect(page.locator('#start-camera')).toBeVisible();
});

test('a failed live remeasurement clears the previous amount', async ({ page }) => {
  await syntheticCamera(page);
  await page.goto('/');
  await page.locator('#start-camera').click();
  await expect(page.locator('#result-content')).toBeVisible();
  await page.evaluate(() => {
    for (const [left, right] of [[469, 471], [474, 476]]) window.guideLandmarks[left] = { ...window.guideLandmarks[right] };
  });
  await page.locator('#analyze-camera').click();
  await expect(page.locator('#capture-error')).toContainText('홍채');
  await expect(page.locator('#result-content')).toBeHidden();
  await expect(page.locator('#live-dose-value')).toHaveText('얼굴 확인 후 안내');
  await expect(page.getByRole('button', { name: '부위 확인 후 시작', exact: true })).toBeEnabled();
});

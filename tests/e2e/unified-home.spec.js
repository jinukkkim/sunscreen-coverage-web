import { test, expect } from '@playwright/test';
import { face } from '../helpers/landmarks.js';
import { seedProduct, measureFace, enterScan } from './helpers/flow.js';

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

test('home guide keeps local dose controls and proceeds to automatic motion without recording', async ({ page }) => {
  await seedProduct(page); await syntheticCamera(page); await page.goto('/');
  await measureFace(page);
  await expect(page.locator('#live-dose-value')).toHaveText(/\d+\.\d{2}g/);
  const before = await page.locator('#live-finger-value').innerText();
  await page.getByLabel(/검지 한 마디 길이/).fill('40');
  await expect(page.locator('#live-finger-value')).not.toHaveText(before);
  await expect(page.getByRole('heading', { name: '기록 없음', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '도포 스캔 시작', exact: true }).click();
  await expect(page.getByLabel('인식 상태', { exact: true })).toHaveText('제품을 바르세요');
  await expect(page.getByRole('heading', { name: '기록 없음', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.cameraStreams.length)).toBe(1);
});

test('one camera starts motion automatically with readable numbers', async ({ page }) => {
  await seedProduct(page); await syntheticCamera(page); await page.goto('/');
  await measureFace(page);
  for (const selector of ['#live-dose-value', '#live-finger-value']) {
    expect(await page.locator(selector).evaluate(node => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(30);
  }
  await page.getByRole('button', { name: '도포 스캔 시작', exact: true }).click();
  await expect(page.locator('video')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '부위 확인 후 시작', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('인식 상태', { exact: true })).toHaveText('제품을 바르세요');
  expect(await page.locator('.motion-total-value').evaluate(node => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(30);
  expect(await page.evaluate(() => window.cameraStreams.length)).toBe(1);
  await page.getByRole('button', { name: '카메라 끄기', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.cameraStreams[0].getTracks()[0].readyState)).toBe('ended');
});

test('cancelling pending camera permission releases its late stream', async ({ page }) => {
  await syntheticCamera(page, { pending: true }); await page.goto('/');
  await page.getByRole('button', { name: '카메라 켜기', exact: true }).click();
  await page.getByRole('button', { name: '연결 취소', exact: true }).click();
  await page.evaluate(() => window.cameraRequests[0]());
  await expect.poll(() => page.evaluate(() => window.cameraStreams[0].getTracks()[0].readyState)).toBe('ended');
  await expect(page.locator('video')).toHaveJSProperty('srcObject', null);
});

test('compact home preserves the team shell and camera status on mobile and desktop', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.hero')).toHaveCount(0);
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'SunGuard 처음으로', exact: true })).toBeVisible();
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    const stage = await page.locator('#camera-stage').boundingBox();
    const state = await page.getByLabel('인식 상태', { exact: true }).boundingBox();
    expect(state.x).toBeGreaterThan(stage.x + stage.width / 2);
    expect(state.y).toBeGreaterThanOrEqual(stage.y);
    expect(state.y + state.height).toBeLessThan(stage.y + stage.height / 3);
    await expect(page.locator('.motion-progress').getByLabel('인식 상태', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `.pr-review/integrated-home-${width}.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
});

test('stopping during model loading closes late models without resuming observation', async ({ page }) => {
  await seedProduct(page); await syntheticCamera(page, { pendingModels: true }); await page.goto('/');
  await enterScan(page);
  await expect.poll(() => page.evaluate(() => typeof window.releaseVisionModel)).toBe('function');
  await page.getByRole('button', { name: '카메라 끄기', exact: true }).click();
  await page.evaluate(() => window.releaseVisionModel());
  await expect.poll(() => page.evaluate(() => window.closedVisionModels)).toBe(2);
  await expect(page.getByLabel('인식 상태', { exact: true })).toHaveText('카메라 꺼짐');
});

test('hiding the page cancels outstanding camera permission and releases its late stream', async ({ page }) => {
  await syntheticCamera(page, { pending: true }); await page.goto('/');
  await page.getByRole('button', { name: '카메라 켜기', exact: true }).click();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    window.cameraRequests[0]();
  });
  await expect.poll(() => page.evaluate(() => window.cameraStreams[0].getTracks()[0].readyState)).toBe('ended');
  await expect(page.getByRole('button', { name: '카메라 켜기', exact: true })).toBeEnabled();
});

test('a failed remeasurement clears the previous amount', async ({ page }) => {
  await seedProduct(page); await syntheticCamera(page); await page.goto('/');
  await measureFace(page);
  await page.getByRole('button', { name: '얼굴 다시 측정', exact: true }).click();
  await page.evaluate(() => {
    for (const [left, right] of [[469, 471], [474, 476]]) window.guideLandmarks[left] = { ...window.guideLandmarks[right] };
  });
  await page.getByRole('button', { name: '촬영하고 측정', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('홍채');
  await expect(page.locator('#live-dose-value')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '도포 스캔 시작', exact: true })).toHaveCount(0);
});

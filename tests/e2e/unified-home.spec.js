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
      detect: () => ({faceLandmarks: window.guideFaces ?? [window.guideLandmarks]}),
      detectForVideo: () => ({faceLandmarks: [window.guideLandmarks]}), close() { window.closedVisionModels++; }
    }); }};
    export const HandLandmarker = {createFromOptions: async () => ({detectForVideo: () => ({landmarks: []}), close() { window.closedVisionModels++; }})};
  ` }));
}

test('measurement step displays live iris pixels and area without reopening the camera', async ({ page }) => {
  await seedProduct(page); await syntheticCamera(page); await page.goto('/');
  await page.getByRole('button', { name: '다음 단계로', exact: true }).click();
  await expect(page.locator('#live-iris-px')).toHaveText('—');
  await page.getByRole('button', { name: '카메라 켜기', exact: true }).click();
  await expect(page.locator('#live-iris-px')).toHaveText('40.0');
  await expect(page.locator('#live-face-area')).toHaveText(/\d+\.\d/);
  const area = await page.locator('#live-face-area').innerText();
  await expect(page.locator('#live-measure-detail')).toContainText('1000 × 1000 px');
  await page.evaluate(() => {
    window.originalGuideLandmarks = structuredClone(window.guideLandmarks);
    window.guideLandmarks = window.originalGuideLandmarks.map(p => ({x:.5+(p.x-.5)*.5,y:.5+(p.y-.5)*.5,z:p.z*.5}));
  });
  await expect(page.locator('#live-iris-px')).toHaveText('20.0');
  await expect(page.locator('#live-face-area')).toHaveText(area);
  await page.setViewportSize({ width: 390, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByLabel('실시간 얼굴 측정', { exact: true }).screenshot({ path: '.pr-review/live-face-measurements-mobile.png' });
  await page.evaluate(() => { window.guideLandmarks = window.originalGuideLandmarks.map(p => ({x:.5+(p.x-.5)*.2,y:.5+(p.y-.5)*.2,z:p.z*.2})); });
  await expect(page.locator('#live-iris-px')).toHaveText('8.0');
  await expect(page.locator('#live-face-area')).toHaveText('—');
  await expect(page.locator('#live-measure-reason')).toContainText('홍채');
  await page.evaluate(() => { window.guideFaces = []; });
  await expect(page.locator('#live-iris-px')).toHaveText('—');
  await expect(page.locator('#live-face-area')).toHaveText('—');
  await page.evaluate(() => { window.guideFaces = [window.originalGuideLandmarks]; });
  await expect(page.locator('#live-iris-px')).toHaveText('40.0');
  await page.getByRole('button', { name: '카메라 끄기', exact: true }).click();
  await expect(page.locator('#live-iris-px')).toHaveText('—');
  await expect(page.locator('#live-face-area')).toHaveText('—');
  expect(await page.evaluate(() => window.cameraStreams.length)).toBe(1);
  await page.getByRole('button', { name: '선크림 등록으로 돌아가기', exact: true }).click();
  await expect(page.locator('#live-iris-px')).toHaveCount(0);
  await expect(page.getByRole('list', { name: '하루 도포 타임라인' }).getByText(/· 도포 완료$/)).toHaveCount(0);
});

test('home guide keeps local dose controls and proceeds to automatic motion without recording', async ({ page }) => {
  await seedProduct(page); await syntheticCamera(page); await page.goto('/');
  await measureFace(page);
  await expect(page.locator('#live-dose-value')).toHaveText(/\d+\.\d{2}g/);
  const before = await page.locator('#live-finger-value').innerText();
  await page.getByLabel(/검지 한 마디 길이/).fill('40');
  await expect(page.locator('#live-finger-value')).not.toHaveText(before);
  await expect(page.getByRole('list', { name: '하루 도포 타임라인' }).getByText(/· 도포 완료$/)).toHaveCount(0);
  await page.getByRole('button', { name: '도포 스캔 시작', exact: true }).click();
  await expect(page.getByLabel('인식 상태', { exact: true })).toHaveText('제품을 바르세요');
  await expect(page.getByRole('list', { name: '하루 도포 타임라인' }).getByText(/· 도포 완료$/)).toHaveCount(0);
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
  await expect(page.getByRole('link', { name: 'SUNFIT 처음으로', exact: true })).toBeVisible();
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    // Read both boxes in one frame: the step indicator reflows after a resize and would shift them between calls.
    await expect.poll(() => page.evaluate(() => {
      const stage = document.querySelector('#camera-stage').getBoundingClientRect();
      const state = document.querySelector('[aria-label="인식 상태"]').getBoundingClientRect();
      return state.x > stage.x + stage.width / 2 && state.y >= stage.y && state.y + state.height < stage.y + stage.height / 3;
    })).toBe(true);
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

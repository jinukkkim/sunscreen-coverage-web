import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { mockMeasurement, syntheticCamera, seedProduct } from './helpers/flow.js';

test('one camera remains through product capture, measurement, guide and motion', async ({ page }) => {
  const fixture = JSON.parse(await readFile(new URL('../fixtures/recognition/full-label.json', import.meta.url), 'utf8'));
  await syntheticCamera(page, true); await mockMeasurement(page);
  let requests = 0;
  await page.route('**/api/recognize', async route => {
    requests++;
    const { images } = route.request().postDataJSON();
    expect(images).toHaveLength(1);
    expect(images[0].mimeType).toBe('image/jpeg');
    const size = await page.evaluate(async image => {
      const decoded = new Image(); decoded.src = `data:${image.mimeType};base64,${image.data}`;
      await decoded.decode();
      const canvas = document.createElement('canvas'); canvas.width = decoded.naturalWidth; canvas.height = decoded.naturalHeight;
      const context = canvas.getContext('2d'); context.drawImage(decoded, 0, 0);
      return { dimensions: [canvas.width, canvas.height], pixels: [[4,4],[495,4],[4,595],[495,595],[250,300]].map(([x,y]) => Array.from(context.getImageData(x,y,1,1).data)) };
    }, images[0]);
    expect(size.dimensions).toEqual([500, 600]);
    for (const [red, green, blue] of size.pixels) { expect(red).toBeLessThan(30); expect(green).toBeGreaterThan(110); expect(blue).toBeLessThan(30); }
    await route.fulfill({ json: { ok: true, result: fixture } });
  });
  await page.goto('/');
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await page.getByRole('button', { name: '카메라 켜기', exact: true }).click();
  await expect(page.getByRole('button', { name: '선크림 촬영하고 인식', exact: true })).toBeEnabled();
  await page.evaluate(() => { window.originalVideo = document.querySelector('video'); });
  // Read the rectangle and scroll offset in one frame while focus scrolling may be active.
  const documentBox = () => page.getByLabel('카메라 미리보기').evaluate(video => {
    const box = video.getBoundingClientRect();
    return { x: box.x + scrollX, y: box.y + scrollY, width: box.width };
  });
  const originalBox = await documentBox();
  await page.getByRole('button', { name: '선크림 촬영하고 인식', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('사진 전송에 동의');
  expect(requests).toBe(0);
  await page.getByRole('checkbox', { name: '제품 사진을 외부 AI 모델(Google Gemini)로 전송하는 데 동의합니다', exact: true }).check();
  await page.getByRole('button', { name: '선크림 촬영하고 인식', exact: true }).click();
  await expect(page.getByRole('heading', { name: '라운드랩 자작나무 수분 선크림', exact: true })).toBeVisible();
  await expect(page.getByText(/SPF 50\+ · PA\+\+\+\+/).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: '얼굴 크기 측정', exact: true })).toHaveCount(0);
  await page.screenshot({ path: '.pr-review/product-recognition-result.png', fullPage: true });
  await page.getByRole('button', { name: '다음 단계로', exact: true }).click();
  await expect(page.getByRole('heading', { name: '얼굴 크기 측정', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.originalVideo === document.querySelector('video'))).toBe(true);
  expect(await page.evaluate(() => window.cameraStreams.length)).toBe(1);
  await page.getByRole('button', { name: '촬영하고 측정', exact: true }).click();
  await expect(page.getByRole('heading', { name: '도포 용량 안내', exact: true })).toBeVisible();
  await expect(page.getByLabel('카메라 미리보기')).toBeVisible();
  expect(await page.evaluate(() => window.cameraStreams[0].getTracks().every(t => t.readyState === 'live'))).toBe(true);
  await page.getByRole('button', { name: '도포 스캔 시작', exact: true }).click();
  await expect(page.getByRole('heading', { name: '부위별 도포 동작', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.originalVideo === document.querySelector('video'))).toBe(true);
  expect(await page.evaluate(() => window.cameraStreams.length)).toBe(1);
  expect(requests).toBe(1);
  const motionBox = await documentBox();
  expect(motionBox.x).toBeCloseTo(originalBox.x, 0);
  expect(motionBox.y).toBeCloseTo(originalBox.y, 0);
  expect(motionBox.width).toBeCloseTo(originalBox.width, 0);
  await page.getByRole('button', { name: '용량 안내로 돌아가기', exact: true }).click();
  expect(await page.evaluate(() => window.cameraStreams[0].getTracks().every(t => t.readyState === 'live'))).toBe(true);
  await page.screenshot({ path: '.pr-review/persistent-camera-guide.png', fullPage: true });
});

test('cancelling product recognition discards a late result and keeps the camera ready', async ({ page }) => {
  await syntheticCamera(page); await page.goto('/');
  let respond;
  const response = new Promise(resolve => { respond = resolve; });
  let sent = false;
  const fixture = JSON.parse(await readFile(new URL('../fixtures/recognition/full-label.json', import.meta.url), 'utf8'));
  await page.route('**/api/recognize', async route => {
    sent = true; await response;
    await route.fulfill({ json: { ok: true, result: fixture } }).catch(() => {});
  });
  await page.getByRole('button', { name: '카메라 켜기', exact: true }).click();
  await page.getByRole('checkbox', { name: '제품 사진을 외부 AI 모델(Google Gemini)로 전송하는 데 동의합니다', exact: true }).check();
  await page.getByRole('button', { name: '선크림 촬영하고 인식', exact: true }).click();
  await expect.poll(() => sent).toBe(true);
  await page.getByRole('button', { name: '취소', exact: true }).click();
  respond();
  await expect(page.getByRole('button', { name: '선크림 촬영하고 인식', exact: true })).toBeEnabled();
  await expect(page.getByRole('heading', { name: '얼굴 크기 측정', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('sunguard.product.v1'))).toBeNull();
  expect(await page.evaluate(() => window.cameraStreams.length)).toBe(1);
  expect(await page.evaluate(() => window.cameraStreams[0].getTracks().every(t => t.readyState === 'live'))).toBe(true);
});

test('unread product fields stay editable before advancing, without a file picker', async ({ page }) => {
  await syntheticCamera(page);
  const fixture = JSON.parse(await readFile(new URL('../fixtures/recognition/front-only.json', import.meta.url), 'utf8'));
  // This path must not register a product with no name.
  fixture.productName = ''; fixture.brand = ''; fixture.candidates = [];
  await page.route('**/api/recognize', route => route.fulfill({ json: { ok: true, result: fixture } }));
  await page.goto('/');
  await page.getByRole('button', { name: '카메라 켜기', exact: true }).click();
  await page.getByRole('checkbox', { name: '제품 사진을 외부 AI 모델(Google Gemini)로 전송하는 데 동의합니다', exact: true }).check();
  await page.getByRole('button', { name: '선크림 촬영하고 인식', exact: true }).click();
  await expect(page.getByRole('button', { name: '다음 단계로', exact: true })).toBeDisabled();
  await expect(page.getByLabel(/제품 이름/)).toBeVisible();
  await page.getByLabel(/제품 이름/).fill('확인한 선크림');
  await page.getByRole('button', { name: '이 정보로 저장', exact: true }).click();
  await page.getByRole('button', { name: '다음 단계로', exact: true }).click();
  await expect(page.getByRole('heading', { name: '얼굴 크기 측정', exact: true })).toBeVisible();
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.cameraStreams.length)).toBe(1);
});

test('desktop keeps step information alongside the compact camera', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await seedProduct(page); await page.goto('/');
  const camera = await page.getByLabel('카메라 미리보기').boundingBox();
  const information = await page.getByRole('heading', { name: '테스트 선크림', exact: true }).boundingBox();
  expect(information.x).toBeGreaterThanOrEqual(camera.x + camera.width);
  expect(information.y).toBeLessThan(camera.y + camera.height);
  await page.screenshot({ path: '.pr-review/persistent-camera-desktop.png', fullPage: true });
});

test('switching tabs preserves an unfinished product draft', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '직접 입력', exact: true }).click();
  await page.getByLabel('제품 이름', { exact: true }).fill('작성 중인 선크림');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByLabel('제품 이름', { exact: true })).toHaveValue('작성 중인 선크림');
});


test('skipping registration keeps the camera and proceeds without product assumptions', async ({ page }) => {
  await syntheticCamera(page); await mockMeasurement(page); await seedProduct(page); await page.goto('/');
  await page.getByRole('button', { name: '카메라 켜기', exact: true }).click();
  await page.evaluate(() => { window.originalVideo = document.querySelector('video'); });
  await page.getByRole('button', { name: '건너뛰기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '얼굴 크기 측정', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '촬영하고 측정', exact: true }).click();
  await expect(page.getByRole('heading', { name: '도포 용량 안내', exact: true })).toBeVisible();
  await expect(page.getByText('선크림 미등록', { exact: true })).toBeVisible();
  await expect(page.getByText(/표준 크림 줄 참고/)).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sunguard.product.v1')).name)).toBe('테스트 선크림');
  expect(await page.evaluate(() => window.originalVideo === document.querySelector('video'))).toBe(true);
  expect(await page.evaluate(() => window.cameraStreams.length)).toBe(1);
  await page.getByRole('button', { name: '도포 스캔 시작', exact: true }).click();
  await expect(page.getByRole('heading', { name: '부위별 도포 동작', exact: true })).toBeVisible();
});

test('registration can be skipped before opening a camera or granting transmission consent', async ({ page }) => {
  let sent = 0;
  page.on('request', request => { if (request.url().includes('/api/recognize')) sent++; });
  await page.goto('/');
  await page.getByRole('button', { name: '건너뛰기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '얼굴 크기 측정', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '카메라 켜기', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => localStorage.getItem('sunguard.product.v1'))).toBeNull();
  expect(sent).toBe(0);
});

test('skipping an in-flight recognition cannot save its late product result', async ({ page }) => {
  await syntheticCamera(page); await page.goto('/');
  let respond, sent = false;
  const pending = new Promise(resolve => { respond = resolve; });
  const fixture = JSON.parse(await readFile(new URL('../fixtures/recognition/full-label.json', import.meta.url), 'utf8'));
  await page.route('**/api/recognize', async route => {
    sent = true; await pending;
    await route.fulfill({ json: { ok: true, result: fixture } }).catch(() => {});
  });
  await page.getByRole('button', { name: '카메라 켜기', exact: true }).click();
  await page.getByRole('checkbox', { name: '제품 사진을 외부 AI 모델(Google Gemini)로 전송하는 데 동의합니다', exact: true }).check();
  await page.getByRole('button', { name: '선크림 촬영하고 인식', exact: true }).click();
  await expect.poll(() => sent).toBe(true);
  await page.getByRole('button', { name: '건너뛰기', exact: true }).click();
  respond();
  await expect(page.getByRole('heading', { name: '얼굴 크기 측정', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('sunguard.product.v1'))).toBeNull();
  expect(await page.evaluate(() => window.cameraStreams.length)).toBe(1);
});

test('product capture freezes the preview through recognition and resumes on next', async ({ page }) => {
  await syntheticCamera(page); await page.goto('/');
  let respond, sent = false;
  const pending = new Promise(resolve => { respond = resolve; });
  const fixture = JSON.parse(await readFile(new URL('../fixtures/recognition/full-label.json', import.meta.url), 'utf8'));
  await page.route('**/api/recognize', async route => {
    sent = true; await pending;
    await route.fulfill({ json: { ok: true, result: fixture } });
  });
  await page.getByRole('button', { name: '카메라 켜기', exact: true }).click();
  await page.getByRole('checkbox', { name: '제품 사진을 외부 AI 모델(Google Gemini)로 전송하는 데 동의합니다', exact: true }).check();
  const video = page.getByLabel('카메라 미리보기');
  await page.getByRole('button', { name: '선크림 촬영하고 인식', exact: true }).click();
  await expect.poll(() => sent).toBe(true);
  await expect(video).toHaveJSProperty('paused', true);
  expect(await page.evaluate(() => window.cameraStreams[0].getTracks().every(t => t.readyState === 'live'))).toBe(true);
  respond();
  await expect(page.getByRole('heading', { name: '라운드랩 자작나무 수분 선크림', exact: true })).toBeVisible();
  await expect(video).toHaveJSProperty('paused', true);
  await page.getByRole('button', { name: '다음 단계로', exact: true }).click();
  await expect(page.getByRole('heading', { name: '얼굴 크기 측정', exact: true })).toBeVisible();
  await expect(video).toHaveJSProperty('paused', false);
  expect(await page.evaluate(() => window.cameraStreams.length)).toBe(1);
});

test('failed recognition keeps the photo until retake returns to live preview', async ({ page }) => {
  await syntheticCamera(page);
  await page.route('**/api/recognize', route => route.fulfill({ status: 502, json: { ok: false, message: '분석 실패' } }));
  await page.goto('/');
  await page.getByRole('button', { name: '카메라 켜기', exact: true }).click();
  await page.getByRole('checkbox', { name: '제품 사진을 외부 AI 모델(Google Gemini)로 전송하는 데 동의합니다', exact: true }).check();
  await page.getByRole('button', { name: '선크림 촬영하고 인식', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('분석 실패');
  await expect(page.getByLabel('카메라 미리보기')).toHaveJSProperty('paused', true);
  await page.getByRole('button', { name: '다시 촬영', exact: true }).click();
  await expect(page.getByLabel('카메라 미리보기')).toHaveJSProperty('paused', false);
  expect(await page.evaluate(() => window.cameraStreams.length)).toBe(1);
});

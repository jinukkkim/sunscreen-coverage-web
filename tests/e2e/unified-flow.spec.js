import { test, expect } from '@playwright/test';
import { seedProduct, mockMeasurement, measureFace, syntheticCamera } from './helpers/flow.js';

test('registration gates measurement and manual save unlocks the next step', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '다음 단계로', exact: true })).toBeDisabled();
  await expect(page.getByRole('heading', { name: '얼굴 크기 측정', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '직접 입력', exact: true }).click();
  await page.getByLabel('제품 이름', { exact: true }).fill('내 선크림');
  await page.getByRole('button', { name: '이 정보로 저장', exact: true }).click();
  await page.getByRole('button', { name: '다음 단계로', exact: true }).click();
  await expect(page.getByRole('heading', { name: '얼굴 크기 측정', exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sunguard.care.v1')).records)).toEqual([]);
});

test('measurement flows to dose, retaking invalidates it, and reload keeps only the product', async ({ page }) => {
  await seedProduct(page); await mockMeasurement(page); await syntheticCamera(page); await page.goto('/');
  await measureFace(page);
  await expect(page.getByText(/모델 영역 기준 추정량/)).toBeVisible();
  await page.getByRole('button', { name: '얼굴 다시 측정', exact: true }).click();
  await expect(page.getByRole('button', { name: '도포 스캔 시작', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: '테스트 선크림', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '도포 용량 안내', exact: true })).toHaveCount(0);
});

test('camera denial keeps manual records and lower dashboard usable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await seedProduct(page);
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('denied', 'NotAllowedError'); }; });
  await page.goto('/');
  await page.getByRole('button', { name: '지금 발랐어요', exact: true }).click();
  await page.getByRole('button', { name: '다음 단계로', exact: true }).click();
  await page.getByRole('button', { name: '카메라 켜기', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: '카메라 권한' })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sunguard.care.v1')).records.length)).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.pr-review/unified-mobile.png', fullPage: true });
});

test('stick product never receives a cream strip conversion', async ({ page }) => {
  await seedProduct(page, 'stick'); await mockMeasurement(page); await syntheticCamera(page); await page.goto('/');
  await measureFace(page);
  await expect(page.getByText(/스틱.*길이 환산/)).toBeVisible();
  await expect(page.getByText(/표준 크림 줄 참고/)).toHaveCount(0);
});

test('live measurement keeps the camera across back and capture but stops on hidden tab', async ({ page }) => {
  await seedProduct(page); await mockMeasurement(page); await syntheticCamera(page); await page.goto('/');
  await page.getByRole('button', { name: '다음 단계로', exact: true }).click();
  await page.getByRole('button', { name: '카메라 켜기', exact: true }).click();
  await expect(page.getByRole('button', { name: '촬영하고 측정', exact: true })).toBeVisible();
  await page.screenshot({ path: '.pr-review/unified-measurement.png', fullPage: true });
  await page.getByRole('button', { name: '선크림 등록으로 돌아가기', exact: true }).click();
  expect(await page.evaluate(() => window.cameraStreams[0].getTracks().every(t => t.readyState === 'live'))).toBe(true);
  await page.getByRole('button', { name: '다음 단계로', exact: true }).click();
  await expect(page.getByRole('button', { name: '촬영하고 측정', exact: true })).toBeEnabled();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByRole('button', { name: '카메라 켜기', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => window.cameraStreams[0].getTracks().every(t => t.readyState === 'ended'))).toBe(true);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); });
  await page.getByRole('button', { name: '카메라 켜기', exact: true }).click();
  await page.getByRole('button', { name: '촬영하고 측정', exact: true }).click();
  await expect(page.getByRole('heading', { name: '도포 용량 안내', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.cameraStreams[1].getTracks().every(t => t.readyState === 'live'))).toBe(true);
  await page.screenshot({ path: '.pr-review/unified-dose.png', fullPage: true });
});

test('cancelled model loading cannot restore a stale measurement result', async ({ page }) => {
  await seedProduct(page); await mockMeasurement(page); await syntheticCamera(page);
  await page.addInitScript(() => { window.measurementPending = true; });
  await page.goto('/');
  await page.getByRole('button', { name: '다음 단계로', exact: true }).click();
  await page.getByRole('button', { name: '카메라 켜기', exact: true }).click();
  await page.getByRole('button', { name: '촬영하고 측정', exact: true }).click();
  await expect.poll(() => page.evaluate(() => typeof window.finishMeasurement)).toBe('function');
  await page.getByRole('button', { name: '취소', exact: true }).click();
  await page.evaluate(() => { window.finishMeasurement(); });
  await expect(page.getByRole('heading', { name: '얼굴 크기 측정', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '도포 스캔 시작', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sunguard.care.v1')).records)).toEqual([]);
});

test('editing a registered product blocks continuation until it is saved or cancelled', async ({ page }) => {
  await seedProduct(page); await page.goto('/');
  await page.getByRole('button', { name: '정보 수정', exact: true }).click();
  await expect(page.getByRole('button', { name: '다음 단계로', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '취소', exact: true }).click();
  await expect(page.getByRole('button', { name: '다음 단계로', exact: true })).toBeEnabled();
});

test('hiding the motion step releases its camera without creating a record', async ({ page }) => {
  await seedProduct(page); await mockMeasurement(page); await syntheticCamera(page); await page.goto('/');
  await measureFace(page);
  await page.getByRole('button', { name: '도포 스캔 시작', exact: true }).click();
  await expect(page.getByRole('button', { name: '카메라 끄기', exact: true })).toBeEnabled();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByText('카메라 꺼짐', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.cameraStreams[0].getTracks().every(t => t.readyState === 'ended'))).toBe(true);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sunguard.care.v1')).records)).toEqual([]);
});

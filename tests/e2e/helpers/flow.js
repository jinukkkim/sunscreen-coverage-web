import { expect } from '@playwright/test';

// Synthetic geometry, not a participant image. The real estimator runs on these points.
export function measurementFace() {
  const points = Array.from({ length: 478 }, (_, i) => {
    const angle = i / 478 * Math.PI * 2;
    return { x: .5 + .23 * Math.cos(angle), y: .5 + .32 * Math.sin(angle), z: -.025 * Math.cos(angle) };
  });
  const set = (id, x, y, z = 0) => points[id] = { x, y, z };
  set(234, .25, .5); set(454, .75, .5); set(10, .5, .18); set(152, .5, .82);
  set(33, .39, .42); set(263, .61, .42);
  for (const [center, ids] of [[.43, [468, 469, 470, 471, 472]], [.57, [473, 474, 475, 476, 477]]]) {
    set(ids[0], center, .42); set(ids[1], center + .025, .42); set(ids[2], center, .445);
    set(ids[3], center - .025, .42); set(ids[4], center, .395);
  }
  return points;
}

export async function seedProduct(page, form = 'cream') {
  await page.addInitScript(form => {
    localStorage.setItem('sunguard.product.v1', JSON.stringify({
      id: 'flow-test', name: '테스트 선크림', spf: 50, spfPlus: true, paGrade: 4,
      form, ingredients: [], waterResistance: 'unknown', source: 'manual', registeredAt: '2026-11-14T00:00:00Z',
    }));
  }, form);
}

export async function mockMeasurement(page) {
  await page.addInitScript(points => { window.measurementPoints = points; }, measurementFace());
  await page.route('**/assets/vision_bundle-*.js', async route => {
    if (route.request().url().includes('?actual')) return route.continue();
    await route.fulfill({ contentType: 'application/javascript', body: `
      import * as sdk from '${route.request().url()}?actual';
      export const FilesetResolver = sdk.FilesetResolver;
      export const HandLandmarker = sdk.HandLandmarker;
      export class FaceLandmarker extends sdk.FaceLandmarker {
        static async createFromOptions(files, options) {
          if (options.runningMode === 'IMAGE') {
            if (window.measurementPending) await new Promise(resolve => {window.finishMeasurement = resolve;});
            return {detect: () => ({faceLandmarks: [window.measurementPoints]})};
          }
          return sdk.FaceLandmarker.createFromOptions(files, options);
        }
      }` });
  });
}

export async function measureFace(page) {
  await page.getByRole('button', { name: '다음 단계로', exact: true }).click();
  const start = page.getByRole('button', { name: '카메라 켜기', exact: true });
  if (await start.isEnabled()) await start.click();
  await page.getByRole('button', { name: '촬영하고 측정', exact: true }).click();
  await expect(page.getByRole('heading', { name: '도포 용량 안내', exact: true })).toBeVisible();
}

export async function enterScan(page) {
  await measureFace(page);
  await page.getByRole('button', { name: '도포 스캔 시작', exact: true }).click();
}

export async function syntheticCamera(page, patterned = false) {
  await page.addInitScript(patterned => {
    window.cameraStreams = [];
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 1000;
      const context = canvas.getContext('2d'); let frame = 0;
      const draw = () => {
        context.fillStyle = patterned ? 'red' : frame++ % 2 ? 'gray' : 'silver';
        context.fillRect(0, 0, 1000, 1000);
        if (patterned) { context.fillStyle = 'green'; context.fillRect(250, 200, 500, 600); }
      };
      draw(); const timer = setInterval(draw, 50); const stream = canvas.captureStream(20);
      window.cameraStreams.push(stream);
      for (const track of stream.getTracks()) {
        const stop = track.stop.bind(track);
        track.stop = () => { clearInterval(timer); stop(); };
      }
      return stream;
    };
  }, patterned);
}

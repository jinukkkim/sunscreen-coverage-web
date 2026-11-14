import { readFileSync } from 'node:fs';
// Synthetic canonical geometry, not participant data. Google MediaPipe, Apache-2.0.
const vertices = JSON.parse(readFileSync(new URL('../fixtures/canonical-face.json', import.meta.url)));
export function face() {
  return vertices.map(([x, y, z]) => ({ x: 0.5 + x / 25, y: 0.45 - y / 25, z: -z / 25 }));
}
export function hand(x, y) {
  return Array.from({ length: 21 }, () => ({ x, y, z: 0 }));
}
export const dimensions = { width: 1000, height: 1000 };

// Points inside the five regions of the synthetic canonical fixture.
export function regionHand(id, elapsed) {
  const centers = { forehead: [.5, .205], nose: [.5, .478], leftCheek: [.675, .539], rightCheek: [.325, .539], chin: [.5, .745] };
  const [x, y] = centers[id];
  const triangle = 1 - Math.abs((elapsed % 400) / 200 - 1);
  return hand(x - .02 + .04 * triangle, y);
}

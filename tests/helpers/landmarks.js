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

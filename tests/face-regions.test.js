import test from 'node:test';
import assert from 'node:assert/strict';
import { getFaceGeometry, locateRegion, getDisplayPoint, getMeshSegments } from '../src/lib/face-regions.js';
import { face, dimensions } from './helpers/landmarks.js';

test('assigns visible skin to five user-relative regions without including eyes, mouth or background', () => {
  const geometry = getFaceGeometry(face(), dimensions);
  assert.equal(geometry.quality.ready, true);
  for (const [x, y, expected] of [
    [.5, .18, 'forehead'], [.5, .49, 'nose'], [.32, .53, 'rightCheek'],
    [.68, .53, 'leftCheek'], [.5, .75, 'chin'], [.5, .63, null],
    [.37, .345, null], [.63, .345, null], [.05, .5, null],
  ]) assert.equal(locateRegion(geometry, [{ x, y }]), expected, `${x},${y}`);
  assert.equal(geometry.regions.length, 5);
  assert.equal(locateRegion(geometry, [{ x: NaN, y: .5 }]), null);
  assert.equal(locateRegion(geometry, []), null);
});

test('normalizes joint head and hand translation, scale and roll in physical image coordinates', () => {
  const original = getFaceGeometry(face(), dimensions);
  const point = { x: .32, y: .53 };
  const angle = .12;
  const transform = p => ({
    x: .52 + .8 * ((p.x - .5) * Math.cos(angle) - (p.y - .45) * Math.sin(angle)),
    y: .46 + .8 * ((p.x - .5) * Math.sin(angle) + (p.y - .45) * Math.cos(angle)),
  });
  const moved = getFaceGeometry(face().map(transform), dimensions);
  assert.equal(locateRegion(moved, [transform(point)]), 'rightCheek');
  const before = original.toFacePoint(point), after = moved.toFacePoint(transform(point));
  assert.ok(Math.abs(before.x - after.x) < 1e-8);
  assert.ok(Math.abs(before.y - after.y) < 1e-8);
  const wide = getFaceGeometry(face().map(p => ({ ...p, x: p.x / 2 })), { width: 2000, height: 1000 });
  const normalized = wide.toFacePoint({ x: point.x / 2, y: point.y });
  assert.ok(Math.abs(before.x - normalized.x) < 1e-8);
  assert.ok(Math.abs(before.y - normalized.y) < 1e-8);
});

test('rejects invalid and degenerate geometry and prevents a scan with a clipped or turned face', () => {
  assert.equal(getFaceGeometry([], dimensions), null);
  const invalid = face(); invalid[33].x = NaN;
  assert.equal(getFaceGeometry(invalid, dimensions), null);
  assert.equal(getFaceGeometry(face(), { width: 0, height: 1000 }), null);
  assert.equal(getFaceGeometry(face().map(() => ({ x: .5, y: .5 })), dimensions), null);
  const clipped = face().map(p => ({ ...p, x: p.x + .3 }));
  assert.equal(getFaceGeometry(clipped, dimensions).quality.ready, false);
  const turned = face(); turned[1].x += .18;
  assert.equal(getFaceGeometry(turned, dimensions).quality.ready, false);
});

test('maps cover-cropped mirrored video points to the exact visible overlay', () => {
  const size = { videoWidth: 1920, videoHeight: 1080, stageWidth: 400, stageHeight: 300, mirrored: true };
  assert.deepEqual(getDisplayPoint({ x: .5, y: .5 }, size), { x: 200, y: 150 });
  const point = getDisplayPoint({ x: .25, y: .25 }, size);
  assert.ok(Math.abs(point.x - 333.3333333333) < 1e-6);
  assert.equal(point.y, 75);
  assert.equal(getDisplayPoint({ x: .25, y: .25 }, { ...size, mirrored: false }).x < 200, true);
});

test('forehead follows the upper contour and brow line instead of clipping side and upper forehead skin', () => {
  const geometry = getFaceGeometry(face(), dimensions);
  for (const [x, y] of [[.4, .145], [.6, .145], [.32, .22], [.68, .22]]) {
    assert.equal(locateRegion(geometry, [{ x, y }]), 'forehead', `${x},${y}`);
  }
  for (const [x, y] of [[.5, .10], [.35, .27], [.65, .27], [.37, .345], [.63, .345]]) {
    assert.equal(locateRegion(geometry, [{ x, y }]), null, `${x},${y}`);
  }
});

test('keeps raw landmarks for the overlay and skips mesh segments with missing points', () => {
  const landmarks = face();
  assert.equal(getFaceGeometry(landmarks, dimensions).landmarks, landmarks);
  const segments = getMeshSegments([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: NaN, y: 0 }],
    [{ start: 0, end: 1 }, { start: 1, end: 2 }, { start: 0, end: 9 }]);
  assert.deepEqual(segments, [[{ x: 0, y: 0 }, { x: 1, y: 1 }]]);
});

test('mesh leaves out lines around the eyes and lips but keeps cheek lines', () => {
  const landmarks = face();
  const mouth = [61, 40, 37, 0, 267, 270, 291, 321, 314, 17, 84, 91].map(i => landmarks[i]);
  const center = { x: mouth.reduce((s, p) => s + p.x, 0) / 12, y: mouth.reduce((s, p) => s + p.y, 0) / 12 };
  const extra = landmarks.length;
  const points = [...landmarks, center, { x: center.x + 1e-3, y: center.y }, { x: .3, y: .53 }, { x: .31, y: .53 }];
  const segments = getMeshSegments(points, [{ start: extra, end: extra + 1 }, { start: extra + 2, end: extra + 3 }]);
  assert.deepEqual(segments, [[points[extra + 2], points[extra + 3]]]);
});

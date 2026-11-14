import test from 'node:test';
import assert from 'node:assert/strict';
import { FaceLandmarker } from '@mediapipe/tasks-vision';
import * as faceRegions from '../src/lib/face-regions.js';
import * as coverage from '../src/lib/coverage-visual.js';
import { face, dimensions } from './helpers/landmarks.js';

test('real tessellation yields unique skin triangles assigned to the five tracked regions', () => {
  const geometry = faceRegions.getFaceGeometry(face(), dimensions);
  const triangles = faceRegions.getMeshTriangles?.(geometry, FaceLandmarker.FACE_LANDMARKS_TESSELATION) ?? [];
  assert.ok(triangles.length > 100);
  assert.equal(new Set(triangles.map(tile => tile.id)).size, triangles.length);
  assert.deepEqual(new Set(triangles.map(tile => tile.regionId)), new Set(['forehead', 'nose', 'leftCheek', 'rightCheek', 'chin']));
  for (const tile of triangles) {
    assert.equal(tile.points.length, 3);
    const edges = tile.points.map((point, i) => ({ start: i, end: (i + 1) % 3 }));
    // The same eye/lip exclusions apply to both lines and painted triangles.
    const landmarks = [...geometry.landmarks, ...tile.points];
    const offset = geometry.landmarks.length;
    assert.equal(faceRegions.getMeshSegments(landmarks, edges.map(edge => ({ start: edge.start + offset, end: edge.end + offset }))).length, 3);
  }
});

test('half progress colors half the triangles while each region advances independently', () => {
  const tiles = [0, 1, 2, 3].map(id => ({ id, regionId: 'forehead' }));
  tiles.push({ id: 4, regionId: 'nose' });
  const result = coverage.getTriangleCoverage?.(tiles, [{ id: 'forehead', progress: 50 }, { id: 'nose', progress: 0 }]) ?? [];
  assert.deepEqual(result.map(tile => tile.visual.progress), [100, 100, 0, 0, 0]);
});

test('fractional progress blends one tile and completion fills every tile without overflow', () => {
  const tiles = [0, 1].map(id => ({ id, regionId: 'chin' }));
  const partial = coverage.getTriangleCoverage?.(tiles, [{ id: 'chin', progress: 25 }]) ?? [];
  assert.deepEqual(partial.map(tile => tile.visual.progress), [50, 0]);
  const complete = coverage.getTriangleCoverage?.(tiles, [{ id: 'chin', progress: 120 }]) ?? [];
  assert.deepEqual(complete.map(tile => tile.visual.progress), [100, 100]);
  const invalid = coverage.getTriangleCoverage?.(tiles, [{ id: 'chin', progress: NaN }]) ?? [];
  assert.deepEqual(invalid.map(tile => tile.visual.progress), [0, 0]);
});

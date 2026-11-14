import test from 'node:test';
import assert from 'node:assert/strict';
import { createRubbingTracker } from '../src/lib/rubbing-tracker.js';
import { getFaceGeometry } from '../src/lib/face-regions.js';
import { face, hand, dimensions, regionHand } from './helpers/landmarks.js';
const geometry = getFaceGeometry(face(), dimensions);
const xAt = t => .30 + .04 * (1 - Math.abs((t % 400) / 200 - 1));
const status = (tracker, id = 'rightCheek') => tracker.snapshot().regions.find(r => r.id === id).status;
function feed(tracker, end, step = 100, from = 0, point = t => hand(xAt(t), .53)) {
  for (let t = from; t <= end; t += step) tracker.update({ geometry, hands: [point(t)], timestampMs: t });
}

test('requires two seconds of moving hand observations, independently of frame rate', () => {
  for (const step of [50, 100, 200]) {
    const tracker = createRubbingTracker();
    feed(tracker, 1800, step);
    assert.notEqual(status(tracker), 'detected');
    feed(tracker, 2200, step, 1800 + step);
    assert.equal(status(tracker), 'detected');
    assert.equal(tracker.snapshot().detectedCount, 1);
    tracker.reset();
    assert.equal(status(tracker), 'pending');
  }
});

test('rejects a static hand, tiny jitter, short pass and a hand outside the face', () => {
  for (const makeHand of [
    () => hand(.32, .53), t => hand(.32 + .0001 * Math.sin(t), .53),
    () => hand(.03, .53),
  ]) {
    const tracker = createRubbingTracker();
    feed(tracker, 4000, 100, 0, makeHand);
    assert.equal(tracker.snapshot().detectedCount, 0);
  }
  const tracker = createRubbingTracker();
  feed(tracker, 600);
  tracker.update({ geometry, hands: [], timestampMs: 700 });
  assert.equal(status(tracker), 'pending');
});

test('does not mistake joint head and hand translation for rubbing', () => {
  const tracker = createRubbingTracker();
  for (let t = 0; t <= 3000; t += 100) {
    const offset = .03 * Math.sin(t / 400);
    const shifted = getFaceGeometry(face().map(p => ({ ...p, x: p.x + offset })), dimensions);
    tracker.update({ geometry: shifted, hands: [hand(.32 + offset, .53)], timestampMs: t });
  }
  assert.equal(tracker.snapshot().detectedCount, 0);
});

test('does not inherit time across a lost hand, new region, or a long frame gap', () => {
  for (const interrupt of [
    t => ({ geometry, hands: [], timestampMs: t }),
    t => ({ geometry: null, hands: [], timestampMs: t }),
    t => ({ geometry, hands: [hand(.68, .53)], timestampMs: t }),
  ]) {
    const tracker = createRubbingTracker();
    feed(tracker, 1500);
    tracker.update(interrupt(1600));
    feed(tracker, 2900, 100, 1700);
    assert.notEqual(status(tracker), 'detected');
  }
  const tracker = createRubbingTracker();
  feed(tracker, 1500);
  feed(tracker, 3500, 100, 2500);
  assert.notEqual(status(tracker), 'detected');
});

test('ignores repeated and backward timestamps rather than giving extra credit', () => {
  const tracker = createRubbingTracker();
  feed(tracker, 1000);
  for (let i = 0; i < 50; i++) tracker.update({ geometry, hands: [hand(xAt(i * 100), .53)], timestampMs: 1000 - i });
  feed(tracker, 1800, 100, 1100);
  assert.notEqual(status(tracker), 'detected');
});

test('hand array order cannot mix histories or make two hands complete early', () => {
  const tracker = createRubbingTracker();
  for (let t = 0; t <= 2200; t += 100) {
    const hands = [hand(xAt(t), .53), hand(1 - xAt(t), .53)];
    if ((t / 100) % 2) hands.reverse();
    tracker.update({ geometry, hands, timestampMs: t });
    if (t < 2000) assert.equal(tracker.snapshot().detectedCount, 0);
  }
  assert.equal(tracker.snapshot().detectedCount, 2);
});

test('ambiguous nearby hands do not share accumulated credit', () => {
  const tracker = createRubbingTracker();
  for (let t = 0; t <= 3000; t += 100) {
    tracker.update({ geometry, hands: [hand(xAt(t), .53), hand(xAt(t) + .015, .53)], timestampMs: t });
  }
  assert.equal(tracker.snapshot().detectedCount, 0);
});

test('air rubbing can pass: motion observations do not certify physical contact or product', () => {
  const tracker = createRubbingTracker();
  feed(tracker, 2300, 100, 0, t => hand(xAt(t), .53).map(p => ({ ...p, z: -10 })));
  assert.equal(status(tracker), 'detected');
});

test('a fixed image-space hand with only the head moving cannot register rubbing', () => {
  const tracker = createRubbingTracker();
  for (let t = 0; t <= 3000; t += 100) {
    const offset = .02 * Math.sin(2 * Math.PI * t / 800);
    const shifted = getFaceGeometry(face().map(p => ({ ...p, x: p.x + offset })), dimensions);
    tracker.update({ geometry: shifted, hands: [hand(.32, .53)], timestampMs: t });
  }
  assert.equal(tracker.snapshot().detectedCount, 0);
});

test('valid motion raises partial progress before detection and preserves it between regions', () => {
  const tracker = createRubbingTracker();
  const values = [];
  for (let t = 0; t <= 1000; t += 100) {
    tracker.update({ geometry, hands: [regionHand('rightCheek', t)], timestampMs: t });
    values.push(tracker.snapshot().regions.find(r => r.id === 'rightCheek').progress);
  }
  assert.ok(values.at(-1) > 0 && values.at(-1) < 100);
  assert.ok(values.every((value, i) => i === 0 || value >= values[i - 1]));
  const previous = tracker.snapshot().progress;
  tracker.update({ geometry, hands: [], timestampMs: 1100 });
  assert.equal(tracker.snapshot().progress, previous);
  assert.equal(tracker.snapshot().detectedCount, 0);
  tracker.reset();
  assert.equal(tracker.snapshot().progress, 0);
});

test('all five independently detected regions are required for total progress of 100', () => {
  const tracker = createRubbingTracker();
  let time = 0;
  for (const id of ['forehead', 'nose', 'leftCheek', 'rightCheek', 'chin']) {
    for (let elapsed = 0; elapsed <= 2500; elapsed += 100) {
      tracker.update({ geometry, hands: [regionHand(id, elapsed)], timestampMs: time });
      time += 100;
    }
    assert.equal(tracker.snapshot().regions.find(region => region.id === id).progress, 100, id);
    if (id !== 'chin') assert.ok(tracker.snapshot().progress < 100);
  }
  assert.equal(tracker.snapshot().progress, 100);
  assert.equal(tracker.snapshot().detectedCount, 5);
});

test('static hands and head-only movement cannot raise progress', () => {
  const tracker = createRubbingTracker();
  for (let t = 0; t <= 3000; t += 100) {
    const offset = .02 * Math.sin(2 * Math.PI * t / 800);
    const shifted = getFaceGeometry(face().map(p => ({ ...p, x: p.x + offset })), dimensions);
    tracker.update({ geometry: shifted, hands: [hand(.32, .53)], timestampMs: t });
  }
  assert.equal(tracker.snapshot().progress, 0);
});


test('interrupt preserves completed and partial progress without joining motion across the gap', () => {
  const tracker = createRubbingTracker();
  feed(tracker, 2200);
  feed(tracker, 3800, 100, 2300, t => regionHand('leftCheek', t));
  const before = tracker.snapshot();
  assert.equal(before.detectedCount, 1);
  tracker.interrupt();
  assert.equal(tracker.snapshot().progress, before.progress);
  assert.equal(tracker.snapshot().detectedCount, 1);
  assert.equal(tracker.snapshot().regions.find(r => r.id === 'leftCheek').status, 'pending');
  feed(tracker, 4900, 100, 3900, t => regionHand('leftCheek', t));
  assert.equal(tracker.snapshot().detectedCount, 1);
  assert.equal(tracker.snapshot().progress, before.progress);
});

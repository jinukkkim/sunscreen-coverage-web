import test from 'node:test';
import assert from 'node:assert/strict';
import { AUTO_START_MS, createVisionSession, loadVisionModels } from '../src/lib/vision-session.js';
import { face, hand, regionHand } from './helpers/landmarks.js';

function fixture(options = {}) {
  let nextId = 0, closed = 0;
  const callbacks = new Map(), updates = [];
  const video = { readyState: 2, currentTime: 0, videoWidth: 1000, videoHeight: 1000 };
  const input = { faces: [face()], hands: [], visible: true, throws: false };
  const models = {
    face: { detectForVideo() {
      if (input.throws) throw new Error('inference failed');
      return { faceLandmarks: input.faces, faceBlendshapes: [], facialTransformationMatrixes: [] };
    } },
    hand: { detectForVideo() { return { landmarks: input.hands, worldLandmarks: [], handedness: [] }; } },
    close() { closed++; },
  };
  const session = createVisionSession({
    video, onUpdate: update => updates.push(update),
    loadModels: async () => models, isVisible: () => input.visible,
    scheduleFrame: callback => { callbacks.set(++nextId, callback); return nextId; },
    cancelFrame: id => callbacks.delete(id), ...options,
  });
  function tick(t, advance = true) {
    if (advance) video.currentTime = t / 1000;
    const first = callbacks.entries().next().value;
    assert.ok(first, 'analysis has a scheduled frame');
    callbacks.delete(first[0]); first[1](t);
  }
  return { session, video, input, models, callbacks, updates, tick,
    get last() { return updates.at(-1); }, get closed() { return closed; } };
}
async function ready(f) {
  await f.session.start();
  for (let t = 0; t <= 1000; t += 100) f.tick(t);
  assert.equal(f.last.phase, 'ready');
}

test('two continuous seconds of stable face detection start motion automatically once', async () => {
  const f = fixture(); await f.session.start();
  for (let t = 0; t < AUTO_START_MS; t += 100) f.tick(t);
  assert.equal(f.last.phase, 'ready');
  assert.equal(f.last.sessionId, null);
  assert.equal(f.last.progress, 0);
  f.tick(AUTO_START_MS);
  assert.equal(f.last.phase, 'tracking');
  assert.ok(f.last.sessionId);
  assert.equal(f.last.completedAt, null);
  assert.equal(f.updates.filter(update => update.phase === 'tracking').length, 1);
  assert.ok(f.updates.some(update => update.phase === 'ready'));
  const id = f.last.sessionId;
  f.tick(AUTO_START_MS + 100);
  assert.equal(f.last.sessionId, id);
  f.session.stop();
});

test('lost faces, multiple faces, hidden tabs and motion reset the automatic countdown', async () => {
  for (const invalidate of [
    f => { f.input.faces = []; },
    f => { f.input.faces = [face(), face()]; },
    f => { f.input.visible = false; },
    f => { f.input.faces = [face().map(p => ({ ...p, x: p.x + .03 }))]; },
  ]) {
    const f = fixture(); await f.session.start();
    for (let t = 0; t <= 1900; t += 100) f.tick(t);
    invalidate(f); f.tick(2000);
    assert.equal(f.last.sessionId, null);
    f.input.faces = [face()]; f.input.visible = true;
    for (let t = 2100; t < 4100; t += 100) f.tick(t);
    assert.equal(f.last.sessionId, null);
    f.tick(4100);
    assert.equal(f.last.phase, 'tracking');
    f.session.stop();
  }
});

test('stopping during the countdown prevents automatic start and completion', async () => {
  const f = fixture(); await ready(f);
  f.session.stop();
  assert.equal(f.callbacks.size, 0);
  assert.equal(f.last.phase, 'stopped');
  assert.equal(f.updates.some(update => update.phase === 'tracking' || update.phase === 'completed'), false);
});

test('requires stable face scan and explicit confirmation before accumulating motion', async () => {
  const f = fixture();
  await f.session.start();
  assert.equal(f.session.confirmScan(), false);
  for (let t = 0; t <= 900; t += 100) f.tick(t);
  assert.equal(f.last.phase, 'scanning');
  f.tick(1000);
  assert.equal(f.last.phase, 'ready');
  assert.equal(f.last.detectedCount, 0);
  assert.equal(f.session.confirmScan(), true);
  for (let t = 1100; t <= 3400; t += 100) {
    f.input.hands = [hand(.30 + .04 * (1 - Math.abs((t % 400) / 200 - 1)), .53)];
    f.tick(t);
  }
  assert.equal(f.last.phase, 'tracking');
  assert.equal(f.last.detectedCount, 1);
  f.session.stop();
  assert.equal(f.closed, 1);
  assert.equal(f.callbacks.size, 0);
});

test('tracking loss pauses and multiple faces require a new scan', async () => {
  for (const faces of [[], [face(), face()]]) {
    const f = fixture(); await ready(f); f.session.confirmScan();
    f.input.faces = faces; f.tick(1100);
    assert.equal(f.last.phase, faces.length ? 'scanning' : 'recovering');
    assert.equal(f.last.detectedCount, 0);
    assert.equal(f.session.confirmScan(), false);
    f.session.stop();
  }
});

test('duplicate video frames do not produce new observations and hidden tabs require rescan', async () => {
  const f = fixture(); await ready(f); f.session.confirmScan();
  const count = f.updates.length;
  f.tick(1100, false);
  assert.equal(f.updates.length, count);
  f.input.visible = false; f.tick(1200);
  assert.equal(f.last.phase, 'scanning');
  assert.equal(f.last.detectedCount, 0);
  f.input.visible = true; f.tick(1300);
  assert.equal(f.session.confirmScan(), false);
  f.session.stop();
});

test('long frame stalls require a fresh scan instead of crediting missing time', async () => {
  const f = fixture(); await ready(f); f.session.confirmScan();
  f.tick(3000);
  assert.equal(f.last.phase, 'scanning');
  assert.equal(f.session.confirmScan(), false);
  f.session.stop();
});

test('stopping during model loading releases late models without changing stopped state', async () => {
  let resolve;
  const f = fixture({ loadModels: () => new Promise(done => { resolve = done; }) });
  const pending = f.session.start();
  f.session.stop();
  resolve(f.models);
  await pending;
  assert.equal(f.last.phase, 'stopped');
  assert.equal(f.closed, 1);
  assert.equal(f.callbacks.size, 0);
});

test('a stale loading result cannot replace a newer analysis session', async () => {
  let resolve, calls = 0, oldClosed = 0;
  const f = fixture({ loadModels: () => ++calls === 1
    ? new Promise(done => { resolve = done; })
    : Promise.resolve(f.models) });
  const old = f.session.start();
  await f.session.start();
  resolve({ ...f.models, close() { oldClosed++; } }); await old;
  assert.equal(f.last.phase, 'scanning');
  assert.equal(oldClosed, 1);
  assert.equal(f.closed, 0);
  f.session.stop();
});

test('inference failures release resources and do not report a completed observation', async () => {
  const f = fixture(); await f.session.start();
  f.input.throws = true; f.tick(0);
  assert.equal(f.last.phase, 'error');
  assert.equal(f.last.detectedCount, 0);
  assert.equal(f.closed, 1);
  assert.equal(f.callbacks.size, 0);
});

test('cancelled callbacks cannot update a stopped session', async () => {
  const f = fixture(); await f.session.start();
  const stale = [...f.callbacks.values()][0];
  f.session.stop(); const count = f.updates.length;
  stale(1000);
  assert.equal(f.updates.length, count);
});

test('partial model initialization failure closes the face model', async () => {
  let closed = false;
  const sdk = {
    FilesetResolver: { forVisionTasks: async () => ({}) },
    FaceLandmarker: { createFromOptions: async () => ({ close() { closed = true; } }) },
    HandLandmarker: { createFromOptions: async () => { throw new Error('hand failed'); } },
  };
  await assert.rejects(loadVisionModels({ sdk }), /hand failed/);
  assert.equal(closed, true);
});

test('model loading uses local assets and configures multi-face rejection and two hands', async () => {
  const paths = [];
  const sdk = {
    FilesetResolver: { forVisionTasks: async path => { paths.push(path); return {}; } },
    FaceLandmarker: { createFromOptions: async (_, opts) => {
      assert.equal(opts.numFaces, 2); assert.equal(opts.runningMode, 'VIDEO');
      paths.push(opts.baseOptions.modelAssetPath); return { close() {} };
    } },
    HandLandmarker: { createFromOptions: async (_, opts) => {
      assert.equal(opts.numHands, 2); paths.push(opts.baseOptions.modelAssetPath); return { close() {} };
    } },
  };
  const models = await loadVisionModels({ sdk });
  assert.deepEqual(paths, ['/vision/wasm', '/vision/face_landmarker.task', '/vision/hand_landmarker.task']);
  models.close();
});

test('a frozen video invalidates a ready scan before another frame arrives', async () => {
  const f = fixture(); await ready(f);
  for (let t = 1100; t <= 5000; t += 100) f.tick(t, false);
  assert.equal(f.last.phase, 'scanning');
  assert.equal(f.session.confirmScan(), false);
  f.session.stop();
});

test('a frozen video preserves detected regions and requires confirmation', async () => {
  const f = fixture(); await ready(f); f.session.confirmScan();
  for (let t = 1100; t <= 3400; t += 100) {
    f.input.hands = [hand(.30 + .04 * (1 - Math.abs((t % 400) / 200 - 1)), .53)];
    f.tick(t);
  }
  assert.equal(f.last.detectedCount, 1);
  for (let t = 3500; t <= 5000; t += 100) f.tick(t, false);
  assert.equal(f.last.phase, 'scanning');
  assert.equal(f.last.detectedCount, 1);
  assert.equal(f.session.confirmScan(), false);
  f.tick(5100);
  assert.equal(f.last.phase, 'scanning');
  f.session.stop();
});

test('completing five regions emits one timestamped completion and releases inference', async () => {
  const completedAt = Date.parse('2026-11-14T09:00:00+09:00');
  const f = fixture({ now: () => completedAt, createId: () => 'test-completion-session' });
  await ready(f); f.session.confirmScan();
  let timestamp = 1100;
  for (const id of ['forehead', 'nose', 'leftCheek', 'rightCheek', 'chin']) {
    for (let elapsed = 0; elapsed <= 2600 && f.callbacks.size; elapsed += 100) {
      f.input.hands = [regionHand(id, elapsed)];
      f.tick(timestamp); timestamp += 100;
    }
  }
  assert.equal(f.last.phase, 'completed');
  assert.equal(f.last.progress, 100);
  assert.equal(f.last.completedAt, completedAt);
  assert.equal(f.last.sessionId, 'test-completion-session');
  assert.equal(f.updates.filter(update => update.phase === 'completed').length, 1);
  assert.equal(f.callbacks.size, 0);
  assert.equal(f.closed, 1);
});

test('an interrupted partial observation never emits a completion', async () => {
  const f = fixture(); await ready(f); f.session.confirmScan();
  for (let t = 1100; t <= 2000; t += 100) {
    f.input.hands = [regionHand('rightCheek', t)]; f.tick(t);
  }
  assert.ok(f.last.progress > 0 && f.last.progress < 100);
  f.input.faces = []; f.tick(2100);
  assert.ok(f.last.progress > 0 && f.last.progress < 100);
  assert.ok(f.last.sessionId);
  assert.equal(f.updates.some(update => update.phase === 'completed'), false);
  f.session.stop();
});

async function partial(f) {
  await ready(f); f.session.confirmScan();
  for (let t = 1100; t <= 2600; t += 100) {
    f.input.hands = [regionHand('rightCheek', t)]; f.tick(t);
  }
  assert.ok(f.last.progress > 0 && f.last.progress < 20);
  return { progress: f.last.progress, sessionId: f.last.sessionId };
}

test('brief face loss or invalid pose preserves credit and resumes observed motion without counting the gap', async () => {
  for (const invalid of [[], [face().map(p => ({ ...p, x: p.x + .4 }))]]) {
    const f = fixture(); const before = await partial(f);
    f.input.faces = invalid;
    for (let t = 2700; t <= 3000; t += 100) f.tick(t);
    assert.equal(f.last.phase, 'recovering');
    assert.equal(f.last.geometry, null);
    assert.equal(f.last.progress, before.progress);
    assert.equal(f.last.sessionId, before.sessionId);
    f.input.faces = [face()];
    f.input.hands = [regionHand('rightCheek', 3100)]; f.tick(3100);
    assert.equal(f.last.progress, before.progress);
    assert.equal(f.last.detectedCount, 0);
    for (let t = 3200; t <= 4100; t += 100) {
      f.input.hands = [regionHand('rightCheek', t)]; f.tick(t);
    }
    assert.equal(f.last.phase, 'tracking');
    assert.equal(f.last.detectedCount, 1);
    assert.ok(f.last.progress > before.progress);
    f.session.stop();
  }
});

test('the 2000ms recovery boundary requires rescan while 1900ms automatically resumes', async () => {
  for (const duration of [1900, 2000]) {
    const f = fixture(); const before = await partial(f);
    f.input.faces = [];
    for (let t = 2700; t < 2700 + duration; t += 100) f.tick(t);
    f.input.faces = [face()]; f.tick(2700 + duration);
    assert.equal(f.last.phase, duration === 1900 ? 'tracking' : 'scanning');
    assert.equal(f.last.progress, before.progress);
    assert.equal(f.last.sessionId, before.sessionId);
    if (duration === 2000) {
      for (let t = 4800; t <= 5700; t += 100) f.tick(t);
      assert.equal(f.last.phase, 'ready');
      assert.equal(f.session.confirmScan(), true);
      assert.equal(f.last.progress, before.progress);
      assert.equal(f.last.sessionId, before.sessionId);
    }
    f.session.stop();
  }
});

test('hidden tabs, unreadable video, multiple faces and stalled frames preserve progress through reconfirmation', async () => {
  for (const cause of ['hidden', 'unreadable', 'multiple', 'stalled']) {
    const f = fixture(); const before = await partial(f);
    if (cause === 'hidden') f.input.visible = false;
    if (cause === 'unreadable') f.video.readyState = 1;
    if (cause === 'multiple') f.input.faces = [face(), face()];
    if (cause === 'stalled') {
      for (let t = 2700; t <= 3300; t += 100) f.tick(t, false);
    } else f.tick(3300);
    assert.equal(f.last.phase, 'scanning');
    assert.equal(f.last.progress, before.progress);
    f.input.visible = true; f.video.readyState = 2; f.input.faces = [face()];
    for (let t = 3400; t <= 4500; t += 100) f.tick(t);
    assert.equal(f.last.phase, 'ready');
    assert.equal(f.session.confirmScan(), true);
    assert.equal(f.last.progress, before.progress);
    assert.equal(f.last.sessionId, before.sessionId);
    f.session.stop();
  }
});

test('explicit restart and stop clear preserved progress and session identity', async () => {
  for (const action of ['reset', 'stop']) {
    const f = fixture(); await partial(f);
    f.input.faces = []; f.tick(2700);
    f.session[action]();
    assert.equal(f.last.progress, 0);
    assert.equal(f.last.sessionId, null);
    assert.equal(f.last.phase, action === 'reset' ? 'scanning' : 'stopped');
    f.session.stop();
  }
});

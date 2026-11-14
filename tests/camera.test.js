import test from 'node:test';
import assert from 'node:assert/strict';
import { createCameraSession } from '../src/lib/camera.js';

function fixture(getUserMedia, play = async () => {}) {
  const video = { srcObject: null, play };
  return { video, session: createCameraSession({ getUserMedia, video }) };
}

function cameraStream() {
  let stopped = false;
  return { get stopped() { return stopped; }, getTracks: () => [{ stop() { stopped = true; } }] };
}

test('requests only video and releases all tracks on stop', async () => {
  const stream = cameraStream();
  const { video, session } = fixture(async constraints => {
    assert.deepEqual(constraints, { video: { facingMode: 'user' }, audio: false });
    return stream;
  });
  assert.equal(await session.start(), true);
  assert.equal(video.srcObject, stream);
  session.stop();
  assert.equal(stream.stopped, true);
  assert.equal(video.srcObject, null);
});

test('releases a camera request resolved after cancellation', async () => {
  let resolve;
  const stream = cameraStream();
  const { video, session } = fixture(() => new Promise(done => { resolve = done; }));
  const pending = session.start();
  session.stop();
  resolve(stream);
  assert.equal(await pending, false);
  assert.equal(stream.stopped, true);
  assert.equal(video.srcObject, null);
});

test('releases the stream if video playback fails', async () => {
  const stream = cameraStream();
  const { video, session } = fixture(async () => stream, async () => { throw new Error('playback failed'); });
  await assert.rejects(session.start(), /playback failed/);
  assert.equal(stream.stopped, true);
  assert.equal(video.srcObject, null);
});

test('a cancelled request cannot replace a newer stream', async () => {
  let resolve;
  const oldStream = cameraStream(), newStream = cameraStream();
  let calls = 0;
  const { video, session } = fixture(() => ++calls === 1
    ? new Promise(done => { resolve = done; }) : Promise.resolve(newStream));
  const oldRequest = session.start();
  assert.equal(await session.start(), true);
  resolve(oldStream);
  assert.equal(await oldRequest, false);
  assert.equal(oldStream.stopped, true);
  assert.equal(video.srcObject, newStream);
  assert.equal(newStream.stopped, false);
  session.stop();
});

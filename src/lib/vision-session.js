import { getFaceGeometry } from './face-regions.js';
import { createRubbingTracker } from './rubbing-tracker.js';

export async function loadVisionModels({ sdk } = {}) {
  sdk ??= await import('@mediapipe/tasks-vision');
  const files = await sdk.FilesetResolver.forVisionTasks('/vision/wasm');
  let face, hand;
  try {
    face = await sdk.FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: '/vision/face_landmarker.task', delegate: 'CPU' },
      runningMode: 'VIDEO', numFaces: 2,
    });
    hand = await sdk.HandLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: '/vision/hand_landmarker.task', delegate: 'CPU' },
      runningMode: 'VIDEO', numHands: 2,
    });
  } catch (error) { face?.close(); throw error; }
  let closed = false;
  return { face, hand, close() {
    if (closed) return;
    closed = true;
    try { face.close(); } finally { hand.close(); }
  } };
}

export function createVisionSession({
  video, onUpdate, loadModels = loadVisionModels,
  scheduleFrame = callback => requestAnimationFrame(callback),
  cancelFrame = id => cancelAnimationFrame(id),
  isVisible = () => document.visibilityState === 'visible',
}) {
  const tracker = createRubbingTracker();
  let generation = 0, models = null, frame = null, phase = 'stopped';
  let lastVideoTime = -1, lastInference = null, stableSince = null, anchor = null, geometry = null;
  const blank = () => { tracker.reset(); stableSince = null; anchor = null; geometry = null; };
  function emit(reason = '', hands = []) {
    onUpdate({ phase, reason, geometry, hands, ...tracker.snapshot() });
  }
  function scanAgain(reason) { blank(); phase = 'scanning'; emit(reason); }
  function release() {
    if (frame !== null) cancelFrame(frame);
    frame = null;
    const previous = models; models = null;
    try { previous?.close(); } catch { /* Release failures must not prevent camera teardown. */ }
  }
  function stop(notify = true) {
    generation++; release(); blank(); phase = 'stopped';
    lastVideoTime = -1; lastInference = null;
    if (notify) emit();
  }
  function queue(token) { frame = scheduleFrame(time => tick(time, token)); }
  function tick(timestamp, token) {
    if (token !== generation || !models) return;
    frame = null;
    if (!isVisible() || video.readyState < 2) {
      scanAgain('영상을 다시 확인한 뒤 부위를 확인해 주세요.'); lastInference = null;
      queue(token); return;
    }
    if (video.currentTime === lastVideoTime || (lastInference !== null && timestamp - lastInference < 100)) {
      queue(token); return;
    }
    try {
      if (lastInference !== null && timestamp - lastInference > 500) scanAgain('영상이 잠시 멈췄습니다. 부위를 다시 확인해 주세요.');
      lastInference = timestamp; lastVideoTime = video.currentTime;
      const faces = models.face.detectForVideo(video, timestamp).faceLandmarks;
      if (faces.length !== 1) {
        scanAgain(faces.length ? '한 사람만 화면에 들어오게 해 주세요.' : '얼굴을 정면 안내선에 맞춰 주세요.');
      } else {
        geometry = getFaceGeometry(faces[0], { width: video.videoWidth, height: video.videoHeight });
        if (!geometry?.quality.ready) {
          const reason = geometry?.quality.reason || '얼굴 부위를 확인할 수 없습니다.';
          scanAgain(reason);
        } else if (phase !== 'tracking') {
          const points = [faces[0][1], faces[0][33], faces[0][263]];
          if (!anchor || points.some((p, i) => Math.hypot(p.x - anchor[i].x, p.y - anchor[i].y) > .02)) {
            anchor = points.map(p => ({ ...p })); stableSince = timestamp; phase = 'scanning';
          }
          phase = timestamp - stableSince >= 1000 ? 'ready' : 'scanning';
          emit(phase === 'ready' ? '표시된 부위를 확인한 뒤 시작해 주세요.' : '얼굴을 잠시 정면으로 유지해 주세요.');
        } else {
          const hands = models.hand.detectForVideo(video, timestamp).landmarks;
          tracker.update({ geometry, hands, timestampMs: timestamp });
          emit(hands.length ? '부위별 펴 바르는 동작을 관찰하고 있습니다.' : '손이 보이도록 펴 바르는 동작을 해 주세요.', hands);
        }
      }
      queue(token);
    } catch {
      release(); blank(); phase = 'error';
      emit('분석을 실행하지 못했습니다. 카메라와 브라우저를 확인한 뒤 분석을 다시 시도해 주세요.');
    }
  }
  async function start() {
    stop(false); const token = generation;
    phase = 'loading'; emit('얼굴·손 인식 모델을 준비하고 있습니다.');
    try {
      const next = await loadModels();
      if (token !== generation) { next.close(); return false; }
      models = next; phase = 'scanning'; emit('얼굴을 정면 안내선에 맞춰 주세요.'); queue(token);
      return true;
    } catch {
      if (token !== generation) return false;
      release(); blank(); phase = 'error'; emit('인식 모델을 불러오지 못했습니다. 분석을 다시 시도해 주세요.');
      return false;
    }
  }
  function confirmScan() {
    if (phase !== 'ready') return false;
    tracker.reset(); phase = 'tracking'; emit('손으로 선크림을 펴 발라 주세요.'); return true;
  }
  function reset() {
    if (models) scanAgain('부위를 다시 확인해 주세요.');
  }
  return { start, stop, confirmScan, reset };
}

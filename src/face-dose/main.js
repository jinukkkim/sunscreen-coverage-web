import { createCameraSession } from '../lib/camera.js';
import { createOperationGuard } from '../lib/operation.js';
import { createVisionSession } from '../lib/vision-session.js';
import { estimateFace } from '../lib/measurement.js';
import { getFingerGuide } from '../lib/dose.js';
import { fingerSVG } from '../lib/ui.js';

const phaseLabels = {
  stopped: '카메라 대기', loading: '인식 준비 중', scanning: '얼굴 스캔 중',
  ready: '자동 시작 준비', recovering: '인식 복구 대기', tracking: '제품을 바르세요',
  completed: '도포 완료', error: '분석 재시도 필요',
};

export function mountFaceDose(root, { onAnalysisChange }) {
  const events = new AbortController();
  const $ = id => root.querySelector(`[id="${id}"]`);
  const video = $('video');
  const operations = createOperationGuard();
  const camera = createCameraSession({ getUserMedia: c => navigator.mediaDevices.getUserMedia(c), video });
  let result = null, cameraState = 'idle', vision = null, doseAttempted = false;
  let analysis = { phase: 'stopped', geometry: null, regions: [], detectedCount: 0, progress: 0 };

  function text(id, value) { const node = $(id); if (node.textContent !== value) node.textContent = value; }
  function show(id, value = true) { $(id).hidden = !value; }
  function status(value) { text('capture-status', value); }
  function clearResult() {
    result = null;
    text('live-dose-value', '얼굴 확인 후 안내'); text('live-finger-value', '정면 얼굴을 맞춰 주세요.');
    show('results', false); show('result-content', false); show('reset', false); setStep(1);
  }
  function setStep(step) {
    for (let i = 1; i <= 3; i++) {
      const node = $(`step-${i}`); node.classList.toggle('current', i === step); node.classList.toggle('complete', i < step);
      if (i === step) node.setAttribute('aria-current', 'step'); else node.removeAttribute('aria-current');
    }
  }
  function controls() {
    show('start-camera', cameraState === 'idle');
    show('analyze-camera', cameraState === 'active' && ['ready', 'tracking'].includes(analysis.phase));
    show('motion-reset', cameraState === 'active' && !!analysis.sessionId && !['error', 'completed'].includes(analysis.phase));
    show('motion-retry', cameraState === 'active' && analysis.phase === 'error');
    show('motion-new', cameraState === 'active' && analysis.phase === 'completed');
    show('cancel-camera', cameraState === 'loading');
    show('stop-camera', cameraState === 'active');
    text('stage-resolution', cameraState === 'loading' ? '카메라 연결 중' : phaseLabels[analysis.phase] || '카메라 대기');
  }
  function stopCamera() { vision?.stop(); camera.stop(); cameraState = 'idle'; show('video', false); controls(); }
  function error(message) { text('capture-error', message); show('capture-error'); status('입력을 확인한 뒤 다시 시도해 주세요.'); controls(); }
  function dismissError() { show('capture-error', false); }
  function reset() {
    operations.cancel(); stopCamera(); clearResult(); dismissError(); doseAttempted = false;
    show('stage-empty'); status('정면 얼굴을 2초간 유지하면 도포 동작 관찰을 자동 시작합니다.');
  }
  async function startCamera() {
    vision?.stop(false); doseAttempted = false;
    operations.cancel(); const token = operations.begin(); clearResult(); dismissError();
    if (!navigator.mediaDevices?.getUserMedia) { error('카메라를 사용할 수 없어요. HTTPS 또는 localhost로 접속해 주세요.'); return; }
    cameraState = 'loading'; status('카메라 권한을 확인하고 있어요.'); controls();
    try {
      const started = await camera.start();
      if (!started || !operations.isCurrent(token)) return;
      cameraState = 'active'; show('stage-empty', false); show('video'); startObservation();
    } catch (cause) {
      if (!operations.isCurrent(token)) return;
      stopCamera(); show('stage-empty');
      error(cause.name === 'NotAllowedError' ? '카메라 권한이 허용되지 않았어요. 브라우저 설정을 확인해 주세요.' : '카메라에 연결하지 못했어요. 다른 앱의 카메라 사용 여부를 확인해 주세요.');
    }
  }
  function measureLive() {
    doseAttempted = true;
    if (!analysis.geometry?.landmarks) return;
    dismissError();
    try { result = estimateFace(analysis.geometry.landmarks, video.videoWidth, video.videoHeight); renderResult(); }
    catch (cause) {
      clearResult(); setStep(2);
      error(`${cause.message} 사용량 추정과 별개로 도포 동작은 자동으로 관찰합니다.`);
    }
  }
  function startObservation() {
    void video.play().catch(() => error('영상 재생을 확인한 뒤 카메라를 다시 켜 주세요.'));
    vision ??= createVisionSession({ video, onUpdate(update) {
      analysis = update;
      if (update.phase === 'ready' && !doseAttempted) measureLive();
      if (update.phase === 'completed') video.pause();
      if (['ready', 'tracking', 'completed'].includes(update.phase)) setStep(update.phase === 'ready' ? 2 : update.phase === 'tracking' ? 3 : 4);
      if (update.phase !== 'stopped') status(update.reason);
      onAnalysisChange(update); controls();
    } });
    void vision.start();
  }
  function renderFinger() {
    if (!result) return;
    const guide = getFingerGuide(result.doseGrams, Number($('joint-length').value));
    text('live-dose-value', `${result.doseGrams.toFixed(2)} g`);
    text('live-finger-value', `표준 조건 약 ${guide.joints.toFixed(1)}마디`);
    text('joint-mm', `${guide.jointMm}mm`); text('joint-value', guide.joints.toFixed(1)); text('length-value', guide.stripMm.toFixed(0));
    $('finger-graphic').innerHTML = fingerSVG(guide);
    $('finger-graphic').setAttribute('aria-label', `표준 조건 참고: 약 ${guide.joints.toFixed(1)}마디, ${guide.stripMm.toFixed(0)}mm. 제품별 토출량 미검증.`);
  }
  function renderResult() {
    text('area-value', result.areaCm2.toFixed(0)); text('width-value', result.widthCm.toFixed(1)); text('height-value', result.heightCm.toFixed(1));
    text('dose-value', result.doseGrams.toFixed(2)); text('formula-area', result.areaCm2.toFixed(0));
    text('sensitivity', `홍채 지름 가정을 11.2~12.2mm로 바꾸면 면적 계산은 ${result.areaSensitivity.map(n => n.toFixed(0)).join('~')}cm²로 달라져요.`);
    renderFinger(); show('results'); show('result-content'); show('reset'); setStep(analysis.phase === 'tracking' ? 3 : 2);
  }
  function listen(target, type, handler) { target.addEventListener(type, handler, { signal: events.signal }); }
  listen($('start-camera'), 'click', startCamera);
  listen($('stop-camera'), 'click', () => { operations.cancel(); stopCamera(); show('stage-empty'); status('카메라를 껐어요.'); });
  listen($('cancel-camera'), 'click', () => { operations.cancel(); stopCamera(); show('stage-empty'); status('카메라 연결을 취소했어요.'); });
  listen($('analyze-camera'), 'click', measureLive);
  listen($('motion-reset'), 'click', () => { clearResult(); doseAttempted = false; dismissError(); vision?.reset(); });
  listen($('motion-retry'), 'click', () => { dismissError(); startObservation(); });
  listen($('motion-new'), 'click', () => { clearResult(); doseAttempted = false; dismissError(); startObservation(); });
  listen($('joint-length'), 'input', renderFinger);
  listen($('reset'), 'click', reset);
  listen(document, 'visibilitychange', () => {
    if (!document.hidden) return;
    operations.cancel();
    if (cameraState === 'loading') { stopCamera(); status('카메라 연결을 취소했어요. 다시 켜서 시작해 주세요.'); }
    controls();
  });
  listen(window, 'pagehide', () => { operations.cancel(); vision?.stop(false); camera.stop(); });
  controls();
  return { dispose() { events.abort(); operations.cancel(); vision?.stop(false); camera.stop(); } };
}

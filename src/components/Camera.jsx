import React, { useEffect, useRef, useState } from 'react';
import { createCameraSession } from '../lib/camera.js';
import { createVisionSession } from '../lib/vision-session.js';
import { getDisplayPoint, getMeshSegments } from '../lib/face-regions.js';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Section } from '@astryxdesign/core/Section';

const emptyAnalysis = { phase: 'stopped', reason: '', geometry: null, hands: [], regions: [], detectedCount: 0, progress: 0, sessionId: null, completedAt: null };
// Same lazy chunk vision-session already loads; only the connection constants are read here.
let meshConnections = null;
const loadMeshConnections = () => meshConnections ??= import('@mediapipe/tasks-vision')
  .then(({ FaceLandmarker }) => FaceLandmarker.FACE_LANDMARKS_TESSELATION);

function FaceOverlay({ analysis, video }) {
  const canvas = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [connections, setConnections] = useState(null);
  useEffect(() => {
    let alive = true;
    if (analysis.geometry && !connections) loadMeshConnections().then(next => alive && setConnections(next), () => {});
    return () => { alive = false; };
  }, [analysis.geometry, connections]);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(canvas.current.parentElement);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const element = canvas.current, source = video.current;
    const ratio = window.devicePixelRatio || 1;
    element.width = size.width * ratio; element.height = size.height * ratio;
    const context = element.getContext('2d');
    context.scale(ratio, ratio);
    if (analysis.phase === 'completed' || !analysis.geometry || !source?.videoWidth || !size.width) return;
    const display = point => getDisplayPoint(point, {
      videoWidth: source.videoWidth, videoHeight: source.videoHeight,
      stageWidth: size.width, stageHeight: size.height, mirrored: true,
    });
    // Region status stays as a borderless tint only while a region is observed or detected.
    for (const region of analysis.geometry.regions) {
      const status = analysis.regions.find(item => item.id === region.id)?.status;
      if (status !== 'detected' && status !== 'observing') continue;
      context.beginPath();
      region.polygon.map(display).forEach((p, i) => i ? context.lineTo(p.x, p.y) : context.moveTo(p.x, p.y));
      context.closePath();
      context.fillStyle = status === 'detected' ? '#70d39b66' : '#ffca5c66'; context.fill();
    }
    if (connections) {
      context.save();
      context.beginPath();
      for (const [a, b] of getMeshSegments(analysis.geometry.landmarks, connections)) {
        const p = display(a), q = display(b); context.moveTo(p.x, p.y); context.lineTo(q.x, q.y);
      }
      context.globalAlpha = .55; context.lineWidth = .7; context.lineCap = 'round';
      context.strokeStyle = '#eef8f2'; context.shadowColor = '#eef8f2'; context.shadowBlur = 4;
      context.stroke();
      context.restore();
    }
    const outline = analysis.geometry.outline.map(display);
    const xs = outline.map(p => p.x), ys = outline.map(p => p.y);
    const x0 = Math.min(...xs) - 12, x1 = Math.max(...xs) + 12, y0 = Math.min(...ys) - 12, y1 = Math.max(...ys) + 12;
    const arm = Math.min(x1 - x0, y1 - y0) * .18;
    context.beginPath();
    for (const [x, y, dx, dy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
      context.moveTo(x, y + dy * arm); context.lineTo(x, y); context.lineTo(x + dx * arm, y);
    }
    context.strokeStyle = '#7cf2a2'; context.lineWidth = 2.5; context.stroke();
    for (const hand of analysis.hands) for (const index of [8, 12, 16]) {
      const point = hand[index];
      if (!point || !Number.isFinite(point.x + point.y)) continue;
      const p = display(point); context.beginPath(); context.arc(p.x, p.y, 4, 0, 2 * Math.PI);
      context.fillStyle = '#ffca5c'; context.fill();
    }
  }, [analysis, size, video, connections]);
  return <canvas ref={canvas} aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />;
}

export default function Camera({ onAnalysisChange, video, mode = 'motion', onActiveChange, photoFrozen = false }) {
  const session = useRef(null), vision = useRef(null);
  const request = useRef(0), alive = useRef(true), onChange = useRef(onAnalysisChange);
  onChange.current = onAnalysisChange;
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState(emptyAnalysis);

  useEffect(() => { onActiveChange?.(status === 'active'); }, [status, onActiveChange]);
  useEffect(() => {
    if (status !== 'active') return;
    if (photoFrozen) { video.current.pause(); return; }
    if (!video.current.paused) return;
    const token = request.current;
    void video.current.play().catch(cause => {
      if (!alive.current || token !== request.current || cause.name === 'AbortError') return;
      stop(); setError('실시간 미리보기를 다시 시작하지 못했습니다. 카메라를 다시 켜 주세요.');
    });
  }, [photoFrozen, status, video]);
  useEffect(() => {
    if (mode === 'completed') { stop(); return; }
    if (mode === 'motion' && status === 'active') analyze();
    else { vision.current?.stop(); setAnalysis(emptyAnalysis); onChange.current?.(emptyAnalysis); }
  }, [mode, status]);

  useEffect(() => {
    alive.current = true;
    const hide = () => { if (document.hidden) stop(); };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', stop);
    return () => {
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', stop);
      alive.current = false; request.current++;
      vision.current?.stop(); session.current?.stop();
    };
  }, []);

  function stop() {
    request.current++;
    vision.current?.stop(); session.current?.stop();
    setStatus('idle'); setError(''); setAnalysis(emptyAnalysis);
  }
  function analyze() {
    vision.current ??= createVisionSession({
      video: video.current, onUpdate: update => {
        if (!alive.current) return;
        setAnalysis(update);
        onChange.current?.({ phase: update.phase, regions: update.regions, detectedCount: update.detectedCount, progress: update.progress, sessionId: update.sessionId, completedAt: update.completedAt });
      },
    });
    void vision.current.start();
  }
  async function start() {
    const token = ++request.current;
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('카메라를 사용할 수 없습니다. HTTPS 또는 localhost에서 접속해 주세요.');
      return;
    }
    session.current ??= createCameraSession({
      getUserMedia: constraints => navigator.mediaDevices.getUserMedia(constraints),
      video: video.current,
    });
    setStatus('loading');
    try {
      if (await session.current.start() && token === request.current) {
        setStatus('active');
      }
    } catch (cause) {
      if (token !== request.current) return;
      setStatus('idle');
      setError(cause.name === 'NotAllowedError'
        ? '카메라 권한을 허용한 후 다시 시도해 주세요.'
        : '카메라를 열지 못했습니다. 장치와 연결 상태를 확인해 주세요.');
    }
  }

  return (
    <Section padding={4}>
      <VStack gap={3}>
        <Heading level={2}>선케어 카메라</Heading>
        <VStack style={{ position: 'relative', aspectRatio: '4 / 3', overflow: 'hidden', borderRadius: 'var(--radius-container)', backgroundColor: 'var(--color-background-body)' }}>
          <video ref={video} autoPlay muted playsInline aria-label="카메라 미리보기" style={{ width: '100%', height: '100%', objectFit: 'cover', transform: mode === 'product' ? 'none' : 'scaleX(-1)' }} />
          <FaceOverlay analysis={analysis} video={video} />
          {mode === 'product' && <VStack aria-hidden="true" style={{ position: 'absolute', left: '25%', top: '10%', width: '50%', height: '80%', border: 'medium dashed var(--color-text-primary)', borderRadius: 'var(--radius-container)', pointerEvents: 'none' }} />}
          {mode === 'motion' && status === 'active' && analysis.phase !== 'completed' && !analysis.geometry && <VStack aria-hidden="true" style={{ position: 'absolute', left: '28%', top: '12%', width: '44%', height: '76%', border: 'medium dashed var(--color-text-secondary)', borderRadius: '48%', pointerEvents: 'none' }} />}
          {status !== 'active' && <VStack padding={4} vAlign="center" style={{ position: 'absolute', inset: 0 }}><Text justify="center">{status === 'loading' ? '카메라 권한을 확인하고 있습니다.' : '카메라를 켜면 내 모습이 표시됩니다.'}</Text></VStack>}
        </VStack>
        <Text>{mode === 'product' ? '선크림 라벨이 중앙 가이드 안에 들어오도록 들고 촬영해 주세요.' : mode === 'measurement' ? '선크림을 내려놓고 얼굴과 양쪽 눈을 정면에 맞춰 주세요.' : mode === 'guide' ? '안내량을 확인하고 준비되면 같은 화면에서 도포 스캔을 시작하세요.' : mode === 'completed' ? '촬영을 마쳤습니다. 카메라는 꺼졌고 기록과 알림을 확인할 수 있습니다.' : '얼굴 부위를 확인한 뒤 손으로 펴 바르는 동작을 관찰합니다.'}</Text>
        {mode === 'motion' && <HStack as="ol" wrap="wrap" gap={4} aria-label="사용 순서" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          <VStack as="li"><Text type="supporting">1. 얼굴 맞추기</Text></VStack>
          <VStack as="li"><Text type="supporting">2. 부위 확인</Text></VStack>
          <VStack as="li"><Text type="supporting">3. 펴 바르기</Text></VStack>
        </HStack>}
        <Text role="status">{status === 'active' ? photoFrozen ? '촬영한 선크림 사진을 확인하고 있습니다.' : (mode === 'motion' && analysis.reason) || '카메라 사용 중' : status === 'loading' ? '카메라 연결 중' : '카메라 꺼짐'}</Text>
        {error && <Text role="alert">{error}</Text>}
        {mode === 'motion' && analysis.phase === 'error' && <Text role="alert">인식 기능을 다시 준비해 주세요. 영상 미리보기는 계속 사용할 수 있습니다.</Text>}
        <HStack wrap="wrap" gap={2}>
          <Button label="카메라 켜기" onClick={start} isDisabled={status !== 'idle' || mode === 'completed'} />
          <Button label={status === 'loading' ? '연결 취소' : '카메라 끄기'} onClick={stop} isDisabled={status === 'idle'} />
          {mode === 'motion' && status === 'active' && !['error', 'completed'].includes(analysis.phase) && <Button label="부위 확인 후 시작" onClick={() => vision.current?.confirmScan()} isDisabled={analysis.phase !== 'ready'} />}
          {mode === 'motion' && status === 'active' && analysis.sessionId && !['error', 'completed'].includes(analysis.phase) && <Button label="다시 시작" onClick={() => vision.current?.reset()} />}
          {mode === 'motion' && status === 'active' && analysis.phase === 'error' && <Button label="분석 다시 시도" onClick={analyze} />}
          {mode === 'motion' && status === 'active' && analysis.phase === 'completed' && <Button label="새 도포 시작" onClick={analyze} />}
        </HStack>
        {mode === 'motion' && <Text type="supporting">머리카락과 손으로 얼굴이 가려지지 않게 부위를 먼저 확인해 주세요. 좌우는 내 얼굴 기준입니다.</Text>}
        {mode === 'motion' && <Text type="supporting">잠깐 인식이 끊겨도 진행률은 유지됩니다. 다른 사람이 사용할 때는 다시 시작해 주세요.</Text>}
        <Text type="supporting">제품 단계에서 동의 후 촬영한 가이드 영역만 분석 서버로 보냅니다. 얼굴 측정·스캔 영상과 특징점은 기기 안에서만 처리합니다.</Text>
      </VStack>
    </Section>
  );
}

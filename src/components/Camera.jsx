import React, { useEffect, useRef, useState } from 'react';
import { createCameraSession } from '../lib/camera.js';
import { createVisionSession } from '../lib/vision-session.js';
import { getDisplayPoint, getMeshSegments } from '../lib/face-regions.js';
import { getCoverageVisual } from '../lib/coverage-visual.js';
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

function tracePolygon(context, points) {
  context.beginPath();
  points.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
  context.closePath();
}

function polygonBounds(points) {
  const xs = points.map(point => point.x), ys = points.map(point => point.y);
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
}

function drawRegionFill(context, points, progress) {
  const visual = getCoverageVisual(progress);
  const bounds = polygonBounds(points), height = bounds.bottom - bounds.top;
  tracePolygon(context, points);
  context.save();
  context.clip();
  context.fillStyle = 'rgba(34, 47, 40, 0.26)';
  context.fillRect(bounds.left, bounds.top, bounds.right - bounds.left, height);
  if (visual.fillFraction > 0) {
    context.fillStyle = `rgba(${visual.color.join(', ')}, ${visual.opacity})`;
    const fillHeight = height * visual.fillFraction;
    context.fillRect(bounds.left, bounds.bottom - fillHeight, bounds.right - bounds.left, fillHeight);
  }
  context.restore();
}

function drawRegionMarker(context, points, index, progress, size) {
  const visual = getCoverageVisual(progress);
  tracePolygon(context, points);
  context.lineWidth = Math.max(3, size.width / 150);
  context.strokeStyle = 'rgba(18, 29, 24, 0.9)';
  context.stroke();
  tracePolygon(context, points);
  context.lineWidth = Math.max(1.4, size.width / 330);
  context.strokeStyle = 'rgba(255, 250, 240, 0.95)';
  context.stroke();

  const center = points.reduce((sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }), { x: 0, y: 0 });
  const radius = Math.max(9, Math.min(13, size.width / 32));
  context.beginPath();
  context.arc(center.x, center.y, radius, 0, Math.PI * 2);
  context.fillStyle = `rgba(${visual.color.join(', ')}, 0.96)`;
  context.fill();
  context.lineWidth = 2;
  context.strokeStyle = 'rgba(18, 29, 24, 0.92)';
  context.stroke();
  context.font = `700 ${Math.max(10, Math.min(13, radius))}px system-ui`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = progress >= 45 ? 'rgba(34, 47, 40, 0.98)' : 'rgba(255, 250, 240, 0.98)';
  context.fillText(String(index + 1), center.x, center.y + .5);
}

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
    context.clearRect(0, 0, size.width, size.height);
    if (!analysis.geometry || !source?.videoWidth || !size.width) return;
    const display = point => getDisplayPoint(point, {
      videoWidth: source.videoWidth, videoHeight: source.videoHeight,
      stageWidth: size.width, stageHeight: size.height, mirrored: true,
    });
    const progressById = new Map(analysis.regions.map(region => [region.id, region.progress]));
    const displayRegions = analysis.geometry.regions.map((region, index) => ({
      region, index, points: region.polygon.map(display), progress: progressById.get(region.id) ?? 0,
    }));
    displayRegions.forEach(({ points, progress }) => drawRegionFill(context, points, progress));
    if (connections) {
      context.save();
      context.beginPath();
      for (const [a, b] of getMeshSegments(analysis.geometry.landmarks, connections)) {
        const p = display(a), q = display(b); context.moveTo(p.x, p.y); context.lineTo(q.x, q.y);
      }
      context.globalAlpha = .38; context.lineWidth = .7; context.lineCap = 'round';
      context.strokeStyle = '#eef8f2'; context.shadowColor = '#eef8f2'; context.shadowBlur = 4;
      context.stroke();
      context.restore();
    }
    displayRegions.forEach(({ points, index, progress }) => drawRegionMarker(context, points, index, progress, size));
    const outline = analysis.geometry.outline.map(display);
    const xs = outline.map(p => p.x), ys = outline.map(p => p.y);
    const x0 = Math.min(...xs) - 12, x1 = Math.max(...xs) + 12, y0 = Math.min(...ys) - 12, y1 = Math.max(...ys) + 12;
    const arm = Math.min(x1 - x0, y1 - y0) * .18;
    context.beginPath();
    for (const [x, y, dx, dy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
      context.moveTo(x, y + dy * arm); context.lineTo(x, y); context.lineTo(x + dx * arm, y);
    }
    context.strokeStyle = '#fffaf0'; context.lineWidth = 2.5; context.stroke();
    for (const hand of analysis.hands) for (const index of [8, 12, 16]) {
      const point = hand[index];
      if (!point || !Number.isFinite(point.x + point.y)) continue;
      const p = display(point); context.beginPath(); context.arc(p.x, p.y, 4, 0, 2 * Math.PI);
      context.fillStyle = '#ffca5c'; context.fill();
    }
  }, [analysis, size, video, connections]);
  return <canvas ref={canvas} aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />;
}

export default function Camera({ onAnalysisChange }) {
  const video = useRef(null), session = useRef(null), vision = useRef(null);
  const request = useRef(0), alive = useRef(true), onChange = useRef(onAnalysisChange);
  onChange.current = onAnalysisChange;
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState(emptyAnalysis);

  useEffect(() => {
    alive.current = true;
    return () => {
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
        setStatus('active'); analyze();
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
        <Heading level={2}>얼굴 스캔과 동작 관찰</Heading>
        <HStack as="ol" wrap="wrap" gap={4} aria-label="사용 순서" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          <VStack as="li"><Text type="supporting">1. 얼굴 맞추기</Text></VStack>
          <VStack as="li"><Text type="supporting">2. 부위 확인</Text></VStack>
          <VStack as="li"><Text type="supporting">3. 펴 바르기</Text></VStack>
        </HStack>
        <VStack style={{ position: 'relative', aspectRatio: '4 / 3', overflow: 'hidden', borderRadius: 'var(--radius-container)', backgroundColor: 'var(--color-background-body)' }}>
          <video ref={video} autoPlay muted playsInline aria-label="카메라 미리보기" style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
          <FaceOverlay analysis={analysis} video={video} />
          {status === 'active' && analysis.phase !== 'completed' && !analysis.geometry && <VStack aria-hidden="true" style={{ position: 'absolute', left: '28%', top: '12%', width: '44%', height: '76%', border: 'medium dashed var(--color-text-secondary)', borderRadius: '48%', pointerEvents: 'none' }} />}
          {status !== 'active' && <VStack padding={4} vAlign="center" style={{ position: 'absolute', inset: 0 }}><Text justify="center">{status === 'loading' ? '카메라 권한을 확인하고 있습니다.' : '카메라를 켜면 내 모습이 표시됩니다.'}</Text></VStack>}
        </VStack>
        <Text role="status">{status === 'active' ? analysis.reason || '카메라 사용 중' : status === 'loading' ? '카메라 연결 중' : '카메라 꺼짐'}</Text>
        {error && <Text role="alert">{error}</Text>}
        {analysis.phase === 'error' && <Text role="alert">인식 기능을 다시 준비해 주세요. 영상 미리보기는 계속 사용할 수 있습니다.</Text>}
        <HStack wrap="wrap" gap={2}>
          <Button label="카메라 켜기" onClick={start} isDisabled={status !== 'idle'} />
          <Button label={status === 'loading' ? '연결 취소' : '카메라 끄기'} onClick={stop} isDisabled={status === 'idle'} />
          {status === 'active' && !['error', 'completed'].includes(analysis.phase) && <Button label="부위 확인 후 시작" onClick={() => vision.current?.confirmScan()} isDisabled={analysis.phase !== 'ready'} />}
          {status === 'active' && analysis.phase === 'tracking' && <Button label="다시 시작" onClick={() => vision.current?.reset()} />}
          {status === 'active' && analysis.phase === 'error' && <Button label="분석 다시 시도" onClick={analyze} />}
          {status === 'active' && analysis.phase === 'completed' && <Button label="새 도포 시작" onClick={analyze} />}
        </HStack>
        <Text type="supporting">머리카락과 손으로 얼굴이 가려지지 않게 부위를 먼저 확인해 주세요. 좌우는 내 얼굴 기준입니다.</Text>
        <Text type="supporting">어두운 영역에서 크림색으로 차오르는 정도는 동작 진행률입니다. 얼굴 위 숫자 1–5는 아래 부위 목록과 연결되며, 실제 피부에 남은 선크림 양을 측정하지 않습니다.</Text>
        <Text type="supporting">영상과 특징점은 브라우저 안에서만 분석하며 저장하거나 외부 서버로 전송하지 않습니다.</Text>
      </VStack>
    </Section>
  );
}

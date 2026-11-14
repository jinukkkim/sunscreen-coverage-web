import React, { useEffect, useRef, useState } from 'react';
import { createCameraSession } from '../lib/camera.js';
import { createVisionSession } from '../lib/vision-session.js';
import { getDisplayPoint, getMeshSegments, getMeshTriangles } from '../lib/face-regions.js';
import { getTriangleCoverage } from '../lib/coverage-visual.js';
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
    if (connections) {
      for (const tile of getTriangleCoverage(getMeshTriangles(analysis.geometry, connections), analysis.regions)) {
        tracePolygon(context, tile.points.map(display));
        context.fillStyle = `rgba(${tile.visual.color.join(', ')}, ${tile.visual.opacity})`;
        context.fill();
      }
      context.save();
      context.beginPath();
      for (const [a, b] of getMeshSegments(analysis.geometry.landmarks, connections)) {
        const p = display(a), q = display(b); context.moveTo(p.x, p.y); context.lineTo(q.x, q.y);
      }
      // Fine contrast edges keep the tessellation visible on dark and cream tiles.
      context.lineWidth = 1.2; context.lineCap = 'round';
      context.strokeStyle = 'rgba(34, 47, 40, 0.32)';
      context.stroke();
      context.globalAlpha = .5; context.lineWidth = .45;
      context.strokeStyle = '#eef8f2';
      context.stroke();
      context.restore();
    }
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
    // A completed session holds the final frame with its result until restarted.
    void video.current?.play().catch(() => {});
    vision.current ??= createVisionSession({
      video: video.current, onUpdate: update => {
        if (!alive.current) return;
        if (update.phase === 'completed') video.current?.pause();
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
          {status === 'active' && analysis.sessionId && !['error', 'completed'].includes(analysis.phase) && <Button label="다시 시작" onClick={() => vision.current?.reset()} />}
          {status === 'active' && analysis.phase === 'error' && <Button label="분석 다시 시도" onClick={analyze} />}
          {status === 'active' && analysis.phase === 'completed' && <Button label="새 도포 시작" onClick={analyze} />}
        </HStack>
        <Text type="supporting">머리카락과 손으로 얼굴이 가려지지 않게 부위를 먼저 확인해 주세요. 좌우는 내 얼굴 기준입니다.</Text>
        <Text type="supporting">각 부위의 동작 진행률에 따라 삼각형이 어두운 색에서 크림색으로 채워집니다. 실제 도포량을 측정하는 값은 아닙니다. 완료 화면은 고정되고 새 도포 시작을 누르면 다시 관찰합니다.</Text>
        <Text type="supporting">잠깐 인식이 끊겨도 진행률은 유지됩니다. 다른 사람이 사용할 때는 다시 시작해 주세요.</Text>
        <Text type="supporting">영상과 특징점은 브라우저 안에서만 분석하며 저장하거나 외부 서버로 전송하지 않습니다.</Text>
      </VStack>
    </Section>
  );
}

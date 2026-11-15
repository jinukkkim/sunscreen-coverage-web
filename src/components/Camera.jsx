import React, { useEffect, useRef, useState } from 'react';
import { createCameraSession } from '../lib/camera.js';
import { createVisionSession } from '../lib/vision-session.js';
import FaceOverlay from './FaceOverlay.jsx';
import { captureVideoFrame } from '../lib/capture.js';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Section } from '@astryxdesign/core/Section';

const emptyAnalysis = { phase: 'stopped', reason: '', geometry: null, hands: [], regions: [], detectedCount: 0, progress: 0, sessionId: null, completedAt: null };
export default function Camera({ onAnalysisChange, video, mode = 'motion', onActiveChange, photoFrozen = false }) {
  const session = useRef(null), vision = useRef(null), completionCanvas = useRef(null);
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
    if (mode === 'completed') {
      if (status !== 'active') return;
      if (video.current.videoWidth) {
        const frame = captureVideoFrame(video.current);
        const canvas = completionCanvas.current;
        canvas.width = frame.width; canvas.height = frame.height;
        const context = canvas.getContext('2d');
        context.translate(canvas.width, 0); context.scale(-1, 1);
        context.drawImage(frame, 0, 0);
        context.setTransform(1, 0, 0, 1, 0, 0);
        const overlay = canvas.parentElement.querySelector('canvas[aria-hidden="true"]');
        if (overlay) context.drawImage(overlay, 0, 0, canvas.width, canvas.height);
        frame.width = 1; frame.height = 1;
      }
      request.current++; vision.current?.stop(false); session.current?.stop(); setAnalysis(emptyAnalysis); setStatus('idle');
      return;
    }
    completionCanvas.current.width = 1; completionCanvas.current.height = 1;
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
    <Section padding={4} className="capture-panel">
      <VStack gap={3}>
        <Heading level={2}>선케어 카메라</Heading>
        <VStack id="camera-stage" style={{ position: 'relative', aspectRatio: '4 / 3', overflow: 'hidden', borderRadius: 'var(--radius-container)', backgroundColor: 'var(--color-background-body)' }}>
          <video ref={video} autoPlay muted playsInline aria-label="카메라 미리보기" style={{ width: '100%', height: '100%', objectFit: 'cover', transform: mode === 'product' ? 'none' : 'scaleX(-1)' }} />
          <FaceOverlay analysis={analysis} video={video} />
          <canvas ref={completionCanvas} aria-label="완료한 도포 동작 화면" hidden={mode !== 'completed'} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
          {mode === 'product' && <VStack aria-hidden="true" style={{ position: 'absolute', left: '25%', top: '10%', width: '50%', height: '80%', border: 'medium dashed var(--color-text-primary)', borderRadius: 'var(--radius-container)', pointerEvents: 'none' }} />}
          {mode === 'motion' && status === 'active' && analysis.phase !== 'completed' && !analysis.geometry && <VStack aria-hidden="true" style={{ position: 'absolute', left: '28%', top: '12%', width: '44%', height: '76%', border: 'medium dashed var(--color-text-secondary)', borderRadius: '48%', pointerEvents: 'none' }} />}
          {status !== 'active' && mode !== 'completed' && <VStack padding={4} vAlign="center" style={{ position: 'absolute', inset: 0 }}><Text justify="center">{status === 'loading' ? '카메라 권한을 확인하고 있습니다.' : '카메라를 켜면 내 모습이 표시됩니다.'}</Text></VStack>}
          <HStack className="stage-meta" hAlign="between">
            <Text type="supporting">{mode === 'product' ? '제품 촬영' : '얼굴·동작 분석'}</Text>
            <Text id="stage-resolution" role="status" aria-label="인식 상태" aria-live="polite">{mode === 'completed' ? '동작 관찰 완료' : photoFrozen ? '촬영 사진 확인 중' : status === 'loading' ? '카메라 연결 중' : status !== 'active' ? '카메라 꺼짐' : mode !== 'motion' ? '카메라 사용 중' : ({ loading: '인식 준비 중', scanning: '얼굴 스캔 중', ready: '자동 시작 준비 중', recovering: '인식 복구 대기', tracking: '제품을 바르세요', error: '분석 재시도 필요' }[analysis.phase] || '카메라 사용 중')}</Text>
          </HStack>
        </VStack>
        <Text>{mode === 'product' ? '선크림 라벨이 중앙 가이드 안에 들어오도록 들고 촬영해 주세요.' : mode === 'measurement' ? '선크림을 내려놓고 얼굴과 양쪽 눈을 정면에 맞춰 주세요.' : mode === 'guide' ? '안내량을 확인하고 준비되면 같은 화면에서 도포 스캔을 시작하세요.' : mode === 'completed' ? '촬영을 마쳤습니다. 카메라는 꺼졌고 기록과 알림을 확인할 수 있습니다.' : '정면 얼굴을 2초간 유지하면 손으로 펴 바르는 동작 관찰을 자동 시작합니다.'}</Text>
        {mode === 'motion' && <HStack as="ol" wrap="wrap" gap={4} aria-label="사용 순서" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          <VStack as="li"><Text type="supporting">1. 얼굴 맞추기</Text></VStack>
          <VStack as="li"><Text type="supporting">2. 부위 확인</Text></VStack>
          <VStack as="li"><Text type="supporting">3. 펴 바르기</Text></VStack>
        </HStack>}
        {error && <Text role="alert">{error}</Text>}
        {mode === 'motion' && analysis.phase === 'error' && <Text role="alert">인식 기능을 다시 준비해 주세요. 영상 미리보기는 계속 사용할 수 있습니다.</Text>}
        <HStack wrap="wrap" gap={2}>
          <Button label="카메라 켜기" onClick={start} isDisabled={status !== 'idle' || mode === 'completed'} />
          <Button label={status === 'loading' ? '연결 취소' : '카메라 끄기'} onClick={stop} isDisabled={status === 'idle'} />
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

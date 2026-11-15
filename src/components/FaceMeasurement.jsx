import React, { useEffect, useRef, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Section } from '@astryxdesign/core/Section';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { getFaceModel } from '../lib/vision.js';
import { estimateFace, getLiveFaceMeasurement } from '../lib/measurement.js';
import { captureVideoFrame } from '../lib/capture.js';

const waitingMeasurement = reason => ({ irisPx: null, irisDiametersPx: [], areaCm2: null, reason });

export default function FaceMeasurement({ video, cameraActive, onMeasured }) {
  const generation = useRef(0);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [live, setLive] = useState(() => waitingMeasurement('카메라를 켜면 실시간으로 표시합니다.'));
  useEffect(() => {
    if (!cameraActive) { setLive(waitingMeasurement('카메라를 켜면 실시간으로 표시합니다.')); return; }
    let stopped = false, timer, lastVideoTime = -1, lastFrameAt = performance.now();
    const schedule = () => { if (!stopped) timer = setTimeout(tick, 250); };
    const hide = () => { if (document.hidden) setLive(waitingMeasurement('영상을 확인할 수 없어 측정을 기다립니다.')); };
    async function tick() {
      const source = video.current;
      if (stopped) return;
      if (document.hidden || !source || source.readyState < 2 || source.paused) {
        setLive(waitingMeasurement('영상을 확인할 수 없어 측정을 기다립니다.')); schedule(); return;
      }
      if (source.currentTime === lastVideoTime) {
        if (performance.now() - lastFrameAt > 500) setLive(waitingMeasurement('영상이 멈춰 측정을 기다립니다.'));
        schedule(); return;
      }
      try {
        // Reuse the measurement step's cached model; never open a second camera.
        const model = await getFaceModel();
        if (stopped) return;
        if (document.hidden || source.paused || source.readyState < 2) { schedule(); return; }
        lastVideoTime = source.currentTime; lastFrameAt = performance.now();
        const { videoWidth: width, videoHeight: height } = source;
        setLive({ ...getLiveFaceMeasurement(model.detect(source).faceLandmarks, width, height), width, height });
      } catch {
        if (!stopped) setLive(waitingMeasurement('실시간 측정을 준비하지 못했습니다. 카메라를 다시 켜 주세요.'));
      }
      schedule();
    }
    setLive(waitingMeasurement('홍채와 얼굴 측정을 준비하고 있습니다.'));
    void tick();
    document.addEventListener('visibilitychange', hide);
    return () => { stopped = true; clearTimeout(timer); document.removeEventListener('visibilitychange', hide); };
  }, [cameraActive, video]);
  function cancel() { generation.current++; setBusy(false); }
  useEffect(() => {
    const hide = () => { if (document.hidden) cancel(); };
    document.addEventListener('visibilitychange', hide);
    return () => { generation.current++; document.removeEventListener('visibilitychange', hide); };
  }, []);
  useEffect(() => { if (!cameraActive) cancel(); }, [cameraActive]);

  async function measure() {
    const token = ++generation.current;
    let frame;
    setError(''); setBusy(true);
    try {
      frame = captureVideoFrame(video.current);
      const model = await getFaceModel();
      if (token !== generation.current) return;
      const detected = model.detect(frame);
      if (detected.faceLandmarks.length !== 1) throw new Error('한 사람의 얼굴과 양쪽 눈이 선명하게 보이도록 다시 촬영해 주세요.');
      const { areaCm2, doseGrams, widthCm, heightCm, areaSensitivity } = estimateFace(detected.faceLandmarks[0], frame.width, frame.height);
      if (token === generation.current) onMeasured({ areaCm2, doseGrams, widthCm, heightCm, areaSensitivity });
    } catch (cause) {
      if (token === generation.current) setError(cause.message || '분석하지 못했습니다. 다시 촬영해 주세요.');
    } finally {
      if (frame) { frame.width = 1; frame.height = 1; }
      if (token === generation.current) setBusy(false);
    }
  }

  return <Section padding={4}><VStack gap={4}>
    <Heading level={2}>얼굴 크기 측정</Heading>
    <Text>위 카메라에서 선크림을 내려놓고 얼굴 전체와 양쪽 눈을 정면에 맞춰 주세요.</Text>
    <VStack gap={2} aria-label="실시간 얼굴 측정">
      <Text type="supporting">거리 비교용 · 현재 프레임의 실험 추정값</Text>
      <HStack gap={6} wrap="wrap">
        <VStack gap={1}>
          <Text type="supporting">홍채 지름 · 두 눈 평균</Text>
          <HStack gap={1}><Text size="3xl" weight="bold" hasTabularNumbers id="live-iris-px">{live.irisPx === null ? '—' : live.irisPx.toFixed(1)}</Text><Text type="supporting">px</Text></HStack>
        </VStack>
        <VStack gap={1}>
          <Text type="supporting">얼굴 모델 영역 면적</Text>
          <HStack gap={1}><Text size="3xl" weight="bold" hasTabularNumbers id="live-face-area">{live.areaCm2 === null ? '—' : live.areaCm2.toFixed(1)}</Text><Text type="supporting">cm²</Text></HStack>
        </VStack>
      </HStack>
      <Text type="supporting" id="live-measure-detail">{live.irisDiametersPx.length ? `두 홍채 ${live.irisDiametersPx.map(n => n.toFixed(1)).join(' / ')} px · 입력 영상 ${live.width} × ${live.height} px` : '영상 원본 해상도의 픽셀 기준이에요.'}</Text>
      <Text type="supporting" id="live-measure-reason" role="status">{live.reason || '실시간 갱신 중 · 거리를 바꾸며 면적 변화를 비교해 보세요.'}</Text>
      <Text type="supporting">홍채 지름 11.7mm 가정 · 이마 위쪽 일부·옆면 전체·귀·목 제외</Text>
    </VStack>
    {busy && <Text role="status">얼굴과 홍채를 분석하고 있습니다. 처음에는 모델 준비에 시간이 걸릴 수 있습니다.</Text>}
    {error && <Text role="alert">{error}</Text>}
    <Button variant="primary" label="촬영하고 측정" onClick={measure} isDisabled={!cameraActive || busy} />
    {busy && <Button label="취소" onClick={cancel} />}
    <Text type="supporting">얼굴 사진·특징점은 브라우저 메모리에서만 처리하며 저장하거나 전송하지 않습니다. 평균 홍채 지름을 이용한 모델 영역 추정입니다.</Text>
  </VStack></Section>;
}

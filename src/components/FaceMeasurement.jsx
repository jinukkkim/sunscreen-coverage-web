import React, { useEffect, useRef, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { Section } from '@astryxdesign/core/Section';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { getFaceModel } from '../lib/vision.js';
import { estimateFace } from '../lib/measurement.js';
import { captureVideoFrame } from '../lib/capture.js';

export default function FaceMeasurement({ video, cameraActive, onMeasured }) {
  const generation = useRef(0);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
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
    {busy && <Text role="status">얼굴과 홍채를 분석하고 있습니다. 처음에는 모델 준비에 시간이 걸릴 수 있습니다.</Text>}
    {error && <Text role="alert">{error}</Text>}
    <Button variant="primary" label="촬영하고 측정" onClick={measure} isDisabled={!cameraActive || busy} />
    {busy && <Button label="취소" onClick={cancel} />}
    <Text type="supporting">얼굴 사진·특징점은 브라우저 메모리에서만 처리하며 저장하거나 전송하지 않습니다. 평균 홍채 지름을 이용한 모델 영역 추정입니다.</Text>
  </VStack></Section>;
}

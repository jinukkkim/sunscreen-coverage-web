import React, { useCallback, useEffect, useRef, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Section } from '@astryxdesign/core/Section';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import ProductSetup from './ProductSetup.jsx';
import FaceMeasurement from './FaceMeasurement.jsx';
import RecognitionPanel from './RecognitionPanel.jsx';
import Camera from './Camera.jsx';
import { REGIONS } from '../lib/face-regions.js';
import { captureVideoFrame } from '../lib/capture.js';
import { loadProfile } from '../lib/productStorage.js';
import { getFingerGuide } from '../lib/dose.js';
import { formatTime, nextDue, policyAt } from '../lib/reapplication.js';

const steps = ['내 선크림 등록', '얼굴 크기 측정', '도포 용량 안내', '도포 스캔', '기록과 알림'];

export default function CareFlow({ model }) {
  const [step, setStep] = useState(0), [profile, setProfile] = useState(() => loadProfile(window.localStorage));
  const [measurement, setMeasurement] = useState(null), [completed, setCompleted] = useState(null);
  const [skippedProduct, setSkippedProduct] = useState(false);
  const [jointMm, setJointMm] = useState(25);
  const video = useRef(null), completedSession = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [productFrozen, setProductFrozen] = useState(false);
  useEffect(() => { if (step !== 0 || !cameraActive) setProductFrozen(false); }, [step, cameraActive]);

  function captureProductPhoto() {
    const frame = captureVideoFrame(video.current, { product: true });
    video.current.pause();
    setProductFrozen(true);
    return frame;
  }
  const [analysis, setAnalysis] = useState({ phase: 'stopped', regions: [], progress: 0, detectedCount: 0 });
  const handleAnalysis = useCallback(update => {
    setAnalysis(update);
    if (update.phase === 'completed' && update.progress === 100 && update.detectedCount === REGIONS.length && update.sessionId && completedSession.current !== update.sessionId) {
      completedSession.current = update.sessionId;
      model.completeMotion(update);
    }
  }, [model.completeMotion]);
  const heading = useRef(null), previousStep = useRef(0);
  useEffect(() => {
    if (!model.completion) {
      setCompleted(null);
      setStep(current => current === 4 ? 0 : current);
      return;
    }
    setCompleted(model.completion); setStep(4);
  }, [model.completion]);
  useEffect(() => {
    if (previousStep.current !== step) heading.current?.focus();
    previousStep.current = step;
  }, [step]);

  function remeasure() { setMeasurement(null); setStep(1); }
  const due = nextDue(model.care, model.now, model.forecast);
  const policy = policyAt(model.forecast, model.now, model.now);
  const selectedProfile = skippedProduct ? null : profile;
  const creamGuide = measurement && ['cream', 'lotion', 'gel'].includes(selectedProfile?.form) ? getFingerGuide(measurement.doseGrams, jointMm) : null;

  return <VStack as="section" id="workspace" gap={4} aria-label="선케어 순서">
    <VStack gap={2}>
      <Heading level={1}>내 선크림부터 오늘의 알림까지</Heading>
      <Text>내 제품을 등록하고, 얼굴 크기에 따른 참고량을 확인한 뒤 펴 바르는 동작을 스캔하세요.</Text>
    </VStack>
    <HStack as="ol" gap={3} wrap="wrap" aria-label="선케어 단계" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {steps.map((label, index) => <VStack as="li" key={label} aria-current={index === step ? 'step' : undefined}>
        <Text weight={index === step ? 'bold' : 'regular'} color={index === step ? 'primary' : 'secondary'}>{index + 1}. {label}{index < step ? index === 0 && skippedProduct ? ' · 건너뜀' : ' · 완료' : ''}</Text>
      </VStack>)}
    </HStack>
    <ProgressBar label="선케어 단계 진행" value={step * 25} isLabelHidden />
    <h2 ref={heading} tabIndex={-1} style={{ font: 'inherit', fontWeight: 'bold', margin: 0 }}>{step + 1} / 5 · {steps[step]}</h2>
    <Grid columns={{ minWidth: 300, max: 2 }} gap={4} align="start">
    <Camera video={video} photoFrozen={step === 0 && productFrozen} mode={['product', 'measurement', 'guide', 'motion', 'completed'][step]} onActiveChange={setCameraActive} onAnalysisChange={handleAnalysis} />
    <VStack gap={4}>
    {step === 0 && <>
      <ProductSetup onProfileChange={setProfile} cameraActive={cameraActive} capturePhoto={captureProductPhoto} photoFrozen={productFrozen} onRetake={() => setProductFrozen(false)} />
      <HStack gap={2} wrap="wrap">
        <Button variant="primary" label="다음 단계로" isDisabled={!profile} onClick={() => { setSkippedProduct(false); setStep(measurement ? 2 : 1); }} />
        <Button variant="ghost" label="건너뛰기" onClick={() => { setSkippedProduct(true); setStep(measurement ? 2 : 1); }} />
      </HStack>
    </>}
    {step === 1 && <>
      <FaceMeasurement video={video} cameraActive={cameraActive} onMeasured={result => { setMeasurement(result); setStep(2); }} />
      <Button label="선크림 등록으로 돌아가기" onClick={() => setStep(0)} />
    </>}
    {step === 2 && measurement && <Section padding={4}><VStack gap={4}>
      <Heading level={2}>도포 용량 안내</Heading>
      <Text type="label">{selectedProfile?.name || '선크림 미등록'}</Text>
      <Text type="label">모델 영역 기준 추정량</Text>
      <Heading level={3} id="live-dose-value" style={{ fontSize: 'var(--font-size-4xl)' }}>{measurement.doseGrams.toFixed(2)}g</Heading>
      <Text>분석 영역 약 {measurement.areaCm2.toFixed(0)}cm² · 너비 {measurement.widthCm.toFixed(1)}cm · 높이 {measurement.heightCm.toFixed(1)}cm</Text>
      <Text>눈·입술을 제외한 모델 영역에 2mg/cm²를 적용한 계산입니다. 얼굴 전체의 권장량이나 실제 바른 양을 측정한 값이 아닙니다.</Text>
      {creamGuide ? <VStack gap={2}>
        <Text type="label">표준 크림 줄 참고: 약 {creamGuide.stripMm.toFixed(0)}mm</Text>
        <Heading level={3} id="live-finger-value" style={{ fontSize: 'var(--font-size-4xl)' }}>{creamGuide.joints.toFixed(1)}마디</Heading>
        <label htmlFor="joint-length"><Text type="label">검지 한 마디 길이 (mm): {jointMm}</Text></label>
        <input id="joint-length" type="range" min={10} max={45} value={jointMm} onChange={event => setJointMm(Number(event.target.value))} />
        <Text type="supporting">5mm 줄, 25mm당 0.5g, 한 마디 {jointMm}mm를 가정한 시연용 환산입니다. 등록 제품의 토출량·밀도는 보정하지 않았습니다.</Text>
      </VStack> : !selectedProfile ? <Text>선크림 등록을 건너뛰어 제품별 안내와 길이 환산은 표시하지 않습니다. 모델 영역의 추정량만 참고하세요.</Text> : <Text>스틱·스프레이 또는 제형 미확인 제품에는 크림 기준 길이 환산을 적용하지 않습니다. 제품 라벨의 사용 방법을 확인해 주세요.</Text>}
      <Text type="supporting">평균 홍채 지름 11.7mm를 가정합니다. 11.2–12.2mm 가정에서는 영역 면적이 {measurement.areaSensitivity.map(value => value.toFixed(0)).join('–')}cm²로 달라집니다. 귀·목 등 모델 밖 영역은 별도로 챙겨 주세요.</Text>
      <HStack gap={2} wrap="wrap">
        <Button variant="primary" label="도포 스캔 시작" onClick={() => setStep(3)} />
        <Button label="얼굴 다시 측정" onClick={remeasure} />
        <Button variant="ghost" label="선크림 변경" onClick={() => setStep(0)} />
      </HStack>
    </VStack></Section>}
    {step === 3 && <>
      <RecognitionPanel analysis={analysis} />
      {model.error && <Text role="alert">{model.error}</Text>}
      <Button label="용량 안내로 돌아가기" onClick={() => setStep(2)} />
    </>}
    {step === 4 && completed && <Section padding={4}><VStack gap={4}>
      <Heading level={2}>오늘의 선케어를 이어가세요</Heading>
      <Text role="status">{formatTime(completed.at)} 도포 동작 완료 시각을 기록했습니다.</Text>
      <Text>{policy.minutes === null ? '현재 UV가 낮아 재도포 알림을 대기합니다.' : due ? `다음 재도포 알림 ${formatTime(due.at)}` : '오늘 알림 종료 시각 안의 예정이 없습니다.'}</Text>
      <Text>아래에서 오늘의 알림 종료 시각, 타임라인과 자외선 예보를 확인하세요.</Text>
      <Text type="supporting">실제 선크림의 존재·도포량·차단력을 확인한 기록은 아닙니다. 기기 알림은 페이지가 보이는 동안 사용합니다.</Text>
      <HStack gap={2} wrap="wrap">
        <Button label={model.deviceEnabled ? '기기 알림 끄기' : '기기 알림 허용하기'} onClick={model.deviceEnabled ? model.disableNotifications : model.enableNotifications} />
        <Button variant="primary" label="다시 바르기" onClick={() => { setCompleted(null); setSkippedProduct(false); setStep(0); }} />
      </HStack>
    </VStack></Section>}
    </VStack>
    </Grid>
  </VStack>;
}

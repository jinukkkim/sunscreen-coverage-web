import React, { useCallback, useEffect, useRef, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import FaceOverlay from './FaceOverlay.jsx';
import RecognitionPanel from './RecognitionPanel.jsx';
import { REGIONS } from '../lib/face-regions.js';
import { mountFaceDose } from '../face-dose/main.js';
export default function FaceDoseGuide({ onComplete }) {
  const root = useRef(null), video = useRef(null), completedSession = useRef(null);
  const [analysis, setAnalysis] = useState({ phase: 'stopped', regions: [], detectedCount: 0, progress: 0 });
  const handleAnalysis = useCallback(update => {
    setAnalysis(update);
    if (update.phase === 'completed' && update.progress === 100 && update.detectedCount === REGIONS.length && update.sessionId && completedSession.current !== update.sessionId) {
      completedSession.current = update.sessionId;
      onComplete(update);
    }
  }, [onComplete]);
  useEffect(() => {
    const controller = mountFaceDose(root.current, { onAnalysisChange: handleAnalysis });
    return () => controller.dispose();
  }, [handleAnalysis]);
  return <VStack ref={root} gap={0} aria-label="얼굴 크기·사용량 가이드">
    <VStack className="guide-layout section-heading">
      <VStack className="guide-layout">
        <Text as="span" type="inherit" className="eyebrow">YOUR SUNCARE ROUTINE</Text>
        <Heading level={1}>사용량 확인과 도포 동작 관찰</Heading>
      </VStack>
      <Text as="p" type="inherit" display="block">한 번 켠 카메라로 사용량을 알아보고,<br />같은 화면에서 고르게 펴 바르는 동작을 확인하세요.</Text>
    </VStack>
    <VStack as="ol" className="guide-layout steps" aria-label="가이드 진행 단계">
      <VStack as="li" className="guide-layout current" id="step-1" aria-current="step">
        <Text as="span" type="inherit">01</Text> 얼굴 맞추기 <Text as="b" type="inherit">카메라로 촬영</Text>
      </VStack>
      <VStack as="li" id="step-2" className="guide-layout">
        <Text as="span" type="inherit">02</Text> 면적·사용량 추정 <Text as="b" type="inherit">선택 영역 기준</Text>
      </VStack>
      <VStack as="li" id="step-3" className="guide-layout">
        <Text as="span" type="inherit">03</Text> 도포 동작 관찰 <Text as="b" type="inherit">5구역 확인</Text>
      </VStack>
    </VStack>
    <VStack id="workspace" className="guide-layout workspace">
      <VStack as="section" id="motion" className="guide-layout capture-panel" aria-labelledby="capture-title">
        <VStack className="guide-layout panel-heading">
          <Heading level={3} id="capture-title">얼굴 스캔과 동작 관찰</Heading>
        </VStack>
        <VStack className="guide-layout camera-stage" id="camera-stage">
          <video ref={video} id="video" autoPlay={true} muted={true} playsInline={true} aria-label="카메라 미리보기" hidden={true}>
          </video>
          <FaceOverlay analysis={analysis} video={video} />
          <VStack className="guide-layout stage-empty" id="stage-empty">
            <Text as="span" type="inherit" className="corner tl">
            </Text>
            <Text as="span" type="inherit" className="corner tr">
            </Text>
            <Text as="span" type="inherit" className="corner bl">
            </Text>
            <Text as="span" type="inherit" className="corner br">
            </Text>
            <svg viewBox="0 0 180 220" fill="none" aria-hidden="true">
              <path d="M90 18c-44 0-61 32-57 81 3 43 23 89 57 101 34-12 54-58 57-101 4-49-13-81-57-81Z" stroke="currentColor" strokeWidth="1.3">
              </path>
              <path d="M90 18v182M35 84h110M38 126h104M51 166h78M35 84l55 42 55-42M38 126l52 40 52-40" stroke="currentColor" strokeOpacity=".4">
              </path>
              <circle cx="35" cy="84" r="3" fill="currentColor">
              </circle>
              <circle cx="90" cy="166" r="3" fill="currentColor">
              </circle>
            </svg>
            <Text as="p" type="inherit" display="block" id="stage-instruction">얼굴 전체가 보이도록<br />정면을 바라봐 주세요.</Text>
            <Text as="span" type="inherit">모자·머리카락으로 이마와 눈을 가리지 마세요</Text>
          </VStack>
          <VStack className="guide-layout stage-meta">
            <Text as="span" type="inherit">
              <Text as="i" type="inherit">
              </Text> ON-DEVICE ANALYSIS</Text>
            <Text as="span" type="inherit" id="stage-resolution" role="status" aria-label="인식 상태" aria-live="polite">카메라 대기</Text>
          </VStack>
        </VStack>
        <Text as="p" type="inherit" display="block" className="capture-status" id="capture-status" role="status" aria-live="polite">카메라를 켜고 정면 얼굴을 2초간 유지하면 도포 동작 관찰을 자동 시작합니다.</Text>
        <Text as="p" type="inherit" display="block" className="error-box" id="capture-error" role="alert" hidden={true}>
        </Text>
        <VStack className="guide-layout capture-actions">
          <Button label="카메라 켜기" className="button orange" id="start-camera">
            <Text as="span" type="inherit" aria-hidden="true">◉</Text> 카메라 켜기</Button>
          <Button label="사용량 다시 확인" className="button outline" id="analyze-camera" hidden={true} />
          <Button label="다시 시작" id="motion-reset" hidden={true} />
          <Button label="분석 다시 시도" id="motion-retry" hidden={true} />
          <Button label="새 도포 시작" variant="primary" id="motion-new" hidden={true} />
          <Button label="연결 취소" className="button outline" id="cancel-camera" hidden={true} />
          <Button label="카메라 끄기" className="button outline" id="stop-camera" hidden={true} />
        </VStack>
        <Text as="p" type="inherit" display="block" className="privacy-note">
          <Text as="span" type="inherit" aria-hidden="true">◇</Text> 얼굴 사진과 영상은 기기 안에서만 분석해요. 저장하거나 전송하지 않아요.</Text>
        <Text type="supporting">다른 사람이 사용할 때는 다시 시작으로 진행률을 초기화해 주세요.</Text>
      </VStack>
      <VStack className="guide-layout session-feedback" gap={4}>
        <VStack className="live-dose-summary" padding={4} gap={2}>
          <Text type="supporting">표시 영역의 계산량 · 실험 추정</Text>
          <Heading level={3} id="live-dose-value">얼굴 확인 후 안내</Heading>
          <Text type="large" id="live-finger-value">정면 얼굴을 맞춰 주세요.</Text>
          <Text type="supporting">실제 도포량이나 개인별 권장량을 확정한 값은 아니에요.</Text>
          <a href="#results">면적·손가락 길이 자세히 보기</a>
        </VStack>
        <RecognitionPanel analysis={analysis} />
      </VStack>
    </VStack>
    <VStack as="section" id="results" className="guide-layout results-section" aria-label="사용량 계산 결과" hidden={true}>
      <VStack className="guide-layout section-heading compact">
        <Button label="처음부터 다시" className="text-button" id="reset" hidden={true}>처음부터 다시 <Text as="span" type="inherit" aria-hidden="true">↻</Text>
        </Button>
      </VStack>
      <VStack id="result-content" hidden={true} className="guide-layout">
        <VStack className="guide-layout result-grid">
          <VStack as="article" className="guide-layout area-card">
            <VStack className="guide-layout panel-heading">
              <Heading level={3}>02 <Text as="span" type="inherit">분석한 얼굴 영역</Text>
              </Heading>
              <Text as="span" type="inherit" className="status-chip">실험 추정</Text>
            </VStack>
            <VStack className="guide-layout face-values">
              <VStack className="guide-layout">
                <Text as="span" type="inherit">모델 영역 면적</Text>
                <Text as="strong" type="inherit" id="area-value">—</Text>
                <Text as="span" type="inherit">cm²</Text>
              </VStack>
              <VStack className="guide-layout dimensions">
                <Text as="span" type="inherit">가로 <Text as="b" type="inherit" id="width-value">—</Text> cm</Text>
                <Text as="span" type="inherit">이마 지점 ~ 턱 <Text as="b" type="inherit" id="height-value">—</Text> cm</Text>
              </VStack>
            </VStack>
            <Text as="p" type="inherit" display="block">계산한 모델 얼굴 영역에서 눈 안쪽·입술을 제외했어요. 이마 위쪽 일부·옆면 전체·귀·목은 포함하지 않아요.</Text>
            <details>
              <summary>계산 근거와 불확실성 보기</summary>
              <Text as="p" type="inherit" display="block">홍채 지름 11.7mm를 가정하고 얼굴 삼각형의 면적을 합산했어요. 깊이는 모델의 상대 추정값으로, 실제 피부 면적을 측정한 결과는 아니에요.</Text>
              <Text as="p" type="inherit" display="block" id="sensitivity">
              </Text>
              <Text as="p" type="inherit" display="block">위 범위는 홍채 가정만 바꾼 민감도이며, 전체 오차범위나 신뢰구간이 아니에요.</Text>
            </details>
          </VStack>
          <VStack as="article" className="guide-layout dose-card">
            <Text as="span" type="inherit" className="eyebrow">CALCULATED FOR THE HIGHLIGHTED AREA</Text>
            <Heading level={3}>표시 영역의 계산량</Heading>
            <VStack className="guide-layout dose-number">
              <Text as="strong" type="inherit" id="dose-value">—</Text>
              <Text as="span" type="inherit">g</Text>
            </VStack>
            <VStack className="guide-layout dose-equation">
              <Text as="span" type="inherit" id="formula-area">—</Text> cm² × 2mg/cm²</VStack>
            <Text as="p" type="inherit" display="block">전체 얼굴의 충분한 양이나<br />개인별 권장량을 확정한 값은 아니에요.</Text>
            <Text as="span" type="inherit" className="dose-line" aria-hidden="true">
            </Text>
          </VStack>
        </VStack>
        <VStack as="article" className="guide-layout finger-card">
          <VStack className="guide-layout finger-copy">
            <Text as="span" type="inherit" className="eyebrow">03 / FINGERTIP GUIDE</Text>
            <Heading level={3}>숫자보다 쉬운,<br />손끝의 가이드.</Heading>
            <Text as="p" type="inherit" display="block">검지 끝에서 첫 번째 주름까지를<br />‘한 마디’로 보고 길이를 표시해요.</Text>
            <Text as="span" type="inherit" className="status-chip amber">제품별 토출량 미검증</Text>
          </VStack>
          <VStack className="guide-layout finger-visual">
            <VStack id="finger-graphic" className="guide-layout finger-graphic" role="img" aria-label="필요한 선크림 줄 길이 비례 그림">
            </VStack>
            <VStack className="guide-layout finger-reading">
              <Text as="strong" type="inherit" id="joint-value">—</Text>
              <Text as="span" type="inherit">마디 상당 · <Text as="b" type="inherit" id="length-value">—</Text> mm</Text>
            </VStack>
            <Text as="span" type="inherit" className="small-label">비례 그림이며, 화면을 실제 자로 사용하지 마세요.</Text>
          </VStack>
          <VStack className="guide-layout finger-settings">
            <label htmlFor="joint-length">검지 끝 한 마디 길이 <Text as="span" type="inherit" id="joint-mm">25mm</Text>
            </label>
            <input id="joint-length" type="range" min="15" max="40" defaultValue="25" step="1" />
            <VStack className="guide-layout range-labels">
              <Text as="span" type="inherit">15mm</Text>
              <Text as="span" type="inherit">40mm</Text>
            </VStack>
            <Text as="p" type="inherit" display="block">기본 25mm는 참고 설정이에요. 실제 길이를 알고 있다면 조절해 보세요.</Text>
            <VStack className="guide-layout standard-note">
              <Text as="strong" type="inherit">표준 조건 참고값</Text>
              <Text as="p" type="inherit" display="block">지름 5mm로 일정하게 짠 줄 25mm ≈ 0.5g을 가정했어요. 제품의 실측값이나 실제 짠 양을 확인한 결과가 아니에요.</Text>
            </VStack>
          </VStack>
        </VStack>
        <VStack className="guide-layout next-note">
          <Text as="span" type="inherit" aria-hidden="true">↗</Text>
          <Text as="p" type="inherit" display="block">양을 준비했다면, 고르게 발라 주세요.<Text as="small" type="inherit">이 가이드는 실제 도포 여부·균일함·SPF 또는 UVA 차단력을 판정하지 않아요.</Text>
          </Text>
          <a href="#motion" className="button outline">같은 카메라에서 도포 동작 관찰</a>
        </VStack>
      </VStack>
    </VStack>
    
  </VStack>;
}

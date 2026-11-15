import React, { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Section } from '@astryxdesign/core/Section';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Link } from '@astryxdesign/core/Link';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Divider } from '@astryxdesign/core/Divider';

// Visible only while focused, so keyboard users can jump past the header.
export function SkipLink() {
  const [focused, setFocused] = useState(false);
  return <Link href="#workspace" onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    style={focused ? { position: 'fixed', top: 'var(--spacing-2)', left: 'var(--spacing-4)', zIndex: 20, padding: 'var(--spacing-3)', backgroundColor: 'var(--color-background-surface)', border: 'thin solid var(--color-border)', borderRadius: 'var(--radius-container)' }
      : { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap' }}>가이드로 건너뛰기</Link>;
}

export function HomeHeader() {
  return <HStack as="header" vAlign="center">
    <Link href="#" label="SUNFIT 처음으로"><Heading level={3} color="accent">SUNFIT</Heading></Link>
  </HStack>;
}

const questions = [
  ['얼굴 크기는 어떻게 추정하나요?', 'MediaPipe로 홍채와 얼굴 특징점을 찾고, 평균 홍채 지름 11.7mm를 기준으로 크기를 환산해요. 개인차와 카메라 원근감에 따른 오차가 있어요. 상대 깊이로 계산한 면적은 실제 피부 면적과 다를 수 있어요.'],
  ['왜 2mg/cm²인가요?', 'SPF 시험에 사용하는 면적당 도포량을 계산 기준으로 사용해요. 이 양이 실제로 고르게 발렸는지는 확인하지 않아요. 제품 사용 안내를 우선해 주세요.'],
  ['손가락 안내를 어떻게 읽나요?', '‘몇 마디’는 선크림 줄의 길이를 이해하기 위한 표준 조건의 참고값이에요. 제품 제형·입구·줄 굵기에 따라 실제 무게는 달라져요. 제품별 실제 토출량은 검증하지 않았어요.'],
  ['얼굴 사진은 어디로 가나요?', '얼굴 측정·도포 동작 영상과 특징점은 이 브라우저 메모리에서만 처리하고 저장·전송하지 않아요. 제품 등록에서 동의 후 촬영한 가이드 영역만 분석 서버와 Google Gemini로 보내요. 이 영역에 들어온 얼굴·배경도 포함될 수 있어 제품만 담아 주세요. 촬영 이미지는 저장하지 않아요.'],
];

export function HomeMethod() {
  return <Section padding={5}>
    <VStack as="section" id="method" gap={4} aria-labelledby="method-title">
      <VStack gap={2}>
        <Heading level={2} id="method-title">계산 방법</Heading>
        <Text>추정할 수 있는 것과 아직 확인이 필요한 것을 함께 보여주는 실험 가이드입니다.</Text>
      </VStack>
      <VStack gap={0}>
        {questions.map(([question, answer], index) => <VStack key={question} gap={0}>
          <Collapsible trigger={<VStack paddingBlock={3}><Text type="label">{question}</Text></VStack>} defaultIsOpen={index === 0}>
            <VStack paddingBlockEnd={3}><Text>{answer}</Text></VStack>
          </Collapsible>
          <Divider />
        </VStack>)}
      </VStack>
    </VStack>
  </Section>;
}

export function HomeFooter() {
  return <HStack as="footer" hAlign="between" vAlign="center" wrap="wrap" gap={3}>
    <Text weight="bold" color="accent">SUNFIT</Text>
    <Text type="supporting">2026 시립대 해커톤 ‘바르게 살자’ 팀</Text>
  </HStack>;
}

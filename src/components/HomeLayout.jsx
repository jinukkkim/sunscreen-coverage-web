import React from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
export function HomeHeader() {
  return <VStack as="header" className="guide-layout site-header">
    <a className="brand" href="#" aria-label="SunGuard 처음으로">
      <Text as="span" type="inherit" className="sun-mark" aria-hidden="true">✳</Text> sun<Text as="span" type="inherit">guard</Text>
      <Text as="sup" type="inherit">LAB</Text>
    </a>
    <VStack as="nav" aria-label="주 메뉴" className="guide-layout">
      <a href="#workspace" className="active">사용량·도포 동작</a>
      <a href="#care">재도포 일정</a>
      <a href="#method">어떻게 계산하나요? <Text as="span" type="inherit" aria-hidden="true">↗</Text>
      </a>
    </VStack>
    <Text as="span" type="inherit" className="local-label">
      <Text as="i" type="inherit">
      </Text> 얼굴 영상은 내 기기 안에</Text>
  </VStack>;
}
export function HomeHero() {
  return <VStack as="section" className="guide-layout hero" aria-labelledby="hero-title">
    <VStack className="guide-layout hero-content">
      <Text as="span" type="inherit" className="hero-tag">
        <Text as="i" type="inherit">
        </Text> 나에게 맞는 선케어, 첫 번째 단계</Text>
      <Heading level={1} id="hero-title">햇살을 즐기는<br />나만의 적정량.</Heading>
      <Text as="p" type="inherit" display="block">내 얼굴을 비추고, 선크림의 양을 알아보세요.<br />복잡한 숫자는 손가락 위의 쉬운 가이드로.</Text>
      <a className="button white" href="#workspace">내 얼굴로 시작하기 <Text as="span" type="inherit" aria-hidden="true">↗</Text>
      </a>
    </VStack>
    <VStack className="guide-layout hero-visual" aria-hidden="true">
      <VStack className="guide-layout orbit orbit-one">
      </VStack>
      <VStack className="guide-layout orbit orbit-two">
      </VStack>
      <Text as="span" type="inherit" className="diagram-label label-top">A LITTLE CARE, EVERY DAY</Text>
      <VStack className="guide-layout hero-face">
        <svg viewBox="0 0 220 270" fill="none">
          <path d="M110 22C52 22 31 64 36 127c4 54 28 111 74 123 46-12 70-69 74-123 5-63-16-105-74-105Z" stroke="currentColor" strokeWidth="1.5">
          </path>
          <path d="m57 93 105 0M43 132l134 0M57 177l107 0M110 23v225M57 93l53 39 52-39M43 132l67 45 67-45M57 177l53 33 54-33M57 93l0 84M162 93v84" stroke="currentColor" strokeOpacity=".45">
          </path>
          <path d="M66 117c8-7 18-7 26 0m36 0c8-7 18-7 26 0M110 121l-8 33h17m-30 36c14 8 28 8 42 0" stroke="currentColor" strokeWidth="2">
          </path>
          <circle cx="57" cy="93" r="4" fill="currentColor">
          </circle>
          <circle cx="164" cy="177" r="4" fill="currentColor">
          </circle>
        </svg>
      </VStack>
      <VStack className="guide-layout diagram-callout">얼굴의 형태에서<br />
        <Text as="strong" type="inherit">손끝의 기준까지.</Text>
        <Text as="span" type="inherit" className="callout-dot">
        </Text>
      </VStack>
      <Text as="span" type="inherit" className="diagram-label label-bottom">FACE → AREA → AMOUNT</Text>
    </VStack>
  </VStack>;
}
export function HomeMethod() {
  return <VStack as="section" id="method" className="guide-layout method-section">
    <VStack className="guide-layout">
      <Text as="span" type="inherit" className="eyebrow">A CLEARER WAY TO CARE</Text>
      <Heading level={2}>근거는 투명하게.<br />선케어는 간편하게.</Heading>
      <Text as="p" type="inherit" display="block">추정할 수 있는 것과 아직 확인이 필요한 것을<br />함께 보여주는 실험 가이드입니다.</Text>
    </VStack>
    <VStack className="guide-layout method-list">
      <details open={true}>
        <summary>
          <Text as="span" type="inherit">01</Text> 얼굴 크기는 어떻게 추정하나요?</summary>
        <Text as="p" type="inherit" display="block">MediaPipe로 홍채와 얼굴 특징점을 찾고, 평균 홍채 지름 11.7mm를 기준으로 크기를 환산해요. 개인차와 카메라 원근감에 따른 오차가 있어요. 상대 깊이로 계산한 면적은 실제 피부 면적과 다를 수 있어요.</Text>
      </details>
      <details>
        <summary>
          <Text as="span" type="inherit">02</Text> 왜 2mg/cm²인가요?</summary>
        <Text as="p" type="inherit" display="block">SPF 시험에 사용하는 면적당 도포량을 계산 기준으로 사용해요. 이 양이 실제로 고르게 발렸는지는 확인하지 않아요. 제품 사용 안내를 우선해 주세요.</Text>
      </details>
      <details>
        <summary>
          <Text as="span" type="inherit">03</Text> 손가락 안내를 어떻게 읽나요?</summary>
        <Text as="p" type="inherit" display="block">‘몇 마디’는 선크림 줄의 길이를 이해하기 위한 표준 조건의 참고값이에요. 제품 제형·입구·줄 굵기에 따라 실제 무게는 달라져요. 제품별 실제 토출량은 검증하지 않았어요.</Text>
      </details>
      <details>
        <summary>
          <Text as="span" type="inherit">04</Text> 얼굴 사진은 어디로 가나요?</summary>
        <Text as="p" type="inherit" display="block">얼굴 측정·도포 동작 영상과 특징점은 이 브라우저 메모리에서만 처리하고 저장·전송하지 않아요. 제품 등록에서 동의 후 촬영한 가이드 영역만 분석 서버와 Google Gemini로 보내요. 이 영역에 들어온 얼굴·배경도 포함될 수 있어 제품만 담아 주세요. 촬영 이미지는 저장하지 않아요.</Text>
      </details>
    </VStack>
  </VStack>;
}
export function HomeFooter() {
  return <VStack as="footer" className="guide-layout site-footer">
    <a className="brand" href="#">
      <Text as="span" type="inherit" className="sun-mark" aria-hidden="true">✳</Text> sun<Text as="span" type="inherit">guard</Text>
    </a>
    <Text as="span" type="inherit">매일의 햇살을, 더 안심하고.</Text>
    <Text as="small" type="inherit">2026 SunGuard contributors · 실험용 가이드</Text>
  </VStack>;
}

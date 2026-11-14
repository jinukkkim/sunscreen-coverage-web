import React from 'react';
import CareDashboard from './components/CareDashboard.jsx';
import ProductSetup from './components/ProductSetup.jsx';
import FaceDoseGuide from './components/FaceDoseGuide.jsx';
import { HomeHeader, HomeHero, HomeMethod, HomeFooter } from './components/HomeLayout.jsx';
import { useCare } from './hooks/useCare.js';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';

export default function App() {
  const model = useCare();
  return (
    <VStack className="sunguard-home" gap={0}>
      <a className="skip-link" href="#workspace">가이드로 건너뛰기</a>
      <HomeHeader />
      <VStack as="main" className="page-frame" gap={0} width="100%">
        <HomeHero />
        <HStack as="nav" className="home-steps" aria-label="선케어 순서" gap={6} wrap="wrap">
          <a href="#workspace">01 사용량·도포 동작</a>
          <a href="#care">02 재도포 일정</a>
          <a href="#product">내 선크림</a>
        </HStack>
        <FaceDoseGuide onComplete={model.completeMotion} />
        <VStack as="section" id="care" className="care-section" gap={5} aria-labelledby="care-title">
          <VStack className="section-intro" gap={2}>
            <Text type="supporting" color="accent">바른 뒤에도 이어지는 선케어</Text>
            <Heading level={2} id="care-title">다음 재도포 일정</Heading>
            <Text>최신 UV와 직전 도포 시각으로 앞으로 언제 덧바를지 안내합니다.</Text>
          </VStack>
          <CareDashboard model={model} />
        </VStack>
        <VStack as="section" id="product" className="care-section" gap={5} aria-labelledby="product-setup-title">
          <VStack className="section-intro" gap={2}>
            <Heading level={2} id="product-setup-title">내 선크림</Heading>
            <Text>사용 중인 선크림의 라벨을 사진으로 읽어 등록하고, 표기된 SPF·PA에 맞는 안내를 확인하세요.</Text>
          </VStack>
          <ProductSetup />
        </VStack>
        <HomeMethod />
      </VStack>
      <HomeFooter />
    </VStack>
  );
}

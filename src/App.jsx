import React from 'react';
import CareFlow from './components/CareFlow.jsx';
import CareDashboard from './components/CareDashboard.jsx';
import { HomeHeader, HomeMethod, HomeFooter } from './components/HomeLayout.jsx';
import { useCare } from './hooks/useCare.js';
import { VStack } from '@astryxdesign/core/VStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import './home.css';

export default function App() {
  const model = useCare();
  return (
    <VStack className="sunguard-home" gap={6} padding={6} maxWidth={1280} style={{ marginInline: 'auto' }}>
      <a className="skip-link" href="#workspace">가이드로 건너뛰기</a>
      <HomeHeader />
      <VStack as="main" gap={6}>
        <CareFlow model={model} />
        <VStack as="section" id="care" gap={5} aria-labelledby="care-title">
          <VStack gap={2}>
            <Heading level={2} id="care-title">오늘의 선케어 타임라인</Heading>
            <Text>바른 시각을 기록하고, 다음 재도포 시각과 자외선 예보를 함께 확인하세요.</Text>
          </VStack>
          <CareDashboard model={model} />
        </VStack>
        <HomeMethod />
      </VStack>
      <HomeFooter />
    </VStack>
  );
}

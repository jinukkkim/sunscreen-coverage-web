import React from 'react';
import RecognitionPanel from './components/RecognitionPanel.jsx';
import CareDashboard from './components/CareDashboard.jsx';
import { useCare } from './hooks/useCare.js';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Divider } from '@astryxdesign/core/Divider';
import { Button } from '@astryxdesign/core/Button';

export default function App() {
  const model = useCare();
  return (
    <VStack gap={6} padding={6} maxWidth={1120} style={{ marginInline: 'auto' }}>
      <HStack as="header" hAlign="between" vAlign="center" wrap="wrap" gap={3}>
        <Text type="large" weight="bold">SunGuard</Text>
        <Text type="supporting">매일 이어가는 선케어</Text>
        <Button label="얼굴 크기·사용량 가이드" onClick={() => window.location.assign('/face-dose.html')} />
      </HStack>
      <Divider />
      <VStack as="main" gap={6}>
        <VStack gap={2}>
          <Heading level={1}>선크림 도포 인식</Heading>
          <Text>얼굴을 먼저 맞춘 뒤 이마·코·양 볼·턱에서 손으로 펴 바르는 동작을 관찰합니다.</Text>
        </VStack>
        <RecognitionPanel onComplete={model.completeMotion} />
        <Divider />
        <VStack gap={2}>
          <Heading level={2}>다음 재도포 일정</Heading>
          <Text>최신 UV와 직전 도포 시각으로 앞으로 언제 덧바를지 안내합니다.</Text>
        </VStack>
        <CareDashboard model={model} />
      </VStack>
      <Divider />
      <Text as="p" type="supporting">2026 SunGuard contributors · 시각 기준: 대한민국(Asia/Seoul)</Text>
    </VStack>
  );
}

import React from 'react';
import CareFlow from './components/CareFlow.jsx';
import CareDashboard from './components/CareDashboard.jsx';
import { useCare } from './hooks/useCare.js';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Divider } from '@astryxdesign/core/Divider';

export default function App() {
  const model = useCare();
  return (
    <VStack gap={6} padding={6} maxWidth={1280} style={{ marginInline: 'auto' }}>
      <HStack as="header" hAlign="between" vAlign="center" wrap="wrap" gap={3}>
        <Text type="large" weight="bold">SunGuard</Text>
        <Text type="supporting">매일 이어가는 선케어</Text>
      </HStack>
      <Divider />
      <VStack as="main" gap={6}>
        <CareFlow model={model} />
        <Divider />
        <VStack gap={2}>
          <Heading level={2}>오늘의 선케어 타임라인</Heading>
          <Text>바른 시각을 기록하고, 다음 재도포 시각과 자외선 예보를 함께 확인하세요.</Text>
        </VStack>
        <CareDashboard model={model} />
      </VStack>
      <Divider />
      <Text as="p" type="supporting">2026 SunGuard contributors · 시각 기준: 대한민국(Asia/Seoul)</Text>
    </VStack>
  );
}

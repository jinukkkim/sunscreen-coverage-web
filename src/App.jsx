import React from 'react';
import Camera from './components/Camera.jsx';
import CareDashboard from './components/CareDashboard.jsx';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Divider } from '@astryxdesign/core/Divider';

export default function App() {
  return (
    <VStack gap={6} padding={6} maxWidth={1120} style={{ marginInline: 'auto' }}>
      <HStack as="header" hAlign="between" vAlign="center" wrap="wrap" gap={3}>
        <Text type="large" weight="bold">SunGuard</Text>
        <Text type="supporting">매일 이어가는 선케어</Text>
      </HStack>
      <Divider />
      <VStack as="main" gap={6}>
        <VStack gap={2}>
          <Heading level={1}>오늘의 선케어 타임라인</Heading>
          <Text>바른 시각을 기록하고, 다음 재도포 시각과 자외선 예보를 함께 확인하세요.</Text>
        </VStack>
        <CareDashboard />
        <Divider />
        <Grid columns={{ minWidth: 300, max: 2 }} gap={4}>
          <Camera />
          <VStack as="section" gap={3} padding={4}>
            <Heading level={2}>도포 인식 결과</Heading>
            <Text>인식 기능 연결 전 · 아직 분석 결과가 없습니다.</Text>
            <Text type="supporting">현재 도포 기록은 사용자가 직접 입력한 시각입니다. 카메라나 손 움직임으로 도포 완료를 자동 판정하지 않습니다.</Text>
            <Text type="supporting">일반 카메라의 실제 도포 인식 정확도는 아직 검증되지 않았으며, 도포량과 자외선 차단력을 측정하지 않습니다.</Text>
          </VStack>
        </Grid>
      </VStack>
      <Divider />
      <Text as="p" type="supporting">2026 SunGuard contributors · 시각 기준: 대한민국(Asia/Seoul)</Text>
    </VStack>
  );
}

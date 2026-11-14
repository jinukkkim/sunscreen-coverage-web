import React, { useState } from 'react';
import Camera from './components/Camera.jsx';
import CareDashboard from './components/CareDashboard.jsx';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Divider } from '@astryxdesign/core/Divider';
import { Button } from '@astryxdesign/core/Button';
import { REGIONS } from './lib/face-regions.js';

const phaseLabels = {
  stopped: '카메라 대기', loading: '인식 준비 중', scanning: '얼굴 스캔 중',
  ready: '부위 확인 대기', tracking: '동작 관찰 중', error: '분석 재시도 필요',
};
const statusLabels = { pending: '아직 감지되지 않음', observing: '동작 관찰 중', detected: '도포 동작 감지' };

export default function App() {
  const [analysis, setAnalysis] = useState({ phase: 'stopped', regions: [], detectedCount: 0 });
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
        <Grid columns={{ minWidth: 300, max: 2 }} gap={4}>
          <Camera onAnalysisChange={setAnalysis} />
          <VStack as="section" gap={3} padding={4}>
            <Heading level={2}>부위별 도포 동작</Heading>
            <Text type="label">{phaseLabels[analysis.phase]}</Text>
            <Text role="status">5구역 중 {analysis.detectedCount}구역에서 동작 감지</Text>
            <VStack as="ul" gap={0} style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {REGIONS.map(region => {
                const status = analysis.regions.find(item => item.id === region.id)?.status || 'pending';
                return <VStack as="li" key={region.id} gap={0}>
                  <HStack paddingBlock={3} gap={3} hAlign="between" wrap="wrap">
                    <Text type="label">{region.label}</Text>
                    <Text type="supporting" color={status === 'detected' ? 'accent' : 'secondary'}>{statusLabels[status]}</Text>
                  </HStack>
                  <Divider />
                </VStack>;
              })}
            </VStack>
            {analysis.detectedCount === 5 && <Text role="status">관찰 대상 5구역에서 동작을 감지했습니다.</Text>}
            <Text type="supporting">관찰 범위는 정면 5구역입니다. 눈가·귀·목 등은 이번 관찰에 포함되지 않습니다.</Text>
            <Text type="supporting">손의 동작을 확인하는 기능입니다. 선크림이 실제로 발렸는지, 양이 충분한지는 확인하지 못합니다. 아래 도포 기록은 직접 입력하며 동작만으로 자동 완료하지 않습니다.</Text>
            <Text type="supporting">일반 카메라의 실제 도포 인식 정확도는 아직 검증되지 않았으며, 도포량과 자외선 차단력을 측정하지 않습니다.</Text>
          </VStack>
        </Grid>
        <Divider />
        <VStack gap={2}>
          <Heading level={2}>오늘의 선케어 타임라인</Heading>
          <Text>바른 시각을 기록하고, 다음 재도포 시각과 자외선 예보를 함께 확인하세요.</Text>
        </VStack>
        <CareDashboard />
      </VStack>
      <Divider />
      <Text as="p" type="supporting">2026 SunGuard contributors · 시각 기준: 대한민국(Asia/Seoul)</Text>
    </VStack>
  );
}

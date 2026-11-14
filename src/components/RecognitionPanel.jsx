import React, { useCallback, useRef, useState } from 'react';
import Camera from './Camera.jsx';
import { REGIONS } from '../lib/face-regions.js';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Divider } from '@astryxdesign/core/Divider';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';

const phaseLabels = {
  stopped: '카메라 대기', loading: '인식 준비 중', scanning: '얼굴 스캔 중',
  ready: '부위 확인 대기', recovering: '인식 복구 대기', tracking: '동작 관찰 중', completed: '동작 관찰 완료', error: '분석 재시도 필요',
};
const statusLabels = { pending: '아직 감지되지 않음', observing: '동작 관찰 중', detected: '도포 동작 감지' };

export default function RecognitionPanel({ onComplete }) {
  const [analysis, setAnalysis] = useState({ phase: 'stopped', regions: [], detectedCount: 0, progress: 0 });
  const completedSession = useRef(null);
  const handleAnalysis = useCallback(update => {
    setAnalysis(update);
    if (update.phase === 'completed' && update.progress === 100 && update.detectedCount === REGIONS.length && update.sessionId && completedSession.current !== update.sessionId) {
      completedSession.current = update.sessionId;
      onComplete(update);
    }
  }, [onComplete]);

  return (
    <Grid columns={{ minWidth: 300, max: 2 }} gap={4}>
      <Camera onAnalysisChange={handleAnalysis} />
      <VStack as="section" gap={3} padding={4}>
        <Heading level={2}>부위별 도포 동작</Heading>
        <Text type="label">{phaseLabels[analysis.phase]}</Text>
        <ProgressBar label="전체 동작 진행률" value={analysis.progress} hasValueLabel variant={analysis.progress === 100 ? 'success' : 'accent'} />
        <Text role="status">5구역 중 {analysis.detectedCount}구역에서 동작 감지</Text>
        <VStack as="ul" gap={3} style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {REGIONS.map((region, index) => {
            const observed = analysis.regions.find(item => item.id === region.id);
            const status = observed?.status || 'pending', progress = observed?.progress || 0;
            return <VStack as="li" key={region.id} gap={2}>
              <HStack gap={3} hAlign="between" wrap="wrap">
                <Text type="label">{index + 1}. {region.label}</Text>
                <Text type="supporting" color={status === 'detected' ? 'accent' : 'secondary'}>{status === 'pending' && progress > 0 ? '이어 바르기' : statusLabels[status]}</Text>
              </HStack>
              <ProgressBar label={`${region.label} 동작 진행률`} value={progress} hasValueLabel isLabelHidden variant={progress === 100 ? 'success' : 'accent'} />
              <Divider />
            </VStack>;
          })}
        </VStack>
        {analysis.phase === 'completed' && <Text role="status">관찰 대상 5구역에서 동작을 감지했습니다.</Text>}
        <Text type="supporting">진행률은 구역별 움직임 시간·이동 범위의 달성 비율입니다. 실제 선크림 도포량·두께·차단력을 측정한 퍼센트가 아닙니다.</Text>
        <Text type="supporting">5구역을 완료하면 완료 시각을 자동 기록하고 UV별 재도포 알림을 켭니다. 위치와 기기 알림은 허용한 경우에만 사용합니다.</Text>
        <Text type="supporting">관찰 범위는 정면 5구역입니다. 눈가·귀·목 등은 이번 관찰에 포함되지 않습니다.</Text>
      </VStack>
    </Grid>
  );
}

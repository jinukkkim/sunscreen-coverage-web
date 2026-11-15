import React from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { currentUvDetails, formatUvTime, KMA_UV_SOURCE_URL } from '../lib/uv-details.js';

export default function KmaUV({ forecast, now }) {
  const data = currentUvDetails(forecast, now);
  return <VStack gap={3} aria-live="polite">
    <Heading level={3}>현재 지역 자외선지수</Heading>
    <Text type="supporting">기상청 생활기상지수 조회서비스의 현재 시간대 예보입니다. 재도포 알림과 하루 타임라인에 같은 값을 적용합니다.</Text>
    {data ? <VStack gap={2}>
      <Text>인근 기상청 지점: {data.region.name}</Text>
      <Text>현재 시간대 자외선지수: {data.value}</Text>
      <Text>예보 구간: {formatUvTime(data.validFrom)}–{formatUvTime(data.validTo)} (한국 시간)</Text>
      <Text type="supporting">발표 {formatUvTime(data.publishedAt)} · 조회 {formatUvTime(data.fetchedAt)}</Text>
    </VStack> : <Text>위치 갱신에 동의하면 기상청 UV 예보를 조회합니다. 유효한 예보가 없으면 재도포는 기본 120분으로 안내합니다.</Text>}
    <Text type="supporting">실시간 실측값이 아닌 3시간 단위 예보입니다. 조회 후 1시간이 지나거나 해당 시간대 자료가 없으면 다시 확인이 필요합니다.</Text>
    <Text as="a" href={KMA_UV_SOURCE_URL} target="_blank" rel="noreferrer" type="supporting">데이터 출처: 기상청 생활기상지수 조회서비스</Text>
  </VStack>;
}

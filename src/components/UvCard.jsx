import React from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Divider } from '@astryxdesign/core/Divider';
import { currentUvDetails, KMA_UV_SOURCE_URL } from '../lib/uv-details.js';
import { policyAt } from '../lib/reapplication.js';

const GAUGE_MAX = 11;

// Current KMA UV forecast for the user's position: gauge and the station it applies to.
export default function UvCard({ model }) {
  const { forecast, now } = model;
  const data = currentUvDetails(forecast, now);
  const policy = policyAt(forecast, now, now);
  const headline = !data ? model.locationEnabled ? '현재 시간대 예보를 확인하지 못했어요' : '위치를 확인하면 자외선 예보를 보여드려요'
    : `${data.level} · ${policy.minutes === null ? '재도포 알림 대기' : `${policy.minutes}분마다 덧바르기`}`;
  const rows = [
    ['위치', data ? `${data.region.name} 인근 지점${data.region.distanceKm != null ? ` · ${data.region.distanceKm}km` : ''}` : '확인 전'],
  ];
  return <Card>
    <VStack as="section" gap={3} aria-labelledby="uv-card-title">
      <HStack hAlign="between" vAlign="center" gap={3} wrap="wrap">
        <Text type="label" color="secondary">지금 자외선</Text>
        <Text type="supporting">기상청 3시간 예보 · 실측값 아님</Text>
      </HStack>
      <Heading level={3} id="uv-card-title">{headline}</Heading>
      <UvGauge value={data?.value} level={data?.level} />
      <VStack gap={0} aria-label="예보 정보">
        {rows.map(([label, value]) => <VStack key={label} gap={0}>
          <HStack hAlign="between" vAlign="center" gap={3} wrap="wrap" paddingBlock={2}>
            <Text type="supporting">{label}</Text>
            <Text type="label" hasTabularNumbers justify="end">{value}</Text>
          </HStack>
          <Divider />
        </VStack>)}
      </VStack>
      {!data && <Text type="supporting">{model.locationEnabled ? '해당 시간대 자료가 없거나 조회 후 1시간이 지났습니다. 다시 확인해 주세요. 그동안 재도포는 기본 120분으로 안내합니다.' : '위치 갱신에 동의하면 기상청 UV 예보를 조회합니다. 유효한 예보가 없으면 재도포는 기본 120분으로 안내합니다.'}</Text>}
      <CheckboxInput label="알림마다 새 위치를 확인해 UV 예보 갱신" value={model.locationEnabled} onChange={model.toggleLocation} />
      <HStack wrap="wrap" gap={3} vAlign="center" aria-live="polite">
        <Button label="현재 위치·예보 다시 확인" isDisabled={!model.locationEnabled} clickAction={model.refresh} />
        {/* The success message repeats the rows above; keep progress and failures visible. */}
        {!(data && model.locationStatus.startsWith(`${data.region.name} 인근`)) && <Text type="supporting">{model.locationStatus}</Text>}
      </HStack>
      <Text as="a" href={KMA_UV_SOURCE_URL} target="_blank" rel="noreferrer" type="supporting">데이터 출처: 기상청 생활기상지수 조회서비스</Text>
    </VStack>
  </Card>;
}

// Half-circle gauge on the UV index scale, 0 to 11+.
function UvGauge({ value, level }) {
  const known = Number.isFinite(value);
  const share = known ? Math.min(value, GAUGE_MAX) / GAUGE_MAX * 100 : 0;
  const arc = 'M 20 110 A 90 90 0 0 1 200 110';
  return <svg viewBox="0 0 220 124" width="100%" style={{ maxWidth: 'calc(var(--spacing-10) * 7)', marginInline: 'auto', display: 'block' }}
    {...known ? { role: 'meter', 'aria-label': '현재 시간대 자외선지수', 'aria-valuemin': 0, 'aria-valuemax': GAUGE_MAX, 'aria-valuenow': value, 'aria-valuetext': `${value} ${level}` } : { 'aria-hidden': true }}>
    <path d={arc} fill="none" stroke="var(--color-border)" strokeWidth="18" strokeLinecap="round" />
    {known && share > 0 && <path d={arc} fill="none" stroke="var(--color-accent)" strokeWidth="18" strokeLinecap="round" pathLength="100" strokeDasharray={`${share} 100`} />}
    <text x="110" y="98" textAnchor="middle" fontSize="48" fontWeight="700" fill="var(--color-text-primary)" style={{ fontFamily: 'var(--font-family-heading, inherit)', fontVariantNumeric: 'tabular-nums' }}>{known ? value : '—'}</text>
    <text x="110" y="120" textAnchor="middle" fontSize="12" fill="var(--color-text-secondary)">{known ? `${level} · 최대 11+` : '예보 확인 전'}</text>
  </svg>;
}

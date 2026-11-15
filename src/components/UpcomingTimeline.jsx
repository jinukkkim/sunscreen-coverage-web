import React from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Section } from '@astryxdesign/core/Section';
import { dailyEnd, dayKey, formatDate, formatTime, latestRecord, policyAt, recordSourceLabel, upcomingTimeline } from '../lib/reapplication.js';

export default function UpcomingTimeline({ care, now, forecast }) {
  const rows = upcomingTimeline(care, now, forecast), last = latestRecord(care);
  const preview = !last || dayKey(last.at) !== dayKey(now);
  const policy = policyAt(forecast, now, now);
  const events = [
    ...care.records.filter(record => dayKey(record.at) === dayKey(now)).map(record => ({ ...record, id: `record-${record.id}`, kind: 'record', label: '도포 완료' })),
    ...rows.map(row => ({ ...row, kind: 'plan' })),
    ...(!rows.some(row => row.immediate) ? [{ id: 'now', at: now, kind: 'now', label: '현재 시각' }] : []),
    { id: 'end', at: dailyEnd(care, now), kind: 'end', label: '오늘 알림 종료' },
  ].sort((a, b) => a.at - b.at);
  const emptyMessage = now >= dailyEnd(care, now) ? '오늘 종료 시각이 지났습니다. 종료 시각을 조정하면 일정을 이어갈 수 있습니다.'
    : policy.minutes === null ? '현재 기준으로 오늘 종료 시각까지 재도포 예정이 없습니다.' : '오늘 종료 시각 안의 다음 예정이 없습니다. 종료 시각을 조정하면 일정을 이어갈 수 있습니다.';
  return <Section padding={4}>
    <VStack as="section" aria-label="앞으로 바를 시각" gap={4} style={{ minWidth: 0 }}>
      <Heading level={2}>{formatDate(now)} · 하루 도포 타임라인</Heading>
      <Text>{preview ? '지금 처음 바른다면 언제 다시 바를지 보여주는 미리보기입니다. 실제로 바른 시각을 기록하면 그 시각부터 계산합니다.' : '현재 시각 이후의 재도포 일정입니다. 실제 직전 도포 시각과 최신 UV 예보를 반영합니다.'}</Text>
      <Text type="label">{policy.label} · 기준 {formatTime(now)} · 오늘 {care.endTime}까지</Text>
      {forecast && <Text type="supporting">{forecast.location.name} 인근 기상청 지점 · UV 갱신 {formatTime(Date.parse(forecast.fetchedAt))}</Text>}
      <HStack gap={4} wrap="wrap">
        <Text type="supporting">● 도포 완료</Text>
        <Text type="supporting">◉ 현재 / 다음 도포</Text>
        <Text type="supporting">○ 이후 예정</Text>
      </HStack>
      {policy.minutes === null && <Text>현재 UV 0–2로 대기 중입니다. 이후 UV가 높아지는 예보가 있으면 그 시각부터 안내합니다.</Text>}
      {rows.length === 0 && <Text>{emptyMessage}</Text>}
      <Text type="supporting">시간 순서대로 오른쪽으로 이어집니다. 좌우로 스크롤해 하루 일정을 확인하세요.</Text>
      <HStack as="ol" aria-label="하루 도포 타임라인" tabIndex={0} isScrollable width="100%" maxWidth="100%" gap={0} padding={1} style={{ listStyle: 'none', margin: 0, minWidth: 0 }}>
        {events.map((event, index) => {
          const current = event.kind === 'now' || event.immediate;
          const next = event.kind === 'plan' && !event.conditional;
          const color = event.kind === 'record' ? 'var(--color-success)' : current || next ? 'var(--color-accent)' : 'var(--color-border-emphasized)';
          return <VStack as="li" key={event.id} aria-current={current ? 'time' : undefined} gap={3} paddingBlock={3} paddingInlineEnd={6} width="calc(var(--spacing-10) * 5)" style={{ position: 'relative', flexShrink: 0 }}>
            {index < events.length - 1 && <VStack aria-hidden="true" style={{ position: 'absolute', left: 'var(--spacing-3)', right: 'calc(-1 * var(--spacing-3))', top: 'var(--spacing-6)', borderTop: `medium ${event.kind === 'record' ? 'solid' : 'dashed'} ${color}`, pointerEvents: 'none' }} />}
            <VStack aria-hidden="true" width="var(--spacing-6)" height="var(--spacing-6)" style={{ position: 'relative', flexShrink: 0, borderRadius: 'var(--radius-full)', border: `medium solid ${color}`, backgroundColor: event.kind === 'record' || current || next ? color : 'var(--color-background-surface)', boxSizing: 'border-box', boxShadow: current ? '0 0 0 var(--spacing-1) var(--color-accent-muted)' : undefined }} />
            <VStack gap={2} style={{ minWidth: 0 }}>
              <VStack gap={1}>
                <Text type={event.kind === 'plan' ? 'large' : 'label'} weight="bold" hasTabularNumbers color={event.kind === 'end' ? 'secondary' : 'primary'}>{formatTime(event.at)} · {event.label}</Text>
                {event.kind === 'plan' && <Text type="label">{event.immediate ? '지금 바를 시간' : `${Math.ceil((event.at - now) / 60000)}분 뒤`}</Text>}
              </VStack>
              <Text type="supporting">{event.kind === 'record' ? recordSourceLabel(event) : event.kind === 'now' ? preview ? '지금 바른다는 기준의 미리보기 · 도포 기록 아님' : '여기부터 앞으로의 도포 일정을 확인하세요.' : event.kind === 'end' ? '이 시각 이후에는 오늘 알림을 보내지 않습니다.' : `${event.uv === null ? 'UV 정보 없음 · 기본' : `UV ${event.uv}`} · ${event.minutes}분 주기${event.conditional ? ' · 앞선 예정에 발랐을 때' : event.immediate ? ' · 지난 예정은 완료로 처리하지 않습니다' : event.preview ? ' · 지금 바른다면' : ' · 직전 도포 기준'}`}</Text>
            </VStack>
          </VStack>;
        })}
      </HStack>
      <Text type="supporting">예정은 앞선 시각에 덧바르는 기준이며, UV 변화·새 도포 기록에 따라 다시 계산합니다. 기상청 시간대별 예보를 사용하며 UV가 없거나 오래되면 기본 120분을 적용합니다.</Text>
    </VStack>
  </Section>;
}

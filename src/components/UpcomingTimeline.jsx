import React from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Section } from '@astryxdesign/core/Section';
import { Stepper, Step } from '@astryxdesign/core/Stepper';
import { dailyEnd, dayKey, formatTime, latestRecord, policyAt, recordSourceLabel, upcomingTimeline } from '../lib/reapplication.js';

// Design direction 1: the day as a vertical Stepper. Circle colors: applied = success, now/next = accent, later = default.
// Step leaves upcoming steps grey whatever their status, so the next application gets its accent circle here.
const nextDot = <VStack aria-hidden="true" width="var(--spacing-4)" height="var(--spacing-4)" style={{ borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-accent)' }} />;

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
  const active = events.findIndex(event => event.kind === 'now' || event.immediate);
  const status = event => event.kind === 'record' ? 'success' : event.kind === 'now' || event.immediate || (event.kind === 'plan' && !event.conditional) ? 'accent' : undefined;
  const description = event => event.kind === 'record' ? recordSourceLabel(event)
    : event.kind === 'now' ? preview ? '지금 바른다는 기준의 미리보기 · 도포 기록 아님' : '현재 시각 이후의 일정입니다.'
      : event.kind === 'end' ? '이 시각 이후에는 오늘 알림을 보내지 않습니다.'
        : `${event.uv === null ? 'UV 정보 없음 · 기본' : `UV ${event.uv}`} · ${event.minutes}분 주기${event.conditional ? ' · 앞선 예정에 발랐을 때' : event.immediate ? ' · 지금 바를 시간' : event.preview ? ' · 지금 바른다면' : ' · 직전 도포 기준'}`;
  return <Section padding={5}>
    <VStack as="section" aria-label="앞으로 바를 시각" gap={4}>
      <Heading level={2}>오늘의 도포 타임라인</Heading>
      <Text type="supporting">{preview ? '지금 처음 바른다면 언제 다시 바를지 보여주는 미리보기입니다. 실제로 바른 시각을 기록하면 그 시각부터 계산합니다.' : '실제 직전 도포 시각과 최신 UV 예보로 현재 이후의 일정을 계산합니다.'}</Text>
      <Text type="label">{policy.label} · 기준 {formatTime(now)}</Text>
      {forecast && <Text type="supporting">{forecast.location.name} 인근 기상청 지점 · UV 갱신 {formatTime(Date.parse(forecast.fetchedAt))}</Text>}
      {rows.length === 0 && <Text type="supporting">{emptyMessage}</Text>}
      <Stepper activeStep={active} orientation="vertical" label="하루 도포 타임라인">
        {events.map((event, index) => <Step key={event.id} step={index} label={`${formatTime(event.at)} · ${event.label}`} status={status(event)} description={description(event)}
          indicator={index > active && status(event) === 'accent' ? nextDot : 'auto'} />)}
      </Stepper>
    </VStack>
  </Section>;
}

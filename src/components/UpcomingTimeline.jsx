import React from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Section } from '@astryxdesign/core/Section';
import { Stepper, Step } from '@astryxdesign/core/Stepper';
import { dailyEnd, dayKey, formatTime, upcomingTimeline } from '../lib/reapplication.js';

// Design direction 1: the day as a vertical Stepper. Circle colors: applied = success, now/next = accent, later = default.
// Step leaves upcoming steps grey whatever their status, so the next application gets its accent circle here.
const nextDot = <VStack aria-hidden="true" width="var(--spacing-4)" height="var(--spacing-4)" style={{ borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-accent)' }} />;

export default function UpcomingTimeline({ care, now, forecast }) {
  const rows = upcomingTimeline(care, now, forecast);
  const events = [
    ...care.records.filter(record => dayKey(record.at) === dayKey(now)).map(record => ({ ...record, id: `record-${record.id}`, kind: 'record', label: '도포 완료' })),
    ...rows.map(row => ({ ...row, kind: 'plan' })),
    ...(!rows.some(row => row.immediate) ? [{ id: 'now', at: now, kind: 'now', label: '현재 시각' }] : []),
    { id: 'end', at: dailyEnd(care, now), kind: 'end', label: '오늘 알림 종료' },
  ].sort((a, b) => a.at - b.at);
  const active = events.findIndex(event => event.kind === 'now' || event.immediate);
  const status = event => event.kind === 'record' ? 'success' : event.kind === 'now' || event.immediate || (event.kind === 'plan' && !event.conditional) ? 'accent' : undefined;
  return <Section padding={5}>
    <VStack as="section" aria-label="앞으로 바를 시각" gap={4}>
      <Heading level={2}>오늘의 도포 타임라인</Heading>
      <Stepper activeStep={active} orientation="vertical" label="하루 도포 타임라인">
        {events.map((event, index) => <Step key={event.id} step={index} label={`${formatTime(event.at)} · ${event.label}`} status={status(event)}
          indicator={index > active && status(event) === 'accent' ? nextDot : 'auto'} />)}
      </Stepper>
    </VStack>
  </Section>;
}

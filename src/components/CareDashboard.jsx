import React, { useState } from 'react';
import UvCard from './UvCard.jsx';
import UpcomingTimeline from './UpcomingTimeline.jsx';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Section } from '@astryxdesign/core/Section';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Divider } from '@astryxdesign/core/Divider';
import { dailyEnd, dayKey, formatTime, parseInput, policyAt } from '../lib/reapplication.js';

const inputStyle = { font: 'inherit', color: 'var(--color-text-primary)', backgroundColor: 'var(--color-background-surface)', border: 'thin solid var(--color-border)', padding: 'var(--spacing-2)', borderRadius: 'var(--radius-container)', maxWidth: '100%' };

export default function CareDashboard({ model }) {
  const { care, now, forecast } = model;
  const [time, setTime] = useState(formatTime(Date.now())), [inputError, setInputError] = useState('');
  const policy = policyAt(forecast, now, now);
  const remindersOn = care.enabled && care.activeDay === dayKey(now) && now <= Date.parse(`${dayKey(now)}T${care.endTime}:00+09:00`);
  function saveTime() {
    try { const at = parseInput(`${dayKey(now)}T${time}`, Date.now()); setInputError(''); model.record(at); }
    catch (cause) { setInputError(cause.message); }
  }
  return (
    <VStack gap={5}>
      {model.error && <Banner key={model.error} status="warning" title="확인이 필요합니다" description={model.error} isDismissable onDismiss={model.clearError} />}
      {model.completion && <Banner key={model.completion.id} status="success" title="동작 완료 시각을 기록했습니다" description={`${formatTime(model.completion.at)} 완료 · UV별 재도포 알림을 켰습니다. ${now > dailyEnd(care, now) ? '오늘 종료 시각이 지났습니다. 종료 시각을 조정하면 알림을 이어갈 수 있습니다.' : `현재 ${policy.label}.`}`} />}
      {model.alert && <Banner status="warning" title="재도포할 시간입니다" description={`${model.alert.detail} ${model.alert.location} ${model.alert.notificationError || ''}`} role="alert" isDismissable onDismiss={model.dismiss} endContent={<Button label="지금 바르고 기록하기" onClick={() => model.record()} />} />}

      <Grid columns={{ minWidth: 280, max: 3 }} gap={4} align="start">
        <UvCard model={model} />
        <UpcomingTimeline care={care} now={now} forecast={forecast} />
        <Section padding={4}>
          <VStack gap={4}>
            <Heading level={2}>오늘의 알림</Heading>
            <Button variant="primary" label="지금 발랐어요" onClick={() => model.record()} />
            <HStack wrap="wrap" gap={2} vAlign="center">
              <Button label={remindersOn ? '오늘 알림 끄기' : '오늘 야외활동 알림 켜기'} onClick={model.toggleReminders} />
              <Text type="supporting">{remindersOn ? policy.minutes === null ? '알림 사용 중 · 낮은 UV로 대기' : '화면 알림 사용 중' : '화면 알림 꺼짐'}</Text>
            </HStack>
            <VStack gap={2}>
              <label htmlFor="end-time"><Text type="label">오늘 알림 종료 시각 (한국 시간)</Text></label>
              <input id="end-time" type="time" value={care.endTime} onChange={event => model.setEndTime(event.target.value)} style={inputStyle} />
            </VStack>
            <HStack wrap="wrap" gap={2} vAlign="center">
              <Button label={model.deviceEnabled ? '기기 알림 끄기' : '기기 알림 허용하기'} onClick={model.deviceEnabled ? model.disableNotifications : model.enableNotifications} />
              <Text type="supporting">{model.deviceEnabled ? '이 페이지에서 기기 알림 사용' : model.permission === 'denied' ? '브라우저 알림 권한 거부됨' : '화면 알림만 사용'}</Text>
            </HStack>
            <Divider />
            <VStack gap={2}>
              <label htmlFor="application-time"><Text type="label">오늘 이전에 바른 시각 (한국 시간)</Text></label>
              <HStack gap={2} wrap="wrap" vAlign="center">
                <input id="application-time" type="time" value={time} onChange={event => setTime(event.target.value)} required style={inputStyle} />
                <Button label="입력한 시각 저장" onClick={saveTime} />
              </HStack>
              {inputError && <Text as="p" role="alert">{inputError}</Text>}
            </VStack>
          </VStack>
        </Section>
      </Grid>
    </VStack>
  );
}

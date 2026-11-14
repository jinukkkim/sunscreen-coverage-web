import React, { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Card } from '@astryxdesign/core/Card';
import { Section } from '@astryxdesign/core/Section';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Banner } from '@astryxdesign/core/Banner';
import { Divider } from '@astryxdesign/core/Divider';
import { useCare } from '../hooks/useCare.js';
import { dayKey, formatDate, formatTime, latestRecord, nextDue, parseInput, timeline, uvAt } from '../lib/reapplication.js';

const inputStyle = { font: 'inherit', color: 'var(--color-text-primary)', backgroundColor: 'var(--color-background-surface)', border: 'thin solid var(--color-border)', padding: 'var(--spacing-2)', borderRadius: 'var(--radius-container)', maxWidth: '100%' };

export default function CareDashboard() {
  const model = useCare();
  const { care, now, forecast } = model;
  const [time, setTime] = useState(formatTime(Date.now())), [inputError, setInputError] = useState('');
  const last = latestRecord(care), due = nextDue(care, now), rows = timeline(care, now);
  const currentUv = uvAt(forecast, now, now);
  const remindersOn = care.enabled && care.activeDay === dayKey(now) && now <= Date.parse(`${dayKey(now)}T${care.endTime}:00+09:00`);
  function saveTime() {
    try { const at = parseInput(`${dayKey(now)}T${time}`, Date.now()); setInputError(''); model.record(at); }
    catch (cause) { setInputError(cause.message); }
  }
  return (
    <VStack gap={5}>
      {model.error && <Banner key={model.error} status="warning" title="확인이 필요합니다" description={model.error} isDismissable onDismiss={model.clearError} />}
      {model.alert && <Banner status="warning" title="재도포할 시간입니다" description={`${model.alert.detail} ${model.alert.location} ${model.alert.notificationError || ''}`} role="alert" isDismissable onDismiss={model.dismiss} endContent={<Button label="지금 바르고 기록하기" onClick={() => model.record()} />} />}
      <Grid columns={{ minWidth: 240, max: 3 }} gap={4}>
        <Card><VStack gap={2}><Text type="supporting">직전 도포 시각</Text><Heading level={2}>{last ? formatTime(last.at) : '기록 없음'}</Heading><Text type="supporting">{last ? `${formatDate(last.at)} · 직접 기록` : '실제로 바른 뒤 기록해 주세요.'}</Text></VStack></Card>
        <Card><VStack gap={2}><Text type="supporting">다음 재도포 시각</Text><Heading level={2}>{due ? formatTime(due.at) : '기록 후 안내'}</Heading><Text type="supporting">{due ? due.at <= now ? '예정 시각 지남 · 아직 재도포 기록 없음' : `약 ${Math.ceil((due.at - now) / 60000)}분 뒤 · 도포 기록 기준` : '오늘 종료 시각 안의 예정이 없습니다.'}</Text></VStack></Card>
        <Card><VStack gap={2}><Text type="supporting">현재 구간 UV 예보</Text><Heading level={2}>{currentUv ? currentUv.value : '확인 전'}</Heading><Text type="supporting">{currentUv ? `${formatTime(Date.parse(currentUv.validFrom))}–${formatTime(Date.parse(currentUv.validTo))} 구간 · 실측값 아님` : '위치와 기상청 데이터 연결 후 표시'}</Text></VStack></Card>
      </Grid>
      <Grid columns={{ minWidth: 300, max: 2 }} gap={4} align="start">
        <Section padding={4}>
          <VStack gap={4}>
            <Heading level={2}>바른 시각 기록</Heading>
            <Text>직접 바른 시각을 기준으로 다음 알림을 계산합니다.</Text>
            <Button variant="primary" label="지금 발랐어요" onClick={() => model.record()} />
            <VStack gap={2}>
              <label htmlFor="application-time"><Text type="label">오늘 이전에 바른 시각 (한국 시간)</Text></label>
              <input id="application-time" type="time" value={time} onChange={event => setTime(event.target.value)} required style={inputStyle} />
              <Button label="입력한 시각 저장" onClick={saveTime} />
              {inputError && <Text as="p" role="alert">{inputError}</Text>}
            </VStack>
            <Text type="supporting">최근 30일 기록을 이 브라우저에 보관하고 페이지를 열 때 정리합니다. 새로고침 후에도 유지되며, 위치 좌표는 저장하지 않습니다.</Text>
          </VStack>
        </Section>
        <Section padding={4}>
          <VStack gap={4}>
            <Heading level={2}>오늘의 알림 설정</Heading>
            <HStack wrap="wrap" gap={2} vAlign="center">
              <Button label={remindersOn ? '오늘 알림 끄기' : '오늘 야외활동 알림 켜기'} onClick={model.toggleReminders} />
              <Text type="supporting">{remindersOn ? '화면 알림 사용 중' : '화면 알림 꺼짐'}</Text>
            </HStack>
            <VStack gap={2}>
              <label htmlFor="end-time"><Text type="label">오늘 알림 종료 시각 (한국 시간)</Text></label>
              <input id="end-time" type="time" value={care.endTime} onChange={event => model.setEndTime(event.target.value)} style={inputStyle} />
            </VStack>
            <HStack wrap="wrap" gap={2}>
              <Button label={model.deviceEnabled ? '기기 알림 끄기' : '기기 알림 허용하기'} onClick={model.deviceEnabled ? model.disableNotifications : model.enableNotifications} />
              <Text type="supporting">{model.deviceEnabled ? '이 페이지에서 기기 알림 사용' : model.permission === 'denied' ? '브라우저 알림 권한 거부됨' : '화면 알림만 사용'}</Text>
            </HStack>
            <Text type="supporting">알림은 페이지가 보이는 동안 동작합니다. 잠금·절전·탭 전환 중에는 늦어질 수 있으며, 돌아오면 지난 알림을 한 번 표시합니다. 매일 새로 켜 주세요.</Text>
          </VStack>
        </Section>
      </Grid>
      <Section padding={4}>
        <VStack gap={4}>
          <Heading level={2}>현재 위치와 자외선 예보</Heading>
          <CheckboxInput label="알림마다 새 위치를 확인해 UV 예보 갱신" description="위치 확인에 동의하면 지금과 재도포 알림 시점에 위치를 요청합니다. 약 0.001도 단위 좌표를 앱 서버로 보내고, 기상청에는 인근 지점 코드만 전송합니다. 좌표는 저장하지 않습니다." value={model.locationEnabled} onChange={model.toggleLocation} />
          <HStack wrap="wrap" gap={3} vAlign="center">
            <Button label="현재 위치·예보 다시 확인" isDisabled={!model.locationEnabled} clickAction={model.refresh} />
            <Text type="supporting">{model.locationStatus}</Text>
          </HStack>
          {forecast && <Text type="supporting">기상청 · 발표 {formatDate(Date.parse(forecast.publishedAt))} {formatTime(Date.parse(forecast.publishedAt))} · 조회 {formatTime(Date.parse(forecast.fetchedAt))} · 조회 후 1시간이 지나면 다시 확인이 필요합니다.</Text>}
        </VStack>
      </Section>
      <Section padding={4}>
        <VStack gap={4}>
          <Heading level={2}>{formatDate(now)} 하루 타임라인</Heading>
          <Text type="supporting">완료는 실제 도포 기록입니다. 이후 예정은 앞선 시각에 실제로 덧발랐을 때의 계획이며, 놓친 시각을 자동 완료하지 않습니다.</Text>
          {rows.length === 0 ? <Text>오늘의 첫 도포를 기록하면 타임라인이 시작됩니다.</Text> :
            <VStack as="ol" gap={0} style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {rows.map(row => {
                const uv = uvAt(forecast, row.at, now);
                return <VStack as="li" key={row.id} gap={0}>
                  <HStack paddingBlock={3} gap={3} hAlign="between" wrap="wrap" vAlign="center">
                    <VStack gap={1}>
                      <Text type="label" hasTabularNumbers>{formatTime(row.at)} · {row.label}</Text>
                      <Text type="supporting">{row.kind === 'record' ? '완료 · 직접 기록' : row.overdue ? '예정 시각 지남 · 미기록' : '예정 · 2시간 간격'} · {uv ? `UV 예보 ${uv.value}` : 'UV 예보 없음'}</Text>
                    </VStack>
                    {row.kind === 'record' && <Button size="sm" variant="ghost" label={`${formatTime(row.at)} 기록 취소`} onClick={() => model.remove(row.id)} />}
                  </HStack><Divider />
                </VStack>;
              })}
            </VStack>}
        </VStack>
      </Section>
      <Banner status="info" title="예정 시각은 보호 시간의 측정값이 아닙니다" description="야외에서는 약 2시간마다, 수영하거나 땀을 흘린 뒤에는 바로 다시 바르세요. 제품 사용법을 우선 확인하세요. UV 예보에 따라 알림 간격을 자동으로 늘리거나 줄이지 않습니다." />
    </VStack>
  );
}

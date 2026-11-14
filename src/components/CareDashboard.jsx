import React, { useState } from 'react';
import KmaUV from './KmaUV.jsx';
import UpcomingTimeline from './UpcomingTimeline.jsx';
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
import { dailyEnd, dayKey, formatDate, formatTime, latestRecord, nextDue, parseInput, policyAt, recordSourceLabel, timeline, uvAt } from '../lib/reapplication.js';

const inputStyle = { font: 'inherit', color: 'var(--color-text-primary)', backgroundColor: 'var(--color-background-surface)', border: 'thin solid var(--color-border)', padding: 'var(--spacing-2)', borderRadius: 'var(--radius-container)', maxWidth: '100%' };

export default function CareDashboard({ model }) {
  const { care, now, forecast } = model;
  const [time, setTime] = useState(formatTime(Date.now())), [inputError, setInputError] = useState('');
  const last = latestRecord(care), due = nextDue(care, now, forecast), rows = timeline(care, now, forecast);
  const currentUv = uvAt(forecast, now, now);
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
      <Grid columns={{ minWidth: 240, max: 3 }} gap={4}>
        <Card><VStack gap={2}><Text type="supporting">직전 도포 시각</Text><Heading level={2}>{last ? formatTime(last.at) : '기록 없음'}</Heading><Text type="supporting">{last ? `${formatDate(last.at)} · ${recordSourceLabel(last)}` : '실제로 바른 뒤 기록하거나 동작 관찰을 완료해 주세요.'}</Text></VStack></Card>
        <Card><VStack gap={2}><Text type="supporting">다음 재도포 시각</Text><Heading level={2}>{policy.minutes === null ? '알림 대기' : due ? formatTime(due.at) : last ? '오늘 일정 종료' : '기록 후 안내'}</Heading><Text type="supporting">{policy.minutes === null ? due ? `UV 상승 예보 · ${formatTime(due.at)} 재개 예정` : 'UV 0–2 · 선택 도포' : due ? due.at <= now ? '예정 시각 지남 · 아직 재도포 기록 없음' : `약 ${Math.ceil((due.at - now) / 60000)}분 뒤 · ${due.minutes}분 주기 적용` : '오늘 종료 시각 안의 예정이 없습니다.'}</Text></VStack></Card>
        <Card><VStack gap={2}><Text type="supporting">현재 구간 UV 예보</Text><Heading level={2}>{currentUv ? currentUv.value : '확인 전'}</Heading><Text type="label">{policy.label}</Text><Text type="supporting">{currentUv ? `${formatTime(Date.parse(currentUv.validFrom))}–${formatTime(Date.parse(currentUv.validTo))} 구간 · 실측값 아님` : '위치와 기상청 데이터 연결 후 자동 적용'}</Text></VStack></Card>
      </Grid>
      <UpcomingTimeline care={care} now={now} forecast={forecast} />
      <Grid columns={{ minWidth: 300, max: 2 }} gap={4} align="start">
        <Section padding={4}>
          <VStack gap={4}>
            <Heading level={2}>바른 시각 기록</Heading>
            <Text>동작 관찰 완료 시각을 자동 기록합니다. 직접 바른 시각도 입력할 수 있습니다.</Text>
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
            <Text type="label">적용 주기: {policy.minutes === null ? '알림 대기 (선택 도포)' : `${policy.minutes}분`}</Text>
            <Text type="supporting">UV 0–2 대기 · UV 3은 150분 · UV 4–5는 120분 · UV 6–7은 80분 · UV 8 이상은 60분</Text>
            <HStack wrap="wrap" gap={2} vAlign="center">
              <Button label={remindersOn ? '오늘 알림 끄기' : '오늘 야외활동 알림 켜기'} onClick={model.toggleReminders} />
              <Text type="supporting">{remindersOn ? policy.minutes === null ? '알림 사용 중 · 낮은 UV로 대기' : '화면 알림 사용 중' : '화면 알림 꺼짐'}</Text>
            </HStack>
            <VStack gap={2}>
              <label htmlFor="end-time"><Text type="label">오늘 알림 종료 시각 (한국 시간)</Text></label>
              <input id="end-time" type="time" value={care.endTime} onChange={event => model.setEndTime(event.target.value)} style={inputStyle} />
            </VStack>
            <HStack wrap="wrap" gap={2}>
              <Button label={model.deviceEnabled ? '기기 알림 끄기' : '기기 알림 허용하기'} onClick={model.deviceEnabled ? model.disableNotifications : model.enableNotifications} />
              <Text type="supporting">{model.deviceEnabled ? '이 페이지에서 기기 알림 사용' : model.permission === 'denied' ? '브라우저 알림 권한 거부됨' : '화면 알림만 사용'}</Text>
            </HStack>
            <Text type="supporting">알림은 페이지가 보이는 동안 동작합니다. 잠금·절전·탭 전환 중에는 늦어질 수 있으며, 돌아오면 지난 알림을 한 번 표시합니다. 매일 동작 완료 또는 알림 버튼으로 켜 주세요.</Text>
          </VStack>
        </Section>
      </Grid>
      <Section padding={4}>
        <VStack gap={4}>
          <Heading level={2}>현재 위치와 자외선 예보</Heading>
          <CheckboxInput label="알림마다 새 위치를 확인해 UV 예보 갱신" description="동의하면 지금과 동작 완료·알림 시점에 새 위치를 확인합니다. 예보는 마지막 확인 위치 기준으로 30분마다 자동 갱신합니다. 약 0.001도 단위 좌표를 앱 서버로 보내고, 기상청에는 인근 지점 코드만 전송합니다. 좌표는 저장하지 않습니다." value={model.locationEnabled} onChange={model.toggleLocation} />
          <HStack wrap="wrap" gap={3} vAlign="center">
            <Button label="현재 위치·예보 다시 확인" isDisabled={!model.locationEnabled} clickAction={model.refresh} />
            <Text type="supporting">{model.locationStatus}</Text>
          </HStack>
          {forecast && <Text type="supporting">기상청 · 발표 {formatDate(Date.parse(forecast.publishedAt))} {formatTime(Date.parse(forecast.publishedAt))} · 조회 {formatTime(Date.parse(forecast.fetchedAt))} · 조회 후 1시간이 지나면 다시 확인이 필요합니다.</Text>}
          <Divider />
          <KmaUV forecast={forecast} now={now} />
        </VStack>
      </Section>
      <Section padding={4}>
        <VStack gap={4}>
          <Heading level={2}>{formatDate(now)} 도포 기록</Heading>
          <Text type="supporting">직접 입력하거나 동작 관찰을 마친 시각입니다. 앞으로의 일정은 위의 재도포 안내에서 확인하세요.</Text>
          {rows.filter(row => row.kind === 'record').length === 0 ? <Text>오늘의 도포 기록이 없습니다.</Text> :
            <VStack as="ol" gap={0} style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {rows.filter(row => row.kind === 'record').map(row => {
                const uv = row.kind === 'plan' ? row.uv : uvAt(forecast, row.at, now)?.value;
                return <VStack as="li" key={row.id} gap={0}>
                  <HStack paddingBlock={3} gap={3} hAlign="between" wrap="wrap" vAlign="center">
                    <VStack gap={1}>
                      <Text type="label" hasTabularNumbers>{formatTime(row.at)} · {row.label}</Text>
                      <Text type="supporting">{row.kind === 'record' ? `완료 · ${recordSourceLabel(row)}` : `${row.overdue ? '예정 시각 지남 · 미기록' : '예정'} · ${row.minutes}분 주기`} · {uv !== null && uv !== undefined ? `UV 예보 ${uv}` : 'UV 예보 없음 · 기본 주기'}</Text>
                    </VStack>
                    {row.kind === 'record' && <Button size="sm" variant="ghost" label={`${formatTime(row.at)} 기록 취소`} onClick={() => model.remove(row.id)} />}
                  </HStack><Divider />
                </VStack>;
              })}
            </VStack>}
        </VStack>
      </Section>
      <Banner status="info" title="예정 시각은 보호 시간의 측정값이 아닙니다" description="표의 UV 구간별 주기는 앱의 알림 설정 기준입니다. 수영·발한 후에는 제품의 재도포 안내를 우선 확인하세요. UV를 확인할 수 없으면 기본 120분 주기를 적용합니다." />
    </VStack>
  );
}

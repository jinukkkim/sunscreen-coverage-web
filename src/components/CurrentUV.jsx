import React, { useEffect, useRef, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Banner } from '@astryxdesign/core/Banner';
import { requestCurrentUv, formatCurrentUvTime } from '../lib/current-uv.js';

export default function CurrentUV({ now = Date.now() }) {
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState({ loading: false, data: null, error: null });
  const active = useRef(null);
  useEffect(() => () => { active.current?.abort(); }, []);
  function changeConsent(value) {
    setConsent(value);
    if (!value) { active.current?.abort(); active.current = null; setState({ loading: false, data: null, error: null }); }
  }
  async function query() {
    if (!consent || active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setState({ loading: true, data: null, error: null });
    try {
      const data = await requestCurrentUv({ signal: controller.signal });
      if (!controller.signal.aborted) setState({ loading: false, data, error: null });
    } catch (error) {
      if (!controller.signal.aborted) setState({ loading: false, data: null, error });
    } finally { if (active.current === controller) active.current = null; }
  }
  const { loading, data, error } = state;
  const stale = data && (data.stale || now - Date.parse(data.occurredAt) > data.staleAfterHours * 3600000);
  return <VStack gap={3}>
    <Heading level={3}>현재 지역 자외선지수</Heading>
    <Text type="supporting">생활안전지도 자료를 별도로 조회합니다. 기존 기상청 구간 예보와 재도포 알림 계산은 그대로 유지됩니다.</Text>
    <CheckboxInput label="현재 지역 UV 조회를 위한 위치 전달에 동의" description="동의 후 버튼을 누를 때만 위치를 확인합니다. 약 0.001도 단위 좌표를 앱 서버와 VWorld에 전달해 지역명을 확인하며, 좌표는 저장하지 않습니다. 생활안전지도에는 좌표를 보내지 않습니다." value={consent} onChange={changeConsent} />
    <Button label="현재 위치 기반 UV 조회" isDisabled={!consent || loading} onClick={query} />
    {loading && <Text role="status">현재 위치 및 자외선지수 확인 중</Text>}
    {error && <Banner status="warning" title="현재 지역 UV 조회 실패" description={error.message} role="alert" />}
    {data && <VStack gap={2} aria-live="polite">
      <Text>조회된 지역명: {data.region.name}</Text>
      <Text>자외선지수: {data.value}{stale ? ' (오래된 자료)' : ''}</Text>
      <Text>데이터 기준시각: {formatCurrentUvTime(data.occurredAt)} (한국 시간)</Text>
      <Text type="supporting">데이터 출처: 행정안전부 생활안전지도</Text>
      {stale && <Banner status="warning" title="조회 데이터의 기준시각이 오래됨" description={`기준시각으로부터 ${data.staleAfterHours}시간이 지난 자료입니다. 현재 시점의 최신 값으로 사용하지 마세요.`} />}
    </VStack>}
  </VStack>;
}

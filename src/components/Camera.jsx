import React, { useEffect, useRef, useState } from 'react';
import { createCameraSession } from '../lib/camera.js';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Section } from '@astryxdesign/core/Section';

export default function Camera() {
  const video = useRef(null);
  const session = useRef(null);
  const request = useRef(0);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  useEffect(() => () => {
    request.current += 1;
    session.current?.stop();
  }, []);

  function stop() {
    request.current += 1;
    session.current?.stop();
    setStatus('idle');
    setError('');
  }

  async function start() {
    const token = ++request.current;
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('카메라를 사용할 수 없습니다. HTTPS 또는 localhost에서 접속해 주세요.');
      return;
    }
    session.current ??= createCameraSession({
      getUserMedia: constraints => navigator.mediaDevices.getUserMedia(constraints),
      video: video.current,
    });
    setStatus('loading');
    try {
      if (await session.current.start() && token === request.current) setStatus('active');
    } catch (cause) {
      if (token !== request.current) return;
      setStatus('idle');
      setError(cause.name === 'NotAllowedError'
        ? '카메라 권한을 허용한 후 다시 시도해 주세요.'
        : '카메라를 열지 못했습니다. 장치와 연결 상태를 확인해 주세요.');
    }
  }

  return (
    <Section padding={4}>
      <VStack gap={3}>
        <Heading level={2}>카메라</Heading>
        <video ref={video} autoPlay muted playsInline hidden={status !== 'active'} aria-label="카메라 미리보기" style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', transform: 'scaleX(-1)', borderRadius: 'var(--radius-container)' }} />
        {status !== 'active' && <Text>{status === 'loading' ? '카메라 권한을 확인하고 있습니다.' : '카메라를 켜면 내 모습이 표시됩니다.'}</Text>}
        <Text role="status">{status === 'active' ? '카메라 사용 중 · 분석은 실행되지 않습니다.' : status === 'loading' ? '카메라 연결 중' : '카메라 꺼짐'}</Text>
        {error && <Text role="alert">{error}</Text>}
        <HStack wrap="wrap" gap={2}>
          <Button label="카메라 켜기" onClick={start} isDisabled={status !== 'idle'} />
          <Button label={status === 'loading' ? '연결 취소' : '카메라 끄기'} onClick={stop} isDisabled={status === 'idle'} />
        </HStack>
        <Text type="supporting">영상은 브라우저 미리보기에만 사용하며 저장하거나 외부 서버로 전송하지 않습니다.</Text>
      </VStack>
    </Section>
  );
}

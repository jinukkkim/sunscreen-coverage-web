import React, { useEffect, useRef, useState } from 'react';
import { createCameraSession } from '../lib/camera.js';

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
    <section className="card" aria-labelledby="camera-title">
      <h2 id="camera-title">카메라</h2>
      <div className="camera-stage">
        <video ref={video} autoPlay muted playsInline aria-label="카메라 미리보기" />
        {status !== 'active' && <p>{status === 'loading' ? '카메라 권한을 확인하고 있습니다.' : '카메라를 켜면 내 모습이 표시됩니다.'}</p>}
      </div>
      <p role="status">{status === 'active' ? '카메라 사용 중 · 분석은 실행되지 않습니다.' : status === 'loading' ? '카메라 연결 중' : '카메라 꺼짐'}</p>
      {error && <p role="alert">{error}</p>}
      <div className="actions">
        <button onClick={start} disabled={status !== 'idle'}>카메라 켜기</button>
        <button className="secondary" onClick={stop} disabled={status === 'idle'}>{status === 'loading' ? '연결 취소' : '카메라 끄기'}</button>
      </div>
      <p className="muted">영상은 브라우저 미리보기에만 사용하며 저장하거나 외부 서버로 전송하지 않습니다.</p>
    </section>
  );
}

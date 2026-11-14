import React, { useEffect, useRef, useState } from 'react';
import { createCameraSession } from '../lib/camera.js';
import { createVisionSession } from '../lib/vision-session.js';
import { getDisplayPoint } from '../lib/face-regions.js';

const emptyAnalysis = { phase: 'stopped', reason: '', geometry: null, hands: [], regions: [], detectedCount: 0 };
function FaceOverlay({ analysis, video }) {
  const canvas = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(canvas.current.parentElement);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const element = canvas.current, source = video.current;
    const ratio = window.devicePixelRatio || 1;
    element.width = size.width * ratio; element.height = size.height * ratio;
    const context = element.getContext('2d');
    context.scale(ratio, ratio);
    if (!analysis.geometry || !source?.videoWidth || !size.width) return;
    const display = point => getDisplayPoint(point, {
      videoWidth: source.videoWidth, videoHeight: source.videoHeight,
      stageWidth: size.width, stageHeight: size.height, mirrored: true,
    });
    for (const region of analysis.geometry.regions) {
      const points = region.polygon.map(display);
      const status = analysis.regions.find(item => item.id === region.id)?.status;
      context.beginPath();
      points.forEach((p, i) => i ? context.lineTo(p.x, p.y) : context.moveTo(p.x, p.y));
      context.closePath();
      context.fillStyle = status === 'detected' ? '#70d39b66' : status === 'observing' ? '#ffca5c66' : '#ffffff19';
      context.strokeStyle = status === 'detected' ? '#9ff2bc' : status === 'observing' ? '#ffca5c' : '#ffffffbb';
      context.lineWidth = 2; context.fill(); context.stroke();
      const x = points.reduce((sum, p) => sum + p.x, 0) / points.length;
      const y = points.reduce((sum, p) => sum + p.y, 0) / points.length;
      context.font = '600 13px system-ui'; context.textAlign = 'center';
      context.strokeStyle = '#1f2e29'; context.lineWidth = 4;
      context.strokeText(region.label, x, y); context.fillStyle = 'white'; context.fillText(region.label, x, y);
    }
    for (const hand of analysis.hands) for (const index of [8, 12, 16]) {
      const point = hand[index];
      if (!point || !Number.isFinite(point.x + point.y)) continue;
      const p = display(point); context.beginPath(); context.arc(p.x, p.y, 4, 0, 2 * Math.PI);
      context.fillStyle = '#ffca5c'; context.fill();
    }
  }, [analysis, size, video]);
  return <canvas ref={canvas} className="camera-overlay" aria-hidden="true" />;
}

export default function Camera({ onAnalysisChange }) {
  const video = useRef(null), session = useRef(null), vision = useRef(null);
  const request = useRef(0), alive = useRef(true), onChange = useRef(onAnalysisChange);
  onChange.current = onAnalysisChange;
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState(emptyAnalysis);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false; request.current++;
      vision.current?.stop(); session.current?.stop();
    };
  }, []);

  function stop() {
    request.current++;
    vision.current?.stop(); session.current?.stop();
    setStatus('idle'); setError(''); setAnalysis(emptyAnalysis);
  }
  function analyze() {
    vision.current ??= createVisionSession({
      video: video.current, onUpdate: update => {
        if (!alive.current) return;
        setAnalysis(update);
        onChange.current?.({ phase: update.phase, regions: update.regions, detectedCount: update.detectedCount });
      },
    });
    void vision.current.start();
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
      if (await session.current.start() && token === request.current) {
        setStatus('active'); analyze();
      }
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
      <h2 id="camera-title">얼굴 스캔과 동작 관찰</h2>
      <ol className="scan-steps" aria-label="사용 순서">
        <li>얼굴 맞추기</li><li>부위 확인</li><li>펴 바르기</li>
      </ol>
      <div className="camera-stage">
        <video ref={video} autoPlay muted playsInline aria-label="카메라 미리보기" />
        <FaceOverlay analysis={analysis} video={video} />
        {status === 'active' && !analysis.geometry && <div className="face-guide" aria-hidden="true" />}
        {status !== 'active' && <p>{status === 'loading' ? '카메라 권한을 확인하고 있습니다.' : '카메라를 켜면 내 모습이 표시됩니다.'}</p>}
      </div>
      <p role="status" className="camera-status">{status === 'active'
        ? analysis.reason || '카메라 사용 중'
        : status === 'loading' ? '카메라 연결 중' : '카메라 꺼짐'}</p>
      {error && <p role="alert">{error}</p>}
      {analysis.phase === 'error' && <p role="alert">인식 기능을 다시 준비해 주세요. 영상 미리보기는 계속 사용할 수 있습니다.</p>}
      <div className="actions">
        <button onClick={start} disabled={status !== 'idle'}>카메라 켜기</button>
        <button className="secondary" onClick={stop} disabled={status === 'idle'}>{status === 'loading' ? '연결 취소' : '카메라 끄기'}</button>
        {status === 'active' && analysis.phase !== 'error' && <button onClick={() => vision.current?.confirmScan()} disabled={analysis.phase !== 'ready'}>부위 확인 후 시작</button>}
        {status === 'active' && analysis.phase === 'tracking' && <button className="secondary" onClick={() => vision.current?.reset()}>다시 시작</button>}
        {status === 'active' && analysis.phase === 'error' && <button onClick={analyze}>분석 다시 시도</button>}
      </div>
      <p className="muted">머리카락과 손으로 얼굴이 가려지지 않게 부위를 먼저 확인해 주세요. 좌우는 내 얼굴 기준입니다.</p>
      <p className="muted">영상과 특징점은 브라우저 안에서만 분석하며 저장하거나 외부 서버로 전송하지 않습니다.</p>
    </section>
  );
}

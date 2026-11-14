import React, { useState } from 'react';
import Camera from './components/Camera.jsx';
import { REGIONS } from './lib/face-regions.js';

const phaseLabels = {
  stopped: '카메라 대기', loading: '인식 준비 중', scanning: '얼굴 스캔 중',
  ready: '부위 확인 대기', tracking: '동작 관찰 중', error: '분석 재시도 필요',
};
const statusLabels = { pending: '아직 감지되지 않음', observing: '동작 관찰 중', detected: '도포 동작 감지' };

export default function App() {
  const [analysis, setAnalysis] = useState({ phase: 'stopped', regions: [], detectedCount: 0 });
  return (
    <div className="app">
      <header><a className="brand" href="/">SunGuard</a><span>선크림 도포 동작 안내</span></header>
      <main>
        <div className="intro">
          <h1>얼굴 부위를 확인하고, 빠짐없이 펴 바르세요</h1>
          <p>얼굴을 먼저 맞춘 뒤 이마·코·양 볼·턱에서 손으로 펴 바르는 동작을 관찰합니다.</p>
        </div>
        <div className="workspace">
          <Camera onAnalysisChange={setAnalysis} />
          <section className="card" aria-labelledby="coverage-title">
            <h2 id="coverage-title">부위별 도포 동작</h2>
            <p className="badge">{phaseLabels[analysis.phase]}</p>
            <p role="status">5구역 중 <strong>{analysis.detectedCount}구역</strong>에서 동작 감지</p>
            <ul className="region-results">
              {REGIONS.map(region => {
                const status = analysis.regions.find(item => item.id === region.id)?.status || 'pending';
                return <li key={region.id} className={`region-result ${status}`}><strong>{region.label}</strong><span>{statusLabels[status]}</span></li>;
              })}
            </ul>
            {analysis.detectedCount === 5 && <p role="status">관찰 대상 5구역에서 동작을 감지했습니다.</p>}
            <p className="muted">관찰 범위는 정면 5구역입니다. 눈가·귀·목 등은 이번 관찰에 포함되지 않습니다.</p>
            <p className="muted">손의 동작을 확인하는 기능입니다. 선크림이 실제로 발렸는지, 양이 충분한지는 확인하지 못합니다.</p>
          </section>
        </div>
        <div className="supporting">
          <section className="card"><h2>자외선 정보</h2><p>기상 데이터 연결 준비 중</p></section>
          <section className="card"><h2>성분 분석</h2><p>제품 성분 분석 연결 준비 중</p></section>
          <section className="card"><h2>덧바름 알림</h2><p>알림 설정 기능 준비 중</p></section>
        </div>
        <p className="notice">제품 종류에 제한 없이 손으로 펴 바르는 동작을 대상으로 합니다. 실제 도포 인식 정확도는 아직 검증되지 않았으며, 도포량과 자외선 차단력을 측정하지 않습니다.</p>
      </main>
      <footer>2026 SunGuard contributors</footer>
    </div>
  );
}

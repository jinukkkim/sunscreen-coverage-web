import React from 'react';
import Camera from './components/Camera.jsx';
import ProductSetup from './components/ProductSetup.jsx';

export default function App() {
  return (
    <div className="app">
      <header><a className="brand" href="/">SunGuard</a><span>선크림 도포 인식</span></header>
      <main>
        <div className="intro">
          <h1>빠뜨린 부위를 알아차리는 선케어</h1>
          <p>카메라 입력부터 시작하세요. 도포 인식 기능은 준비 중입니다.</p>
        </div>
        <div className="workspace">
          <Camera />
          <section className="card" aria-labelledby="coverage-title">
            <h2 id="coverage-title">도포 인식 결과</h2>
            <p className="badge">인식 기능 연결 전</p>
            <p>아직 분석 결과가 없습니다.</p>
            <p className="muted">실제 인식 기능이 연결되면 이곳에 결과를 표시합니다.</p>
          </section>
        </div>
        <div className="supporting">
          <section className="card"><h2>자외선 정보</h2><p>기상 데이터 연결 준비 중</p></section>
          <ProductSetup />
          <section className="card"><h2>덧바름 알림</h2><p>알림 설정 기능 준비 중</p></section>
        </div>
        <p className="notice">일반 카메라를 이용한 실제 도포 인식 정확도는 아직 검증되지 않았습니다. 도포량과 자외선 차단력을 측정하지 않습니다.</p>
      </main>
      <footer>2026 SunGuard contributors</footer>
    </div>
  );
}

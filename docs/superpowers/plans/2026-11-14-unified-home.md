# Unified Home Implementation Plan

> 후속 단일 카메라 요청은 `2026-11-14-shared-camera` 설계·계획으로 대체. 아래 내용은 첫 홈 통합 단계의 기록.
> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 얼굴 크기 사용량 가이드와 기존 앱을 가이드 디자인의 한 홈으로 통합한다.
**Architecture:** React 홈에서 가이드 UI와 기존 RecognitionPanel, CareDashboard, ProductSetup을 조합한다. 기존 가이드 계산·입력 처리는 마운트/해제 가능한 컨트롤러로 보존하고 두 카메라는 동기적으로 상호 해제한다.
**Tech Stack:** React, Astryx, Vite, Playwright.
**Spec:** docs/superpowers/specs/2026-11-14-unified-home-design.md

## Global Constraints
- 한국어 UI, 브라우저 메모리에서만 사진·영상 처리.
- 5구역 완료 기록과 UV 정책·알림 종료 시각 보존.
- 기존 가이드의 흰색·주황색 디자인, Astryx 구성요소·토큰 사용.

## Review Focus
- 카메라 시작 권한 대기 중 다른 카메라 시작: 이전 요청 해제.
- React StrictMode 재마운트: 중복 이벤트/스트림 없음.
- 분석 취소·초기화·잘못된 이미지: 이전 결과 무효화.
- 사진 분석만 완료: 도포 기록 생성 없음.
- 모바일: 가로 넘침 없이 모든 기존 기능 접근 가능.

### Task 1: 홈 가이드와 디자인 통합
**Files:** src/App.jsx, src/components/FaceDoseGuide.jsx, src/components/HomeLayout.jsx, src/face-dose/main.js, src/main.jsx, themes/sunguard/, src/themes/sunguard/, tests/e2e/recognition-care.spec.js, index.html, face-dose.html
**Interfaces:** FaceDoseGuide({controlRef,onCameraStart}); mountFaceDose(root,{onCameraStart}) returns {stop,dispose}.
- [x] 홈 내 가이드 존재, 이전 URL 연결, 잘못된 업로드, 모바일 배치 테스트를 먼저 변경하고 실패 확인.
- [x] 기존 가이드 마크업을 Astryx로 옮기고 컨트롤러를 마운트/해제 함수로 변환.
- [x] 가이드 기준의 브랜드·히어로·단계·근거와 기존 기능을 홈에 배치. 이전 주소는 홈 앵커로 연결.
- [x] 새 테마 미리보기 확인 및 프로덕션 빌드.

### Task 2: 카메라 전환과 회귀 검증
**Files:** src/components/Camera.jsx, src/components/RecognitionPanel.jsx, src/App.jsx, tests/e2e/unified-home.spec.js, README.md
**Interfaces:** Camera({onAnalysisChange,controlRef,onCameraStart}); controlRef.current.stop()은 대기 요청·스트림·관찰을 해제.
- [x] 두 방향 카메라 전환과 대기 요청 취소 테스트 작성 및 실패 확인.
- [x] App의 ref로 다른 카메라를 시작 전에 정지. 숨김·종료 시 기존 해제 유지.
- [x] 전체 단위 테스트, Chrome E2E, 빌드, Astryx doctor 실행.
- [x] 데스크톱·모바일 스크린샷 확인, README 갱신, 최종 diff 검토.

## 실행 기록
- 기존 작업 폴더의 `feat/unified-home`에서 구현. 커밋·푸시·PR 생성은 요청받지 않아 수행하지 않음.
- 단위 테스트 기준선 134개 통과. 홈 통합 테스트는 기존 h1이 도포 인식이어서 실패하는 것을 확인한 뒤 구현.
- 7개 대상 브라우저 테스트 통과. 전체 실행에서 기존 테스트의 전역 video 선택자가 두 카메라와 충돌하여 동작 관찰 영역으로 범위를 좁힘.
- 가이드·관찰 전환과 대기 요청 취소, 계산 결과·초기화·기록 없음, 잘못된 업로드, 390/1440 폭 레이아웃 검증.
- 최종 검증: `npm test` 134/134, `npm run test:e2e` 22/22, `npm run build` 성공, `npx astryx doctor --built dist` fail 0.
- Astryx의 외부 Figtree 폰트 로딩 증명 경고와 Vite의 번들 크기 안내가 남아 있음.
- 별도 읽기 전용 코드 검토에서 Critical/Important/Minor 결함 없음.
- 390/1440 폭 최종 화면 및 테마 미리보기 확인. 실제 카메라 하드웨어는 검증하지 않음.

# Unified Care Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 제품 등록부터 도포 완료까지 메인 화면의 순차 흐름을 제공한다.
**Architecture:** 기존 ProductSetup, 측정 함수, RecognitionPanel, useCare를 재사용한다. App의 작은 흐름 컴포넌트가 현재 단계·제품·메모리 측정 결과를 소유하고 카메라 단계는 조건부 마운트한다.
**Tech Stack:** React, Astryx, MediaPipe, Vite, Node tests, Playwright Chrome.
**Spec:** docs/superpowers/specs/2026-11-15-unified-care-flow-design.md

## Global Constraints
- 새 의존성 없이 한국어 UI와 기존 테마·레이아웃을 유지한다.
- 사진·랜드마크·측정 결과는 메모리에서만 처리한다. 제품 라벨 외부 전송 동의를 유지한다.
- 다섯 부위 모두 100%일 때만 세션당 한 번 기록한다. UV 정책·알림 종료 시각을 보존한다.
- 현재 폴더의 기능 브랜치에서 실행한다. 기존 themes/는 보존한다. 커밋·푸시·PR은 이번 실행에 포함하지 않는다.

## Review Focus
- 재촬영 취소·늦은 모델 응답이 이전 결과를 복원하지 않아야 한다.
- 뒤로 이동·화면 숨김·완료 때 카메라 트랙을 해제해야 한다.
- 제품 삭제·수정 실패가 다음 단계 진입을 허용하면 안 된다.
- 스틱·스프레이에 크림용 토출 길이를 적용하면 안 된다.
- 수동 기록·새로고침이 스캔 완료를 가장하면 안 된다.

### Task 1: 등록·측정·용량 단계
**Files:** src/components/ProductSetup.jsx, src/components/FaceMeasurement.jsx, src/components/CareFlow.jsx, src/App.jsx; tests/e2e/unified-flow.spec.js, tests/e2e/helpers/flow.js.
**Interfaces:** ProductSetup({onProfileChange}); FaceMeasurement({onMeasured}) publishes scalar area/dose/width/height/sensitivity only. CareFlow({model}) owns step and measurement.
- [x] Write browser tests for product reuse, camera denial, measurement success, back navigation/cancellation and stick guidance; run against old app and observe missing flow failure.
- [x] Implement steps with explicit continue/back controls, guarded camera/model operations and local image fallback.
- [x] Run targeted tests and npm test.

### Task 2: 스캔 완료와 하단 대시보드 연결
**Files:** src/components/CareFlow.jsx, src/components/Camera.jsx, src/components/CareDashboard.jsx; tests/e2e/motion-completion.spec.js, tests/e2e/recognition-care.spec.js.
**Interfaces:** Reuse model.completeMotion; model.completion identifies a successful persisted/in-memory completion. Keep model mounted above steps.
- [x] Adapt existing motion browser tests to enter through registration and measurement; assert partial stays unrecorded and completion releases camera, records once, preserves endTime and enables reminders.
- [x] Implement completion view, new session entry and camera visibility cleanup; keep timeline and UV below steps with manual recording available.
- [x] Run relevant motion/recognition tests.

### Task 3: 검증과 문서
**Files:** README.md, design/plan docs.
- [x] Run npm test, npm run build, npm run test:e2e and npx astryx doctor --built dist.
- [x] Review mobile/desktop screenshots, inspect final diff with fresh reviewer and fix material findings.
- [x] Document flow and limitations; leave running Tailscale dev server available.

## Execution ledger
- Baseline: npm test passes 128/128 outside sandbox (inside sandbox socket binding fails with EPERM).
- Approved design: user requested implementation on 2026-11-15.

- Task 1: ProductSetup의 idle 상태만 다음 단계 진입 허용. FaceMeasurement는 기존 estimateFace/getFaceModel을 재사용하고 숫자 결과만 상위에 전달. 취소·숨김·이전 이동 시 generation과 트랙 해제로 늦은 결과 차단.
- Task 2: 성공한 model.completion으로 완료 화면 전환. 다섯 부위 완료 전 기록 없음, 완료 시 트랙 종료·세션당 한 번 기록·18:30 종료 시각 보존을 실제 흐름 E2E로 확인.
- Review: fresh reviewer found no material blockers; 완료 기록 취소 후 완료 화면이 남는 지적은 재현 테스트를 먼저 실패시킨 뒤 null completion 동기화로 수정.
- Verification: final complete Chrome E2E 27/27 (46.9s), unit/API 128/128; build succeeds; Astryx built output fail 0 (external font proof and existing theme ambiguity warnings). Source doctor also fail 0 with inline-style warnings. Mobile, measurement, dose and completion screenshots inspected.
- Product label test fixture initially omitted the actual API `{ok:true,result}` envelope; corrected the test double, then photo consent/candidate-to-measurement test passed.
- Runtime: existing Tailscale root HTTPS responds 200. Automatic approval rejected fetching a source file through that endpoint due to source exposure concerns; source fetch omitted, root response verified instead.
- Device limitation: synthetic camera/landmarks validate lifecycle and flow; physical phone capture, real face accuracy and product-specific dose calibration remain unverified.

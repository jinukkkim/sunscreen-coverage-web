# Face Dose Guide Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline; the user has requested implementation of the previously summarized feature.

**Goal:** 사진/카메라에서 실제 부분 얼굴 면적을 계산하고 표준 손가락 길이로 안내한다.
**Architecture:** pure geometry/dose modules + local MediaPipe service + DOM controller, responsive HTML/CSS. No backend.
**Tech Stack:** HTML, CSS, JavaScript, Vite, MediaPipe Tasks Vision 1.2.3, Node test.
**Spec:** ../specs/2026-11-14-face-dose-guide-design.md

## Global Constraints
- 부분 mesh 영역과 relative-z 한계를 결과와 함께 표시한다.
- 사용자 지정 10mL 제품의 미검증 토출값을 검증값으로 취급하지 않는다.
- 사진/영상과 원시 참가자 데이터를 커밋하지 않는다.
- feat branch; no push, PR creation or merge.

## Review Focus
- 비정면/작은 홍채/여러 얼굴에서 결과를 생성하지 않음.
- 새 사진/취소/재시도 중 오래된 분석이 결과를 덮어쓰지 않음.
- 모델 오류와 카메라 권한 거절 후 복구 가능.
- 부분면적·가정 토출량이 전체얼굴 개인별 권장량으로 보이지 않음.
- 모바일에서 캔버스와 사진 정렬 및 손가락 여러 구간 표시가 정상.

## Tasks
1. [x] Add tests for triangle units, iris scale invariance, face area math, depth-based turned-face rejection, and standard-only finger conversion. Implement `measurement.js`, `dose.js`, and the MediaPipe mesh topology. Tests pass.
2. [x] Implement same-origin model/WASM setup, MediaPipe loader, camera lifecycle, cancellable operation guard, capture/upload/retry/reset controller.
3. [x] Build the orange blueprint interface, three-step flow, measurement overlay/results, adjustable finger visualization, and calculation notes. Remove the React entry points. Update README, third-party notices, and source index.
4. [x] Run tests/build, check the previously captured sample through real model inference, and visually review desktop and mobile layouts. Perform local code review and leave the feature branch unpushed.

## Upload status

Implementation and local verification are complete on `feat/face-dose-guide`. The feature has not been pushed, and no pull request has been created.

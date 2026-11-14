# Face Dose Guide Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline; the user has requested implementation of the previously summarized feature.

**Goal:** 사진/카메라에서 일부 모델 얼굴 면적을 추정하고 표준 손가락 길이 참고값을 안내한다.
**Architecture:** main React app keeps its current behavior and links to a Vite multi-page HTML/CSS/JavaScript dose guide; both use same-origin MediaPipe assets.
**Tech Stack:** React/Vite app, standalone HTML/CSS/JavaScript guide, MediaPipe Tasks Vision 0.10.32, Node tests.
**Spec:** ../specs/2026-11-14-face-dose-guide-design.md

## Global Constraints
- 부분 mesh 영역과 relative-z 한계를 결과와 함께 표시한다.
- 사용자 지정 10mL 제품의 미검증 토출값을 검증값으로 취급하지 않는다.
- 사진/영상과 원시 참가자 데이터를 커밋하지 않는다.
- Keep this feature branch and preserve upstream product work. Resolve latest-main conflicts with a merge commit. Do not push without the user's explicit request.

## Review Focus
- 비정면/작은 홍채/여러 얼굴에서 결과를 생성하지 않음.
- 새 사진/취소/재시도 중 오래된 분석이 결과를 덮어쓰지 않음.
- 모델 오류와 카메라 권한 거절 후 복구 가능.
- 부분면적·가정 토출량이 전체얼굴 개인별 권장량으로 보이지 않음.
- 모바일에서 캔버스와 사진 정렬 및 손가락 여러 구간 표시가 정상.

## Tasks
1. [x] Add tests for triangle units, iris scale invariance, face area math, depth-based turned-face rejection, and standard-only finger conversion. Implement `measurement.js`, `dose.js`, and the MediaPipe mesh topology. Tests pass.
2. [x] Implement same-origin model/WASM setup, MediaPipe loader, camera lifecycle, cancellable operation guard, capture/upload/retry/reset controller.
3. [x] Build the orange blueprint interface, three-step flow, measurement overlay/results, adjustable finger visualization, and calculation notes. Integrate it as `/face-dose.html` and link from the main app. Reuse the shared, checksum-pinned face model assets.
4. [x] Run feature tests/build and review desktop/mobile layouts. The sample photo was used for local QA only and is not committed.

## Upload status

Implementation is available on `feat/face-dose-guide`; no user photos are committed. Resolve updates from `main` using a merge commit, run the complete suite, and only push the updated branch when requested.

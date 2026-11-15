# Persistent Camera Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 하나의 고정 카메라에서 제품 촬영부터 도포 완료까지 진행한다.
**Architecture:** CareFlow의 video ref와 Camera의 스트림 수명은 고정하고 ProductSetup/FaceMeasurement는 공유 프레임을 소비한다. RecognitionPanel은 진행률만 표시한다.
**Tech Stack:** 기존 React/Astryx/MediaPipe/Express/Playwright.
**Spec:** docs/superpowers/specs/2026-11-15-persistent-camera-design.md

## Global Constraints
- 제품 영역 촬영만 동의 후 Gemini로 전송, 얼굴 분석은 로컬 처리.
- 메인 흐름에 파일 선택 없음. 단계 전환은 스트림 유지, 숨김·완료는 해제.
- 기존 작업과 themes/ 보존. 커밋·푸시 없음.

## Review Focus
- 단계 변경 중 늦은 분석 결과 무시.
- 촬영 영역과 실제 전송 크롭 일치.
- 공유 video를 단계 변경 시 교체하지 않음.
- 얼굴 측정 이미지가 제품 요청으로 전달되지 않음.
- 완료 시 한 번 기록, 카메라 종료 후에도 영역 유지.

### Task 1: 카메라 공유와 촬영
- [x] 고정 video/스트림 유지·파일 입력 제거 E2E를 작성하고 실패 확인.
- [x] snapshotVideo 프레임 크롭, 고정 Camera 모드와 단계별 컨트롤 구현.
- [x] ProductSetup 촬영·자동 등록과 FaceMeasurement 로컬 분석 연결.

### Task 2: 스캔과 회귀 검증
- [x] 기존 E2E를 실시간 공유 카메라 기반으로 변경하고 완료·숨김 검증.
- [x] 단위 테스트·빌드·전체 Chrome E2E·Astryx doctor 실행.
- [x] fresh review·화면 확인·문서 갱신.

## Execution ledger
- User additionally requested original compact camera size with information on the right. Restored desktop two-column Grid; mobile stacks. Camera title/preview stays at the same document coordinates across steps.
- Red: old main had two file inputs. Green: same video DOM and one live stream retained across registration, measurement, guide and scan; automatic registration advances without candidate/file controls.
- Product image is a central crop matching the preview guide. Patterned square source -> outgoing 500x600 JPEG, green corners/center and no red area outside the guide. Consent gates transmission; cancellation ignores late API responses.
- Fresh review found draft loss on hidden tab. Red reproduction then fix: only recognizing returns to idle; manual/photo drafts remain editable with their contents intact.
- Existing unit/API baseline 128/128 and prior shared-camera full Chrome suite 27/27. Final complete Chrome suite: 31/31 passed (42.8s), unit/API 128/128 passed, production build passed, Astryx doctor fail 0 (2 warnings). Final suite includes crop/cancellation/draft/desktop layout and stable preview position cases. Desktop and mobile screenshots inspected.
- Removed orphan file-upload image helper after confirming no src/test consumers. No new dependencies, commits or pushes; user-owned themes/ untouched.
- Physical phone capture, real product OCR quality and face/dose accuracy are not verified by synthetic browser tests.

## Follow-up: 결과 확인과 등록 건너뛰기
- User requested displaying recognized product information before advancing. Removed automatic step transition on save; the existing product summary shows name/SPF/PA and the explicit next button controls navigation.
- Added registration skip before capture, during recognition, or after a saved product. Skipping aborts in-flight recognition through unmount cleanup, retains the shared camera and stored product, and excludes product-specific dose guidance for this flow.
- Added E2E coverage for summary-before-next, skip without camera/consent, skip with stored product, and late response after skip. Existing helpers now use the explicit next button.
- Follow-up verification: full Chrome E2E 34/34, unit/API 128/128, build successful, Astryx fail 0. Recognition result screenshot confirms compact camera left and product information plus next/skip controls right.

## Follow-up: 제품 촬영 화면 고정
- User requested holding the captured photo until continuing. Pause the existing video after product snapshot and retain the same live MediaStream; no extra image is persisted.
- Camera resumes playback when advancing/skipping/retaking. Recognition failure retains the photo with retry/retake controls; explicit cancellation resumes live preview. Camera off/hidden-tab handling still releases tracks and clears the frozen state.
- Added browser tests for pause throughout the pending API and recognized result, same-stream playback on next, and retake after recognition failure. Observed the missing pause fail before implementation.
- Freeze verification: full Chrome E2E 36/36 (44.9s), unit/API 128/128, build passed, Astryx fail 0, git diff --check clean. Real phone playback remains unverified.

## PR #18: 최신 main 충돌 통합
- Merge source: origin/main ca41654. Preserve existing team commits as the merge parent; no rebase, force push, or main-branch merge.
- Keep main's SunGuard theme/header/footer/FAQ, KMA-only current-period UV and horizontal timeline, accumulated regional timing, triangular mesh fill, large numbers, adjustable finger joint length, and automatic motion after two stable seconds.
- Retain this branch's explicit product result/next/skip, product snapshot pause/resume, local measurement, fixed video and single hardware stream.
- Final observation image composites the video and mesh in memory before tracks stop. Clear the live analysis layer after compositing. No camera image is saved to storage.
- Update face-photo FAQ to distinguish local face analysis from consented product-crop transmission.
- Adapt existing home/camera tests to the new step flow, retaining permission/model cancellation, auto-start, number sizing, failed remeasurement and responsive status-position coverage.
- Integration review identified FAQ copy contradiction and retained live overlay; both corrected. First full integration run 43/45 passed; the two observed failures were fixed and focused regression run passed 8/8.
- Staged whitespace check includes inherited main-only generated-file whitespace; PR-relative `git diff --check origin/main` is clean. Generated theme files kept unchanged.
- Final integrated verification: unit/API 144/144, Chrome E2E 45/45 (1.2m), build successful, Astryx fail 0 (2 existing warnings), PR-relative whitespace clean. Inspected integrated mobile/desktop and completed observation screenshots.

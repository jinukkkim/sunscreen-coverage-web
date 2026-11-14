# Motion Progress Accumulation Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 손 인식이 끊겨도 확인된 동작이 같은 부위 진행률에 누적되게 한다.
**Architecture:** 현재 손 궤적과 세션의 부위별 누적을 분리한다. 유효 범위가 확인된 움직이는 프레임만 부위별로 누적한다.
**Tech Stack:** JavaScript, Node test runner.
**Spec:** `docs/superpowers/specs/2026-11-14-motion-progress-accumulation-design.md`

## Global Constraints

- 시간은 코 1000ms, 턱 1500ms, 이마·양 볼 각각 2000ms. 경로 .45, 연속 관찰 범위 .08 기준을 유지한다.
- 영상·랜드마크는 브라우저 메모리에만 둔다. 의존성을 추가하지 않는다.

## Review Focus

- 미인식·긴 공백이 유효 시간으로 더해지지 않는가.
- 다른 부위의 동작이 서로 누적되지 않는가.
- 작은 떨림과 정지·머리 움직임이 진행률을 높이지 않는가.
- interrupt 이후 이어지고 reset 이후 지워지는가.
- 모든 부위 완료 전에는 완료 이벤트가 발생하지 않는가.

## Task 1: 누적 변경 및 회귀 검증

**Files:** `src/lib/rubbing-tracker.js`, `tests/rubbing-tracker.test.js`, `tests/vision-session.test.js`
**Interfaces:** `createRubbingTracker()`의 update/snapshot/interrupt/reset 인터페이스는 유지한다.

- [x] 반복되는 1초 동작이 진행률을 이어 올리는 테스트와 공백·정지·떨림 제외 테스트를 작성하고 기존 연속 관찰 전용 기대를 수정한다.
- [x] `node --test tests/rubbing-tracker.test.js tests/vision-session.test.js`로 새 누적 기대의 실패를 확인한다.
- [x] 부위별 시간·경로 누적을 추가하고 프레임 내 동일 부위 중복 가산을 방지한다.
- [x] 위 회귀 테스트, `npm test`, `npm run build`를 실행한다.
- [x] diff를 검토하고 로컬 서버에 반영한다. 커밋·푸시·PR은 이번 요청에 포함하지 않는다.

## Execution notes

- 사용자가 추천 설계를 승인했다. 새 worktree를 방금 정리한 세션이므로 현재 폴더의 `fix/motion-progress-accumulation`에서 직접 실행한다.
- 기준선: 포트 바인딩을 허용한 환경에서 기존 128개 테스트 통과. 샌드박스 안에서는 API 테스트가 listen EPERM으로 실패하여 허용 환경에서 검증한다.

- 결과: 전체 테스트 131개, Chrome 동작 완료 E2E 1개 통과. 빌드 성공. Astryx doctor 실패 0개(외부 Figtree 폰트 검증 경고), Vite 청크 크기·라이브러리 지시문 경고는 남아 있다.
- 재현 비교: 1초 동작/손 분실 반복 시 기존 부위 50% 정체 → 수정 후 45%, 90%, 100%. 초기 범위 확인 전 프레임은 제외한다.
- 실기기 카메라 보정은 미실시. 개발 서버에서 수정 모듈 응답 200을 확인했다.

## 후속 조정: 부위별 완료 시간

- [x] 사용자 승인값(코 1000ms, 턱 1500ms, 이마·양 볼 2000ms)의 조기 완료 방지·완료 경계 회귀 테스트를 추가하고 기존 코 기준 실패를 확인했다.
- [x] 시간 기준과 진행률 분모를 부위별로 적용하고 README 및 설계에 반영했다.

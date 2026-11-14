# Shared Camera Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans task-by-task.

**Goal:** 사용량 추정과 도포 관찰을 하나의 카메라와 작업 영역에서 제공한다.
**Architecture:** mountFaceDose 컨트롤러가 기존 createVisionSession과 동일 영상에서 사용량 계산을 관리한다. FaceOverlay와 부위 진행률은 React 표시 구성요소로 재사용한다.
**Tech Stack:** React, Astryx, MediaPipe, Playwright.
**Spec:** docs/superpowers/specs/2026-11-14-shared-camera-design.md

## Global Constraints
- 사진/영상은 메모리에서만 처리, 5구역 완료만 기록, 기존 UV 정책과 종료 시각 보존.
- 오늘의 선크림 박스 삭제, 내 선크림 등록 유지, 한국어 UI와 기존 테마.

## Review Focus
- 사용량 실패가 유효한 동작 관찰을 막지 않는지 확인.
- 사진 분석은 도포 기록을 만들지 않음.
- 중단 중 도착한 권한/모델 응답은 해제.
- 완료 뒤 새 도포에 두 번째 getUserMedia가 필요하지 않음.
- 숨김·추적 복구 시 누적과 단일 기록 정책 유지.

### Task 1: 단일 작업 영역
- [x] 단일 영상·제품 박스 없음·같은 스트림에서 계산과 동작 시작 E2E를 먼저 작성해 실패 확인.
- [x] Camera의 FaceOverlay를 별도 파일로 이동하고 RecognitionPanel은 전달된 analysis를 표시.
- [x] FaceDoseGuide에서 중복 완료 방지와 한 컨트롤러를 관리. main.js가 VIDEO 스캔의 geometry.landmarks를 계산에 재사용하고 확인/복구/재시작 제어 제공.
- [x] App 중복 카메라 섹션·상호 중지 refs 삭제, 이전 앵커는 같은 작업 영역으로 연결. 제품 박스 및 사용하지 않는 CSS 제거.

### Task 2: 회귀 검증
- [x] 기존 사진 분석과 취소/재시도, 카메라 중지/늦은 요청 해제 검증.
- [x] 기존 동작 완료·회복·기록·알림 E2E를 단일 영상에 맞게 유지하고 전체 단위 테스트 실행.
- [x] 데스크톱·모바일 화면 확인, 빌드·Astryx doctor와 코드 리뷰. 개발 서버에서 변경 제공.

## 실행 기록
- 한 개의 video/스트림으로 VIDEO 얼굴 특징점을 사용량 추정과 동작 관찰에 재사용. 제품 박스와 중복 Camera 구성요소 제거.
- 단일 video 테스트: 기존 2개 영상에서 실패 확인 후 구현. 투명 오버레이 테스트에서 기존 공통 canvas 배경이 영상을 가리는 것을 확인하고 수정.
- 사진 입력 검증·실제 디코딩·결과 초기화, 카메라 및 모델 로딩 중 취소 검증.
- 검토 발견 두 문제: 숨김 중 미완료 권한 요청의 뒤늦은 스트림 해제, 실패한 사용량 재확인 후 이전 값 제거. 각각 재현 테스트 실패 후 수정. 활성 관찰 중 탭 숨김/복구는 기존 진행률 보존 정책을 유지.
- 390/1440 폭 화면 확인. 실행 중인 localhost:5173 개발 서버에서 변경 제공 확인.
- 최종 검증: `npm test` 134/134, Chrome E2E 26/26, 프로덕션 빌드 성공, Astryx doctor fail 0 (기존 외부 폰트 로딩 확인 경고 유지). 실제 카메라 하드웨어는 미검증.

## PR 통합 검증
- 최신 `main`을 merge commit으로 반영하여 기상청 UV 통합과 삼각형 크림색 메시 표시 보존.
- 병합 후 `npm test` 141/141, `npm run test:e2e` Chrome 28/28, `npm run build` 성공, Astryx doctor fail 0, `git diff --check` 통과.

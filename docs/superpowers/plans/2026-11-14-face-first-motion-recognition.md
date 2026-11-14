# Face-first Motion Recognition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 얼굴 정면 5구역을 먼저 확인하고 제품 종류에 의존하지 않는 손의 펴 바르기 동작을 부위별로 표시한다.

**Architecture:** MediaPipe의 얼굴·손 특징점을 브라우저에서 추론한다. 순수 함수가 얼굴 좌표계·구역을 계산하고 상태를 가진 동작 추적기가 시간에 따라 관찰을 누적한다. 기존 카메라 수명 관리에 분석 세션을 연결하고 React가 오버레이와 부위별 결과를 표시한다.

**Tech Stack:** 기존 React 19/Vite 6/JavaScript ESM/Node 내장 테스트, `@mediapipe/tasks-vision`의 구현 시 확인한 고정 버전. 추가 ML 학습 프레임워크·백엔드는 도입하지 않는다.

**Spec:** [얼굴 스캔 후 부위별 도포 동작 인식](../specs/2026-11-14-face-first-motion-recognition-design.md)

## Global Constraints

- 제품 제한 없이 손으로 펴 바르는 동작부터 구현한다. 스틱·쿠션·분사 자체는 제외한다.
- 첫 범위는 이마·코·사용자 기준 왼쪽 볼·오른쪽 볼·턱의 5구역이다.
- `도포 동작 감지`만 표시한다. 실제 제품 전달·접촉·도포량·누락 면적·SPF·UVA 보호를 확정하지 않는다.
- 영상·프레임·특징점은 서버로 전송하거나 자동 저장하지 않는다. 원본 참가자 사진·영상·생체 특징점은 Git에 넣지 않는다.
- 코드 식별자는 영어, 사용자 문구는 한국어. 기존 카메라 취소·종료 보장을 유지한다.
- Node.js 22.12 이상. `npm ci`, `npm run dev`, `npm test`, `npm run build` 사용법을 유지한다.
- 구현은 `feat/face-first-motion-recognition` 브랜치에서 수행한다. 문서 브랜치의 미커밋 초안을 보존한 뒤 worktree/체크아웃을 준비한다. 기존 기여자의 커밋은 수정하지 않는다.
- 커밋 시 팀 규칙과 ship 스킬을 따른다. 푸시·PR은 요청받은 경우에만 하고, 병합은 하지 않는다. AI 기여 표기는 추가하지 않는다.

## Review Focus

- 얼굴 이동·영상 크롭·거울 반전이 구역과 손 좌표를 어긋나게 하지 않는지: Task 1 변환 검사, Task 4 화면 확인.
- 느린 추론·중복 타임스탬프·숨겨진 탭이 시간을 부풀리지 않는지: Task 2 시간 검사, Task 3 루프 검사.
- 두 손의 순서 변경·모호한 손 대응이 진행도를 합산하지 않는지: Task 2 순서 교환·동시 입력 검사.
- 종료 직후 완료된 비동기 로딩·모델 오류가 자원을 남기거나 새 세션 결과를 바꾸지 않는지: Task 3 취소·실패 검사.
- 얼굴 손실·복수 얼굴·재스캔에서 이전 사람의 결과가 남지 않는지: Task 3 세션 검사, Task 4 재시작 확인.

## 파일과 인터페이스

| 파일 | 책임 |
| --- | --- |
| `src/lib/face-regions.js` | 구역 정의, 얼굴 정규화, 시작 가능 품질 조건, 영상 표시 좌표 변환 |
| `src/lib/rubbing-tracker.js` | 손 대응·부위 할당·움직임/시간 누적과 세션 결과 |
| `src/lib/vision-session.js` | 모델 소유권·프레임 루프·상태 전환·정리 |
| `scripts/prepare-vision.mjs` | 고정 모델 확보·WASM 복사, 같은 출처 자산 준비 |
| `scripts/vision-assets.json` | 모델 URL·버전·SHA-256 및 패키지 버전 기록 |
| `src/components/Camera.jsx` | 기존 카메라 UI, 스캔 시작·결과·오버레이 연결 |
| `src/App.jsx`, `src/styles.css` | 실제 관찰 결과 영역과 레이아웃 |
| `tests/face-regions.test.js`, `tests/rubbing-tracker.test.js`, `tests/vision-session.test.js`, `tests/vision-assets.test.js` | 알고리즘 및 비동기 수명·자산 준비 검사 |
| `package.json`, `package-lock.json`, `.gitignore`, `README.md`, `THIRD_PARTY_NOTICES.md` | 재현 가능한 실행·자산 정책·라이선스 안내 |

공통 좌표는 미러링 전 원본 영상의 정규화된 `{x, y}`다. `RegionId`는 `forehead`, `nose`, `leftCheek`, `rightCheek`, `chin`이며 좌우는 사용자 기준이다. 상태 표시는 알고리즘의 신뢰도 퍼센트로 표현하지 않는다.

### Task 1: 얼굴 구역과 좌표 변환

**Files:** Create `src/lib/face-regions.js`, `tests/face-regions.test.js`.

**Interfaces:**
- `REGIONS`: `{id, label}` 5개 배열.
- `getFaceGeometry(landmarks, {width, height})`: 유효하지 않으면 `null`, 유효하면 `{regions, toFacePoint, quality}`. `regions`는 원본 정규화 좌표의 구역별 다각형, `toFacePoint(point)`는 영상 종횡비를 보정한 얼굴 기준 좌표, `quality`는 `{ready, reason}`.
- `locateRegion(geometry, points)`: 눈·입 제외와 경계 중복 처리를 거쳐 한 `RegionId` 또는 `null` 반환.
- `getDisplayPoint(point, {videoWidth, videoHeight, stageWidth, stageHeight, mirrored})`: cover 크롭과 반전을 적용한 화면 픽셀 좌표 반환.

- [ ] **Step 1:** 합성 얼굴 특징점 fixture로 테스트 작성: 구역 5개, 얼굴 바깥·눈·입은 `null`, 경계는 최대 한 구역, NaN/부족한 좌표는 `null`, 사용자 좌우 유지. 얼굴과 손을 함께 평행 이동·확대·회전했을 때 정규화 위치가 허용 오차 내 동일하고, 원본 종횡비가 바뀌어도 물리적으로 같은 위치를 반환하는지 검사한다. cover/반전의 중심·모서리 좌표도 검사한다.
- [ ] **Step 2:** `node --test tests/face-regions.test.js` 실행. 구현이 없어 실패하는지 확인한다.
- [ ] **Step 3:** Face Landmarker 공식 토폴로지를 기준으로 보수적인 다각형과 눈·입 제외 영역을 구현한다. 얼굴 중심·눈 간 거리·눈 축으로 로컬 좌표를 만들고 특이 변환은 거부한다. 정면 품질 조건의 수치는 코드 상수로 설명한다.
- [ ] **Step 4:** 같은 테스트와 기존 `npm test` 실행. 실제 피부/머리카락 분할을 구현한 것으로 설명하지 않는다.
- [ ] **Step 5:** 변경 검토 후 필요한 경우 `feat(src): add face regions and coordinate transforms`로 커밋한다.

### Task 2: 시간 기반 펴 바르기 동작 추적

**Files:** Create `src/lib/rubbing-tracker.js`, `tests/rubbing-tracker.test.js`.

**Interfaces:**
- Consumes Task 1의 `geometry`, `locateRegion`, `toFacePoint`.
- `createRubbingTracker()` → `{update, reset, snapshot}`.
- `update({geometry, hands, timestampMs})`: 손별 원본 특징점 배열과 단조 증가하는 밀리초 타임스탬프를 받아 부위 상태 반환.
- `snapshot()` → `{regions: [{id, status}], detectedCount}`. `status`는 `pending | observing | detected`.
- `reset()`은 모든 누적과 손 대응을 비운다. `geometry: null` 입력도 후보 연속성을 끊는다.

- [ ] **Step 1:** 테스트 작성: `2000ms`의 유효 문지름 후 감지, 정지 손·짧은 통과·얼굴만 이동은 미감지, 구역 변경은 후보 분리, 중복/역행 시간·`500ms` 초과 공백은 적립하지 않음, 손 검출 순서 교환과 두 손 동시 입력이 감지 시간을 줄이지 않음, 손 손실·모호한 대응은 연속 후보 초기화, `reset()`은 감지 결과도 제거.
- [ ] **Step 2:** `node --test tests/rubbing-tracker.test.js` 실행. 새 API 부재로 실패하는지 확인한다.
- [ ] **Step 3:** 손가락 끝/관절의 얼굴 기준 이동을 구역별로 누적한다. 손 대응은 이전 위치와 보수적 거리 기준으로 수행하고 모호하면 버린다. 작은 좌표 떨림과 큰 순간 이동은 유효 움직임에서 제외한다. 연속 문지름 시간 외에 관찰 창 안의 충분한 이동 범위도 요구한다. 임계값은 한곳의 상수로 두고 실기기 튜닝 전 값임을 기록한다. 카메라 z 값으로 실제 접촉을 판정하지 않는다.
- [ ] **Step 4:** 같은 테스트와 `npm test` 실행. 서로 다른 프레임 주기의 같은 궤적에서 결과가 일치하는지 확인한다. 공중 문지름도 감지될 수 있다는 한계는 테스트 이름/문서에서 숨기지 않는다.
- [ ] **Step 5:** 검토 후 필요한 경우 `feat(src): detect rubbing motion by face region`으로 커밋한다.

### Task 3: 모델 자산과 취소 가능한 분석 세션

**Files:** Create `src/lib/vision-session.js`, `scripts/prepare-vision.mjs`, `scripts/vision-assets.json`, `tests/vision-session.test.js`, `tests/vision-assets.test.js`, `THIRD_PARTY_NOTICES.md`; Modify `package.json`, `package-lock.json`, `.gitignore`, `README.md`.

**Interfaces:**
- `createVisionSession({video, onUpdate, loadModels, scheduleFrame, cancelFrame, isVisible})` → `{start, confirmScan, reset, stop}`. 기본 의존성은 실제 브라우저/MediaPipe 구현이며 테스트에서 대체할 수 있다.
- `loadModels()` → `{face, hand, close}`. `face`와 `hand`는 VIDEO 추론을 제공하고 `close()`는 둘 다 해제한다.
- `onUpdate({phase, reason, geometry, hands, regions, detectedCount})`; `phase`는 `loading | scanning | ready | tracking | error | stopped`.
- Task 1의 geometry와 Task 2의 tracker를 사용한다. 카메라 스트림 자체는 기존 `createCameraSession`이 소유한다.
- `prepare-vision.mjs`는 고정 모델 2개와 설치한 패키지의 WASM을 `public/vision/`에 준비한다. 생성 자산은 ignore하고, manifest와 라이선스 고지는 추적한다.

- [ ] **Step 1:** 모의 모델/스케줄러 테스트 작성: 얼굴·손 결과 연결, 안정된 얼굴 1개에서만 `ready`, 확인 전 동작 미누적, 얼굴 없음/복수 얼굴은 재스캔과 결과 초기화, 숨긴 탭/같은 video.currentTime은 추론·시간 누적 없음, 재시작·중단 후 늦은 로딩/콜백 무시 및 모델 해제, 부분 모델 로딩 실패 시 성공한 모델도 해제, 추론 오류는 `error`와 루프 종료.
- [ ] **Step 2:** 자산 준비 테스트 작성: 올바른 기존 자산은 재다운로드하지 않음, 체크섬 불일치는 거부, 다운로드 실패·부분 파일은 완성 자산으로 사용하지 않음, 같은 패키지 버전의 WASM을 복사함. 실제 네트워크 대신 임시 디렉터리와 모의 응답을 쓴다. `node --test tests/vision-session.test.js tests/vision-assets.test.js`에서 구현 부재 실패를 확인한다.
- [ ] **Step 3:** npm/공식 모델 배포에서 버전·라이선스를 확인해 패키지를 정확한 버전으로 추가한다. Face/Hand Landmarker의 고정 모델 URL과 SHA-256을 manifest에 기록한다. `npm run prepare:vision`을 만들고 `predev`, `prebuild`에서 실행하여 기존 명령이 자산을 준비하도록 한다. 자산 누락 시 네트워크가 필요하다는 점과 실패 시 재시도 명령을 README에 기록한다. 준비 후 런타임 자산 요청은 같은 출처로 한정한다.
- [ ] **Step 4:** 모델 생성과 단일 프레임 루프를 구현한다. 얼굴은 복수 얼굴 감지가 가능하게, 손은 최대 2개로 설정한다. 분석 주기를 제한하고 동일 프레임·겹친 추론을 막는다. 모델 준비 후 안정된 정면 얼굴을 기다려 `ready`, `confirmScan()` 후 `tracking`으로 전환한다. 중단은 토큰 무효화·콜백 취소·모델 close·참조 해제를 보장한다.
- [ ] **Step 5:** `npm test`, `npm run build` 실행. 준비 자산으로 재실행할 때 추가 다운로드가 없는지 확인한다. 모델 추론 정확도는 모의 테스트의 검증 범위가 아님을 기록한다.
- [ ] **Step 6:** 검토 후 필요한 경우 `feat(src): run local face and hand analysis sessions`로 커밋한다.

### Task 4: 카메라·오버레이·부위별 결과 연결과 검증

**Files:** Modify `src/components/Camera.jsx`, `src/App.jsx`, `src/styles.css`, `README.md`, `docs/README.md`; Create `docs/sunguard/05-motion-validation.md`.

**Interfaces:** `Camera`는 `onAnalysisChange(snapshot)`으로 Task 3의 화면용 상태를 부모에 전달한다. 부모는 부위별 결과를 표시한다. 원본 영상/랜드마크는 외부 서비스나 영구 저장소로 내보내지 않는다.

- [ ] **Step 1:** 기존 카메라 상태/취소 로직을 유지하며 모델 준비·재시도·`부위 확인 후 시작`·`다시 시작`을 연결한다. 카메라 끄기/해제는 분석도 먼저 중단한다. 영상 준비 전 모델 추론을 시작하지 않는다.
- [ ] **Step 2:** 같은 좌표 변환으로 영상 위 구역·손 관찰 위치를 표시한다. 색 외에 텍스트로도 상태를 구분하고 버튼·상태 안내를 키보드/스크린리더로 사용할 수 있게 한다. 거울 영상의 좌우 라벨과 cover 크롭을 확인한다.
- [ ] **Step 3:** 빈 결과 영역을 5구역의 `아직 감지되지 않음`, `동작 관찰 중`, `도포 동작 감지`로 바꾼다. 요약은 `5구역 중 N구역에서 동작 감지`이며, 눈가·귀·목 등은 관찰 범위 밖임을 안내한다. 실제 도포 완료·면적률·보호 성능으로 표현하지 않는다.
- [ ] **Step 4:** `npm test`, `npm run build`, `git diff --check` 실행 후 로컬 서버의 페이지/모델/WASM 응답과 브라우저 콘솔을 확인한다. 가능한 브라우저 환경에서 카메라 권한 거부·재시도·끄기·재스캔·페이지 해제를 확인한다. 실제 카메라/휴대폰 접근이 없으면 그 항목을 검증 완료로 적지 않는다.
- [ ] **Step 5:** 검증 문서에 장치/버전/조건/성공·오탐·추적 실패·지연을 기록하는 표를 만든다. 정지 손·통과·고개 이동·복수 얼굴·두 손·공중 문지름·빈손·이미 발린 상태를 구분한다. 원본 참가자 영상은 수집하지 않는다. 고정 화면 구역 방식과 비교할 실험 절차를 적고, 수행 전 수치 칸은 비워 둔다.
- [ ] **Step 6:** 새 실행/데이터 흐름/한계와 실기기 미확인 항목을 README에 반영한다. 검토 후 필요한 경우 `feat(src): show face scan and rubbing observations`로 커밋한다. 푸시·PR은 하지 않는다.

## 계획 자체 검토

- 얼굴 스캔·구역·가림 한계·좌표 정합성: Task 1/4에 포함.
- 유효 움직임·연속성·손 대응·시간: Task 2에 포함.
- 로딩 실패·중단·복수 얼굴·탭 비활성·재시도·정리: Task 3/4에 포함.
- 데이터 외부 전송 금지·동일 출처 자산·버전/라이선스·표시 범위: Task 3/4에 포함.
- 실제 도포 인식으로 발전시키는 실험은 설계의 후속 과제로 유지한다. 이번 구현에서 외관 차이를 실제 도포 결과로 추가하지 않는다.
- 실행 방식은 사용자가 선택한다. 모듈 간 인터페이스 의존성이 높고 초기 베이스라인이므로 같은 세션에서 직접 구현하고 마지막에 독립 검토를 받는 방식을 추천한다.

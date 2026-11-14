# 프로젝트 문서

2026 서울시립대학교 해커톤 팀의 선크림 도포 인식 웹 프로젝트를 위한 공동 조사·기획 문서다. GitHub에서 코드와 함께 관리한다.

## 현재 프로젝트

**선크림 도포 인식을 중심으로 하는 웹사이트 SunGuard.** 사용자가 2026-11-14에 선택했다. 콘서트 좌석 시뮬레이터는 이전 아이디어 기록이다.

1. [프로젝트 방향과 결정](sunguard/00-project.md)
2. [유사 서비스 조사](sunguard/01-competition.md)
3. [SunSense 상세 분석](sunguard/02-sunsense.md)
4. [기본 카메라 도포 인식의 가능성과 한계](sunguard/03-recognition-feasibility.md)
5. [출처와 확인 범위](sunguard/04-sources.md)
6. [도포 동작 검증 기록](sunguard/05-motion-validation.md)

## 구현 설계

- [얼굴 스캔 후 부위별 도포 동작 인식](superpowers/specs/2026-11-14-face-first-motion-recognition-design.md)
- [얼굴 스캔·도포 동작 인식 구현 계획](superpowers/plans/2026-11-14-face-first-motion-recognition.md)
- [재도포 기록·UV별 알림·하루 타임라인](superpowers/specs/2026-11-14-reapplication.md)
- [동작 진행률·완료 시각 자동 기록·UV별 알림 연결](superpowers/specs/2026-11-14-motion-completion-reminders.md)

## 문서 관리

선크림 관련 문서는 이 `docs/`에서 Git으로 관리하며 GitHub 게시 대상에 포함한다. 이전 아이디어의 문서·조사·소개 사이트는 프로젝트 루트의 `archive/`에 보존하고, `.gitignore`의 `/archive/` 규칙으로 제외한다.

프로젝트 루트에 `main` 브랜치의 로컬 Git 저장소를 초기화했다. GitHub 저장소는 `jinukkkim/sunscreen-coverage-web`, 공개, MIT 라이선스로 선택했다. MIT 저작권 표기는 `SunGuard contributors`이며 팀 공동 기여를 기준으로 한다. Claude 코드 리뷰·GitHub App·관련 시크릿 연결은 하지 않는다. [GitHub 저장소](https://github.com/jinukkkim/sunscreen-coverage-web)에 기본 파일을 업로드했다. 조사 문서는 별도 문서 PR로 관리한다.

웹 구현은 얼굴 스캔·정면 5구역의 도포 동작 관찰과 기록·UV별 재도포 알림·하루 타임라인·기상청 예보를 함께 제공한다. 동작 감지와 실제 선크림 도포 판단은 구분하며, `docs/sunguard/00-project.md`의 사용자 결정과 미검증 가정을 구분해 따른다.

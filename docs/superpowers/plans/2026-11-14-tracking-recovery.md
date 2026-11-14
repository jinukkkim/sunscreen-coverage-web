# Tracking Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Preserve motion progress across temporary face tracking loss.
**Architecture:** Separate transient hand track interruption from tracker reset. Add a recovering phase with a 2000ms grace period; preserve session progress through subsequent explicit rescan confirmation.
**Tech Stack:** React, Vite, node:test, Playwright.
**Spec:** docs/superpowers/specs/2026-11-14-tracking-recovery-design.md

## Global Constraints
- No new dependencies, storage or image transmission.
- Korean UI; progress measures observed motion only.
- No accumulation on invalid frames or across missing observations.
- Reset on explicit restart, stop or new session.

## Review Focus
- Recovery at 2000ms must require confirmation.
- Repeated invalid frames must not extend grace time.
- Frozen or hidden video must not resume automatically.
- Reconfirmation must preserve session ID and completed regions.
- Reset controls must be available while recovering and awaiting rescan.

### Task 1: Preserve progress and recover tracking
**Files:** src/lib/rubbing-tracker.js, src/lib/vision-session.js, src/components/Camera.jsx, src/components/RecognitionPanel.jsx, tests/vision-session.test.js, tests/rubbing-tracker.test.js, tests/e2e/motion-completion.spec.js.
**Interfaces:** tracker.interrupt() clears active hand tracks and timing only; snapshot/reset/update retain their interfaces. Session emits phase recovering during short loss and scanning/ready after longer interruptions.

- [x] Add regression tests for missing and invalid face recovery, 2000ms boundary, sustained loss, no accumulated missing time, preserved completed regions/session ID, hidden/stalled/multiple-face rescan, explicit reset/stop.
- [x] Run node --test tests/vision-session.test.js tests/rubbing-tracker.test.js; expect preservation/recovery tests FAIL before implementation.
- [x] Implement tracker.interrupt(), recoverable interruption and persistent confirmation. Keep original geometry validity gates and initial scan requirements.
- [x] Add recovering label, preservation guidance and reset controls; extend completion E2E with temporary face loss and return.
- [x] Run npm test, npm run build, npm run test:e2e, npx --no-install astryx doctor --built dist; expect zero test/build failures.
- [ ] Commit fix(src): preserve motion progress across tracking interruptions; no push until requested.

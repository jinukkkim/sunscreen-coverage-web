# 제품 등록·사진 인식·맞춤 솔루션 (기능 7) 설계

- 작성일: 2026-11-14 (같은 날 개정: 인식 방식을 브라우저 OCR에서 비전 모델로 변경, 배포를 Tailscale로 확정)
- 상태: 1차 구현 완료(`feat/product-profile`). 식약처 품목 매칭은 후속 작업.
- 담당 범위: 사용자가 처음에 선크림 제품 정보를 입력하거나 제품 사진을 찍으면 라벨을 읽어 초안을 만들고, 사용자가 확인한 뒤 저장하며, 그 제품에 맞춘 안내(솔루션)를 다른 기능에 제공한다.

## 1. 역할 정의

이 기능은 **제품 프로필(ProductProfile)** 을 만들고 보관하는 "입력 담당"이자, 다른 기능이 쓰는 **솔루션(Solution)** 을 파생하는 "공급자"다.

| 소비자 기능 | 이 기능이 넘기는 값 |
|---|---|
| 1 도포 인식 | `form`(스프레이·스틱 등) → 안내 문구 분기 |
| 3 재도포 알림 | `solution.reapply.intervalMinutes`, `solution.reapply.afterWater` |
| 5 양 추천 | `form`, `spf` → 제형별 권장량 힌트 |
| 6 하루 타임라인 | `reapply`, `waterResistance`, `flags` |

**하지 않는 것**: SPF 숫자로 "보호 시간"을 계산하지 않는다(README의 "임의 보호 시간 계산 금지"). 성분으로 개인 자극 여부나 안전성을 판정하지 않는다. 기존 프로토타입의 눈가 제외 규칙은 미검증이므로 "포함 성분 안내"까지만 한다.

## 2. 사용자 흐름

```
[첫 방문] → "내 선크림 등록" 카드
   ├─ (A) 사진으로 읽기: 앞면(SPF/PA) + 뒷면(전성분·책임판매업자, 선택)
   │        → 동의 체크(기본 해제) → 브라우저에서 축소 → POST /api/recognize
   │        → 비전 모델이 "보이는 것만" JSON으로 전사 → 서버가 스키마 검증
   │        → 후보 선택 (모델이 돌려준 읽기 1~3개: 한글/영문 표기, 라인명, SPF 표기 차이 등)
   │        → 편집 가능한 초안 (신뢰도 낮은 필드에 "확인 필요")
   └─ (B) 직접 입력: 같은 폼을 빈 상태로
→ "이 정보로 저장" → localStorage → 솔루션 카드 → 다른 기능에 공급
[재방문] → 저장된 프로필 자동 로드 · "다른 제품 등록"
```

인식 결과는 항상 **편집 가능한 초안**이고 사용자가 저장을 눌러야 확정된다. 인식이 실패하거나 서버에 키가 없으면 오류 문구와 함께 (B)로 이어진다.

## 3. 데이터 모델 (`src/lib/product.js`)

```js
ProductProfile {
  id, name, brand, sellerName,            // sellerName = 화장품책임판매업자
  spf: 15..100 | null, spfPlus: boolean,  // "50+" → spf 50, spfPlus true
  paGrade: 1..4 | null,
  form: 'cream'|'lotion'|'gel'|'stick'|'spray'|'unknown',
  waterResistance: 'none'|'40min'|'80min'|'unknown',
  ingredients: string[],                  // 소문자·공백 정규화, 순서 유지, 번역 안 함
  source: 'manual'|'photo-ai',
  confidence: { [field]: 0..1 },          // photo-ai 일 때만 의미
  mfds: null | { source, itemName, sellerName, reportNo },   // 후속: 식약처 매칭 결과
  registeredAt: ISO 8601
}
```

솔루션은 저장하지 않고 항상 `deriveSolution(profile)`로 계산한다.

```js
Solution {
  reapply: { intervalMinutes: 120, basis: 'general-guideline',
             afterWater: 'after-40min'|'after-80min'|'reapply-immediately'|'unknown' },
  amount: { formHint: form },
  uvFilters: string[],                    // 성분표에서 확인된 차단 성분 키
  flags: string[],                        // 'spray-rub-in' | 'stick-double-pass' | 'no-uva-rating' | 'no-spf-rating'
                                          // | 'contains-avobenzone' | 'contains-oxybenzone' | 'mineral-only'
  notes: string[]
}
```

`intervalMinutes`는 제품과 무관하게 120 고정이고 `basis`를 항상 남긴다. `flags`는 키만 돌려주고 문장 매핑은 컴포넌트(`ProductSolution.jsx`)가 한다.

## 4. 모듈 구성 (구현됨)

| 경로 | 역할 | 테스트 |
|---|---|---|
| `src/lib/product.js` | 스키마·`normalizeProfile`·`validateProfile`·`findUvFilters`·`deriveSolution` | `tests/product.test.js` |
| `src/lib/productStorage.js` | `loadProfile/saveProfile/clearProfile(storage)` — storage 주입, 키 `sunguard.product.v1`, 손상 데이터는 null | 같은 파일 |
| `src/lib/image.js` | `checkImageFile`, `downscaleImage`(긴 변 1280px, JPEG 0.85) | 수동(브라우저 전용) |
| `src/lib/labelRecognition.js` | `createVisionAdapter`(fetch 주입·타임아웃·취소), `recognizeLabel`, `draftFromRecognition`, `needsReview` | `tests/labelRecognition.test.js` |
| `src/components/ProductSetup.jsx` | Astryx 컴포넌트. 상태 머신 `idle → recognizing → choose → draft`, 동의 체크, 후보 선택(최대 3), 완전한 후보는 즉시 등록, 결측 시 폼, 등록 후 수정 | 수동 |
| `src/components/ProductSolution.jsx` | Astryx 컴포넌트. 저장된 프로필, 활동 환경 안내(Banner), 솔루션 문장, SPF·PA 설명과 기준표 | 수동 |
| `server/recognize.js` | `buildPrompt`, `RESPONSE_SCHEMA`, `validateImages`, `parseModelOutput`, `createGeminiCaller`, `createRecognizeHandler` | `tests/recognize.test.js` |
| `server/app.js` | `POST /api/recognize` 라우트(JSON 6MB 제한, 413/400 매핑), `/api/health`에 `recognitionConfigured` | 수동 |
| `vite.config.js` | `.ts.net` 호스트 허용 (API는 같은 출처라 프록시 불필요) | — |
| `tests/fixtures/recognition/` | 모델 응답 고정 픽스처(완전 라벨·앞면만·범위 밖·비JSON) | — |

테스트는 전부 `node --test`로 돌고 **실물 선크림이 필요하지 않다**. 모델 호출은 fetch를 주입해 가짜 응답으로 검증한다.

## 5. 인식 서버 설계

### 5.1 왜 서버인가

- 모델 API 키를 브라우저에 둘 수 없다.
- 이미지가 외부로 나가는 유일한 지점을 한 곳(`server/index.js`)으로 모아 정책을 지키기 쉽게 한다.

### 5.2 배포: Tailscale

`main`의 Express 서버(`server/index.js` → `server/app.js`)가 Vite 미들웨어와 `/api/*`를 한 프로세스(`npm run dev`, 기본 5173)로 제공하므로, `/api/recognize`는 `server/app.js`에 라우트로 올린다. 팀원 컴퓨터에서 `npm run dev`를 띄우고 `tailscale serve --bg 5173`으로 노출한다. HTTPS는 Tailscale이 종단하므로 휴대폰 카메라·파일 선택이 동작한다. Vite 6은 모르는 Host를 거절하므로 `vite.config.js`에 `allowedHosts: ['.ts.net']`을 둔다. 운영은 `npm run build` 후 `npm start`.

### 5.3 프롬프트 원칙 (`buildPrompt`)

- "인쇄된 것만 전사, 추측 금지, 전형적 값으로 채우지 말 것".
- 못 읽은 필드는 `null`과 `notVisible`로 보고.
- 성분명은 번역하지 않고 인쇄된 대로(한글/INCI).
- `candidates`: 제품 식별 필드(브랜드·제품명·책임판매업자·SPF·PA·제형·내수성)의 읽기를 최대 3개, 가능성 높은 순으로. 라벨이 여러 해석을 허용할 때만 복수. 사진에 없는 제품을 만들어 내지 않도록 명시. 서버는 중복을 제거하고 최상위 읽기를 항상 첫 번째로 둔다.
- Gemini `response_schema`로 JSON 형식을 강제하고, `temperature: 0`.

### 5.4 서버 측 방어 (`parseModelOutput`)

모델이 스키마를 지켰더라도 다시 검증한다: SPF 15~100 밖 → null + 신뢰도 0, PA 1~4 밖 → null, enum 밖 제형·내수성 → `unknown`, 성분 정규화·200개 제한, `notVisible`은 알려진 필드만, 신뢰도는 0~1로 클램프, 마크다운 코드펜스 제거, JSON 아니면 502. 내부 오류 메시지는 클라이언트에 노출하지 않는다.

### 5.5 운영 주의

- 기본 모델은 `gemini-3.8-flash`(2026-11 기준 안정 버전). 404가 나면 서버 로그에 구글 응답이 찍히며, `GEMINI_MODEL`로 교체한다. `.env`의 `GEMINI_MODEL`은 코드 기본값보다 우선한다.
- Windows 콘솔 창을 클릭하면 "선택 모드"가 되어 서버가 로그를 쓰는 순간 멈춘다(요청이 45초 타임아웃까지 걸려 보임). 서버 창은 건드리지 않거나, 멈췄으면 Esc.

### 5.6 제한

사진 최대 2장, 장당 2MB(축소 후), 요청 6MB, JPG/PNG/WebP만. 타임아웃 서버 30초·클라이언트 45초. 429는 그대로 전달해 화면이 "잠시 후 다시 시도"로 안내한다.

## 6. 데이터 전송·보관

[제품 사진 데이터 흐름](../../sunguard/05-product-photo-data-flow.md)에 정리했다. 요점: 제품 사진만, 동의 후, 축소본만 전송. 서버는 저장·로그 없음. 얼굴 카메라 영상은 전송 경로가 없다.

## 7. 카메라 충돌에 대한 결정

제품 사진은 `<input type="file" accept="image/*" capture="environment">`로 OS 카메라 앱을 호출한다. `getUserMedia` 스트림을 열지 않으므로 `Camera.jsx`(얼굴용 전면 스트림)와 장치를 다투지 않는다. 단, 모바일에서 얼굴 카메라가 켜진 상태로 OS 카메라 앱이 뜨면 OS가 기존 스트림을 끊을 수 있다. 이건 `Camera.jsx`의 `status`가 그대로 `active`로 남는 UI 불일치로 나타날 수 있으며, 해결은 기능 1 담당과 함께 `visibilitychange`에서 스트림 상태를 재확인하는 방식으로 한다(후속).

## 7.1 활동 환경 안내

`activityGuidance(profile)`는 라벨의 SPF·PA를 소비자 가이드 표(실내 15~30/PA+~++, 일상 30~50/PA+++, 장시간 야외 50+/PA++++)와 비교해 "… 기준으로 '<환경>'에 맞는 선크림을 사용하고 계십니다"를 만든다. 두 지수 중 낮은 쪽이 등급을 정하고, 하나만 있으면 그 사실을 문장에 덧붙인다. 코드에서 결정적으로 계산하며 모델을 호출하지 않는다(규칙이 3행이고, 모델 지연·표현 변동이 근거를 흐리기 때문). 보호 시간 계산이 아님을 화면에 명시한다.

## 8. 후속 작업

1. **식약처 품목 매칭** (`src/lib/productSearch.js`, `scripts/fetch-mfds-sunscreens.mjs`, `src/data/mfds-sunscreens.json`)
   - 보고품목 + 심사품목 API를 빌드 시점에 받아 품목명에 선/썬/sun/자외선/spf/uv가 들어간 것만 스냅샷.
   - 모델이 돌려준 `brand`·`productName`·`sellerName`으로 스코어링 → 상위 5 후보 → 사용자가 선택 → `profile.mfds`.
   - 매칭 결과는 "식약처 보고 품목 확인됨"까지만 뜻한다. SPF·성분의 출처는 여전히 라벨이다.
2. **`ProductContext`** — 다른 기능이 `useProduct()`로 프로필·솔루션을 읽는 단일 지점. 지금은 `ProductSetup`이 내부 상태로 들고 있다. 기능 3·5·6 담당이 연결 시점을 정하면 추가한다.
3. **여러 제품 저장** — `v1` 키 안에 배열로 확장 가능. 팀 결정 대기.
4. **모델 티어 약관 확인** — 사용 중인 Gemini 티어의 데이터 사용 조건을 데이터 흐름 문서에 반영.

## 9. 수동 검증 체크리스트 (PR 설명에 적을 것)

- [ ] iPhone Safari·Android Chrome에서 Tailscale 주소로 접속, 앞면 사진 선택 → 초안 표시 → 저장 → 새로고침 후 유지.
- [ ] 동의 체크 없이 "사진으로 읽기" → 전송 없이 오류 문구.
- [ ] 서버 미실행 상태 → 네트워크 오류 문구 → 직접 입력으로 저장 가능.
- [ ] `GEMINI_API_KEY` 없이 서버 실행 → 503 → 화면 안내.
- [ ] 얼굴 카메라를 켠 채 제품 사진 촬영 → 돌아왔을 때 얼굴 카메라 상태 관찰(7절).
- [ ] 광택 튜브 1개, 종이 박스 1개 이상으로 SPF/PA/전성분 전사 품질 확인.

# 출처와 확인 범위

조사일: 2026-11-14. 대화에서 열람·검색한 출처를 정리했다. 현재 문서 정리 작업에서 웹 내용을 새로 재검증하지 않았다. 공급자 설명·연구·판단을 구분하며, 검색·코드 확인만으로 실제 정확도를 검증했다고 주장하지 않는다.

## 사용자 사이트

- https://1.tail381297.ts.net/ — 로컬 네트워크의 공개 HTML로 당시 프로젝트 제목과 설명 확인.
- https://1.tail381297.ts.net/assets/index-BHQ3h_SM.js — 당시 배포 청크의 화면 문구·구역·기능 흐름 확인. 파일 해시는 배포 변경 시 달라질 수 있다. 카메라 실제 실행·백엔드 분석 성공·위치·알림은 시험하지 않았다.

## 경쟁 서비스 공식 자료

- [SunSense](https://www.sunsense.app/) — 본문·공개 HTML·연결·삽입 이미지 확인. 앱 설치·정확도 검증 없음.
- [Pavise 제품](https://pavise.com/products/uv-camera), [FAQ](https://pavise.com/pages/faq) — 하드웨어·앱·원리·호환 설명. 운영자 주장.
- [UVLens](https://uvlens.com/), [Google Play](https://play.google.com/store/apps/details?id=com.spark64.uvlens.mobile) — UV·알림 기능과 앱 안내.
- [SunSmart](https://www.sunsmart.com.au/resources/sunsmart-app), [WHO](https://www.who.int/tools/sunsmart-global-uv-app), [2024 업데이트](https://www.who.int/news/item/16-07-2024-sunsmart-global-uv-app-launches-with-new-features-to-enhance-sun-protection) — 공공보건 앱·위치별 UV·알림.
- [INKEEDecoder](https://inkeedecoder.com/), [사진·텍스트 분석](https://inkeedecoder.com/decode-inci) — 구 INCIDecoder의 리디렉션·이름 변경·입력 방식 확인.
- [화해](https://play.google.com/store/apps/details?hl=ko&id=kr.co.company.hwahae) — 공식 앱 설명과 개별 리뷰. 평점·다운로드·전체 리뷰 수는 동적이며 이번 결론의 근거 숫자로 사용하지 않음.
- [Yuka](https://yuka.io/en/app/) — 화장품 평가·대체 제품 설명.
- [INCI Beauty App Store](https://apps.apple.com/me/app/inci-beauty-cosmetic-scanner/id1276113963) — 스토어 설명. 공식 웹 robots 제한.
- [Sunscreenr 원 개발자 FAQ](https://www.kickstarter.com/projects/sunscreenr/sunscreenrtm-is-your-skin-protected/faqs) — 과거 제품의 광학 구성. 현재 판매 상태 미확인.
- [동명 SunSense UV tracker](https://apps.apple.com/us/app/sunsense-uv-tracker/id1228142293), [센서 제품](https://sunsense.com/pages/get-started) — sunsense.app과 운영 관계 미확인.

## 연구·기술 근거

- [FDA 자외선 차단제 시험 기준 (21 CFR 201.327)](https://www.fda.gov/media/85172/download) — SPF 시험에서 2mg/cm²로 제품을 도포하는 기준. 본 앱은 그 시험량을 면적 계산에 차용하며, 해당 인물·제품의 권장량이나 보호력 측정으로 해석하지 않음.
- [MediaPipe Face Landmarker Web 문서](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker) — 얼굴 랜드마크 모델 및 웹 실행 구성. 이 문서는 landmark 검출 API 근거이며 본 면적 환산의 정확도를 검증한 자료가 아님.

- [Assessing Sunscreen Protection Using UV Photography: Descriptive Study](https://derma.jmir.org/2021/1/e24653/), 2021, DOI 10.2196/24653 — 원문 확인. 전용 UV 장비의 도포 관찰·일부 색조 제품 한계. 일반 RGB 기반 SunSense의 검증 논문이 아니다.
- [Quantifying the visual appearance of sunscreens applied to the skin using indirect computer image colorimetry](https://pubmed.ncbi.nlm.nih.gov/29080360/), 2018 — 검색 초록에서 외관 색 차이 측정 확인. 직접 페이지 추출은 불완전. 보호 성능 측정으로 해석하지 않음.
- [The erythema Q-score, an imaging biomarker for redness in skin inflammation](https://pubmed.ncbi.nlm.nih.gov/33113259/), 2021, DOI 10.1111/exd.14224 — 초록·공개 연구 내용 확인. 홍반 영상 분석의 가능성과 평가 필요성.
- [UV imaging reveals facial areas that are prone to skin cancer are disproportionately missed during sunscreen application](https://pmc.ncbi.nlm.nih.gov/articles/PMC5624581/), 2017 — 검색 추출 수준. UV 촬영을 사용한 누락 관찰.
- [Soft, stretchable, epidermal sensor with integrated electronics and photochemistry for measuring personal UV exposures](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0190233), 2018 — 검색 추출 수준. 감응 패치의 색을 스마트폰으로 읽는 방식이며 맨피부 RGB 도포 검출과 다름.
- [UV-Sensitive Wearable Devices for Colorimetric Monitoring of UV Exposure](https://onlinelibrary.wiley.com/doi/10.1002/adom.201901969), 2020 — 검색 초록 수준. UV 감응 염료·웨어러블을 사용하며 추가 소재가 필요.
- [UV reflectance photography of skin: what are you imaging?](https://onlinelibrary.wiley.com/doi/full/10.1111/ics.12591) — 검색 추출 수준. UV 광학계·센서·필터 검토.
- [FDA 자외선 차단제 안내](https://www.fda.gov/drugs/understanding-over-counter-medicines/sunscreen-how-help-protect-your-skin-sun), [AAD 제품 선택](https://www.aad.org/public/everyday-care/sun-protection/shade-clothing-sunscreen/how-to-select-sunscreen) — SPF·보호 범위 설명. 특정 성분만으로 개인별 자극을 단정하는 근거로 사용하지 않음.

## 조사 한계

SUNFIT·SunSense의 실제 도포 검출 성능, 데이터셋, 임상·독립 성능 평가를 확보하지 못했다. 문헌의 가능성을 해당 제품의 성능으로 옮기지 않는다. 이번 조사는 기술의 불가능 증명이나 전 세계 경쟁 서비스 전수조사가 아니다.

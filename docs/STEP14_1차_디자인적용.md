# STEP 14 디자인 적용 — 1차

범위: 공통 디자인 시스템·역할별 앱 쉘·HR 대시보드. 다른 업무 페이지 본문 디자인은 2차 이후에 적용한다. 인증·권한 함수·Server Actions·업무 서비스·DB 스키마·기존 개발 데이터는 변경하지 않았다. Git 커밋은 하지 않았다.

## 디자인 기준 및 공통 컴포넌트

- 확정 screen.png에 맞춘 네이비 사이드바, 흰 헤더, 밝은 배경, 파란색 포인트와 사각형 UI.
- DESIGN.md 상단 색상 토큰 및 이미지 기준: 배경 #faf8ff, 사이드바 #283044, 버튼 #2563eb, 테두리 #c3c6d7.
- Tailwind v4 `@theme` 색상·타이포그래피·간격·0px radius 토큰. 전체 요소와 가상 요소에 0px 모서리를 적용한다.
- Noto Sans KR은 기존 next/font 방식으로 빌드 시 가져와 자체 호스팅한다. 새 패키지나 CDN Tailwind 스크립트를 추가하지 않았다.
- AppShell, Sidebar, Topbar: 역할별 실제 메뉴, 현재 사용자, 기존 알림 수와 로그아웃, 개발용 전환 링크 유지.
- Icon, Button, LinkButton, Badge, Panel, StatCard, EmptyState: 기존 폼 속성을 전달하는 기본 UI.
- 1280px 미만에서는 사이드바를 메뉴 버튼으로 여는 방식으로 전환한다. 좁은 화면은 단일 콘텐츠 열과 표 전용 가로 스크롤을 사용한다.
- 인쇄 시 공통 쉘과 메뉴를 제거하고 콘텐츠 여백을 해제한다. 기존 review-data.module.css는 수정하지 않았다.

기존 HR·직원 layout의 requireRole 검사는 그대로 유지했다. 최상위 layout은 기존 getCurrentUser·알림 수 조회를 사용하고 AppShell에 화면에 필요한 사용자 정보만 전달한다. DB 접근 코드는 클라이언트 컴포넌트로 이동하지 않았다.

## 실제 데이터 연결

| 영역 | 데이터 및 의미 |
|---|---|
| 진행 중 승진심사 | 기존 정의인 RESULT 외 회차 수 |
| 검토 대기 신청서 | 진행 중 회차의 SUBMITTED 신청서 수 |
| 보완 요청 건수 | 진행 중 회차의 RETURNED 신청서 수 |
| 재확인 필요 | 기존 step_schedule의 review_needed=Y 인원 |
| 승진심사 진행 표 | 실제 회차명·신청 기간·상태·신청 인원·상태별 인원 및 기존 회차별 신청 현황 경로 |
| 처리 대기 정정 요청 | correction_request의 PENDING 건수. 기존 표시를 업무 안내 영역에 보존 |
| 비교 상태별 인원 | 기존 MATCH/MISMATCH/NO_MANUAL/UNDETERMINED/EXCLUDED 집계와 기존 필터 링크 |
| 계산 완료 | calc_status=OK 인원 |
| 승급 관리 분모 | EXCLUDED를 제외한 저장 일정 수 |
| 확정 완료 | 관리 대상 중 확정값이 있고 재확인 대상이 아닌 인원 |
| 확정·재확인 분포 | 확정 완료 / 재확인 필요 / 나머지 확정 전의 서로 겹치지 않는 세 그룹 |
| 최근 처리 내역 | 최신 process_history 5건, 실제 처리자와 KST 시각. 상세 JSON·비밀번호 등은 조회하지 않음 |
| 최근 산정 시각 | 실제 calculated_at의 최댓값. 산정 전이면 재계산 안내 |

모든 추가 대시보드 조회는 읽기 전용이다. 대시보드 방문 자체로 업무 이력·접근기록을 추가하지 않는다. 참고 화면의 예시 사용자·숫자·날짜·운영 버전·마감 규칙은 사용하지 않았다. 통합 검색·가상 월별 배치·가짜 다운로드·기능 없는 페이지 버튼도 추가하지 않았다.

## 메뉴와 동작

- HR: 홈, 승진심사 회차, 차기승급일 관리, 승급 안내 메일, 메일 발송함, 알림함, 처리 이력, 접근기록, Mock ERP, 기준정보.
- 회차별 경로에서는 현재 roundId의 대상자 선정·신청서 검토·심사 자료·결과 등록 링크를 추가 표시한다.
- 직원: 내 정보, 내 승진 신청서, 내 메일함. HR 메뉴나 HR 알림 수는 표시하지 않는다.
- 로그인·개발 전환 화면에는 사이드바 없이 공통 헤더를 표시한다. production 전환 차단은 기존 구현을 유지한다.
- 실제 사용자 이름·역할·ID를 표시한다. 직책·부서·재직 상태를 임의로 만들지 않는다.
- 메뉴와 상세 이동 링크는 prefetch를 끄고, 기존 상세 열람 기록이 사전 로딩으로 증가하지 않도록 한다.
- Button은 type·formAction·name·value·disabled를 그대로 전달한다. 기존 로그인·로그아웃·알림 액션은 수정하지 않았다.

## 검증 결과

- `npm test`: **35개 파일, 267개 테스트 통과** (기존 256개 + 신규 11개).
- `npm run build`: 통과. 한글 폰트의 최초 다운로드가 샌드박스에서 차단되어 승인된 외부 빌드로 완료했다.
- 수정 TypeScript/TSX 파일 ESLint: 오류·경고 없음.
- 공통 쉘 6개 테스트: HR/직원 메뉴, 실제 사용자·알림, 공개 화면, 회차별 링크·활성 상태, 버튼 속성 전달, 사각형·반응형·인쇄 CSS 규칙.
- 대시보드 5개 테스트: 빈 데이터, 실제 회차 집계·경로, 관리 제외 및 재확인 중복 방지, 실제 최근 이력, HR 권한 실패.
- 기존 접근성 AST 검사의 범위를 src/components까지 확장했다.
- 기존 대시보드/알림 테스트는 데이터·권한 기대값을 유지하고 새 폰트와 usePathname의 테스트 경계만 보완했다.

자동 검증은 test.db 및 서버 렌더링/정적 검사 기준이다. 실제 브라우저의 픽셀 비교, 메뉴 클릭·Escape·Tab, 인쇄 미리보기는 아직 검증하지 않았다.

## 변경 파일

아래 코드는 web/ 기준이다.

| 파일 | 내용 |
|---|---|
| src/app/globals.css | 디자인 토큰·공통 UI·쉘·대시보드·반응형·인쇄 스타일 |
| src/app/layout.tsx | Noto Sans KR·공통 AppShell 연결 |
| src/app/hr/page.tsx | 실제 DB 기반 대시보드 디자인 |
| src/components/layout/app-shell.tsx | 공통 화면 구조·작은 화면 메뉴 |
| src/components/layout/sidebar.tsx | 역할별 메뉴와 실제 링크 |
| src/components/layout/topbar.tsx | 위치·실제 사용자·알림·기존 계정 액션 |
| src/components/layout/navigation.ts | 역할별 메뉴·회차 경로·활성 메뉴 |
| src/components/ui/icon.tsx | 패키지 없는 SVG 아이콘 |
| src/components/ui/primitives.tsx | 버튼·배지·패널·통계 카드·빈 상태 |
| src/components/layout/app-shell.test.tsx | 공통 쉘 및 UI 검증 |
| src/app/hr/dashboard.int.test.tsx | 실제 DB 대시보드 검증 |
| src/app/hr/p2-pages.int.test.tsx | 새 폰트·현재 경로 모의 경계 |
| src/lib/accessibility.test.ts | 공통 컴포넌트 검사 추가 |

추가 문서: docs/STEP14_1차_디자인적용.md. 총 14개 파일.

## 브라우저 확인 항목과 다음 단계

1. HR 로그인 후 /hr의 디자인과 확정 이미지 비교. 실제 데이터가 없을 때 0과 빈 상태가 표시되는지 확인.
2. 1440px 이상 데스크톱, 1280px 전후 노트북, 768px·모바일 폭에서 메뉴·표·긴 사용자 이름 확인.
3. 작은 화면 메뉴 열기·닫기·Escape, 키보드 포커스·본문 바로가기 확인.
4. 로그아웃·개발 사용자 전환·알림함 이동, 회차별 링크, 직원 메뉴와 HR 접근 차단 확인.
5. 심사 자료 인쇄 미리보기에서 메뉴가 숨겨지고 A4 사람별 페이지가 유지되는지 확인.

2차 후보: HR 회차 목록·대상자 선정·신청 현황·신청서 검토·결과 등록·승급 목록/상세·메일/이력/접근기록/설정/Mock ERP 본문, 직원 홈·신청서·메일함, 로그인·개발 전환 본문. 이번에는 이 페이지들의 본문을 다시 구성하지 않았다.

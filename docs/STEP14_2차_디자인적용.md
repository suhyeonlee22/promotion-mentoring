# STEP 14 디자인 적용 — 2차

1차의 AppShell·Sidebar·Topbar·전역 토큰·Button·Badge를 유지하면서 나머지 화면 본문에 디자인을 적용했다. 인증·권한 함수·Server Actions·업무 서비스·DB 조회 조건·라우팅·DB 스키마를 변경하지 않았다. 개발 DB를 초기화하거나 계정·업무 데이터를 수정하지 않았다. 기존 1차 미커밋 변경을 보존했고 Git 커밋은 하지 않았다.

## 적용 범위

| 구분 | 적용 화면 |
|---|---|
| HR 승진 | 회차 목록·생성, 후보자 선정·근거, 신청 현황·정정 처리, 신청서 상세 검토, 결과 등록·안내 |
| HR 승급 | 목록·비교 필터·재계산·일괄 확정, 상세·계산 근거·확정, 안내 메일 발송 |
| HR 조회 | 알림함, 메일 발송함, 처리 이력·JSON 펼침, 접근기록·통계 |
| HR 관리 | 기준정보 수정, Mock ERP 발령·수기 대장 편집 |
| 직원 | 홈·본인 승급 정보·최근 메일, 승진 신청서·정정 요청·작성 폼, 메일함 |
| 계정 | 로그인, 개발용 사용자 전환 |
| 인쇄 | A4 심사 자료 페이지·인쇄 CSS·인쇄 버튼은 기존 구현을 보존 |

총 19개 페이지와 작성/메일 발송 클라이언트 폼 2개에 공통 UI를 연결했다. 1차 HR 대시보드 본문과 공통 쉘은 다시 구성하지 않았다.

## 공통 디자인

- `PageHeader`: 기존 실제 제목과 설명을 사용하는 흰색 헤더, 파란색 사각 포인트.
- `Surface`: 기존 section의 ID·자식·조건부 표시를 유지하는 사각 패널.
- `DataTable`: 기존 caption·헤더·행·셀·폼을 그대로 보존하고 키보드로 접근할 수 있는 가로 스크롤 영역 제공.
- `FilterBar`: 기존 GET 방식과 필드를 그대로 전달하는 필터 패널.
- `StatusBadge`: 기존 상태 코드를 데이터 속성에 보존하고 한글 상태 텍스트와 색상을 함께 표시. 상태 판정이나 전이 규칙은 변경하지 않음.
- 1차 `Button` 재사용: 기존 type·name·value·formAction·disabled·자식 텍스트 보존.
- 전역 토큰을 사용하는 입력·표·메일 펼침·로그 상세·직원 정보·오류/성공 안내 스타일 추가.
- 로그인은 단일 열 입력 패널, 개발 전환은 실제 계정 목록 그리드로 구성.
- 모바일에서 폼과 계정 목록은 단일 열로 전환하고 표는 영역 내부에서 가로 스크롤.
- 기존 0px 전역 모서리 규칙과 포커스 표시, label 연결·scope 속성 유지.

예시 사용자·수치·날짜·새 업무 규칙·기능 없는 버튼을 추가하지 않았다. 페이지 링크는 기존 href를 유지하고 prefetch를 꺼 상세 열람 기록이 사전 로딩으로 증가하지 않도록 했다.

## 기능 및 계약 보존 점검

1. 초기 UI 연결 전후 21개 뷰의 action·formAction·href·name·value·defaultValue·required·disabled·maxLength·method·type·autoComplete 속성을 비교했다. 동일함을 확인한 후 저장했다.
2. 19개 페이지의 db 쿼리, requireRole·notFound·접근기록 관련 호출을 기존 소스와 대조했다. 줄바꿈을 정규화한 비교에서 모두 동일했다.
3. 기존 Server Actions, services, domain, db, session, package 파일에 2차 변경이 없다.
4. 기존 입력값 보존·임시저장·최종 제출·정정 승인/반려·확정·메일 중복 방지·변경 감지·권한·접근기록 테스트를 전체 실행에 포함했다.
5. 인쇄 전용 page.tsx·review-data.module.css·print-button.tsx는 수정하지 않았다.

## 검증 결과

| 검증 | 결과 |
|---|---|
| 전체 `npm test` | **37개 파일, 297개 테스트 통과** — 기존 267개 + 신규 30개 |
| `npm run build` | 통과, 기존 경로 유지 |
| 수정 TS/TSX 파일 ESLint | 오류·경고 없이 통과 |
| 공통 UI 테스트 | 표 caption·행/열 헤더·키보드 스크롤, GET 필터, 실제 제목·ID·상태 텍스트 |
| 화면 폼 계약 테스트 | 18개 뷰의 기존 액션 및 필드 연결 |
| 이동 경로 테스트 | 8개 뷰의 기존 회차 ID·직원 번호·비교 필터·메일·개발 전환 경로 |
| 인쇄 구조 테스트 | A4·사람별 페이지 분리·행 분리 방지 규칙 유지 |
| 실제 브라우저 조작 | 미수행, 아래 수동 확인 필요 |

초기 ESLint에서 새 상태 배지 배열의 key 누락과 테스트의 일반 a 링크가 발견되어 수정했다. 업무 계산 기대값이나 기존 테스트의 업무 결과는 변경하지 않았다. 테스트는 test.db에서 실행했다.

## 이번 2차 변경 파일 (26개)

아래 코드는 `web/` 기준이다. 1차에서 이미 변경된 파일 목록과 구분한다.

| 파일 | 내용 |
|---|---|
| src/app/globals.css | 업무 화면·폼·표·메일·로그·인증 화면 스타일 추가 |
| src/components/ui/workspace.tsx | PageHeader·Surface·DataTable·FilterBar·StatusBadge |
| src/components/ui/workspace.test.tsx | 공통 UI 계약 검증 |
| src/lib/design-form-contracts.test.ts | 화면 액션·필드·링크·인쇄 계약 검증 |
| src/app/hr/rounds/page.tsx | 회차 목록·생성 |
| src/app/hr/rounds/[roundId]/applications/page.tsx | 신청 현황·정정 처리 |
| src/app/hr/rounds/[roundId]/candidates/page.tsx | 대상자 선정·판정 근거 |
| src/app/hr/applications/[appId]/page.tsx | 신청서 상세 검토 |
| src/app/hr/rounds/[roundId]/results/page.tsx | 결과 등록·안내 |
| src/app/hr/steps/page.tsx | 승급 목록·필터·재계산·일괄 확정 |
| src/app/hr/steps/[empNo]/page.tsx | 승급 상세·근거·확정 |
| src/app/hr/step-mail/page.tsx | 승급 안내 화면 |
| src/app/hr/step-mail/send-form.tsx | 발송 폼·실행 결과 |
| src/app/hr/notifications/page.tsx | 알림 목록 |
| src/app/hr/mails/page.tsx | 발송함·필터·본문 펼침 |
| src/app/hr/history/page.tsx | 처리 이력·필터·상세 |
| src/app/hr/access-logs/page.tsx | 접근기록·필터·통계 |
| src/app/hr/settings/page.tsx | 기준정보 수정 폼 |
| src/app/hr/mock-erp/page.tsx | ERP 편집 |
| src/app/me/page.tsx | 본인 정보·최근 메일 |
| src/app/me/promotion/page.tsx | 본인 신청서·정정 요청 |
| src/app/me/promotion/application-form.tsx | 기존 입력 보존 작성 폼 |
| src/app/me/mails/page.tsx | 본인 메일함 |
| src/app/login/page.tsx | 로그인 입력·오류 |
| src/app/switch-user/page.tsx | 개발용 실제 계정 선택 |

문서 1개: `docs/STEP14_2차_디자인적용.md`.

## 브라우저 수동 확인 항목

1. HR/직원 메뉴 전환과 각 업무 경로 이동, 새로고침 후 현재 메뉴 상태.
2. 데스크톱·작은 노트북·모바일 폭에서 긴 제목·날짜·표·입력창·메일 본문이 화면 밖으로 잘리지 않는지 확인.
3. 회차 생성·상태 전환, 선정·예외 처리, 정정 승인/반려·보완 사유 입력, 결과 등록·안내 동작.
4. 승급 상태 필터·상세 이동·재계산·자동/수기 확정, 기준일 발송·이번 실행 결과 표시.
5. 직원 신청서 제출 실패 후 입력값·오류 유지, 수정 후 재제출·임시저장, 본인 메일 펼침.
6. 로그인·개발 전환·로그아웃, 운영 환경 개발 전환 차단.
7. Tab/Shift+Tab/Enter/Space를 이용한 입력·제출·필터·details 열기, 포커스 표시와 표 가로 스크롤.
8. A4 인쇄 미리보기에서 인당 페이지 분리·메뉴 숨김·여백·긴 입력 내용의 줄바꿈 확인.

수동 확인 과정에서 실제 업무 버튼을 누르면 기존 업무 로직대로 데이터·이력·접근기록이 변경될 수 있다. 이번 구현 작업에서는 개발 DB에 해당 업무 동작을 실행하지 않았다.

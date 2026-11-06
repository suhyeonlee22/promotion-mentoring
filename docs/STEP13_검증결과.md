# STEP 13 P2 구현 및 검증

검증일: 2026-11-06 (한국 시간). 요청된 순서로 구현했다. DB 스키마 변경과 개발 DB 초기화는 하지 않았다. Git 커밋 및 실제 비밀값의 파일 추가도 하지 않았다.

## 구현 상태

| 우선순위 | 항목 | 상태 | 확인 내용 |
|---|---|---|---|
| 1 | SCR-15 알림함 | 구현·자동 검증 완료 | HR 공용(receiver=HR) 및 본인 알림만 조회, 최근 순, 상단 안 읽은 수, 클릭 POST→읽음 저장→저장된 내부 HR 링크 이동 |
| 2 | SCR-01 HR 홈 | 구현·자동 검증 완료 | 진행 중 회차·회차별 신청 상태 인원·정정 대기 수·승급 비교 상태 인원·재확인 인원, HR 첫 진입 /hr |
| 3 | SCR-14 기준정보 | 구현·자동 검증 완료 | 목록·값 수정·정수/날짜/코드/빈 값/대상 검증, SETTING_UPDATED 이력, 변경값 재선정·재계산 반영 |
| 4 | 비밀번호 로그인 | 구현·자동 검증 완료 | bcryptjs@3.0.2, 환경변수 시드 비밀번호, 로그인·로그아웃, HMAC 서명 검증, 운영 사용자 전환 페이지·액션 차단 |
| 5 | NFR-07 접근성 | 코드 보완·정적 자동 검증 완료 | 전 화면 입력 label 연결·표 헤더 scope, 텍스트 상태 유지, 양수 tabIndex 없음. 실제 브라우저 Tab 이동은 미검증 |

미구현 P2 기능은 없다. 실제 브라우저 동작과 운영 환경 검증은 아래에 별도로 남겼으며, 자동 테스트 통과를 실제 브라우저 검증 완료로 간주하지 않는다. P3 기능은 작업 범위에 포함하지 않았다.

## 자동 검증

- `npm test`: 로그인 수동 검증 조사 후 33개 파일, **256개 테스트** — 기존 217개, STEP 13 신규 37개, 로그인 입력 전달 회귀 테스트 2개.
- `npm run build`: 통과. 새 경로 `/hr`, `/hr/notifications`, `/hr/settings`, `/login`을 포함한다.
- 수정 TypeScript/TSX/MTS 파일 ESLint: 오류·경고 없이 통과.
- `src/services/p2.int.test.ts`: 수신자 제한·읽음·링크 안전성·권한·설정 유효성·변경 이력·멱등성·롤백·실제 선정/재계산 반영.
- `src/lib/auth.int.test.ts`: 시드 해시·로그인 성공/실패·쿠키 서명·위조/손상/구형 무서명 쿠키·역할 검사·Secure 속성·환경변수 누락·운영 전환 차단·개발 전환·로그아웃·기존 DB 비밀번호 초기화.
- `src/app/hr/p2-pages.int.test.tsx`: 대시보드 집계·알림 화면/액션·상단 개인별 안 읽은 수·설정 화면/액션·HR 재검사.
- `src/lib/accessibility.test.ts`: TypeScript JSX AST로 모든 앱 화면의 입력 label 연결, 표 헤더 scope, 비정상 tabIndex 검사.

테스트는 test.db를 사용한다. 테스트용 비밀번호와 세션 키는 Vitest 설정에서 실행 시 임의 생성하므로 실제 비밀값을 저장소에 넣지 않는다. bcrypt 설치와 테스트 준비는 기존 샌드박스 접근 오류 때문에 승인된 샌드박스 외부 실행으로 수행했다.

## 기존 기능에 미치는 영향

- 기존 217개 테스트의 기대값은 바꾸지 않았고 전체 회귀 실행에 포함했다.
- 기존 notification, rule_config, app_user.password_hash, process_history를 재사용한다. `history.ts` 타입에 SETTING만 추가했으며 테이블 변경은 없다.
- 설정을 저장해도 기존 업무 스냅샷·확정일을 자동으로 덮어쓰지 않는다. 다음 선정·재계산·안내 발송부터 수정된 규칙을 사용한다.
- 12개월→6개월 변경 후 E01 자동 승급일 2026-09-01, 기존 확정값 2027-03-01 유지와 재확인 Y를 테스트했다. G7 최소 기간 변경 후 E02 재선정 판정 변경도 확인했다.
- 인증 실패 시 `/login`으로 이동하며, HR 홈은 `/hr`이다. 기존 개발 사용자 전환도 서명 쿠키를 사용한다.
- 기존 무서명 uid 쿠키는 더 이상 인정하지 않는다. 다시 로그인하거나 개발 모드에서 사용자 전환을 해야 한다.
- production의 사용자 전환은 화면뿐 아니라 직접 Server Action 호출도 차단한다. 쿠키는 HttpOnly·SameSite=Lax·Path=/, production에서는 Secure로 발급한다.
- 알림의 receiver=HR은 인사팀 공용 알림이다. 특정 계정 수신 알림은 해당 계정만 조회·변경할 수 있고 직원·미로그인 사용자는 접근할 수 없다.
- 접근성 보완은 label 연결·scope 속성 중심이며, 기존 업무 상태 텍스트와 서비스 계산 규칙은 유지했다.

## 로컬/배포 설정

1. 커밋하지 않는 `.env` 또는 배포 환경에 충분히 긴 임의의 `SESSION_SECRET`과 로컬 시드용 `SEED_PASSWORD`를 설정한다. `.env.example`에는 값 없는 항목만 추가했다.
2. README의 실습 공통 비밀번호를 쓰려면 그 값을 로컬 `SEED_PASSWORD`에 지정한다. 비밀번호 기본값을 소스 코드에 하드코딩하지 않았다.
3. 기존 업무 DB를 보존하며 P2로 전환하려면 `web/`에서 `npm run db:passwords`를 실행한다. password_hash가 NULL인 계정만 bcrypt 해시로 초기화하며 기존 비밀번호·회차·신청서·승급 정보는 보존한다. 개발 DB에는 이 명령을 실행하지 않았다.
4. 새 실습 데이터를 만드는 기존 시드 명령도 `SEED_PASSWORD`를 읽는다. 비밀번호가 없으면 기존 데이터 삭제 전에 실패한다. 기존 `db:reset`은 원래대로 데이터를 초기화하는 명령이므로 P2 적용을 위해 실행할 필요가 없다.
5. `/login`에서 인증한다. 정상 HR 계정의 첫 화면은 `/hr`이다. production Secure 쿠키는 HTTPS 환경에서 확인한다.

SESSION_SECRET 미설정 시 쿠키 발급을 거부하며, 임의의 기본 키로 대체하지 않는다. 환경변수 변경 후에는 서버를 재시작한다. 실제 배포 비밀키·계정 비밀번호는 이 작업에서 설정하지 않았다.

## 변경 파일

다음 경로는 `web/` 기준이며, 이 문서 자체는 `docs/STEP13_검증결과.md`이다.

| 파일 | 변경 내용 |
|---|---|
| `.env.example` | SESSION_SECRET·SEED_PASSWORD 빈 항목 |
| `package.json`, `package-lock.json` | bcryptjs@3.0.2 고정, db:passwords 명령 |
| `src/services/notifications.ts` | 수신자 제한·읽음·미열람 수 |
| `src/app/hr/notifications/page.tsx`, `actions.ts` | 알림 목록·이동 액션 |
| `src/app/hr/page.tsx` | SQL 집계 대시보드 |
| `src/services/settings.ts` | 기준정보 검증·저장·이력 트랜잭션 |
| `src/app/hr/settings/page.tsx`, `actions.ts` | 기준정보 목록·수정 |
| `src/lib/rules.ts` | 기존 규칙 파싱 함수를 분리해 수정 검증과 공유 |
| `src/lib/history.ts` | SETTING 대상 타입 추가 |
| `src/app/hr/history/page.tsx` | SETTING 필터 선택지 |
| `src/lib/session-token.ts`, `session.ts` | HMAC 서명 생성·검증·쿠키·역할 접근 |
| `src/services/auth.ts` | bcrypt 로그인 인증 |
| `src/app/login/page.tsx`, `actions.ts` | 로그인 화면·로그인/로그아웃 액션 |
| `src/app/switch-user/page.tsx`, `actions.ts` | 개발 전환 유지·운영 차단 |
| `src/db/seed.ts` | 환경변수 비밀번호 해시 시드 |
| `src/db/set-passwords.ts` | 기존 DB 미설정 비밀번호만 초기화 |
| `vitest.config.mts` | 임의 테스트 비밀값 생성 |
| `src/app/layout.tsx`, `src/app/page.tsx` | 알림 수·메뉴·로그인·HR 첫 화면 연결 |
| `src/app/hr/access-logs/page.tsx` | 헤더 scope |
| `src/app/hr/rounds/page.tsx` | 헤더 scope |
| `src/app/hr/rounds/[roundId]/applications/page.tsx` | 헤더 scope·승인/반려 입력 label 연결 |
| `src/app/hr/rounds/[roundId]/candidates/page.tsx` | 헤더 scope |
| `src/app/hr/steps/page.tsx` | 헤더 scope |
| `src/app/me/promotion/page.tsx` | 헤더 scope·정정 값/사유 label 연결 |
| `src/services/p2.int.test.ts` | P2 서비스 테스트 |
| `src/lib/auth.int.test.ts` | 인증·전환·비밀번호 초기화 테스트 |
| `src/app/hr/p2-pages.int.test.tsx` | 새 화면·액션·상단 알림 테스트 |
| `src/lib/accessibility.test.ts` | 전 화면 정적 접근성 검사 |

## 수동 검증 필요 사항

- 실제 개발 서버에서 SESSION_SECRET 설정 및 기존 DB 비밀번호 초기화 후 로그인·로그아웃·개발 사용자 전환.
- HTTPS production에서 사용자 전환 URL 직접 접근 차단, Secure 쿠키 유지 및 위조 쿠키 거부.
- 알림 클릭 후 안 읽은 수가 줄고 저장된 화면으로 이동하는지, 서로 다른 HR 계정의 개인 알림 격리.
- 화면의 대시보드 수치와 실제 데이터 대조, 기준정보 수정 후 선정/재계산·설정 이력 조회.
- 마우스 없이 Tab/Shift+Tab/Enter로 로그인→신청서 입력→제출/오류 수정/임시저장까지 조작, 포커스 가시성, 확대 화면·스크린리더 확인.

실제 브라우저 검증은 수행하지 않았다. 테스트에서 쿠키 저장소와 Next.js 이동/요청 경계는 모의 객체를 사용했고, DB·bcrypt·HMAC·업무 서비스는 실제 구현을 사용했다.

## 로그인 수동 검증 오류 조사

현재 상태에서 보고된 오류는 재현되지 않았다. 인증 서비스·로그인 화면·쿠키 구현은 변경하지 않았고, 실제 비밀값 대신 실행마다 생성하는 비밀번호로 기호·공백 전달 회귀 테스트 2개만 추가했다.

| 조사 항목 | 확인 결과 |
|---|---|
| DB 연결 | `db/client.ts`는 DATABASE_URL을 사용한다. web 작업 디렉터리와 현재 환경설정을 해석한 로컬 경로는 `web/local.db`다. 읽기 전용 조회에서 hr01과 해시를 확인했고 실제 개발 서버 로그인도 성공했다. 실행 중인 서버 내부의 DB 연결 객체를 직접 계측하는 코드는 추가하지 않았다. |
| 아이디 | 폼 name=userId → FormData.get(userId) → userId.trim() → app_user.user_id. hr01 및 HR 역할 확인. |
| 비밀번호 | 폼 name=password → 문자열 변환 → bcrypt.compare(입력, 저장된 해시). 임의의 trim·분할·인코딩 변경 없음. 현재 .env의 전체 값은 hr01 해시와 일치한다. |
| 환경변수 | 독립 진단 프로세스에서 dotenv 및 Next.js 공식 개발 환경 로더 모두 .env를 읽고 세 설정이 파일 값과 일치했다. 그 진단 프로세스에는 선행 환경변수 덮어쓰기가 없었다. |
| 실행 서버 | 3000번 포트가 프로젝트의 Next.js 로그인 화면을 반환했다. 현재 파일의 비밀번호로 실제 Server Action POST를 보낸 결과 303으로 홈 이동, uid 쿠키 발급 확인. |
| 실패 분기 | 보고된 문구는 INVALID_CREDENTIALS에 해당하며 세션 발급 이전의 입력/계정/해시/비밀번호 불일치 검사에서 사용한다. 원래 브라우저 요청 본문은 수집하지 않았으므로 당시 어느 조건인지 확정할 수 없다. 현재 재현 요청에는 실패 분기가 발생하지 않았다. |
| 세션 | 실제 발급 쿠키의 HMAC이 현재 .env의 세션 키로 검증됐다. 쿠키를 사용해 홈 요청 시 /hr로 이동했다. 쿠키와 비밀값은 출력하지 않았다. |
| 자동 테스트 한계 | test.db, 임의 테스트 비밀번호, 모의 Next 요청 경계를 사용하므로 원래 브라우저의 입력·자동완성·오래된 오류 URL은 재현하지 않는다. 기존 비밀번호는 임의의 16진 문자열이어서 기호·앞뒤 공백의 FormData 전달을 추가 검증했다. |

추가 인증 회귀 테스트는 14개 통과했다. 기호가 포함된 값과 앞뒤 공백이 포함된 값을 그대로 전달하면 인증되고, 첫 글자가 빠진 값은 거부되는 것을 확인했다. 테스트는 실제 비밀값을 사용하지 않는다. 실제 개발 서버 HTTP 로그인도 별도로 성공했지만 브라우저 UI를 직접 조작한 검증은 아니다.

브라우저 재확인 방법:

1. 시크릿 창에서 오류 쿼리 없는 `http://localhost:3000/login`을 새로 연다.
2. 자동완성 값을 지우고 아이디를 hr01로 입력한다.
3. `.env`의 SEED_PASSWORD 항목에서 첫 번째 등호 오른쪽 값 **전체**를 입력한다. 내부의 기호도 비밀번호의 일부이며 IDE에서 선택된 일부만 복사하지 않는다. 실제 값을 채팅이나 로그에 붙여 넣지 않는다.
4. 정상 이동은 `/`를 거쳐 `/hr`다. `.env`를 다시 변경했다면 개발 서버를 재시작한다. SEED_PASSWORD 변경 자체는 DB 비밀번호를 바꾸지 않는다.
5. 같은 오류가 계속되면 비밀번호·쿠키·요청 본문을 공유하지 말고 접속 주소와 로그인 POST 응답 상태 및 이동 경로만 확인한다. 현재 성공한 서버와 같은 포트인지 확인한다.

이 조사에서 개발 DB·계정 비밀번호·환경변수는 변경하지 않았다. 비밀번호·해시·비밀키의 출력이나 디버그 로깅, DB 초기화, Git 커밋도 수행하지 않았다.

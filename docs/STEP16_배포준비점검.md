# STEP 16 배포 준비 점검

점검일: 2026-11-06 (한국 시간). 기준: `main`, `9af9294`.

## 1. 결론 및 점검 범위

**GitHub 업로드는 비밀값 정리 후 진행 가능하고, Vercel용 로컬 프로덕션 빌드는 성공했다. 그러나 현재 파일 SQLite 구성으로는 Vercel에서 업무 데이터를 영속적으로 운영할 수 없다. 운영 배포 준비 완료 판정은 보류한다.**

README STEP 16, 루트 및 `web/AGENTS.md`, `docs/요구사항.md`와 관련 구현을 확인했다. STEP 16과 NFR-03은 DB 오류를 확인하고 대안을 조사하는 실습이며, 실제 DB 이전은 범위 밖이다. 이번에는 그 실습 배포도 실행하지 않았다. 보고서만 추가하며 코드, 환경설정, Git 원격 및 DB 연결을 변경하지 않았다.

## 2. GitHub 업로드 준비 상태

| 항목 | 확인 결과 |
| --- | --- |
| 브랜치/HEAD | `main` / `9af9294 test: complete STEP 15 acceptance verification and fixes` |
| 최초 작업 상태 | 변경 및 미추적 파일 없는 깨끗한 작업 트리 |
| 원격 연결 | `git remote -v` 출력 없음. origin 및 upstream 미설정 |
| 앱 위치 | `web/`; 문서와 원본 요구사항은 `docs/` |
| 잠금 파일 | `web/package-lock.json` 추적 중 |
| 로컬 환경/DB | `web/.env`, `web/local.db` 및 `local.db-wal` 경로가 ignore됨. 현재 추적되지 않음 |
| 추적되는 환경 파일 | `web/.env.example`, `web/.env.test`, `docs/starter/env.example` |

### ignore 범위 및 이력 검사

- `web/.gitignore`는 `.env*`, `*.db`, `*.db-*`, `*.pem`, `.next`, `node_modules`, `.vercel` 등을 제외한다. `.env.example`, `.env.test`는 예외로 허용한다.
- 루트 `.gitignore`는 OS 잡파일만 제외한다. 따라서 **루트나 docs 등에 새로 놓는 `.env`, DB 백업, `.sqlite`, `.sqlite3`, `.key`는 현재 규칙만으로 보호되지 않는다.** 업로드 전 위치별 보완이 필요하다. 이번에는 수정하지 않았다.
- 모든 로컬 참조에서 도달 가능한 **16개 커밋, 고유 blob 237개**를 검사했다. 과거 파일명 검사에서 환경 예제와 테스트 환경 파일 외 실제 `.env`, DB 및 일반적인 키 파일은 발견되지 않았다.
- Git 이력 내용에서 개인키 헤더, GitHub 토큰, AWS 액세스 키 형식, 주요 비밀 환경변수 할당, 현재 로컬 비밀값과의 정확 일치를 검사했다. 비밀값이나 일치한 원문은 출력하지 않았다.
- **중요: 현재 로컬 `CRON_SECRET`이 README 및 두 환경 예제에 있는 값과 일치한다.** 같은 문자열이 과거 README blob에도 있다. 개발 예제라 해도 운영 인증에 재사용하면 안 된다. 배포용 값은 새로 생성하고, 개발용도 교체해야 한다. 환경 예제는 나중에 빈 값 또는 비밀이 아닌 안내 문구로 정리하는 것이 좋다.
- 로컬 `SESSION_SECRET`, `SEED_PASSWORD`와 일치하는 값 및 일반적인 개인키/서비스 토큰 형식은 검사 범위에서 발견되지 않았다. 할당 패턴은 예제 및 seed 코드에서도 검출되므로 패턴 검출 자체를 실비밀 노출로 단정하지 않았다.
- `git fsck --no-reflogs --unreachable`에서 도달 불가 tree 4개와 blob 1개를 확인했다. 해당 blob에서 일반적인 비밀 관련 표식은 발견되지 않았다. 이는 보조 검사이며 완전한 비밀 탐지를 보증하지 않는다.
- 이 평가는 로컬 저장소 기준이다. 연결된 원격이 없으므로 과거 외부 업로드 여부, GitHub 권한/보안 설정은 확인할 수 없다. 임의 형식의 비밀번호나 외부 저장소까지 안전하다는 의미는 아니다.

### 향후 필요한 작업 (미실행)

1. `CRON_SECRET` 재발급, 예제 정리 및 ignore 범위 보완. 문서/백업의 실제 개인정보와 자격증명도 최종 검토한다.
2. 원본 RFP가 있으므로 README 지침대로 **Private** GitHub 저장소를 준비한다. 초기 README 등 자동 생성은 끈다.
3. 실제 저장소 주소로 origin을 연결하고 변경사항을 검토·커밋한 뒤 `main`을 push한다. 업로드 목록에 `.env`, DB 및 백업이 없는지 확인한다.
4. 이미 다른 곳에 실제 키가 노출되었다면 먼저 폐기·재발급한다. 필요 시 이력 정리는 별도로 협의한다. 예제 문자열 제거만으로 과거 이력은 없어지지 않는다.

## 3. Vercel 배포 준비 상태

### 프레임워크 및 빌드

- Next.js **16.4.3**, React **19.3.0**, TypeScript, App Router, Tailwind 4, Drizzle ORM **0.45.4**, `@libsql/client` **0.18.0**.
- `web/package.json`: `build = next build`, `start = next start`, `dev = next dev`. build에 스키마 변경/시드 명령이 결합되어 있지 않다.
- 설치된 Next.js는 Node.js `>=20.9.0`을 요구한다. 점검 환경은 Node **24.22.2**, npm **11.19.1**. 앱 package.json에는 Node engines 고정이 없어 Vercel에서 사용할 지원 Node 버전을 명시적으로 맞추는 것이 좋다.
- 루트 layout의 `dynamic = "force-dynamic"` 유지. 빌드 출력에서 페이지와 API가 동적 라우트로 표시됐다. static export 구성은 없다.
- `next.config.ts`는 Turbopack의 globals.css 처리를 설정하며 `cacheComponents`는 활성화하지 않는다.
- **로컬 `npm run build` 성공(종료 코드 0)**. 컴파일, TypeScript 검사 및 페이지 생성 완료. 로컬 `.env`를 읽은 결과이며, Vercel Linux 환경의 신규 설치/원격 DB 접속까지 검증한 것은 아니다. `next/font/google`의 빌드 시 폰트 취득도 배포 환경의 네트워크 조건에 영향을 받을 수 있다.

향후 Vercel 설정은 Root Directory **`web`**, Framework **Next.js**, Build Command **`npm run build`**, 잠금 파일 기반 설치를 사용한다. 기본 Next.js 출력 처리를 이용한다. 프로젝트 Import나 실제 Vercel 빌드는 실행하지 않았다.

### 서버 기능 호환성

| 기능 | 진단 |
| --- | --- |
| Server Components / Server Actions | Node 런타임에서 제공 가능한 구성. 서버에서 인증과 역할을 확인하며 원격 DB가 필요 |
| API Route | Cron 및 CSV Route Handler 존재. 정적 호스팅만으로 제공 불가 |
| 인증/쿠키 | 서버 cookies API 및 Node crypto 사용. Edge로 임의 변경하면 호환성 재검토 필요 |
| SQLite | 빌드 성공과 별개로 런타임 파일 DB가 차단 요인 |
| Cron | `/api/cron/step-mail` GET 구현됨. `web/vercel.json`은 없어 자동 예약 미설정 |
| 메일 | 실제 SMTP 전송이 아니라 DB `mail_outbox`에 저장하는 실습 기능 |

README의 “사용자 전환 화면에서 500” 예시는 현재 P2 인증 구현과 차이가 있다. 운영 모드에서는 `/switch-user` 페이지와 Action이 404로 차단된다. DB 문제는 로그인 시 계정 조회 등 DB를 쓰는 요청에서 드러날 것으로 예상한다. 모든 첫 화면이 반드시 500이 된다고 단정할 수 없으며, 실제 오류/로그는 아직 수집하지 않았다.

Vercel은 로컬 SQLite의 공유·영속 저장을 보장하지 않는다. DB를 번들에 포함하거나 `/tmp`로 옮겨도 여러 인스턴스와 재배포 사이의 영속성을 해결하지 못한다. [Vercel SQLite 공식 안내](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel)

### 필요한 환경변수 (실제 값 미기재)

| 이름 | 용도 | 현재 로컬 상태 / 배포 시 처리 |
| --- | --- | --- |
| `DATABASE_URL` | Drizzle 앱 연결 및 drizzle-kit 대상 DB | 설정됨. 현재 개발 파일 DB. 운영은 별도 원격 DB URL 필요 |
| `DATABASE_AUTH_TOKEN` | 원격 libSQL/Turso DB 인증 | 비어 있음. 인증이 필요한 원격 DB 사용 시 발급 필요 |
| `SESSION_SECRET` | 사용자 ID의 HMAC 서명/검증 | 설정됨. 운영/Preview/개발 간 분리된 강한 무작위 값 필요 |
| `CRON_SECRET` | Cron Bearer 인증 | 설정됐으나 예제와 일치. 반드시 새 값 필요 |
| `SEED_PASSWORD` | 시드 및 비밀번호 없는 계정 초기화 | 설정됨. 초기화 작업용이며 일반 웹 요청에는 불필요. 운영 공통 비밀번호로 재사용 금지 |
| `NODE_ENV` | 운영 쿠키 및 개발 기능 차단 분기 | 플랫폼의 production 설정 사용. 배포에서 development로 덮어쓰지 않음 |

이 변수들은 클라이언트에 공개할 값이 아니며 `NEXT_PUBLIC_`를 붙이지 않는다. Production과 Preview는 DB 및 비밀값을 분리하고 로컬 `.env`를 그대로 복사하는 안내는 따르지 않는다.

Cron 예약은 추후 별도 설정이 필요하다. UTC 스케줄과 KST 업무 날짜를 함께 검토하고 플랜별 실행 제약, 함수 제한 시간, 실패 알림과 재실행 절차를 확인해야 한다. 현재 Route의 Bearer 검증은 Vercel의 `CRON_SECRET` 전달 방식과 맞는다. Vercel 환경변수를 바꾸면 재배포 후 적용되는 점도 고려한다. [Vercel Cron 공식 문서](https://vercel.com/docs/cron-jobs/manage-cron-jobs)

## 4. 데이터베이스 진단 및 대안

### 현재 구성과 보존 확인

- `web/src/db/client.ts`: `drizzle-orm/libsql`에 URL과 선택적 authToken을 전달한다. 로컬 `.env`는 계속 개발 파일 DB를 가리킨다.
- `web/src/db/schema.ts`: SQLite 스키마. `web/drizzle.config.ts`: dialect `turso`, 동일 URL/토큰 환경변수 사용. `web/drizzle/` 마이그레이션 디렉터리는 현재 없다. 기존 운영용 순차 마이그레이션 이력은 확인되지 않았다.
- `web/local.db`: **180,224바이트**. sidecar 파일 없는 상태에서 SQLite `mode=ro&immutable=1`로 조회했다. `integrity_check = ok`, 외래키 검사 오류 0건.
- 테이블 21개(내부 테이블 포함), 계정 14개, 승진 회차 1개, 신청서 4개, 처리 이력 31개, 접근기록 12개, 메일 발송함 4개. 기존 수동 테스트 데이터를 보존할 필요가 있다.
- 모든 계정에 비밀번호 해시 값이 존재한다. 실제 비밀번호나 해시는 읽어 출력하지 않았으며, 해시 존재가 비밀번호의 강도를 보장하지는 않는다.
- 점검 전후 DB SHA-256이 일치하여 원본 파일 불변을 확인했다. 원본에 reset/seed/push/쓰기 SQL을 실행하지 않았다.

### 배포용 DB 방안 비교

| 방안 | 기존 개발 DB 보존 | 변경/작업량 | 주요 위험 및 적합성 |
| --- | --- | --- | --- |
| **Turso 원격 libSQL (우선 권고)** | 원본은 로컬에 유지하고 운영 환경변수만 분리 | 현 드라이버와 스키마 재사용 가능. 원격 DB 생성·스키마/데이터 준비·연결 검증 필요 | 인증 토큰, 네트워크 지연, 트랜잭션 제한 및 백업/복원 정책 확인 필요. 현재 프로젝트에서 변경 부담이 가장 작음 |
| PostgreSQL (Neon/Supabase 등) | 원본 유지 후 별도 변환·검증 | `sqlite-core`→`pg-core`, 드라이버와 dialect, SQL 및 데이터 타입/자동 증가 등을 수정 | 범위 큼. 데이터 변환, 제약 및 충돌 처리 차이의 회귀 검증 필요 |
| 영속 볼륨이 있는 Node 서버/VM | 일관된 복사본으로 별도 서비스 구성 | SQLite 및 앱 구조 대부분 유지. 마운트 경로·권한·배포 운영 구성 필요 | Vercel 단독 배포 대안. 백업·복원·장애 대응·단일 writer 및 잠금/확장 운영 부담 |

Turso 공식 문서는 기존 `@libsql/client` 기반 코드의 원격 연결을 지원하며 SQLite 파일로 별도 DB를 생성하는 방식도 안내한다. 실제 대상은 현재 드라이버와 호환되는 libSQL DB로 선택해야 한다. [Turso SDK](https://docs.turso.tech/sdk/ts/reference), [SQLite 파일 가져오기](https://docs.turso.tech/cli/db/create)

### 이전 필요 여부와 후속 절차 (미실행)

**Vercel에서 정상적으로 쓰기 기능을 제공하려면 DB를 외부로 분리해야 한다. 기존 개발 DB 전체를 운영에 복사할 의무는 없다.** 실습 데이터는 원본에 보존하고 운영은 별도의 빈 DB로 시작할 수도 있다. 수동 테스트 상태를 온라인 데모에서도 재현하려면 복사본의 전체 데이터를 가져오는 방식이 적합하다.

1. 앱 쓰기를 중단하거나 SQLite backup API 등으로 일관된 스냅샷을 만든다. WAL 사용 중 DB 본체만 복사하면 최근 변경이 빠질 수 있다. 백업에는 비밀번호 해시와 인사정보가 포함되므로 Git에 넣지 않는다.
2. 대상 DB와 토큰을 별도로 준비하고 URL 대상 확인 절차를 둔다. 개발/테스트/Preview/Production을 분리한다.
3. 새 빈 DB에 스키마를 적용할지, 기존 스냅샷을 가져올지 먼저 결정한다. 데이터 보존 경로에서는 가져온 DB와 코드 스키마 차이를 검토하고 무조건 push/seed하지 않는다.
4. 계정, 규칙, Mock ERP, 업무 상태, 신청서/정정, 처리·접근기록, 알림·메일을 함께 검증한다. 행 수, PK/FK, 중복 키, 자동 증가 값 및 트랜잭션 동작을 확인한다. 메일 중복 방지 키를 누락하면 재실행 때 중복 발송함 생성 위험이 있다.
5. 복사한 비밀번호 해시도 자격정보이므로 운영 계정 발급·비밀번호 변경 계획을 별도로 세운다. 원격 DB로 기능 검증한 뒤 배포 환경만 연결하고 롤백/복원 절차를 확보한다. 로컬 `.env`와 `local.db`는 그대로 유지한다.

**특히 `db:seed`는 seedAll→clearAll로 기존 테이블 데이터를 지운다. `db:reset`도 스키마 push 후 시드하여 데이터를 없앤다.** README의 “스키마 반영 후 시드” 안내는 새로 만드는 실습 DB에만 적용해야 한다. 기존 데이터가 있는 어느 DB에서도 그대로 실행하면 안 된다. `db:push` 역시 스키마/데이터 변경 위험이 있어 대상 및 변경 계획 검토가 선행되어야 한다.

## 5. 보안 및 운영 점검

| 항목 | 확인 및 남은 과제 |
| --- | --- |
| HR/직원 권한 | HR/직원 layout·페이지에서 requireRole, Actions에서 현재 사용자 조회/권한 검사, 서비스에서 역할 및 본인 사번 검사 확인. 직원 신청서는 ID와 본인 사번 조건을 함께 사용. CSV API도 HR 검사 |
| 로그인 | bcryptjs 비교, 미설정 해시 계정 거절, 비밀번호 72바이트 상한 확인. 로그인 속도 제한/잠금/MFA는 현재 구현에서 확인되지 않음 |
| 세션 | HMAC-SHA256 서명과 timingSafeEqual 검증. HttpOnly, SameSite=Lax, path=/, production Secure 설정. 서버 프로세스 메모리에 의존하지 않음 |
| 세션 운영 한계 | 토큰이 사용자 ID+서명으로만 구성되어 서버 검증용 만료 시각과 세션별 폐기 목록이 없음. 브라우저 세션 쿠키라도 탈취한 토큰의 서버 만료를 의미하지 않음. 비밀번호 변경만으로 기존 토큰 폐기되지 않음. 운영 전 만료/강제 로그아웃 정책 필요 |
| 개발 사용자 전환 | `/switch-user` 페이지와 Action 모두 production에서 notFound. AppShell도 development 플래그 사용. 운영 배포에서 직접 URL/Action 호출 차단을 나중에 실제 검증할 것 |
| 초기 계정 | 실습 HR/직원/심사위원 계정이 존재. seed는 동일 초기 비밀번호 해시를 여러 계정에 적용하므로 운영 계정으로 그대로 공개하면 안 됨 |
| 비밀번호 초기화 | `db:passwords`는 passwordHash가 NULL인 계정만 채우며 기존 비밀번호를 보존. 기존 계정 비밀번호 교체 도구가 아님. 운영용 개별 발급/변경 흐름 별도 필요 |
| Cron 보안 | secret 미설정 또는 불일치 시 401. 현재 예제 값 재사용은 해결 필요. 메일 생성은 DB 중복 키로 방지하며 실제 원격 DB에서 동시 호출도 검증 필요 |
| Mock ERP 편집 | HR 권한은 있지만 운영에서 기능 자체를 막는 환경 분기는 확인되지 않음. 실습용 공개 데모에서도 HR 자격정보 보호와 데이터 변경 범위를 정할 것 |
| HR 허용 IP | P3 요구. 현재 허용 목록 구현은 확인되지 않음. IP 기록은 x-forwarded-for 첫 값 사용. 신뢰할 프록시와 헤더 처리 정책 검토 필요 |
| 이력/접근기록 | process_history/access_log 등 DB 테이블에 저장. 주요 업무 쓰기와 이력은 트랜잭션, 개인정보 VIEW/PRINT/DOWNLOAD/UPDATE 기록 구현 확인. 영속성은 DB에 의존 |

서버리스 로그는 업무 감사 DB의 대체물이 아니다. 배포 후 업무 데이터, 접근기록, 메일 중복 키 모두 동일한 외부 영속 DB에 저장되어야 한다. 백업 주기, 보관 기간, 복원 테스트, 관리자 접근 권한 및 장애 알림 정책은 별도 운영 준비가 필요하다.

## 6. 검증 결과와 배포 전 우선순위

| 검증 | 결과 |
| --- | --- |
| Git 상태/ignore/로컬 커밋 이력 | 검사 완료. 원격 미연결, CRON 예제 값 재사용 발견 |
| `npm run build` | 성공 |
| `npm test` | **준비 단계 실패**. drizzle-kit 실행 중 `uv_os_get_passwd returned ENOMEM (not enough memory)`. Vitest 본 실행에 도달하지 못했으므로 통과로 판단하지 않음 |
| 테스트 DB 격리 | `.env.test`와 Vitest 모두 별도 `file:test.db` 대상 확인. 개발 DB 대상 reset/seed 없음 |
| 원본 개발 DB | 읽기 전용 무결성/건수 검사 완료. 점검 전후 SHA-256 일치 |
| GitHub push / Vercel 배포 / 원격 DB 이전 | 모두 미실행 |

배포 전 해결 순서:

1. **필수:** 예제와 일치하는 CRON 비밀값 교체, 비밀/백업 ignore 범위 보완, Private 원격 저장소 준비.
2. **정상 서비스 배포에 필수:** 외부 DB 방식 결정 및 별도 작업에서 준비. 개발 DB 보존과 백업 검증을 선행.
3. **검증 필요:** 테스트 준비 단계 시스템 오류 원인 확인 후 전체 테스트 재실행. Vercel의 실제 신규 설치/빌드 및 원격 DB 인증·권한·쓰기·이력 검증.
4. **운영 공개 전:** 개별 계정/비밀번호 관리와 세션 만료·폐기 정책, 필요 시 로그인 제한 및 HR 접근 제한을 마련.
5. **자동 실행 필요 시:** 영속 DB 준비 후 Cron 예약, 시간대, 제한 시간, 실패 감지 및 재시도 검증.

STEP 16의 GitHub 업로드, 배포 URL, 실제 DB 오류와 Runtime Logs 확인 항목은 아직 완료되지 않았다. 본 문서는 배포 전 진단 결과이며 STEP 16 완료 보고가 아니다.

## 7. 보안 설정 및 테스트 환경 후속 조치 (2026-11-06)

이 절은 위 최초 진단 이후의 수정 결과다. 최초 진단에 기록된 CRON 예제 값 재사용, ignore 누락 및 테스트 미완료 상태는 아래 결과로 갱신한다.

### 수정 내용

- 루트와 `web/.gitignore`에 비밀 환경파일, 개인키/인증서, SQLite 본체·sidecar·확장자 뒤에 백업 확장자가 붙는 파일, SQL/dump 및 백업 파일·폴더·일반적인 백업 압축파일 이름의 제외 규칙을 추가했다. 루트/docs 등 앱 밖에도 적용된다.
- 검토용 `.env.example`과 기존 `web/.env.test`는 허용한다. `.env.test` 예외는 web 바로 아래로 한정해 다른 경로의 동명 파일이 자동 허용되지 않게 했다. `web/drizzle/**/*.sql`은 향후 스키마 마이그레이션을 버전 관리할 수 있도록 예외 처리했다. 일반 SQL 내보내기는 제외되므로 새 SQL 소스를 추가할 때는 경로 예외를 검토해야 한다.
- README의 고정 Bearer 예제 값을 비밀이 아닌 안내용 표시로 바꾸고 대체 방법을 설명했다. `web/.env.example`과 `docs/starter/env.example`의 `CRON_SECRET`은 생성 안내 주석과 빈 값으로 바꿨다. 빈 값인 동안 Cron Route는 인증을 거절한다.
- Git에서 제외된 로컬 `web/.env`의 `CRON_SECRET`만 암호학적 난수 32바이트로 생성한 새 값으로 교체했다. 새 값 및 이전 값은 출력하거나 보고서에 기재하지 않았다. 새 값이 현재 추적 파일 내용에 포함되지 않는 것도 확인했다.
- `.env`의 `SESSION_SECRET`, `SEED_PASSWORD`는 변경하지 않았다. 계정 비밀번호 초기화 명령도 실행하지 않았다.

### ENOMEM 진단 및 재검증

제한된 실행 환경에서 `npm test`를 다시 실행하자 같은 `uv_os_get_passwd returned ENOMEM` 오류가 재현됐다. 별도의 최소 Node 진단에서도 `os.userInfo()`가 같은 syscall로 실패했다. 설치된 drizzle-kit 내부의 tsx 임시 디렉터리 생성 코드가 Windows에서 `os.userInfo().username`을 호출하는 것을 확인했다.

제한 밖에서는 동일 Node 사용자 정보 조회가 성공했고, 동일한 `npm test` 명령도 성공했다. 따라서 이번 오류는 테스트의 메모리 사용량이나 개발 DB 손상으로 판단할 근거가 없으며, 제한 실행 환경의 Windows 사용자 정보 조회 실패로 좁혀졌다. 의존성 수정, os.userInfo 우회 패치, 테스트 스크립트 변경 없이 실행 환경을 달리해 검증했다. 제한 환경에서 원래 명령을 실행하면 오류가 다시 발생할 수 있다.

| 항목 | 후속 검증 결과 |
| --- | --- |
| 전체 테스트 | `npm test` 성공. 테스트 준비에서 스키마 차이 없음. **38개 파일 / 309개 테스트 통과**, Vitest 실행 시간 47.72초 |
| 테스트 DB | `.env.test` 및 Vitest 설정의 `file:test.db` 사용. 개발 DB 대상 push/seed/reset 미실행 |
| 프로덕션 빌드 | `npm run build` 성공, 종료 코드 0 |
| ESLint | `npm run lint`로 web 전체 검사 성공, 종료 코드 0. 이번 수정 파일은 Markdown/ignore/env이므로 현재 ESLint 설정의 직접 검사 대상인 JS/TS 수정은 없음 |
| ignore 검증 | `git check-ignore --no-index`로 루트/docs/web의 env, DB, sidecar, DB 백업, SQL 압축파일, 개인키 및 백업 압축 경로 차단 확인. 환경 예제·web 테스트 env·마이그레이션 SQL 허용 확인 |
| 개발 DB 보존 | 작업 전후 `web/local.db` SHA-256 일치. 기존 업무 데이터와 비밀번호 해시를 포함한 원본 파일 불변 확인 |
| 기타 인증정보 | 작업 전후 로컬 `SESSION_SECRET`, `SEED_PASSWORD` 동일 여부를 값 출력 없이 해시로 비교해 확인 |
| Git 상태 | 앱 코드/의존성 변경 없음. 보고서 및 명시된 설정/문서만 변경. 로컬 `.env`는 계속 ignore됨 |

### 남은 문제 및 범위

1. Git 이력에는 과거 예제 문자열이 그대로 남는다. 이번에는 사용 중인 로컬 키를 교체해 재사용을 해소했으며 이력 재작성이나 커밋은 하지 않았다. 새 운영 비밀값은 개발 값과 별도로 발급해야 한다.
2. ignore는 이미 추적된 파일에는 소급 적용되지 않으며 임의 이름의 압축 백업까지 판별하지는 못한다. 새 백업은 제외되는 backup/backups 폴더 또는 지정된 DB 백업 확장자를 사용하고 업로드 목록을 계속 검토해야 한다.
3. 제한 실행 환경의 `os.userInfo()` 실패 자체는 저장소 수정으로 해결한 것이 아니다. 동일 제약의 환경에서는 허용된 일반 실행 환경에서 테스트해야 하며, 향후 CI에서도 전체 테스트를 검증해야 한다.
4. Vercel 파일 SQLite의 영속성 문제, 외부 DB 선택/이전, 계정별 운영 비밀번호 발급, 세션 만료·폐기 정책, Cron 예약 등 최초 진단의 운영 과제는 남아 있다.
5. GitHub push, Vercel 배포, DB 이전, 기존 계정 비밀번호 변경 및 Git 커밋은 모두 실행하지 않았다.

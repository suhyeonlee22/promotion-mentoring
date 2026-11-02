# 프로젝트 규칙

## 문서

- 진행 순서와 설계: README.md (Step, 부록 A~C)
- 요구사항과 정답표: docs/요구사항.md
- 지금 하는 Step 밖의 일은 하지 않는다. 요구사항이 모호하면 추측하지 말고 질문한다.

## 환경

- 앱 코드는 web/ 아래에 있다. npm 명령은 web/에서 실행한다.
- Next.js 16.4.3 App Router, React 19, TypeScript, Drizzle ORM 0.45 + @libsql/client (SQLite), Tailwind 4, Vitest 5
- Next.js API는 web/node_modules/next/dist/docs/ 의 문서를 기준으로 한다. 학습된 지식과 다를 수 있다.
- 패키지를 새로 설치하거나 버전을 바꾸지 않는다.
- next.config.ts에 cacheComponents를 켜지 않는다. layout.tsx의 `dynamic = "force-dynamic"`을 지우지 않는다.

## 코드 규칙

- Pages Router(pages/, getServerSideProps)를 쓰지 않는다.
- searchParams, params, cookies(), headers()는 Promise이다. PageProps<'/경로'>, RouteContext<'/경로'> 타입을 쓴다.
- 업무 규칙 숫자(소요 개월, 제한 개월, 승급 주기 등)는 코드에 쓰지 않고 loadRules()로 읽는다.
- 날짜 계산은 src/domain/date.ts 함수만 쓴다. new Date()로 날짜를 더하거나 빼지 않는다. 날짜 비교는 문자열 비교로 한다.
- src/domain/은 @/db를 import하지 않는 순수 함수다. 테스트를 함께 작성한다.
- 상태를 바꾸는 처리는 src/services/ 함수로 만들고, 권한 확인 → 규칙 검사(BusinessError) → 트랜잭션(쓰기 + recordHistory) 순서로 한다.
- 권한은 서버에서 확인한다. Server Action 안에서도 역할과 본인 여부를 확인한다.
- 집계 쿼리는 drizzle의 sql 템플릿으로 SQL을 직접 쓴다. 문자열 연결로 SQL을 만들지 않는다.
- 테스트 기대값은 docs/요구사항.md 8장 정답표를 따른다. 테스트가 실패하면 기대값이 아니라 구현을 고친다.

## 완료 전 확인

- npm test, npm run build 가 통과해야 한다.

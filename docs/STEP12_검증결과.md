# STEP 12 검증 결과

검증일: 2026-11-06 (한국 시간). STEP 12 구현 및 기존 P1 기능 점검 기록이다. 실제 브라우저를 조작한 검증은 수행하지 않았다. 아래 자동 검증은 Vitest에서 실제 test.db를 사용한 서비스·서버 액션·서버 컴포넌트 렌더링 테스트이며, 브라우저 E2E 테스트와 구분한다.

## 변경 파일

| 파일 (web/ 기준) | 내용 |
|---|---|
| `src/app/hr/history/page.tsx` | SCR-11, 대상 종류·ID·기간·처리자 필터, 최근 순, 상세 JSON 펼침 |
| `src/app/hr/access-logs/page.tsx` | SCR-12, 계정·정보주체·수행업무·기간 필터 및 같은 조건의 SQL 집계 |
| `src/app/hr/mock-erp/page.tsx` | SCR-13, 발령 목록·추가·수정·삭제와 수기 대장 목록·수정 |
| `src/app/hr/mock-erp/actions.ts` | HR 재검사, 입력 변환, 오류 전달 및 재조회 |
| `src/services/mock-erp.ts` | HR 검사, 코드·날짜·기간·호봉·직급·대상 존재·중복 검사, 트랜잭션 |
| `src/lib/log-filters.ts` | 문자열 쿼리와 날짜 범위 검증, 종료일 포함 범위 |
| `src/services/steps.ts` | 자동값이 날짜→null로 바뀔 때도 STEP_CALCULATED 기록 |
| `src/app/layout.tsx` | SCR-11~13 메뉴, 메뉴 줄바꿈 |
| `src/app/hr/logs.int.test.tsx` | 로그 필터·정렬·집계·JSON·권한 검증 5개 |
| `src/services/mock-erp.int.test.ts` | ERP CRUD·검증·권한·이력 미생성 검증 16개 |
| `src/app/hr/mock-erp/page.int.test.tsx` | 화면·액션·8.7 연결 시나리오·권한 검증 4개 |
| `src/app/hr/audit.int.test.tsx` | 실제 업무 흐름으로 처리 코드 19종·접근기록 5가지 검증 1개 |
| `src/app/me/promotion/actions.ts` | 후속 보완: 제출 실패 시 검증 오류와 입력값을 응답 상태로 반환 |
| `src/app/me/promotion/application-form.tsx` | 후속 보완: useActionState로 실패한 입력 및 오류 표시 유지 |
| `src/app/me/promotion/page.tsx` | 후속 보완: 본인 신청서의 저장값으로 작성 폼 초기화 |
| `src/app/me/promotion/actions.int.test.tsx` | 후속 보완: 입력 보존·검증·재제출·임시저장·권한 등 8개 테스트 |
| `src/app/hr/rounds/[roundId]/applications/page.tsx` | 후속 보완: submittedAt 기반 제출일 열, 값이 없으면 미제출 표시 |
| `src/app/hr/applications-list.int.test.tsx` | 후속 보완: 제출일·미제출·보완 요청 상태·권한 3개 테스트 |

DB 스키마, 패키지, 기존 테스트 기대값은 변경하지 않았다. Mock ERP 편집은 원천 테이블만 변경하며 인사마스터·확정값을 자동으로 변경하지 않는다. 업무 처리 이력은 재계산·확정 등 업무 실행에서 생성한다.

## 실행 검증

- `npm test`: 후속 보완까지 29개 테스트 파일, 217개 테스트 (기존 180개 + STEP 12 신규 26개 + 후속 보완 신규 11개).
- `npm run build`: 통과. 새 라우트 3개 생성 및 TypeScript 검사 통과.
- 수정 TypeScript/TSX 파일 ESLint: 통과.
- 테스트 준비 명령이 샌드박스의 `uv_os_get_passwd` 오류로 한 번 중단되어, 승인된 샌드박스 외부 실행에서 test.db로 검증했다. 개발 DB를 초기화하지 않았다.
- 실제 브라우저 및 운영 스케줄러: 미검증.

조회 기간과 표시 시각은 저장된 ISO UTC 기준이며 화면에 UTC를 명시한다. 시작일 00:00부터 종료일 다음 날 00:00 직전까지 조회한다. 통계는 목록과 동일한 조건으로 집계한다. 잘못된 날짜·역전 범위는 오류를 표시한다.

## 요구사항 4.1 처리 이력 점검

`web/src/app/hr/audit.int.test.tsx`에서 다음 19개 코드가 실제 서비스 실행으로 모두 생성되는 것을 확인했다. 각 기록의 처리자·시각이 존재하고, 관련 쓰기와 `recordHistory`가 같은 트랜잭션에서 수행되는 것을 코드로 대조했다. 기존 롤백 테스트도 전체 실행에 포함된다.

| 코드 | 기록 지점 | 확인 |
|---|---|---|
| ROUND_CREATED | `services/rounds.ts:createRound` | 자동 테스트 |
| ROUND_STATUS_CHANGED | `services/rounds.ts:changeRoundStatus` | 자동 테스트 |
| SELECTION_RUN | `services/rounds.ts:runSelection` | 자동 테스트 |
| MANUAL_ADD | `services/rounds.ts:setManualAction` | 자동 테스트 |
| MANUAL_EXCLUDE | `services/rounds.ts:setManualAction` | 자동 테스트 |
| MANUAL_CANCEL | `services/rounds.ts:setManualAction` 및 재선정 | 자동 테스트 |
| APP_CREATED | `services/rounds.ts:changeRoundStatus` | 자동 테스트 |
| APP_DRAFTED | `services/applications.ts:saveDraft/submitApplication` | 자동 테스트 |
| APP_SUBMITTED | `services/applications.ts:submitApplication` | 자동 테스트 |
| APP_RETURNED | `services/applications.ts:returnApplication` | 자동 테스트 |
| APP_CONFIRMED | `services/applications.ts:confirmApplication` | 자동 테스트 |
| RESULT_REGISTERED | `services/applications.ts:registerResult` | 자동 테스트 |
| RESULT_NOTIFIED | `services/applications.ts:notifyResults` | 자동 테스트 |
| CORRECTION_REQUESTED | `services/applications.ts:requestCorrection` | 자동 테스트 |
| CORRECTION_APPROVED | `services/applications.ts:approveCorrection` | 자동 테스트 |
| CORRECTION_REJECTED | `services/applications.ts:rejectCorrection` | 자동 테스트 |
| STEP_CALCULATED | `services/steps.ts:recalcAll` | 날짜→null 누락 보완 및 자동 테스트 |
| STEP_CONFIRMED | `services/steps.ts:confirmStep/bulkConfirmMatched` | 자동 테스트 |
| STEP_REVIEW_NEEDED | `services/steps.ts:recalcAll` | 자동 테스트 |

날짜→null 변경도 `{ before: "2027-03-01", after: null }`로 남는다. 미확정값이 처음부터 null인 직원은 불필요한 이력을 만들지 않는다. 동일 재계산 시 이력·알림 증가가 없는 기존 테스트도 유지했다.

## 요구사항 4.2 접근기록 점검

연결 테스트에서 아래 5가지 실제 동작을 실행하고 계정·시각·IP·정보주체·대상을 확인했다. 다운로드 사유도 확인했다. 직원의 자기 정보 조회는 기록 수를 늘리지 않는다.

| 경우 | 수행업무 | 기록 지점 | 결과 |
|---|---|---|---|
| 신청서 검토 상세 열기 | VIEW | `/hr/applications/[appId]` | 자동 확인 |
| 차기승급일 상세 열기 | VIEW | `/hr/steps/[empNo]` | 자동 확인 |
| 심사 자료 인쇄 화면 열기 | PRINT | `/hr/rounds/[roundId]/review-data` | 자동 확인; 실제 인쇄는 미검증 |
| 심사 자료 CSV 다운로드 | DOWNLOAD | 같은 경로의 `/csv` POST | 사유 포함 자동 확인; 사유 누락 차단은 기존 테스트 |
| 정정 요청 승인 | UPDATE | `approveCorrection` | 신청서 변경과 같은 트랜잭션, 자동 확인 |

복수 정보주체일 때 null과 대상 인원을 기록하는 것은 기존 인쇄·CSV 테스트 및 코드를 확인했다. 신규 조회 화면은 HR 검사를 먼저 수행한다. Mock ERP 원천 편집 자체에는 업무 처리 이력을 추가하지 않는다.

## 요구사항 8.7 ERP 변경 결과

신규 `mock-erp/page.int.test.tsx`에서 실제 편집 서버 액션 → 실제 DB → 재계산 → 이력 화면 렌더링으로 검증했다. 각 편집은 처리 이력을 추가하지 않으며, 이후 재계산이 변경 이력을 추가한다.

| 시나리오 | 확인 결과 |
|---|---|
| E01 질병휴직 2026-11-10~12-09 추가 | 자동값 2027-03-31, 불산입 30일, 확정값 2027-03-01 유지, 재확인 Y, STEP_CHANGED 1건 |
| 처리 이력 조회 | 대상 STEP/U1001·처리자 hr01 조건으로 STEP_REVIEW_NEEDED와 변경값 조회 |
| E01 AUTO 재확정 | 확정값 2027-03-31, 재확인 N |
| E08 개인사정 휴직 종료일 2026-12-31 입력 | 자동값 2027-07-01, 불산입 122일, MISMATCH, 기존 MANUAL 확정값 2027-03-01 유지, 재확인 Y |
| E06 수기 대장 2027-06-01로 수정 | MATCH, 확정값 2027-06-01 유지, 재확인 N |
| 자동값 날짜→산정 불가 변경 (추가 감사 시나리오) | STEP_CALCULATED와 STEP_REVIEW_NEEDED 생성, 반복 실행 증가 없음 |

## 요구사항 5장 P1 완료 기준 점검

완료는 기존·신규 자동 테스트와 코드 대조로 확인한 기능 기준이다. 모든 화면의 실제 브라우저 검증은 별도로 미검증이다. 최초 점검에서 발견한 002-04·003-01의 누락은 사용자의 후속 요청으로 보완했다. P2인 기준정보 화면·로그인·알림 UI와 P3 심사 점수는 이 표에 포함하지 않는다.

| ID | 기준 | 기능 상태 | 근거·남은 확인 |
|---|---|---|---|
| 001-01 | 승진 기준 데이터 | 완료 | loadRules, 규칙·도메인 테스트; 기준정보 화면은 P2 |
| 001-02 | 회차 생성 | 완료 | rounds 통합 테스트 |
| 001-03 | 자동 선정 | 완료 | 8.3 정답표 및 재선정 테스트 |
| 001-04 | 판정 근거 표시 | 완료 | 선정 스냅샷 테스트, candidates 근거 UI 코드 대조; 브라우저 펼침 미검증 |
| 001-05 | 예외 처리 | 완료 | 추가·제외·취소·사유·재선정 취소 테스트 |
| 001-06 | 상태 전환 | 완료 | 상태 제약·신청서·메일·롤백 테스트 |
| 002-01 | 주요 데이터 확인 | 완료 | 항목 도메인·ERP 원본/현재값 테스트, 직원 페이지 코드 대조 |
| 002-02 | 정정 요청 | 완료 | 허용 항목·중복·사유·승인·반려 테스트 |
| 002-03 | 추가 데이터 입력 | 완료 | 저장·제출 한도 테스트, textarea maxLength 코드 확인 |
| 002-04 | 최종 제출 | 완료 | 기존 제출 조건·수정 차단 유지. 실패 시 오류와 양쪽 입력값을 폼 상태로 반환, DB·이력·알림 불변·공백/줄바꿈 보존·수정 후 재제출·임시저장 테스트 통과 |
| 002-05 | 정정 요청 확인 | 완료 | 회차별 대기 목록 코드 확인, 서비스 및 연결 테스트; 브라우저 미검증 |
| 002-06 | 정정 요청 피드백 | 완료 | 승인·현재값 반영·반려 사유·UPDATE 테스트 |
| 003-01 | 신청 현황 | 완료 | 기존 목록·상태·대기 수·상태별 인원 유지. submittedAt을 time 요소로 표시하고 없으면 미제출, 보완 요청 상태의 기존 제출일·HR 권한 테스트 통과 |
| 003-02 | 신청서 검토 | 완료 | 상세 항목·입력·정정 요청·관련 이력 화면 테스트 |
| 003-03 | 보완 요청·확정 | 완료 | 상태·사유·보완 후 재제출·이력 테스트 |
| 003-04 | 심사 자료 인쇄 | 완료 | 확정자·인별 페이지·PRINT·인쇄 CSS 확인; 실제 인쇄 미검증 |
| 003-05 | 심사 자료 CSV | 완료 | 확정자·현재값·사유·BOM·DOWNLOAD 테스트 |
| 004-01 | 결과 등록 | 완료 | RESULT·CONFIRMED 조건 및 변경 이력 테스트 |
| 004-02 | 결과 안내 발송 | 완료 | 중복 방지·메일·이력·롤백 테스트 |
| 004-03 | 직원 결과 확인 | 완료 | 발송 전 비공개·발송 후 공개 및 타인 결과 차단 테스트 |
| 005-01 | 차기승급일 저장 | 완료 | step_schedule 및 8.5 12행 테스트 |
| 005-02 | 발령 연계 산정 | 완료 | 반복 계산·불산입 근거·상세 테스트 |
| 005-03 | 변경 감지 | 완료 | 8.7·확정 보존·재확인·알림·멱등성 테스트 |
| 006-01 | 승급 기준 설정 | 완료 | loadRules와 날짜·승급 도메인 테스트 |
| 006-02 | 비교 조회 | 완료 | 8.5 비교 상태 및 목록 필터 테스트 |
| 006-03 | 확정 | 완료 | AUTO/MANUAL·사유·산정 불가·재확정·롤백 테스트 |
| 006-04 | 일괄 확정 | 완료 | MATCH 미확정 6명 AUTO·재실행 0명 테스트 |
| 007-01 | 내 승급 정보 | 완료 | 본인 직급·호봉·승급일·미확정·확정 화면 테스트 |
| 007-02 | 승급 안내 발송 | 완료 | 8.6 신규 2건/재실행0건/12월2건, 규칙·기본 기준일·재직자 테스트 |
| 007-03 | 자동 API | 완료 | 인증 401·성공200·KST 날짜 테스트; 운영 스케줄러 미검증 |
| 007-04 | 내 메일함 | 완료 | 본인 메일·본문·타인 차단 테스트 |
| 008-01 | 사용자 전환 | 미검증 | switch-user/session/layout 구현은 코드 확인. 쿠키 전환과 화면 헤더 연동의 실제 브라우저 검증·전용 자동 테스트 없음 |
| 008-02 | 역할별 접근 | 완료 | 서비스 권한·본인 데이터 제한·신규 화면/액션 권한 테스트; 전 라우트 실브라우저 우회검증 미수행 |
| 008-03 | 처리 이력 | 완료 | 19종 연결 테스트·SCR-11 필터·정렬·상세 및 신청서 관련 이력 테스트 |
| 008-04 | 접근기록 | 완료 | 5가지 연결 테스트·SCR-12 필터·SQL 집계 테스트 |

후속 보완 후 집계: 완료 34개, 미완료 0개, 미검증 1개 (008-01 사용자 전환). 미검증 항목이 남아 P1 전체 검증 완료로 판정하지 않는다. 추가 실습 도구 SCR-13은 화면·액션·서비스 자동 테스트로 확인했다.

## 실제 브라우저에서 확인할 항목

1. hr01·직원 사용자 전환, 쿠키 적용, 현재 사용자/역할 헤더, HR URL 직접 접근 차단.
2. SCR-11~12 메뉴와 필터 입력·다중 조건·기간 경계·상세 펼침, 좁은 화면 표 가독성.
3. SCR-13 발령 추가·수정·삭제, 대장 날짜 비우기, 잘못된 입력 오류와 저장 안내.
4. 개발용 데이터에서 8.7 시나리오 수행 후 재계산·재확정·이력 조회 및 확정값 유지 확인. 개발 DB는 작업 중 초기화하지 않았다.
5. 후속 보완한 신청서 제출 실패 시 입력·오류 유지, 실패 후 재제출·임시저장, 신청 현황 제출일·미제출 표시의 실제 브라우저 동작 확인. 이 항목들의 서버 액션 및 렌더링 자동 테스트는 통과했다.
6. 실제 인쇄 미리보기·CSV 파일 저장·cron 배포 스케줄러 호출.

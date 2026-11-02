// 직원 승진승급 관리시스템 — DB 스키마 (Drizzle ORM, SQLite)
//
// 타입 규칙
// - 날짜: TEXT 'YYYY-MM-DD' / 시각: TEXT ISO 8601 (new Date().toISOString())
// - Y/N, O/X 값: TEXT 한 글자
//
// src_ 로 시작하는 테이블은 Mock ERP(가짜 원천 시스템)이다.
// 실제 ERP라면 다른 시스템에 있을 데이터를 같은 DB 안에 흉내 내어 둔 것이며,
// 본 시스템은 이 테이블을 읽기만 한다 (Mock ERP 편집 화면은 예외).

import { sqliteTable, text, integer, primaryKey, index, unique } from 'drizzle-orm/sqlite-core';

// ─────────────────────────────────────────────
// Mock ERP: 인사 기본정보
// ─────────────────────────────────────────────

/** 부서 */
export const srcOrg = sqliteTable('src_org', {
  orgId: text('org_id').primaryKey(),
  orgName: text('org_name').notNull(),
});

/** 직원 인사마스터 (ERP 인사정보의 현재 상태) */
export const srcEmployee = sqliteTable('src_employee', {
  empNo: text('emp_no').primaryKey(), // 사번. 예: 'U1001'
  name: text('name').notNull(),
  orgId: text('org_id').notNull(),
  grade: text('grade').notNull(), // 직급: G7 | G6 | G5 | G4 | G3
  step: integer('step').notNull(), // 호봉
  hireDate: text('hire_date').notNull(), // 입사일
  gradeDate: text('grade_date').notNull(), // 현 직급 임용일
  stepDate: text('step_date').notNull(), // 현 호봉 승급일 (차기승급일 계산의 기산일)
  status: text('status').notNull(), // ACTIVE(재직) | RETIRED(퇴직)
  retireDate: text('retire_date'), // 퇴직일 (재직이면 NULL)
  email: text('email').notNull(),
  phone: text('phone').notNull(), // 개인정보: 화면 목록에서는 마스킹
});

/** 발령 이력. 휴직·징계·승급 등 인사 발령 */
export const srcAppointment = sqliteTable(
  'src_appointment',
  {
    apptId: text('appt_id').primaryKey(), // 예: 'A-U1001-01'
    empNo: text('emp_no').notNull(),
    apptType: text('appt_type').notNull(), // HIRE(임용) | PROMOTE(승진) | STEP_UP(승급) | LEAVE(휴직) | DISCIPLINE(징계)
    subType: text('sub_type'), // LEAVE: CHILDCARE(육아) | SICK(질병) | PERSONAL(개인사정) / DISCIPLINE: REPRIMAND(견책) | PAY_CUT(감봉) | SUSPENSION(정직)
    startDate: text('start_date').notNull(), // 발령일 또는 기간 시작일
    endDate: text('end_date'), // 기간 종료일 (포함). 휴직 중이면 NULL. 기간이 없는 발령은 NULL
    stepAfter: integer('step_after'), // STEP_UP 발령 후 호봉
    gradeAfter: text('grade_after'), // HIRE·PROMOTE 발령 후 직급
    memo: text('memo'),
  },
  (t) => [index('idx_appt_emp').on(t.empNo)],
);

/** 연도별 근무평정 (S > A > B > C) */
export const srcEvaluation = sqliteTable(
  'src_evaluation',
  {
    empNo: text('emp_no').notNull(),
    year: integer('year').notNull(),
    rating: text('rating').notNull(), // S | A | B | C
  },
  (t) => [primaryKey({ columns: [t.empNo, t.year] })],
);

/** 연도별 교육이수시간 */
export const srcTraining = sqliteTable(
  'src_training',
  {
    empNo: text('emp_no').notNull(),
    year: integer('year').notNull(),
    hours: integer('hours').notNull(),
  },
  (t) => [primaryKey({ columns: [t.empNo, t.year] })],
);

/** 포상 이력 */
export const srcAward = sqliteTable('src_award', {
  awardId: text('award_id').primaryKey(),
  empNo: text('emp_no').notNull(),
  awardDate: text('award_date').notNull(),
  awardName: text('award_name').notNull(),
});

/** 인사팀이 엑셀로 수기 관리하던 차기승급일 대장 (SFR-006의 비교 대상) */
export const srcManualStepLedger = sqliteTable('src_manual_step_ledger', {
  empNo: text('emp_no').primaryKey(),
  nextStepDate: text('next_step_date'), // 수기로 적은 차기승급일. 비어 있을 수 있음
  memo: text('memo'),
});

// ─────────────────────────────────────────────
// 본 시스템: 공통
// ─────────────────────────────────────────────

/** 로그인 사용자. P1에서는 사용자 전환(비밀번호 없음), P2에서 비밀번호 로그인 */
export const appUser = sqliteTable('app_user', {
  userId: text('user_id').primaryKey(), // 예: 'hr01', 'u1001'
  name: text('name').notNull(),
  role: text('role').notNull(), // HR(인사팀) | EMPLOYEE(직원) | REVIEWER(심사위원, P3)
  empNo: text('emp_no'), // EMPLOYEE이면 본인 사번
  passwordHash: text('password_hash'), // P2
});

/** 업무 규칙 숫자 (요구사항 3장 가정값) */
export const ruleConfig = sqliteTable('rule_config', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  description: text('description').notNull(),
});

/** 처리 이력: 누가, 언제, 무엇을, 어떤 상태에서 어떤 상태로, 왜 (요구사항 4.1) */
export const processHistory = sqliteTable(
  'process_history',
  {
    histId: integer('hist_id').primaryKey({ autoIncrement: true }),
    entityType: text('entity_type').notNull(), // ROUND | CANDIDATE | APPLICATION | CORRECTION | STEP
    entityId: text('entity_id').notNull(), // 예: 회차 '1', 신청서 '3', 대상자 '1|U1003', 승급 'U1001'
    action: text('action').notNull(), // 요구사항 4.1의 처리 코드
    fromStatus: text('from_status'),
    toStatus: text('to_status'),
    reason: text('reason'), // 정정 사유, 반려 사유, 수동 처리 사유 등
    detailJson: text('detail_json'), // 변경 전후 값 등 추가 정보
    actor: text('actor').notNull(), // user_id 또는 'SYSTEM'
    actedAt: text('acted_at').notNull(),
  },
  (t) => [index('idx_hist_entity').on(t.entityType, t.entityId)],
);

/** 개인정보 접근기록 (요구사항 4.2) */
export const accessLog = sqliteTable('access_log', {
  logId: integer('log_id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull(), // 계정
  ip: text('ip').notNull(), // 접속지 정보
  subjectEmpNo: text('subject_emp_no'), // 정보주체 (누구의 개인정보인가). 여러 명이면 NULL + target에 기록
  action: text('action').notNull(), // VIEW(열람) | UPDATE(수정) | DOWNLOAD(다운로드) | PRINT(인쇄)
  target: text('target').notNull(), // 화면 또는 대상. 예: 'SCR-05 신청서 검토', '심사자료 CSV (6명)'
  reason: text('reason'), // DOWNLOAD는 필수
  actedAt: text('acted_at').notNull(), // 접속일시
});

/** 인사팀 알림 */
export const notification = sqliteTable('notification', {
  notiId: integer('noti_id').primaryKey({ autoIncrement: true }),
  receiver: text('receiver').notNull(), // 'HR' 또는 user_id
  type: text('type').notNull(), // CORRECTION_REQUESTED | APPLICATION_SUBMITTED | STEP_CHANGED
  title: text('title').notNull(),
  body: text('body').notNull(),
  link: text('link'),
  readYn: text('read_yn').notNull().default('N'),
  createdAt: text('created_at').notNull(),
});

/** 메일 발송함. 실제 메일은 보내지 않고 이 테이블에 쌓는다 (요구사항 3.9) */
export const mailOutbox = sqliteTable('mail_outbox', {
  mailId: integer('mail_id').primaryKey({ autoIncrement: true }),
  dedupKey: text('dedup_key').notNull().unique(), // 같은 메일 중복 발송 방지 키
  mailType: text('mail_type').notNull(), // PROMO_INVITE | PROMO_RESULT | STEP_NOTICE | STEP_RESULT
  toEmpNo: text('to_emp_no').notNull(),
  toEmail: text('to_email').notNull(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  createdAt: text('created_at').notNull(),
});

// ─────────────────────────────────────────────
// 본 시스템: 승진 (SFR-001 ~ 004)
// ─────────────────────────────────────────────

/** 승진 회차. 예: 2027년 상반기 정기승진 */
export const promotionRound = sqliteTable('promotion_round', {
  roundId: integer('round_id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  baseDate: text('base_date').notNull(), // 승진 대상자 선정 기준일
  applyStart: text('apply_start').notNull(), // 신청 기간 (안내용)
  applyEnd: text('apply_end').notNull(),
  status: text('status').notNull(), // PREPARING | APPLYING | REVIEWING | RESULT
  createdAt: text('created_at').notNull(),
});

/** 승진 대상자 선정 결과. 선정 실행 시점의 ERP 값을 복사해 둔다 */
export const promotionCandidate = sqliteTable(
  'promotion_candidate',
  {
    roundId: integer('round_id')
      .notNull()
      .references(() => promotionRound.roundId),
    empNo: text('emp_no').notNull(),
    name: text('name').notNull(),
    orgName: text('org_name').notNull(),
    grade: text('grade').notNull(),
    targetGrade: text('target_grade').notNull(),
    gradeDate: text('grade_date').notNull(),
    requiredMonths: integer('required_months').notNull(), // 승진 소요 최저 개월
    excludedDays: integer('excluded_days').notNull(), // 불산입 일수
    qualifyDate: text('qualify_date').notNull(), // 소요기간 충족일
    r1Active: text('r1_active').notNull(), // O | X  기준일 현재 재직·근무 중
    r2Period: text('r2_period').notNull(), // O | X  소요기간 충족
    r3Discipline: text('r3_discipline').notNull(), // O | X  징계 승진제한 없음
    restrictEndDate: text('restrict_end_date'), // 징계 승진제한 종료일 (없으면 NULL)
    autoSelected: text('auto_selected').notNull(), // Y | N  (R1∧R2∧R3)
    manualAction: text('manual_action').notNull().default('NONE'), // NONE | ADD | EXCLUDE
    manualReason: text('manual_reason'),
    finalSelected: text('final_selected').notNull(), // Y | N  최종 대상자 여부
    judgedAt: text('judged_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.roundId, t.empNo] })],
);

/** 승진 신청서 */
export const application = sqliteTable(
  'application',
  {
    appId: integer('app_id').primaryKey({ autoIncrement: true }),
    roundId: integer('round_id')
      .notNull()
      .references(() => promotionRound.roundId),
    empNo: text('emp_no').notNull(),
    status: text('status').notNull(), // NOT_STARTED | DRAFT | SUBMITTED | RETURNED | CONFIRMED
    achievement: text('achievement'), // 주요 업무실적 (직원 입력, 제출 시 필수)
    plan: text('plan'), // 자기개발 계획 (직원 입력, 선택)
    returnReason: text('return_reason'), // 보완 요청 사유
    submittedAt: text('submitted_at'),
    confirmedAt: text('confirmed_at'),
    result: text('result'), // PROMOTED | NOT_PROMOTED (결과 등록 전 NULL)
    resultNotifiedAt: text('result_notified_at'),
  },
  (t) => [unique('uq_application_round_emp').on(t.roundId, t.empNo)],
);

/** 신청서 주요 데이터 항목. 신청서 생성 시 ERP 값을 복사하고, 정정 승인 시 current_value를 바꾼다 */
export const applicationItem = sqliteTable(
  'application_item',
  {
    appId: integer('app_id')
      .notNull()
      .references(() => application.appId),
    itemKey: text('item_key').notNull(), // 요구사항 3.7의 항목 키
    label: text('label').notNull(),
    sortOrder: integer('sort_order').notNull(),
    erpValue: text('erp_value').notNull(), // 생성 시점 ERP 값 (바뀌지 않음)
    currentValue: text('current_value').notNull(), // 현재 값 (정정 승인 시 변경)
    correctable: text('correctable').notNull(), // Y | N  정정 요청 가능 여부
  },
  (t) => [primaryKey({ columns: [t.appId, t.itemKey] })],
);

/** 정정 요청 */
export const correctionRequest = sqliteTable('correction_request', {
  reqId: integer('req_id').primaryKey({ autoIncrement: true }),
  appId: integer('app_id')
    .notNull()
    .references(() => application.appId),
  itemKey: text('item_key').notNull(),
  requestedValue: text('requested_value').notNull(),
  reason: text('reason').notNull(),
  status: text('status').notNull(), // PENDING | APPROVED | REJECTED
  feedback: text('feedback'), // 인사팀 피드백 (반려 시 필수)
  appliedValue: text('applied_value'), // 승인 시 실제 반영한 값
  requestedAt: text('requested_at').notNull(),
  handledBy: text('handled_by'),
  handledAt: text('handled_at'),
});

/** P3: 심사위원 평가 점수 (확장성 실습) */
export const reviewScore = sqliteTable(
  'review_score',
  {
    appId: integer('app_id')
      .notNull()
      .references(() => application.appId),
    reviewerId: text('reviewer_id').notNull(),
    itemKey: text('item_key').notNull(), // 평가 항목. 예: 'ACHIEVEMENT', 'INTERVIEW'
    score: integer('score').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.appId, t.reviewerId, t.itemKey] })],
);

// ─────────────────────────────────────────────
// 본 시스템: 승급 (SFR-005 ~ 007)
// ─────────────────────────────────────────────

/** 차기승급일 관리. 인사마스터에 추가할 "차기승급일 필드"의 역할을 한다 */
export const stepSchedule = sqliteTable('step_schedule', {
  empNo: text('emp_no').primaryKey(),
  name: text('name').notNull(),
  grade: text('grade').notNull(),
  step: integer('step').notNull(),
  stepDate: text('step_date').notNull(), // 계산에 쓴 현 호봉 승급일
  calcStatus: text('calc_status').notNull(), // OK(산정됨) | UNDETERMINED(산정 불가) | EXCLUDED(관리 제외)
  autoNextDate: text('auto_next_date'), // 자동 산정 차기승급일 (OK일 때만)
  excludedDays: integer('excluded_days').notNull(), // 불산입 일수
  calcDetailJson: text('calc_detail_json').notNull(), // 계산 근거 (불산입 기간 목록 등)
  manualDate: text('manual_date'), // 수기 대장 값
  compareStatus: text('compare_status').notNull(), // MATCH | MISMATCH | NO_MANUAL | UNDETERMINED | EXCLUDED
  confirmedDate: text('confirmed_date'), // 인사팀이 확정한 차기승급일 (직원에게 보이는 값)
  confirmSource: text('confirm_source'), // AUTO | MANUAL
  confirmReason: text('confirm_reason'), // MANUAL 확정 시 필수
  confirmedBy: text('confirmed_by'),
  confirmedAt: text('confirmed_at'),
  reviewNeeded: text('review_needed').notNull().default('N'), // Y: 확정 후 발령 변경으로 자동값이 바뀜
  calculatedAt: text('calculated_at').notNull(),
});

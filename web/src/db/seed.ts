
// 시드 데이터 — docs/요구사항.md 8장 인수 시나리오
//
// 실행: npm run db:seed (또는 npm run db:reset). 통합 테스트에서는 seedAll()을 import 해서 쓴다.
// 동작: 모든 테이블을 비운 뒤 Mock ERP(src_), 사용자, 규칙 설정값을 넣는다.
//       승진 회차·신청서·차기승급일 관리 등 본 시스템 업무 데이터는 비워 둔다.
//       이 데이터는 화면에서 업무를 진행하면서 만들어진다.
// 여러 번 실행해도 결과가 같다.

import 'dotenv/config';
import { db } from './client';
import * as s from './schema';
import { hash } from 'bcryptjs';

type Emp = {
  key: string; // 시나리오 ID (E01 ~ E12)
  empNo: string;
  name: string;
  orgId: string;
  grade: string;
  step: number;
  hireDate: string;
  hireGrade: string; // 입사 시 직급
  gradeDate: string;
  stepDate: string;
  status: 'ACTIVE' | 'RETIRED';
  retireDate?: string;
  ratings: Record<number, string>; // 연도별 근무평정
  training: Record<number, number>; // 연도별 교육이수시간
};

const EMPLOYEES: Emp[] = [
  { key: 'E01', empNo: 'U1001', name: '김지훈', orgId: 'ORG02', grade: 'G7', step: 3, hireDate: '2024-01-01', hireGrade: 'G7', gradeDate: '2024-01-01', stepDate: '2026-03-01', status: 'ACTIVE',
    ratings: { 2024: 'A', 2025: 'A', 2026: 'S' }, training: { 2024: 24, 2025: 30, 2026: 28 } },
  { key: 'E02', empNo: 'U1002', name: '이수빈', orgId: 'ORG03', grade: 'G7', step: 2, hireDate: '2025-03-01', hireGrade: 'G7', gradeDate: '2025-03-01', stepDate: '2025-12-01', status: 'ACTIVE',
    ratings: { 2025: 'A', 2026: 'A' }, training: { 2025: 18, 2026: 22 } },
  { key: 'E03', empNo: 'U1003', name: '박민재', orgId: 'ORG04', grade: 'G6', step: 5, hireDate: '2019-07-01', hireGrade: 'G7', gradeDate: '2023-07-01', stepDate: '2026-01-01', status: 'ACTIVE',
    ratings: { 2024: 'A', 2025: 'S', 2026: 'A' }, training: { 2024: 40, 2025: 36, 2026: 32 } },
  { key: 'E04', empNo: 'U1004', name: '최유진', orgId: 'ORG02', grade: 'G6', step: 4, hireDate: '2020-02-01', hireGrade: 'G7', gradeDate: '2023-07-01', stepDate: '2026-02-01', status: 'ACTIVE',
    ratings: { 2024: 'S', 2025: 'A', 2026: 'A' }, training: { 2024: 30, 2025: 20, 2026: 28 } },
  { key: 'E05', empNo: 'U1005', name: '정현수', orgId: 'ORG03', grade: 'G5', step: 6, hireDate: '2015-04-01', hireGrade: 'G7', gradeDate: '2022-01-01', stepDate: '2026-04-01', status: 'ACTIVE',
    ratings: { 2024: 'B', 2025: 'B', 2026: 'A' }, training: { 2024: 18, 2025: 22, 2026: 20 } },
  { key: 'E06', empNo: 'U1006', name: '강서연', orgId: 'ORG04', grade: 'G5', step: 7, hireDate: '2014-06-01', hireGrade: 'G7', gradeDate: '2021-06-01', stepDate: '2026-06-01', status: 'ACTIVE',
    ratings: { 2024: 'A', 2025: 'A', 2026: 'B' }, training: { 2024: 26, 2025: 24, 2026: 30 } },
  { key: 'E07', empNo: 'U1007', name: '조민호', orgId: 'ORG02', grade: 'G4', step: 9, hireDate: '2010-07-01', hireGrade: 'G7', gradeDate: '2022-12-31', stepDate: '2026-07-01', status: 'ACTIVE',
    ratings: { 2024: 'S', 2025: 'S', 2026: 'A' }, training: { 2024: 35, 2025: 40, 2026: 38 } },
  { key: 'E08', empNo: 'U1008', name: '윤하늘', orgId: 'ORG03', grade: 'G6', step: 4, hireDate: '2018-03-01', hireGrade: 'G7', gradeDate: '2022-03-01', stepDate: '2026-03-01', status: 'ACTIVE',
    ratings: { 2024: 'A', 2025: 'B', 2026: 'A' }, training: { 2024: 20, 2025: 16, 2026: 8 } },
  { key: 'E09', empNo: 'U1009', name: '장도현', orgId: 'ORG04', grade: 'G7', step: 2, hireDate: '2023-01-01', hireGrade: 'G7', gradeDate: '2023-01-01', stepDate: '2026-01-01', status: 'RETIRED', retireDate: '2026-08-31',
    ratings: { 2024: 'B', 2025: 'B' }, training: { 2024: 12, 2025: 10 } },
  { key: 'E10', empNo: 'U1010', name: '임정숙', orgId: 'ORG01', grade: 'G3', step: 12, hireDate: '2005-10-15', hireGrade: 'G7', gradeDate: '2019-01-01', stepDate: '2026-10-15', status: 'ACTIVE',
    ratings: { 2024: 'A', 2025: 'A', 2026: 'A' }, training: { 2024: 20, 2025: 20, 2026: 20 } },
  { key: 'E11', empNo: 'U1011', name: '한상우', orgId: 'ORG02', grade: 'G5', step: 8, hireDate: '2013-12-01', hireGrade: 'G7', gradeDate: '2021-01-01', stepDate: '2025-12-01', status: 'ACTIVE',
    ratings: { 2024: 'A', 2025: 'C', 2026: 'B' }, training: { 2024: 22, 2025: 14, 2026: 16 } },
  { key: 'E12', empNo: 'U1012', name: '오세린', orgId: 'ORG03', grade: 'G4', step: 10, hireDate: '2009-07-01', hireGrade: 'G7', gradeDate: '2021-03-01', stepDate: '2026-07-01', status: 'ACTIVE',
    ratings: { 2024: 'A', 2025: 'S', 2026: 'S' }, training: { 2024: 32, 2025: 30, 2026: 24 } },
];

/** 휴직·징계 발령 (시나리오별) */
const EVENTS: (typeof s.srcAppointment.$inferInsert)[] = [
  { apptId: 'A-U1003-L1', empNo: 'U1003', apptType: 'LEAVE', subType: 'SICK', startDate: '2024-03-01', endDate: '2024-08-31', memo: '질병휴직' },
  { apptId: 'A-U1004-L1', empNo: 'U1004', apptType: 'LEAVE', subType: 'CHILDCARE', startDate: '2024-03-01', endDate: '2024-08-31', memo: '육아휴직' },
  { apptId: 'A-U1004-L2', empNo: 'U1004', apptType: 'LEAVE', subType: 'CHILDCARE', startDate: '2026-03-01', endDate: '2026-05-31', memo: '육아휴직' },
  { apptId: 'A-U1005-D1', empNo: 'U1005', apptType: 'DISCIPLINE', subType: 'PAY_CUT', startDate: '2026-03-01', endDate: '2026-05-31', memo: '감봉 3개월' },
  { apptId: 'A-U1006-D1', empNo: 'U1006', apptType: 'DISCIPLINE', subType: 'REPRIMAND', startDate: '2025-01-15', endDate: '2025-01-15', memo: '견책' },
  { apptId: 'A-U1008-L1', empNo: 'U1008', apptType: 'LEAVE', subType: 'PERSONAL', startDate: '2026-09-01', endDate: null, memo: '개인사정 휴직 (복직일 미정)' },
  { apptId: 'A-U1011-D1', empNo: 'U1011', apptType: 'DISCIPLINE', subType: 'SUSPENSION', startDate: '2026-02-01', endDate: '2026-03-31', memo: '정직 2개월' },
  { apptId: 'A-U1012-L1', empNo: 'U1012', apptType: 'LEAVE', subType: 'SICK', startDate: '2026-08-01', endDate: '2026-09-30', memo: '질병휴직' },
];

const AWARDS: (typeof s.srcAward.$inferInsert)[] = [
  { awardId: 'AW-01', empNo: 'U1003', awardDate: '2025-12-20', awardName: '총장 표창' },
  { awardId: 'AW-02', empNo: 'U1006', awardDate: '2024-05-15', awardName: '우수직원 표창' },
  { awardId: 'AW-03', empNo: 'U1007', awardDate: '2026-05-15', awardName: '총장 표창' },
  { awardId: 'AW-04', empNo: 'U1012', awardDate: '2025-12-20', awardName: '총장 표창' },
];

/** 인사팀 수기 대장의 차기승급일. U1010은 대장에 없음 */
const MANUAL_LEDGER: (typeof s.srcManualStepLedger.$inferInsert)[] = [
  { empNo: 'U1001', nextStepDate: '2027-03-01' },
  { empNo: 'U1002', nextStepDate: '2026-12-01' },
  { empNo: 'U1003', nextStepDate: '2027-01-01' },
  { empNo: 'U1004', nextStepDate: '2027-02-01' },
  { empNo: 'U1005', nextStepDate: '2027-04-01' },
  { empNo: 'U1006', nextStepDate: '2027-05-01', memo: '대장 입력 시 오기' },
  { empNo: 'U1007', nextStepDate: '2027-07-01' },
  { empNo: 'U1008', nextStepDate: '2027-03-01', memo: '휴직 반영 전' },
  { empNo: 'U1009', nextStepDate: '2027-01-01', memo: '퇴직자 미정리' },
  { empNo: 'U1011', nextStepDate: '2026-12-01', memo: '정직 반영 전' },
  { empNo: 'U1012', nextStepDate: '2027-07-01', memo: '휴직 반영 전' },
];

async function clearAll() {
  // 자식 테이블부터 지운다 (FK 순서)
  const tables = [
    s.reviewScore, s.correctionRequest, s.applicationItem, s.application, s.promotionCandidate, s.promotionRound,
    s.stepSchedule, s.mailOutbox, s.notification, s.accessLog, s.processHistory, s.ruleConfig, s.appUser,
    s.srcManualStepLedger, s.srcAward, s.srcTraining, s.srcEvaluation, s.srcAppointment, s.srcEmployee, s.srcOrg,
  ];
  for (const t of tables) await db.delete(t);
}

async function seedRules() {
  await db.insert(s.ruleConfig).values([
    { key: 'promotion.min_months.G7', value: '24', description: '7급 → 6급 승진 소요 최저 개월' },
    { key: 'promotion.min_months.G6', value: '36', description: '6급 → 5급 승진 소요 최저 개월' },
    { key: 'promotion.min_months.G5', value: '48', description: '5급 → 4급 승진 소요 최저 개월' },
    { key: 'promotion.min_months.G4', value: '48', description: '4급 → 3급 승진 소요 최저 개월' },
    { key: 'period.non_counting_leave', value: 'SICK,PERSONAL', description: '기간에 산입하지 않는 휴직 유형 (쉼표 구분)' },
    { key: 'period.non_counting_discipline', value: 'SUSPENSION', description: '기간에 산입하지 않는 징계 유형 (쉼표 구분)' },
    { key: 'discipline.restrict_months.REPRIMAND', value: '6', description: '견책 후 승진 제한 개월' },
    { key: 'discipline.restrict_months.PAY_CUT', value: '12', description: '감봉 후 승진 제한 개월' },
    { key: 'discipline.restrict_months.SUSPENSION', value: '18', description: '정직 후 승진 제한 개월' },
    { key: 'step.cycle_months', value: '12', description: '승급 주기 (개월)' },
    { key: 'mail.step_notice_days', value: '30', description: '차기승급일 며칠 전부터 예정 안내 메일을 보내는가' },
    { key: 'mail.step_result_days', value: '30', description: '최근 며칠 이내의 승급 발령에 결과 안내 메일을 보내는가' },
    { key: 'system.default_today', value: '2026-11-01', description: '화면의 기준일 기본값 (실습용 오늘 날짜)' },
  ]);
}

async function seedErp() {
  await db.insert(s.srcOrg).values([
    { orgId: 'ORG01', orgName: '행정처' },
    { orgId: 'ORG02', orgName: '연구처' },
    { orgId: 'ORG03', orgName: '학술정보처' },
    { orgId: 'ORG04', orgName: '기획처' },
  ]);

  await db.insert(s.srcEmployee).values(
    EMPLOYEES.map((e) => ({
      empNo: e.empNo,
      name: e.name,
      orgId: e.orgId,
      grade: e.grade,
      step: e.step,
      hireDate: e.hireDate,
      gradeDate: e.gradeDate,
      stepDate: e.stepDate,
      status: e.status,
      retireDate: e.retireDate ?? null,
      email: `${e.empNo.toLowerCase()}@unist.example`,
      phone: `010-${String(2000 + Number(e.empNo.slice(1)) % 1000).padStart(4, '0')}-${e.empNo.slice(1)}`,
    })),
  );

  // 발령 이력: 임용 → (승진) → 최근 승급 → 휴직·징계
  const appts: (typeof s.srcAppointment.$inferInsert)[] = [];
  for (const e of EMPLOYEES) {
    appts.push({ apptId: `A-${e.empNo}-H`, empNo: e.empNo, apptType: 'HIRE', startDate: e.hireDate, gradeAfter: e.hireGrade, memo: '신규 임용' });
    if (e.gradeDate !== e.hireDate) {
      appts.push({ apptId: `A-${e.empNo}-P`, empNo: e.empNo, apptType: 'PROMOTE', startDate: e.gradeDate, gradeAfter: e.grade, memo: '현 직급 승진 (중간 이력 생략)' });
    }
    appts.push({ apptId: `A-${e.empNo}-S`, empNo: e.empNo, apptType: 'STEP_UP', startDate: e.stepDate, stepAfter: e.step, memo: `${e.step}호봉 승급` });
  }
  appts.push(...EVENTS);
  await db.insert(s.srcAppointment).values(appts);

  await db.insert(s.srcEvaluation).values(
    EMPLOYEES.flatMap((e) => Object.entries(e.ratings).map(([y, r]) => ({ empNo: e.empNo, year: Number(y), rating: r }))),
  );
  await db.insert(s.srcTraining).values(
    EMPLOYEES.flatMap((e) => Object.entries(e.training).map(([y, h]) => ({ empNo: e.empNo, year: Number(y), hours: h }))),
  );
  await db.insert(s.srcAward).values(AWARDS);
  await db.insert(s.srcManualStepLedger).values(MANUAL_LEDGER);
}

async function seedUsers(passwordHash: string) {
  await db.insert(s.appUser).values([
    { userId: 'hr01', name: '이인사 (인사팀)', role: 'HR' },
    ...EMPLOYEES.map((e) => ({ userId: e.empNo.toLowerCase(), name: e.name, role: 'EMPLOYEE', empNo: e.empNo })),
    { userId: 'reviewer01', name: '김심사 (심사위원)', role: 'REVIEWER' },
  ].map((user) => ({ ...user, passwordHash })));
}

let cachedPassword = '';
let cachedHash: Promise<string> | undefined;

/** 모든 테이블을 비우고 시드 데이터를 넣는다. 통합 테스트에서도 호출한다. */
export async function seedAll() {
  const password = process.env.SEED_PASSWORD;
  if (!password || Buffer.byteLength(password, 'utf8') > 72) throw new Error('SEED_PASSWORD를 비어 있지 않은 72바이트 이하 환경변수로 설정해 주세요.');
  if (password !== cachedPassword || !cachedHash) {
    cachedPassword = password;
    cachedHash = hash(password, 10);
  }
  const passwordHash = await cachedHash;
  await clearAll();
  await seedRules();
  await seedErp();
  await seedUsers(passwordHash);
}

// `npm run db:seed` 로 직접 실행했을 때만 동작한다 (테스트에서 import 할 때는 실행되지 않음).
if (process.argv[1]?.endsWith('seed.ts')) {
  seedAll()
    .then(() => console.log('시드 완료'))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

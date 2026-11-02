// src/lib/codes.ts
export const GRADES = [
  { code: "G7", label: "7급", next: "G6" },
  { code: "G6", label: "6급", next: "G5" },
  { code: "G5", label: "5급", next: "G4" },
  { code: "G4", label: "4급", next: "G3" },
  { code: "G3", label: "3급", next: null },
] as const;
export type GradeCode = (typeof GRADES)[number]["code"];

export const LEAVE_TYPES = {
  CHILDCARE: "육아휴직",
  SICK: "질병휴직",
  PERSONAL: "개인사정 휴직",
} as const;
export const DISCIPLINE_TYPES = {
  REPRIMAND: "견책",
  PAY_CUT: "감봉",
  SUSPENSION: "정직",
} as const;

export const ROUND_STATUS = {
  PREPARING: "준비",
  APPLYING: "신청",
  REVIEWING: "검토",
  RESULT: "결과",
} as const;
export const APP_STATUS = {
  NOT_STARTED: "작성 전",
  DRAFT: "작성 중",
  SUBMITTED: "제출",
  RETURNED: "보완 요청",
  CONFIRMED: "확정",
} as const;
export const CORRECTION_STATUS = {
  PENDING: "처리 대기",
  APPROVED: "승인",
  REJECTED: "반려",
} as const;
export const COMPARE_STATUS = {
  MATCH: "일치",
  MISMATCH: "불일치",
  NO_MANUAL: "수기값 없음",
  UNDETERMINED: "산정 불가",
  EXCLUDED: "관리 제외",
} as const;
export const MAIL_TYPES = {
  PROMO_INVITE: "승진 신청 안내",
  PROMO_RESULT: "승진 결과 안내",
  STEP_NOTICE: "승급 예정 안내",
  STEP_RESULT: "승급 결과 안내",
} as const;

/** 요구사항 3.7. year 항목은 기준일 연도 기준으로 만든다 */
export const ITEM_DEFS: {
  key: string;
  label: string;
  correctable: boolean;
}[] = [
  { key: "name", label: "성명", correctable: false },
  { key: "org", label: "소속", correctable: true },
  { key: "grade", label: "현 직급", correctable: false },
  { key: "target_grade", label: "승진 예정 직급", correctable: false },
  { key: "hire_date", label: "입사일", correctable: true },
  { key: "grade_date", label: "현 직급 임용일", correctable: true },
  { key: "qualify_date", label: "소요기간 충족일", correctable: false },

  ...[2024, 2025, 2026].map((year) => ({
    key: `rating_${year}`,
    label: `${year}년 근무평정`,
    correctable: true,
  })),

  ...[2024, 2025, 2026].map((year) => ({
    key: `training_${year}`,
    label: `${year}년 교육이수시간`,
    correctable: true,
  })),

  { key: "awards", label: "포상", correctable: true },
  { key: "disciplines", label: "징계", correctable: true },
];

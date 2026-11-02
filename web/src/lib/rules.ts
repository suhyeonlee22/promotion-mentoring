
import { db } from "@/db/client";
import { ruleConfig } from "@/db/schema";

export type Rules = {
  minMonths: Record<"G7" | "G6" | "G5" | "G4", number>;
  nonCountingLeave: string[];
  nonCountingDiscipline: string[];
  restrictMonths: Record<
    "REPRIMAND" | "PAY_CUT" | "SUSPENSION",
    number
  >;
  stepCycleMonths: number;
  stepNoticeDays: number;
  stepResultDays: number;
  defaultToday: string;
};

export async function loadRules(): Promise<Rules> {
  // 1. DB에서 모든 규칙 조회
  const rows = await db.select().from(ruleConfig);

  // 2. key-value 형태로 변환
  const config = new Map(
    rows.map((row) => [row.key, row.value])
  );

  // 3. 필수 설정값 조회
  function required(key: string): string {
    const value = config.get(key);

    if (value === undefined || value.trim() === "") {
      throw new Error(`필수 규칙이 없습니다: ${key}`);
    }

    return value;
  }

  // 4. 숫자 설정값 변환 및 검증
  function numberValue(key: string): number {
    const raw = required(key);
    const value = Number(raw);

    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`숫자 규칙이 올바르지 않습니다: ${key}`);
    }

    return value;
  }

  // 5. 배열 설정값 변환 및 검증
  function arrayValue(key: string): string[] {
    const raw = required(key);
    const value = raw.split(",").map((item) => item.trim());

    if (value.some((item) => item.length === 0)) {
      throw new Error('배열 규칙 형식이 올바르지 않습니다: ${key}');
    }

    return value;
  }

  // 6. 날짜 설정값 검증
  const defaultToday = required("system.default_today");

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(defaultToday) ||
    Number.isNaN(Date.parse(defaultToday))
  ) {
    throw new Error("기본 기준일 형식이 올바르지 않습니다.");
  }

  // 7. Rules 객체 생성
  return {
    minMonths: {
      G7: numberValue("promotion.min_months.G7"),
      G6: numberValue("promotion.min_months.G6"),
      G5: numberValue("promotion.min_months.G5"),
      G4: numberValue("promotion.min_months.G4"),
    },

    nonCountingLeave: arrayValue(
      "period.non_counting_leave"
    ),

    nonCountingDiscipline: arrayValue(
      "period.non_counting_discipline"
    ),

    restrictMonths: {
      REPRIMAND: numberValue(
        "discipline.restrict_months.REPRIMAND"
      ),
      PAY_CUT: numberValue(
        "discipline.restrict_months.PAY_CUT"
      ),
      SUSPENSION: numberValue(
        "discipline.restrict_months.SUSPENSION"
      ),
    },

    stepCycleMonths: numberValue("step.cycle_months"),

    stepNoticeDays: numberValue("mail.step_notice_days"),

    stepResultDays: numberValue("mail.step_result_days"),

    defaultToday,
  };
}

import type { ApptInput, NonCountingPart } from "./period";
import type { Rules } from "@/lib/rules";
import { addDays, addMonths } from "./date";
import { isNonCounting, nonCountingDays } from "./period";

export type StepInput = {
  status: "ACTIVE" | "RETIRED";
  stepDate: string;
  appointments: ApptInput[];
};

export type StepCalc = {
  calcStatus: "OK" | "UNDETERMINED" | "EXCLUDED";
  autoNextDate: string | null;
  excludedDays: number;
  parts: NonCountingPart[];
  iterations: {
    nextDate: string;
    excludedDays: number;
  }[];
};

export function calcNextStepDate(input: StepInput, rules: Rules): StepCalc {
  const emptyResult = {
    autoNextDate: null,
    excludedDays: 0,
    parts: [],
    iterations: [],
  };

  // 1. 퇴직자는 계산하지 않음
  if (input.status === "RETIRED") {
    return {
      calcStatus: "EXCLUDED",
      ...emptyResult,
    };
  }

  const basicDate = addMonths(input.stepDate, rules.stepCycleMonths);

  // 2. 종료일이 없는 불산입 휴직 확인
  const hasOpenLeave = input.appointments.some(
    (a) =>
      a.apptType === "LEAVE" &&
      a.endDate === null &&
      isNonCounting(a, rules) &&
      a.startDate < basicDate,
  );

  if (hasOpenLeave) {
    return {
      calcStatus: "UNDETERMINED",
      ...emptyResult,
    };
  }

  // 3. 차기승급일 반복 계산
  let nextDate = basicDate;
  const iterations: StepCalc["iterations"] = [];

  for (let i = 0; i < 100; i++) {
    // 차기승급일 전날까지만 계산
    const periodEnd = addDays(nextDate, -1);

    const excluded = nonCountingDays(
      input.appointments,
      input.stepDate,
      periodEnd,
      rules,
      periodEnd,
    );

    const newDate = addDays(basicDate, excluded.days);

    iterations.push({
      nextDate: newDate,
      excludedDays: excluded.days,
    });

    if (newDate === nextDate) {
      return {
        calcStatus: "OK",
        autoNextDate: newDate,
        excludedDays: excluded.days,
        parts: excluded.parts,
        iterations,
      };
    }

    nextDate = newDate;
  }

  // 반복 계산이 수렴하지 않는 예외 상황
  return {
    calcStatus: "UNDETERMINED",
    ...emptyResult,
    iterations,
  };
}

export function compareStatus(
  calc: StepCalc,
  manualDate: string | null,
): "MATCH" | "MISMATCH" | "NO_MANUAL" | "UNDETERMINED" | "EXCLUDED" {
  if (calc.calcStatus === "EXCLUDED") {
    return "EXCLUDED";
  }

  if (calc.calcStatus === "UNDETERMINED") {
    return "UNDETERMINED";
  }

  if (manualDate === null) {
    return "NO_MANUAL";
  }

  return calc.autoNextDate === manualDate ? "MATCH" : "MISMATCH";
}

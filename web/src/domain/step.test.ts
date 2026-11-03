import { describe, it, expect } from "vitest";
import { calcNextStepDate, compareStatus } from "./step";
import type { Rules } from "@/lib/rules";

const rules = {
  stepCycleMonths: 12,
  nonCountingLeave: ["SICK", "PERSONAL"],
  nonCountingDiscipline: ["SUSPENSION"],
} as Rules;

describe("calcNextStepDate", () => {
  it("정상 승급: 12개월 후", () => {
    const result = calcNextStepDate(
      {
        status: "ACTIVE",
        stepDate: "2025-01-01",
        appointments: [],
      },
      rules,
    );

    expect(result.calcStatus).toBe("OK");
    expect(result.autoNextDate).toBe("2026-01-01");
    expect(result.excludedDays).toBe(0);
  });

  it("질병휴직 31일만큼 승급일 연기", () => {
    const result = calcNextStepDate(
      {
        status: "ACTIVE",
        stepDate: "2025-01-01",
        appointments: [
          {
            apptType: "LEAVE",
            subType: "SICK",
            startDate: "2025-03-01",
            endDate: "2025-03-31",
          },
        ],
      },
      rules,
    );

    expect(result.calcStatus).toBe("OK");
    expect(result.autoNextDate).toBe("2026-02-01");
    expect(result.excludedDays).toBe(31);
  });

  it("육아휴직은 불산입하지 않음", () => {
    const result = calcNextStepDate(
      {
        status: "ACTIVE",
        stepDate: "2025-01-01",
        appointments: [
          {
            apptType: "LEAVE",
            subType: "CHILDCARE",
            startDate: "2025-03-01",
            endDate: "2025-03-31",
          },
        ],
      },
      rules,
    );

    expect(result.autoNextDate).toBe("2026-01-01");
  });

  it("퇴직자는 계산 대상 제외", () => {
    const result = calcNextStepDate(
      {
        status: "RETIRED",
        stepDate: "2025-01-01",
        appointments: [],
      },
      rules,
    );

    expect(result.calcStatus).toBe("EXCLUDED");
    expect(result.autoNextDate).toBeNull();
  });

  it("종료되지 않은 질병휴직은 미확정", () => {
    const result = calcNextStepDate(
      {
        status: "ACTIVE",
        stepDate: "2025-01-01",
        appointments: [
          {
            apptType: "LEAVE",
            subType: "SICK",
            startDate: "2025-06-01",
            endDate: null,
          },
        ],
      },
      rules,
    );

    expect(result.calcStatus).toBe("UNDETERMINED");
  });
  it("E03: 승급일 이전 휴직은 영향 없음", () => {
    const result = calcNextStepDate(
      {
        status: "ACTIVE",
        stepDate: "2026-01-01",
        appointments: [
          {
            apptType: "LEAVE",
            subType: "SICK",
            startDate: "2024-03-01",
            endDate: "2024-08-31",
          },
        ],
      },
      rules,
    );

    expect(result.autoNextDate).toBe("2027-01-01");
    expect(result.excludedDays).toBe(0);
  });

  it("E05: 감봉은 승급일에 영향 없음", () => {
    const result = calcNextStepDate(
      {
        status: "ACTIVE",
        stepDate: "2026-04-01",
        appointments: [
          {
            apptType: "DISCIPLINE",
            subType: "PAY_CUT",
            startDate: "2026-03-01",
            endDate: "2026-05-31",
          },
        ],
      },
      rules,
    );

    expect(result.autoNextDate).toBe("2027-04-01");
  });

  it("E08: 복직일 확정 후 122일 반영", () => {
    const result = calcNextStepDate(
      {
        status: "ACTIVE",
        stepDate: "2026-03-01",
        appointments: [
          {
            apptType: "LEAVE",
            subType: "PERSONAL",
            startDate: "2026-09-01",
            endDate: "2026-12-31",
          },
        ],
      },
      rules,
    );

    expect(result.calcStatus).toBe("OK");
    expect(result.excludedDays).toBe(122);
    expect(result.autoNextDate).toBe("2027-07-01");
  });

  it("E11: 정직 59일 반영", () => {
    const result = calcNextStepDate(
      {
        status: "ACTIVE",
        stepDate: "2025-12-01",
        appointments: [
          {
            apptType: "DISCIPLINE",
            subType: "SUSPENSION",
            startDate: "2026-02-01",
            endDate: "2026-03-31",
          },
        ],
      },
      rules,
    );

    expect(result.excludedDays).toBe(59);
    expect(result.autoNextDate).toBe("2027-01-29");
  });
});

describe("compareStatus", () => {
  const calc = calcNextStepDate(
    {
      status: "ACTIVE",
      stepDate: "2025-01-01",
      appointments: [],
    },
    rules,
  );

  it("날짜 일치", () => {
    expect(compareStatus(calc, "2026-01-01")).toBe("MATCH");
  });

  it("날짜 불일치", () => {
    expect(compareStatus(calc, "2026-02-01")).toBe("MISMATCH");
  });

  it("수기 날짜 없음", () => {
    expect(compareStatus(calc, null)).toBe("NO_MANUAL");
  });

  it("반복 계산으로 새 휴직 기간까지 반영", () => {
    const result = calcNextStepDate(
      {
        status: "ACTIVE",
        stepDate: "2026-01-01",
        appointments: [
          {
            apptType: "LEAVE",
            subType: "SICK",
            startDate: "2026-06-01",
            endDate: "2026-06-30",
          },
          {
            apptType: "LEAVE",
            subType: "SICK",
            startDate: "2027-01-15",
            endDate: "2027-01-31",
          },
        ],
      },
      rules,
    );

    expect(result.calcStatus).toBe("OK");
    expect(result.autoNextDate).toBe("2027-02-17");
    expect(result.excludedDays).toBe(47);
  });
});

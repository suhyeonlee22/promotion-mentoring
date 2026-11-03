import { describe, it, expect } from "vitest";
import { judgeCandidate, finalSelected } from "./promotion";
import type { CandidateInput } from "./promotion";
import type { Rules } from "@/lib/rules";

const rules = {
  minMonths: {
    G7: 24,
    G6: 36,
    G5: 48,
    G4: 48,
  },
  nonCountingLeave: ["SICK", "PERSONAL"],
  nonCountingDiscipline: ["SUSPENSION"],
  restrictMonths: {
    REPRIMAND: 6,
    PAY_CUT: 12,
    SUSPENSION: 18,
  },
} as Rules;

const baseDate = "2026-12-31";

// README의 E01 정상 직원 사례 검증
describe("judgeCandidate", () => {
  it("E01: 정상 직원은 자동 선정된다", () => {
    const input: CandidateInput = {
      grade: "G7",
      status: "ACTIVE",
      gradeDate: "2024-01-01",
      appointments: [],
    };

    const result = judgeCandidate(input, baseDate, rules);

    expect(result?.targetGrade).toBe("G6");
    expect(result?.qualifyDate).toBe("2026-01-01");
    expect(result?.r1).toBe("O");
    expect(result?.r2).toBe("O");
    expect(result?.r3).toBe("O");
    expect(result?.autoSelected).toBe(true);
  });

  it("E02: 소요기간 부족", () => {
    const result = judgeCandidate(
      {
        grade: "G7",
        status: "ACTIVE",
        gradeDate: "2025-03-01",
        appointments: [],
      },
      baseDate,
      rules,
    );

    expect(result?.qualifyDate).toBe("2027-03-01");
    expect(result?.r2).toBe("X");
    expect(result?.autoSelected).toBe(false);
  });

  it("E03: 질병휴직 184일 불산입", () => {
    const result = judgeCandidate(
      {
        grade: "G6",
        status: "ACTIVE",
        gradeDate: "2023-07-01",
        appointments: [
          {
            apptType: "LEAVE",
            subType: "SICK",
            startDate: "2024-03-01",
            endDate: "2024-08-31",
          },
        ],
      },
      baseDate,
      rules,
    );

    expect(result?.excludedDays).toBe(184);
    expect(result?.qualifyDate).toBe("2027-01-01");
    expect(result?.r2).toBe("X");
  });

  it("E07: 기준일과 충족일이 같으면 통과", () => {
    const result = judgeCandidate(
      {
        grade: "G4",
        status: "ACTIVE",
        gradeDate: "2022-12-31",
        appointments: [],
      },
      baseDate,
      rules,
    );

    expect(result?.qualifyDate).toBe("2026-12-31");
    expect(result?.r2).toBe("O");
  });

  it("E09: 퇴직자는 제외", () => {
    const result = judgeCandidate(
      {
        grade: "G7",
        status: "RETIRED",
        gradeDate: "2020-01-01",
        appointments: [],
      },
      baseDate,
      rules,
    );

    expect(result?.r1).toBe("X");
    expect(result?.autoSelected).toBe(false);
  });

  it("E10: 3급은 판정 대상 아님", () => {
    const result = judgeCandidate(
      {
        grade: "G3",
        status: "ACTIVE",
        gradeDate: "2020-01-01",
        appointments: [],
      },
      baseDate,
      rules,
    );

    expect(result).toBeNull();
  });

  it("E04: 육아휴직은 불산입하지 않는다", () => {
    const result = judgeCandidate(
      {
        grade: "G6",
        status: "ACTIVE",
        gradeDate: "2023-07-01",
        appointments: [
          {
            apptType: "LEAVE",
            subType: "CHILDCARE",
            startDate: "2024-03-01",
            endDate: "2024-08-31",
          },
          {
            apptType: "LEAVE",
            subType: "CHILDCARE",
            startDate: "2026-03-01",
            endDate: "2026-05-31",
          },
        ],
      },
      baseDate,
      rules,
    );

    expect(result?.excludedDays).toBe(0);
    expect(result?.qualifyDate).toBe("2026-07-01");
    expect(result?.autoSelected).toBe(true);
  });

  it("E05: 감봉에 따른 승진 제한", () => {
    const result = judgeCandidate(
      {
        grade: "G5",
        status: "ACTIVE",
        gradeDate: "2022-01-01",
        appointments: [
          {
            apptType: "DISCIPLINE",
            subType: "PAY_CUT",
            startDate: "2026-03-01",
            endDate: "2026-05-31",
          },
        ],
      },
      baseDate,
      rules,
    );

    expect(result?.restrictEndDate).toBe("2027-05-31");
    expect(result?.r3).toBe("X");
    expect(result?.autoSelected).toBe(false);
  });

  it("E06: 견책 제한 종료 후 선정", () => {
    const result = judgeCandidate(
      {
        grade: "G5",
        status: "ACTIVE",
        gradeDate: "2021-06-01",
        appointments: [
          {
            apptType: "DISCIPLINE",
            subType: "REPRIMAND",
            startDate: "2025-01-15",
            endDate: null,
          },
        ],
      },
      baseDate,
      rules,
    );

    expect(result?.restrictEndDate).toBe("2025-07-15");
    expect(result?.r3).toBe("O");
    expect(result?.autoSelected).toBe(true);
  });

  it("E08: 기준일에 휴직 중인 직원", () => {
    const result = judgeCandidate(
      {
        grade: "G6",
        status: "ACTIVE",
        gradeDate: "2022-03-01",
        appointments: [
          {
            apptType: "LEAVE",
            subType: "PERSONAL",
            startDate: "2026-09-01",
            endDate: null,
          },
        ],
      },
      baseDate,
      rules,
    );

    expect(result?.excludedDays).toBe(122);
    expect(result?.r1).toBe("X");
    expect(result?.autoSelected).toBe(false);
  });

  it("E11: 정직 불산입과 승진 제한", () => {
    const result = judgeCandidate(
      {
        grade: "G5",
        status: "ACTIVE",
        gradeDate: "2021-01-01",
        appointments: [
          {
            apptType: "DISCIPLINE",
            subType: "SUSPENSION",
            startDate: "2026-02-01",
            endDate: "2026-03-31",
          },
        ],
      },
      baseDate,
      rules,
    );

    expect(result?.excludedDays).toBe(59);
    expect(result?.qualifyDate).toBe("2025-03-01");
    expect(result?.restrictEndDate).toBe("2027-09-30");
    expect(result?.r3).toBe("X");
  });

  it("E12: 질병휴직이 있어도 소요기간 충족", () => {
    const result = judgeCandidate(
      {
        grade: "G4",
        status: "ACTIVE",
        gradeDate: "2021-03-01",
        appointments: [
          {
            apptType: "LEAVE",
            subType: "SICK",
            startDate: "2026-08-01",
            endDate: "2026-09-30",
          },
        ],
      },
      baseDate,
      rules,
    );

    expect(result?.excludedDays).toBe(61);
    expect(result?.qualifyDate).toBe("2025-05-01");
    expect(result?.autoSelected).toBe(true);
  });
});

describe("finalSelected", () => {
  it("수동 추가는 최종 선정", () => {
    expect(finalSelected(false, "ADD")).toBe(true);
  });

  it("수동 제외는 최종 미선정", () => {
    expect(finalSelected(true, "EXCLUDE")).toBe(false);
  });

  it("수동 처리 없으면 자동 판정 유지", () => {
    expect(finalSelected(true, "NONE")).toBe(true);
    expect(finalSelected(false, "NONE")).toBe(false);
  });
});

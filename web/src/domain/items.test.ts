import { describe, it, expect } from "vitest";
import { buildApplicationItems } from "./items";
import type { ItemSource } from "./items";
import type { CandidateJudgement } from "./promotion";

const judgement = {
  targetGrade: "G4",
  qualifyDate: "2025-06-01",
} as CandidateJudgement;

const source: ItemSource = {
  name: "테스트 직원",
  orgName: "인사팀",
  grade: "G5",
  hireDate: "2020-01-01",
  gradeDate: "2021-06-01",
  ratings: [{ year: 2026, rating: "B" }],
  training: [],
  awards: [{ date: "2024-05-15", name: "우수직원 표창" }],
  disciplines: [{ date: "2025-01-15", subType: "REPRIMAND" }],
};

describe("buildApplicationItems", () => {
  it("E06: 신청서 항목 15개 생성", () => {
    const items = buildApplicationItems(source, judgement, "2026-12-31");

    expect(items).toHaveLength(15);
    expect(items.map((i) => i.sortOrder)).toEqual(
      Array.from({ length: 15 }, (_, i) => i + 1),
    );

    expect(items.find((i) => i.itemKey === "awards")?.value).toBe(
      "2024-05-15 우수직원 표창",
    );

    expect(items.find((i) => i.itemKey === "disciplines")?.value).toBe(
      "2025-01-15 견책",
    );

    expect(items.find((i) => i.itemKey === "rating_2026")?.value).toBe("B");
  });

  it("E02: 입사 전 연도 자료는 '-' 표시", () => {
    const items = buildApplicationItems(
      {
        ...source,
        hireDate: "2025-03-01",
        gradeDate: "2025-03-01",
        ratings: [],
        training: [],
      },
      judgement,
      "2026-12-31",
    );

    expect(items.find((i) => i.itemKey === "rating_2024")?.value).toBe("-");

    expect(items.find((i) => i.itemKey === "training_2024")?.value).toBe("-");
  });
});

import { describe, it, expect } from "vitest";
import { isNonCounting, nonCountingDays } from "./period";
import type { ApptInput } from "./period";
import type { Rules } from "@/lib/rules";

const rules = {
    nonCountingLeave: ["SICK", "PERSONAL"],
    nonCountingDiscipline: ["SUSPENSION"],
} as Rules;

function makeAppt(
    apptType: ApptInput["apptType"],
    subType: string
): ApptInput {
    return {
        apptType,
        subType,
        startDate: "2024-03-01",
        endDate: "2024-08-31"
    };
}

describe("isNonCounting", () => {
    
    it("질병휴직은 불산입 대상이다", () => {
        const a: ApptInput= {
            apptType: "LEAVE",
            subType: "SICK",
            startDate: "2023-01-01",
            endDate: "2023-01-05"
        };
        const result = isNonCounting(a,rules);

        expect(result).toBe(true);
    });

    it("육아휴직은 근무 기간에 산입한다", () => {
    expect(isNonCounting(makeAppt("LEAVE", "CHILDCARE"), rules)).toBe(false);
    });

    it("정직은 불산입 대상이다", () => {
        expect(isNonCounting(makeAppt("DISCIPLINE", "SUSPENSION"), rules)).toBe(true);
    });

    it("개인휴직은 불산입 대상이다", () => {
        expect(isNonCounting(makeAppt("LEAVE", "PERSONAL"), rules)).toBe(true);
    });

    it("감봉은 근무 기간에 산입한다", () => {
        expect(isNonCounting(makeAppt("DISCIPLINE", "PAY_CUT"), rules)).toBe(false);
    });
});

describe("nonCountingDays", () => {
    it("질병휴직 전체 기가는 184일이다", () => {
       const appts: ApptInput[] = [
            makeAppt("LEAVE", "SICK")
        ];

        const result = nonCountingDays(
            appts,
            "2023-07-01",
            "2026-12-31",
            rules,
            "2026-12-31"
        );

        expect(result.days).toBe(184);
    });
    it("질병휴직 일부 기간은 92일이다", () => {
    const appts: ApptInput[] = [
        makeAppt("LEAVE", "SICK")
    ];

    // 여기에 함수 호출
    const result = nonCountingDays(
        appts,
        "2024-06-01",
        "2026-12-31",
        rules,
        "2026-12-31"
    );

    expect(result.days).toBe(92);
    });

    it("육아휴직은 불산입 일수가 0일이다", () => {
    const appts: ApptInput[] = [
        makeAppt("LEAVE", "CHILDCARE")
    ];

    const result = nonCountingDays(
        appts,
        "2023-07-01",
        "2026-12-31",
        rules,
        "2026-12-31"
    );

    expect(result.days).toBe(0);
});
});
import type { Rules } from "@/lib/rules";
import type { GradeCode } from "@/lib/codes";
import type { ApptInput, NonCountingPart } from "./period";
import { addDays, addMonths } from "./date";
import { nonCountingDays } from "./period";

export type CandidateInput = {
    grade: GradeCode;
    status: "ACTIVE" | "RETIRED";
    gradeDate: string;
    appointments: ApptInput[];
};

export type CandidateJudgement = {
    targetGrade: GradeCode;
    requiredMonths: number;
    excludedDays: number;
    excludedParts: NonCountingPart[];
    qualifyDate: string;
    r1: "O" | "X";
    r2: "O" | "X";
    r3: "O" | "X";
    restrictEndDate: string | null;
    autoSelected: boolean;
};

export function finalSelected(
    autoSelected: boolean,
    manualAction: "NONE" | "ADD" | "EXCLUDE"
): boolean {
    if (manualAction === "ADD") return true;
    if (manualAction === "EXCLUDE") return false;

    return autoSelected;
}

export function judgeCandidate(
    input: CandidateInput,
    baseDate: string,
    rules: Rules
): CandidateJudgement | null {

    if (input.grade === "G3") {
        return null;
    }

    const targetGrades = {
        G7: "G6",
        G6: "G5",
        G5: "G4",
        G4: "G3"
    } as const;

    const targetGrade = targetGrades[input.grade];
    const requiredMonths = rules.minMonths[input.grade];

    const excluded = nonCountingDays(
        input.appointments,
        input.gradeDate,
        baseDate,
        rules,
        baseDate
    );

    const basicDate = addMonths(input.gradeDate, requiredMonths);

    const qualifyDate = addDays(basicDate, excluded.days);

    const onLeave = input.appointments.some(a =>
        a.apptType === "LEAVE" &&
        a.startDate <= baseDate &&
        (a.endDate === null || baseDate <= a.endDate)
    );

    const r1 = input.status === "ACTIVE" && !onLeave ? "O" : "X";

    const r2 = qualifyDate <= baseDate ? "O" : "X";

    let restrictEndDate: string | null = null;

    for (const a of input.appointments) {
        if (a.apptType !== "DISCIPLINE") continue;

        const subType = a.subType;

        if (
            subType !== "REPRIMAND" &&
            subType !== "PAY_CUT" &&
            subType !== "SUSPENSION"
        ) continue;

        const months = rules.restrictMonths[subType];
        const disciplineEnd = a.endDate ?? a.startDate;
        const endDate = addMonths(disciplineEnd, months);

        if (restrictEndDate === null || endDate > restrictEndDate) {
            restrictEndDate = endDate;
        }
    }

    const r3 =
        restrictEndDate === null || baseDate > restrictEndDate
            ? "O"
            : "X";
    const autoSelected = r1 === "O" && r2 === "O" && r3 === "O";
    return {
        targetGrade,
        requiredMonths,
        excludedDays: excluded.days,
        excludedParts: excluded.parts,
        qualifyDate,
        r1,
        r2,
        r3,
        restrictEndDate,
        autoSelected
    };

}
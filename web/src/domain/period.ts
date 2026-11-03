import type { Rules } from "@/lib/rules";
import { daysInclusive } from "./date";

export type ApptInput = {
    apptType: 'HIRE' | 'PROMOTE' | 'STEP_UP' | 'LEAVE' | 'DISCIPLINE';
    subType: string | null;
    startDate: string;
    endDate: string | null;
};

export type NonCountingPart = {
    subType: string;
    start: string;
    end: string;
    days: number;
};

// 휴직이나 징계 기록이 근무 기간에서 제외되는 유형인지 판단
export function isNonCounting(
    a: ApptInput,
    rules: Rules
): boolean {
    if (a.apptType === "LEAVE") {
        return a.subType !== null &&
        rules.nonCountingLeave.includes(a.subType);
    }

    if (a.apptType === "DISCIPLINE") {
        return a.subType !== null &&
        rules.nonCountingDiscipline.includes(a.subType);
    }
    return false;
}

export function nonCountingDays(
    appts: ApptInput[],
    from: string,
    to: string,
    rules: Rules,
    openEndAs: string
): { days: number; parts: NonCountingPart[] } {
    const parts: NonCountingPart[] = [];
    let totalDays = 0;
    for (const a of appts) {
        if (isNonCounting(a, rules) && a.subType !== null) {
            const start = a.startDate < from ? from : a.startDate;
            const endDate = a.endDate ?? openEndAs;
            const end = endDate < to ? endDate : to;
            if (start <= end) {
                const days = daysInclusive(start, end);
                parts.push({
                    subType: a.subType,
                    start,
                    end,
                    days
                });
                totalDays += days;

            }
        }
    }

    return {
        days: totalDays,
        parts
    };
}
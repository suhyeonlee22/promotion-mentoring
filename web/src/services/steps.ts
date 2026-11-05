import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { srcEmployee, srcAppointment, srcManualStepLedger, stepSchedule } from "@/db/schema";
import { calcNextStepDate, compareStatus } from "@/domain/step";
import type { ApptInput } from "@/domain/period";
import { addDays } from "@/domain/date";
import { BusinessError } from "@/lib/error";
import { recordHistory, type Tx } from "@/lib/history";
import { createNotification } from "@/lib/notify";
import { loadRules } from "@/lib/rules";
import type { CurrentUser } from "@/lib/session";

function assertHr(me: CurrentUser | null): asserts me is CurrentUser {
  if (me?.role !== "HR") throw new BusinessError("FORBIDDEN", "인사팀만 처리할 수 있습니다.");
}

export async function recalcAll(me: CurrentUser | null): Promise<{ changed: number; reviewNeeded: number }> {
  assertHr(me);
  const rules = await loadRules();
  return db.transaction(async (tx) => {
    const employees = await tx.select().from(srcEmployee);
    const appointments = await tx.select().from(srcAppointment);
    const ledger = await tx.select().from(srcManualStepLedger);
    const previous = await tx.select().from(stepSchedule);
    const summary = { changed: 0, reviewNeeded: 0 };
    for (const e of employees) {
      if (e.status !== "ACTIVE" && e.status !== "RETIRED") throw new Error("잘못된 ERP 재직 상태입니다.");
      const calc = calcNextStepDate({ status: e.status, stepDate: e.stepDate,
        appointments: appointments.filter((a) => a.empNo === e.empNo).map((a): ApptInput => {
          if (!["HIRE", "PROMOTE", "STEP_UP", "LEAVE", "DISCIPLINE"].includes(a.apptType)) throw new Error("잘못된 ERP 발령 유형입니다.");
          return { ...a, apptType: a.apptType as ApptInput["apptType"] };
        }),
      }, rules);
      const prev = previous.find((p) => p.empNo === e.empNo);
      const changed = (prev?.autoNextDate ?? null) !== calc.autoNextDate;
      const review = changed && !!prev?.confirmedDate;
      const manualDate = ledger.find((l) => l.empNo === e.empNo)?.nextStepDate || null;
      const values = { empNo: e.empNo, name: e.name, grade: e.grade, step: e.step, stepDate: e.stepDate,
        calcStatus: calc.calcStatus, autoNextDate: calc.autoNextDate, excludedDays: calc.excludedDays,
        calcDetailJson: JSON.stringify(calc), manualDate, compareStatus: compareStatus(calc, manualDate),
        calculatedAt: new Date().toISOString(), reviewNeeded: review ? "Y" : (prev?.reviewNeeded ?? "N") };
      await tx.insert(stepSchedule).values(values).onConflictDoUpdate({ target: stepSchedule.empNo, set: values });
      const detail = { before: prev?.autoNextDate ?? null, after: calc.autoNextDate };
      if (changed) summary.changed++;
      if (changed && calc.autoNextDate) await recordHistory(tx, { entityType: "STEP", entityId: e.empNo, action: "STEP_CALCULATED", detail, actor: me.userId });
      if (review) {
        summary.reviewNeeded++;
        await recordHistory(tx, { entityType: "STEP", entityId: e.empNo, action: "STEP_REVIEW_NEEDED", detail, actor: me.userId });
        await createNotification(tx, { receiver: "HR", type: "STEP_CHANGED", title: "차기승급일 재확인 필요", body: `${e.name} (${e.empNo}) 자동 산정값이 변경되었습니다.`, link: `/hr/steps/${e.empNo}` });
      }
    }
    return summary;
  });
}

type Confirmation = { source: "AUTO" } | { source: "MANUAL"; date: string; reason: string };
async function confirm(tx: Tx, me: CurrentUser, row: typeof stepSchedule.$inferSelect, c: Confirmation) {
  if (row.calcStatus === "EXCLUDED") throw new BusinessError("EXCLUDED", "관리 제외 직원은 확정할 수 없습니다.");
  const date = c.source === "AUTO" ? row.autoNextDate : c.date;
  if (!date || (c.source === "AUTO" && row.calcStatus !== "OK")) throw new BusinessError("UNDETERMINED", "자동 산정값이 없어 확정할 수 없습니다.");
  await tx.update(stepSchedule).set({ confirmedDate: date, confirmSource: c.source,
    confirmReason: c.source === "MANUAL" ? c.reason.trim() : null, confirmedBy: me.userId,
    confirmedAt: new Date().toISOString(), reviewNeeded: "N" }).where(eq(stepSchedule.empNo, row.empNo));
  await recordHistory(tx, { entityType: "STEP", entityId: row.empNo, action: "STEP_CONFIRMED",
    reason: c.source === "MANUAL" ? c.reason.trim() : null,
    detail: { before: row.confirmedDate, confirmedDate: date, source: c.source }, actor: me.userId });
}

export async function confirmStep(me: CurrentUser | null, empNo: string, c: Confirmation): Promise<void> {
  assertHr(me);
  if (!c || !["AUTO", "MANUAL"].includes(c.source)) throw new BusinessError("INVALID_SOURCE", "확정 방식을 선택해 주세요.");
  if (c.source === "MANUAL") {
    if (typeof c.reason !== "string" || !c.reason.trim()) throw new BusinessError("REASON_REQUIRED", "직접 입력 사유가 필요합니다.");
    if (typeof c.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(c.date) || addDays(c.date, 0) !== c.date) throw new BusinessError("INVALID_DATE", "올바른 날짜를 입력해 주세요.");
  }
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(stepSchedule).where(eq(stepSchedule.empNo, empNo));
    if (!row) throw new BusinessError("NOT_FOUND", "재계산 결과에 없는 직원입니다.");
    await confirm(tx, me, row, c);
  });
}

export async function bulkConfirmMatched(me: CurrentUser | null): Promise<number> {
  assertHr(me);
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(stepSchedule).where(and(eq(stepSchedule.compareStatus, "MATCH"), isNull(stepSchedule.confirmedDate)));
    for (const row of rows) await confirm(tx, me, row, { source: "AUTO" });
    return rows.length;
  });
}

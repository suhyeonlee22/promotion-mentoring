import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { srcAppointment, srcEmployee, srcManualStepLedger } from "@/db/schema";
import { BusinessError } from "@/lib/error";
import { DISCIPLINE_TYPES, GRADES, LEAVE_TYPES } from "@/lib/codes";
import type { CurrentUser } from "@/lib/session";
import type { Tx } from "@/lib/history";
import { addDays } from "@/domain/date";

export type AppointmentInput = {
  apptId: string; empNo: string; apptType: string; subType: string | null;
  startDate: string; endDate: string | null; stepAfter: number | null;
  gradeAfter: string | null; memo: string | null;
};
function assertHr(me: CurrentUser | null) {
  if (me?.role !== "HR") throw new BusinessError("FORBIDDEN", "인사팀만 Mock ERP를 편집할 수 있습니다.");
}
function text(value: string, label: string) {
  if (typeof value !== "string" || !value.trim()) throw new BusinessError("REQUIRED", `${label}을 입력해 주세요.`);
  return value.trim();
}
function date(value: string) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || addDays(value, 0) !== value) throw new BusinessError("INVALID_DATE", "올바른 날짜를 입력해 주세요.");
}
async function employeeExists(tx: Tx, empNo: string) {
  const [employee] = await tx.select().from(srcEmployee).where(eq(srcEmployee.empNo, empNo));
  if (!employee) throw new BusinessError("NOT_FOUND", "ERP에 없는 직원입니다.");
}
function validateAppointment(input: AppointmentInput): AppointmentInput {
  const apptId = text(input.apptId, "발령 ID");
  const empNo = text(input.empNo, "사번");
  if (!["HIRE", "PROMOTE", "STEP_UP", "LEAVE", "DISCIPLINE"].includes(input.apptType)) throw new BusinessError("INVALID_TYPE", "올바른 발령 유형을 선택해 주세요.");
  date(input.startDate);
  if (input.endDate) {
    date(input.endDate);
    if (input.endDate < input.startDate) throw new BusinessError("INVALID_PERIOD", "종료일은 시작일보다 빠를 수 없습니다.");
  }
  const types = input.apptType === "LEAVE" ? LEAVE_TYPES : input.apptType === "DISCIPLINE" ? DISCIPLINE_TYPES : null;
  if (types ? !Object.keys(types).includes(input.subType ?? "") : !!input.subType) throw new BusinessError("INVALID_SUBTYPE", "발령 유형에 맞는 세부 유형을 선택해 주세요.");
  if (input.stepAfter !== null && (!Number.isSafeInteger(input.stepAfter) || input.stepAfter < 1)) throw new BusinessError("INVALID_STEP", "발령 후 호봉은 양의 정수여야 합니다.");
  if (input.apptType === "STEP_UP" && input.stepAfter === null) throw new BusinessError("INVALID_STEP", "승급 발령에는 발령 후 호봉이 필요합니다.");
  if (input.gradeAfter !== null && !GRADES.some((g) => g.code === input.gradeAfter)) throw new BusinessError("INVALID_GRADE", "올바른 직급을 선택해 주세요.");
  if (["HIRE", "PROMOTE"].includes(input.apptType) && !input.gradeAfter) throw new BusinessError("INVALID_GRADE", "임용·승진 발령에는 발령 후 직급이 필요합니다.");
  return { ...input, apptId, empNo, endDate: input.endDate || null, memo: input.memo?.trim() || null };
}

/** 실습용 원천 데이터 변경. 업무 처리 이력은 재계산 등 실제 업무 실행 때 기록한다. */
export async function saveAppointment(me: CurrentUser | null, mode: "ADD" | "UPDATE", input: AppointmentInput): Promise<void> {
  assertHr(me);
  if (mode !== "ADD" && mode !== "UPDATE") throw new BusinessError("INVALID_ACTION", "올바른 편집 작업을 선택해 주세요.");
  const values = validateAppointment(input);
  await db.transaction(async (tx) => {
    await employeeExists(tx, values.empNo);
    const [existing] = await tx.select().from(srcAppointment).where(eq(srcAppointment.apptId, values.apptId));
    if (mode === "ADD") {
      if (existing) throw new BusinessError("DUPLICATE", "이미 사용 중인 발령 ID입니다.");
      await tx.insert(srcAppointment).values(values);
    } else {
      if (!existing) throw new BusinessError("NOT_FOUND", "발령을 찾을 수 없습니다.");
      await tx.update(srcAppointment).set(values).where(eq(srcAppointment.apptId, values.apptId));
    }
  });
}
export async function deleteAppointment(me: CurrentUser | null, apptId: string): Promise<void> {
  assertHr(me);
  const id = text(apptId, "발령 ID");
  await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(srcAppointment).where(eq(srcAppointment.apptId, id));
    if (!existing) throw new BusinessError("NOT_FOUND", "발령을 찾을 수 없습니다.");
    await tx.delete(srcAppointment).where(eq(srcAppointment.apptId, id));
  });
}
export async function updateManualLedger(me: CurrentUser | null, empNo: string, input: { nextStepDate: string | null; memo: string | null }): Promise<void> {
  assertHr(me);
  const id = text(empNo, "사번");
  if (input.nextStepDate !== null) date(input.nextStepDate);
  await db.transaction(async (tx) => {
    await employeeExists(tx, id);
    const [existing] = await tx.select().from(srcManualStepLedger).where(eq(srcManualStepLedger.empNo, id));
    if (!existing) throw new BusinessError("NOT_FOUND", "수기 대장에 없는 직원입니다.");
    await tx.update(srcManualStepLedger).set({ nextStepDate: input.nextStepDate, memo: input.memo?.trim() || null }).where(eq(srcManualStepLedger.empNo, id));
  });
}

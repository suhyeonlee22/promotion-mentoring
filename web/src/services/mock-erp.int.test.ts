import { beforeEach, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { seedAll } from "@/db/seed";
import * as s from "@/db/schema";
import { BusinessError } from "@/lib/error";
import { saveAppointment, deleteAppointment, updateManualLedger, type AppointmentInput } from "./mock-erp";
const hr = { userId: "hr01", name: "인사팀", role: "HR" as const, empNo: null };
const leave: AppointmentInput = { apptId: "TEST-E01", empNo: "U1001", apptType: "LEAVE", subType: "SICK", startDate: "2026-11-10", endDate: "2026-12-09", stepAfter: null, gradeAfter: null, memo: "질병휴직" };
beforeEach(async () => {
  if (process.env.DATABASE_URL !== "file:test.db") throw new Error("테스트 전용 DB가 아닙니다.");
  vi.restoreAllMocks(); await seedAll();
});
it("발령 추가·수정·삭제와 수기 대장 수정, ERP 자체 편집의 업무 이력 0건", async () => {
  await saveAppointment(hr, "ADD", leave);
  await saveAppointment(hr, "UPDATE", { ...leave, endDate: "2026-12-31", memo: "변경" });
  expect((await db.select().from(s.srcAppointment).where(eq(s.srcAppointment.apptId, leave.apptId)))[0]).toMatchObject({ endDate: "2026-12-31", memo: "변경" });
  await deleteAppointment(hr, leave.apptId);
  expect(await db.select().from(s.srcAppointment).where(eq(s.srcAppointment.apptId, leave.apptId))).toHaveLength(0);
  await updateManualLedger(hr, "U1006", { nextStepDate: "2027-06-01", memo: "오기 수정" });
  expect((await db.select().from(s.srcManualStepLedger).where(eq(s.srcManualStepLedger.empNo, "U1006")))[0]).toMatchObject({ nextStepDate: "2027-06-01", memo: "오기 수정" });
  await updateManualLedger(hr, "U1006", { nextStepDate: null, memo: null });
  expect((await db.select().from(s.srcManualStepLedger).where(eq(s.srcManualStepLedger.empNo, "U1006")))[0].nextStepDate).toBeNull();
  expect(await db.select().from(s.processHistory)).toHaveLength(0);
  expect(await db.select().from(s.accessLog)).toHaveLength(0);
});
it.each([
  { apptId: " " }, { empNo: "missing" }, { apptType: "BAD" }, { subType: "CHILD" },
  { startDate: "2026-02-30" }, { endDate: "2026-11-09" }, { endDate: "2026-13-01" },
  { apptType: "DISCIPLINE", subType: "SICK" }, { apptType: "STEP_UP", subType: null },
  { apptType: "HIRE", subType: null }, { stepAfter: -1 }, { stepAfter: 1.5 }, { gradeAfter: "G2" },
])("잘못된 발령 입력 차단: %j", async (invalid) => {
  await expect(saveAppointment(hr, "ADD", { ...leave, ...invalid })).rejects.toBeInstanceOf(BusinessError);
  expect(await db.select().from(s.srcAppointment).where(eq(s.srcAppointment.apptId, leave.apptId))).toHaveLength(0);
});
it("중복 ID, 없는 수정·삭제 대상, 없는 수기 대장 및 잘못된 대장 날짜 차단", async () => {
  await saveAppointment(hr, "ADD", leave);
  await expect(saveAppointment(hr, "ADD", leave)).rejects.toBeInstanceOf(BusinessError);
  await expect(saveAppointment(hr, "UPDATE", { ...leave, apptId: "missing" })).rejects.toBeInstanceOf(BusinessError);
  await expect(deleteAppointment(hr, "missing")).rejects.toBeInstanceOf(BusinessError);
  await expect(updateManualLedger(hr, "U1010", { nextStepDate: "2027-01-01", memo: null })).rejects.toBeInstanceOf(BusinessError);
  await expect(updateManualLedger(hr, "missing", { nextStepDate: null, memo: null })).rejects.toBeInstanceOf(BusinessError);
  await expect(updateManualLedger(hr, "U1006", { nextStepDate: "2027-02-30", memo: null })).rejects.toBeInstanceOf(BusinessError);
});
it("모든 ERP 변경 서비스는 HR만 허용", async () => {
  for (const me of [null, { ...hr, role: "EMPLOYEE" as const }, { ...hr, role: "REVIEWER" as const }]) {
    await expect(saveAppointment(me, "ADD", leave)).rejects.toBeInstanceOf(BusinessError);
    await expect(deleteAppointment(me, "A-U1001-S")).rejects.toBeInstanceOf(BusinessError);
    await expect(updateManualLedger(me, "U1006", { nextStepDate: null, memo: null })).rejects.toBeInstanceOf(BusinessError);
  }
});

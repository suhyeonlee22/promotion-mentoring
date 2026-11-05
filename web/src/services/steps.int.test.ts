import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { seedAll } from "@/db/seed";
import * as s from "@/db/schema";
import * as history from "@/lib/history";
import * as mail from "@/lib/mail";
import { BusinessError } from "@/lib/error";
import type { CurrentUser } from "@/lib/session";
import { recalcAll, confirmStep, bulkConfirmMatched, sendStepMails } from "./steps";
const hr: CurrentUser = { userId: "hr01", name: "이인사", role: "HR", empNo: null };
async function row(empNo: string) { return (await db.select().from(s.stepSchedule).where(eq(s.stepSchedule.empNo, empNo)))[0]; }
async function histories(action: string) { return db.select().from(s.processHistory).where(eq(s.processHistory.action, action)); }
describe("STEP 10 차기승급일", () => {
  beforeEach(async () => {
    if (process.env.DATABASE_URL !== "file:test.db") throw new Error("테스트 전용 DB가 아닙니다.");
    vi.restoreAllMocks(); await seedAll();
  });
  it("8.5 정답표 12행과 STEP_CALCULATED 10건 및 재계산 멱등성", async () => {
    expect(await recalcAll(hr)).toEqual({ changed: 10, reviewNeeded: 0 });
    const rows = await db.select().from(s.stepSchedule).orderBy(s.stepSchedule.empNo);
    expect(rows.map((r) => [r.empNo, r.calcStatus === "EXCLUDED" ? null : r.stepDate, r.excludedDays, r.autoNextDate, r.manualDate, r.compareStatus])).toEqual([
      ["U1001", "2026-03-01", 0, "2027-03-01", "2027-03-01", "MATCH"],
      ["U1002", "2025-12-01", 0, "2026-12-01", "2026-12-01", "MATCH"],
      ["U1003", "2026-01-01", 0, "2027-01-01", "2027-01-01", "MATCH"],
      ["U1004", "2026-02-01", 0, "2027-02-01", "2027-02-01", "MATCH"],
      ["U1005", "2026-04-01", 0, "2027-04-01", "2027-04-01", "MATCH"],
      ["U1006", "2026-06-01", 0, "2027-06-01", "2027-05-01", "MISMATCH"],
      ["U1007", "2026-07-01", 0, "2027-07-01", "2027-07-01", "MATCH"],
      ["U1008", "2026-03-01", 0, null, "2027-03-01", "UNDETERMINED"],
      ["U1009", null, 0, null, "2027-01-01", "EXCLUDED"],
      ["U1010", "2026-10-15", 0, "2027-10-15", null, "NO_MANUAL"],
      ["U1011", "2025-12-01", 59, "2027-01-29", "2026-12-01", "MISMATCH"],
      ["U1012", "2026-07-01", 61, "2027-08-31", "2027-07-01", "MISMATCH"],
    ]);
    expect(await histories("STEP_CALCULATED")).toHaveLength(10);
    const before = await db.select().from(s.processHistory);
    expect(await recalcAll(hr)).toEqual({ changed: 0, reviewNeeded: 0 });
    expect(await db.select().from(s.processHistory)).toEqual(before);
    expect(await db.select().from(s.notification)).toHaveLength(0);
  });
  it("8.6 일괄 AUTO 6명과 개별 AUTO/MANUAL 확정", async () => {
    await recalcAll(hr);
    expect(await bulkConfirmMatched(hr)).toBe(6);
    expect(await bulkConfirmMatched(hr)).toBe(0);
    expect((await db.select().from(s.stepSchedule)).filter((r) => r.confirmSource === "AUTO")).toHaveLength(6);
    for (const empNo of ["U1011", "U1012", "U1010"]) await confirmStep(hr, empNo, { source: "AUTO" });
    await confirmStep(hr, "U1006", { source: "MANUAL", date: "2027-06-01", reason: "수기 대장 오기 정정" });
    await confirmStep(hr, "U1008", { source: "MANUAL", date: "2027-03-01", reason: "복직 예정일 기준 임시 확정" });
    expect(await row("U1011")).toMatchObject({ confirmedDate: "2027-01-29", confirmSource: "AUTO" });
    expect(await row("U1012")).toMatchObject({ confirmedDate: "2027-08-31", confirmSource: "AUTO" });
    expect(await row("U1010")).toMatchObject({ confirmedDate: "2027-10-15", confirmSource: "AUTO" });
    expect(await row("U1006")).toMatchObject({ confirmedDate: "2027-06-01", confirmSource: "MANUAL", confirmReason: "수기 대장 오기 정정" });
    expect(await row("U1008")).toMatchObject({ confirmedDate: "2027-03-01", confirmSource: "MANUAL" });
    expect(await histories("STEP_CONFIRMED")).toHaveLength(11);
  });
  it("산정 불가 AUTO, 사유 누락, 잘못된 날짜와 방식, 없는 직원, 관리 제외 차단", async () => {
    await recalcAll(hr);
    for (const [empNo, c] of [
      ["U1008", { source: "AUTO" }], ["U1006", { source: "MANUAL", date: "2027-06-01", reason: " " }],
      ["U1006", { source: "MANUAL", date: "2027-02-30", reason: "오기 정정" }],
      ["U1006", { source: "BAD" }], ["missing", { source: "AUTO" }],
      ["U1009", { source: "MANUAL", date: "2027-01-01", reason: "제외" }],
    ] as const) await expect(confirmStep(hr, empNo, c as Parameters<typeof confirmStep>[2])).rejects.toBeInstanceOf(BusinessError);
    expect(await histories("STEP_CONFIRMED")).toHaveLength(0);
  });
  it("8.7 E01 휴직 변경 감지, 확정값 보존, 멱등성, 재확정", async () => {
    await recalcAll(hr); await bulkConfirmMatched(hr);
    const before = await row("U1001");
    await db.insert(s.srcAppointment).values({ apptId: "TEST-E01", empNo: "U1001", apptType: "LEAVE", subType: "SICK", startDate: "2026-11-10", endDate: "2026-12-09" });
    expect(await recalcAll(hr)).toEqual({ changed: 1, reviewNeeded: 1 });
    expect(await row("U1001")).toMatchObject({ autoNextDate: "2027-03-31", excludedDays: 30, confirmedDate: "2027-03-01", confirmedAt: before.confirmedAt, confirmedBy: before.confirmedBy, compareStatus: "MISMATCH", reviewNeeded: "Y" });
    expect(await histories("STEP_REVIEW_NEEDED")).toHaveLength(1);
    expect(await db.select().from(s.notification)).toMatchObject([{ type: "STEP_CHANGED", receiver: "HR", link: "/hr/steps/U1001" }]);
    await recalcAll(hr);
    expect(await histories("STEP_CALCULATED")).toHaveLength(11);
    expect(await histories("STEP_REVIEW_NEEDED")).toHaveLength(1);
    expect(await db.select().from(s.notification)).toHaveLength(1);
    await confirmStep(hr, "U1001", { source: "AUTO" });
    expect(await row("U1001")).toMatchObject({ confirmedDate: "2027-03-31", reviewNeeded: "N" });
  });
  it("8.7 E08 복직 및 E06 수기 대장만 수정", async () => {
    await recalcAll(hr);
    await confirmStep(hr, "U1008", { source: "MANUAL", date: "2027-03-01", reason: "복직 예정일 기준 임시 확정" });
    await confirmStep(hr, "U1006", { source: "MANUAL", date: "2027-06-01", reason: "수기 대장 오기 정정" });
    await db.update(s.srcAppointment).set({ endDate: "2026-12-31" }).where(eq(s.srcAppointment.empNo, "U1008"));
    await db.update(s.srcManualStepLedger).set({ nextStepDate: "2027-06-01" }).where(eq(s.srcManualStepLedger.empNo, "U1006"));
    expect(await recalcAll(hr)).toEqual({ changed: 1, reviewNeeded: 1 });
    expect(await row("U1008")).toMatchObject({ autoNextDate: "2027-07-01", excludedDays: 122, compareStatus: "MISMATCH", confirmedDate: "2027-03-01", reviewNeeded: "Y" });
    expect(await row("U1006")).toMatchObject({ compareStatus: "MATCH", confirmedDate: "2027-06-01", reviewNeeded: "N" });
    expect(await db.select().from(s.notification)).toHaveLength(1);
  });
  it("HR 권한과 처리 이력 실패 시 롤백", async () => {
    const employee: CurrentUser = { ...hr, role: "EMPLOYEE", userId: "u1001", empNo: "U1001" };
    for (const me of [null, employee]) {
      await expect(recalcAll(me)).rejects.toBeInstanceOf(BusinessError);
      await expect(bulkConfirmMatched(me)).rejects.toBeInstanceOf(BusinessError);
      await expect(confirmStep(me, "U1001", { source: "AUTO" })).rejects.toBeInstanceOf(BusinessError);
    }
    vi.spyOn(history, "recordHistory").mockRejectedValue(new Error("history failed"));
    await expect(recalcAll(hr)).rejects.toThrow("history failed");
    expect(await db.select().from(s.stepSchedule)).toHaveLength(0);
    expect(await db.select().from(s.notification)).toHaveLength(0);
  });
  it("개별·일괄 확정 이력 실패 시 확정값도 롤백", async () => {
    await recalcAll(hr);
    vi.spyOn(history, "recordHistory").mockRejectedValue(new Error("history failed"));
    await expect(confirmStep(hr, "U1001", { source: "AUTO" })).rejects.toThrow("history failed");
    await expect(bulkConfirmMatched(hr)).rejects.toThrow("history failed");
    expect((await db.select().from(s.stepSchedule)).every((r) => r.confirmedDate === null)).toBe(true);
    expect(await histories("STEP_CONFIRMED")).toHaveLength(0);
  });
});

describe("STEP 11 승급 안내 메일", () => {
  beforeEach(async () => {
    if (process.env.DATABASE_URL !== "file:test.db") throw new Error("테스트 전용 DB가 아닙니다.");
    vi.restoreAllMocks(); await seedAll();
  });
  it("8.6의 1~7 후 11월 안내 2건, 재실행 0건, 12월 안내 2건 및 정확한 중복 방지 키", async () => {
    await recalcAll(hr); await recalcAll(hr); await bulkConfirmMatched(hr);
    for (const empNo of ["U1011", "U1012", "U1010"]) await confirmStep(hr, empNo, { source: "AUTO" });
    await confirmStep(hr, "U1006", { source: "MANUAL", date: "2027-06-01", reason: "수기 대장 오기 정정" });
    await confirmStep(hr, "U1008", { source: "MANUAL", date: "2027-03-01", reason: "복직 예정일 기준 임시 확정" });
    const first = await sendStepMails(hr, "2026-11-01");
    expect(first).toHaveLength(2);
    expect(first).toEqual(expect.arrayContaining([
      expect.objectContaining({ toEmpNo: "U1002", mailType: "STEP_NOTICE", dedupKey: "STEP_NOTICE|U1002|2026-12-01", subject: "[승급] 차기 승급 예정 안내 (2026-12-01)" }),
      expect.objectContaining({ toEmpNo: "U1010", mailType: "STEP_RESULT", dedupKey: "STEP_RESULT|A-U1010-S", subject: "[승급] 승급 결과 안내 (12호봉)" }),
    ]));
    expect(first.find((m) => m.toEmpNo === "U1002")?.body).toContain("이수빈");
    expect(first.find((m) => m.toEmpNo === "U1010")?.body).toContain("12호봉");
    expect(await sendStepMails(hr, "2026-11-01")).toEqual([]);
    const next = await sendStepMails(hr, "2026-12-31");
    expect(next.map((m) => [m.toEmpNo, m.mailType, m.dedupKey])).toEqual([
      ["U1003", "STEP_NOTICE", "STEP_NOTICE|U1003|2027-01-01"],
      ["U1011", "STEP_NOTICE", "STEP_NOTICE|U1011|2027-01-29"],
    ]);
    expect(await db.select().from(s.mailOutbox)).toHaveLength(4);
  });
  it("미확정이면 예정 안내 0건, ERP 결과 안내 1건 (일정 재계산 전에도 동일)", async () => {
    const mails = await sendStepMails(hr, "2026-11-01");
    expect(mails).toMatchObject([{ toEmpNo: "U1010", mailType: "STEP_RESULT" }]);
    await recalcAll(hr);
    expect(await sendStepMails(hr, "2026-11-01")).toEqual([]);
  });
  it("재직자 조건과 확정값만 사용, 산정 불가 MANUAL 확정도 안내", async () => {
    await recalcAll(hr); await bulkConfirmMatched(hr);
    await confirmStep(hr, "U1008", { source: "MANUAL", date: "2026-11-15", reason: "복직 예정일 임시 확정" });
    await db.update(s.srcEmployee).set({ status: "RETIRED" }).where(eq(s.srcEmployee.empNo, "U1002"));
    await db.update(s.srcEmployee).set({ status: "RETIRED" }).where(eq(s.srcEmployee.empNo, "U1010"));
    expect(await sendStepMails(hr, "2026-11-01")).toMatchObject([{ toEmpNo: "U1008", mailType: "STEP_NOTICE", dedupKey: "STEP_NOTICE|U1008|2026-11-15" }]);
  });
  it("loadRules 안내 기간을 사용하고 SYSTEM(HR) 실행 지원", async () => {
    await recalcAll(hr); await bulkConfirmMatched(hr);
    await db.update(s.ruleConfig).set({ value: "29" }).where(eq(s.ruleConfig.key, "mail.step_notice_days"));
    await db.update(s.ruleConfig).set({ value: "16" }).where(eq(s.ruleConfig.key, "mail.step_result_days"));
    expect(await sendStepMails({ ...hr, userId: "SYSTEM" }, "2026-11-01")).toEqual([]);
  });
  it("HR 권한, 유효한 기준일 검사 및 메일 생성 실패 시 전체 롤백", async () => {
    for (const me of [null, { ...hr, role: "EMPLOYEE" as const }, { ...hr, role: "REVIEWER" as const }]) {
      await expect(sendStepMails(me, "2026-11-01")).rejects.toBeInstanceOf(BusinessError);
    }
    for (const today of ["", "2026-02-30", "2026-13-01", "bad"]) await expect(sendStepMails(hr, today)).rejects.toBeInstanceOf(BusinessError);
    await recalcAll(hr); await bulkConfirmMatched(hr);
    const original = mail.queueMail;
    let calls = 0;
    vi.spyOn(mail, "queueMail").mockImplementation(async (...args) => {
      if (++calls === 2) throw new Error("mail failed");
      return original(...args);
    });
    await expect(sendStepMails(hr, "2026-11-01")).rejects.toThrow("mail failed");
    expect(await db.select().from(s.mailOutbox)).toHaveLength(0);
  });
});

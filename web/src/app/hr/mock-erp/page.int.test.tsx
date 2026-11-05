import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { seedAll } from "@/db/seed";
import * as s from "@/db/schema";
import { requireRole } from "@/lib/session";
import { recalcAll, bulkConfirmMatched, confirmStep } from "@/services/steps";
import { editMockErpAction } from "./actions";
import MockErpPage from "./page";
import HistoryPage from "../history/page";
vi.mock("@/lib/session", () => ({ requireRole: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); }, redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));
const hr = { userId: "hr01", name: "인사팀", role: "HR" as const, empNo: null };
const leave = { operation: "ADD", apptId: "TEST-E01", empNo: "U1001", apptType: "LEAVE", subType: "SICK", startDate: "2026-11-10", endDate: "2026-12-09" };
function form(values: Record<string, string>) { const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, value); return data; }
const edit = (values: Record<string, string>) => editMockErpAction(form(values));
const page = (table?: string) => MockErpPage({ params: Promise.resolve({}), searchParams: Promise.resolve(table ? { table } : {}) });
async function schedule(empNo: string) { return (await db.select().from(s.stepSchedule).where(eq(s.stepSchedule.empNo, empNo)))[0]; }
beforeEach(async () => {
  if (process.env.DATABASE_URL !== "file:test.db") throw new Error("테스트 전용 DB가 아닙니다.");
  vi.resetAllMocks(); vi.stubGlobal("React", React); vi.mocked(requireRole).mockResolvedValue(hr); await seedAll();
});
it("발령 목록·추가·수정·삭제 폼과 수기 대장 목록·수정 폼 표시", async () => {
  const appts = renderToStaticMarkup(await page());
  for (const value of ["발령 추가", "발령 삭제", "수정 저장", "A-U1001-S", "SICK", "재계산"]) expect(appts).toContain(value);
  const ledger = renderToStaticMarkup(await page("src_manual_step_ledger"));
  expect(ledger).toContain("대장 수정"); expect(ledger).toContain('value="2027-05-01"');
  await expect(page("src_employee")).rejects.toThrow("NOT_FOUND");
});
it("8.7 편집 액션 → 재계산 → STEP_REVIEW_NEEDED 조회 및 재확정", async () => {
  await recalcAll(hr); await bulkConfirmMatched(hr);
  await confirmStep(hr, "U1006", { source: "MANUAL", date: "2027-06-01", reason: "수기 대장 오기 정정" });
  await confirmStep(hr, "U1008", { source: "MANUAL", date: "2027-03-01", reason: "복직 예정일 기준 임시 확정" });
  const before = await db.select().from(s.processHistory);
  await expect(edit(leave)).rejects.toThrow("saved=1");
  expect(await db.select().from(s.processHistory)).toEqual(before);
  expect(await recalcAll(hr)).toEqual({ changed: 1, reviewNeeded: 1 });
  expect(await schedule("U1001")).toMatchObject({ autoNextDate: "2027-03-31", confirmedDate: "2027-03-01", excludedDays: 30, reviewNeeded: "Y" });
  expect(await db.select().from(s.notification)).toHaveLength(1);
  const html = renderToStaticMarkup(await HistoryPage({ params: Promise.resolve({}), searchParams: Promise.resolve({ entityType: "STEP", entityId: "U1001", actor: "hr01" }) }));
  expect(html).toContain("STEP_REVIEW_NEEDED"); expect(html).toContain("2027-03-31");
  await confirmStep(hr, "U1001", { source: "AUTO" });
  expect(await schedule("U1001")).toMatchObject({ confirmedDate: "2027-03-31", reviewNeeded: "N" });
  const [open] = await db.select().from(s.srcAppointment).where(eq(s.srcAppointment.empNo, "U1008")).then((rows) => rows.filter((a) => a.apptType === "LEAVE"));
  await expect(edit({ operation: "UPDATE", apptId: open.apptId, empNo: "U1008", apptType: "LEAVE", subType: "PERSONAL", startDate: open.startDate, endDate: "2026-12-31" })).rejects.toThrow("saved=1");
  await expect(edit({ operation: "LEDGER", empNo: "U1006", nextStepDate: "2027-06-01", memo: "대장 오기 수정" })).rejects.toThrow("table=src_manual_step_ledger&saved=1");
  expect(await recalcAll(hr)).toEqual({ changed: 1, reviewNeeded: 1 });
  expect(await schedule("U1008")).toMatchObject({ autoNextDate: "2027-07-01", excludedDays: 122, compareStatus: "MISMATCH", confirmedDate: "2027-03-01", reviewNeeded: "Y" });
  expect(await schedule("U1006")).toMatchObject({ compareStatus: "MATCH", confirmedDate: "2027-06-01", reviewNeeded: "N" });
});
it("발령 삭제 액션 및 유효하지 않은 입력의 오류 전달", async () => {
  await expect(edit(leave)).rejects.toThrow("saved=1");
  await expect(edit({ operation: "DELETE", apptId: leave.apptId })).rejects.toThrow("saved=1");
  expect(await db.select().from(s.srcAppointment).where(eq(s.srcAppointment.apptId, leave.apptId))).toHaveLength(0);
  await expect(edit({ ...leave, startDate: "2026-02-30" })).rejects.toThrow("error=");
  await expect(edit({ ...leave, apptType: "STEP_UP", subType: "", stepAfter: "bad" })).rejects.toThrow("error=");
  await expect(edit({ operation: "BAD" })).rejects.toThrow("error=");
});
it("페이지·액션 모두 HR 확인, 권한 실패 시 원천 데이터 보존", async () => {
  const before = await db.select().from(s.srcAppointment);
  vi.mocked(requireRole).mockRejectedValue(new Error("FORBIDDEN"));
  await expect(page()).rejects.toThrow("FORBIDDEN"); await expect(edit(leave)).rejects.toThrow("FORBIDDEN");
  expect(await db.select().from(s.srcAppointment)).toEqual(before);
});

import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { seedAll } from "@/db/seed";
import { accessLog, srcEmployee } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { recalcAll, confirmStep } from "@/services/steps";
import StepsPage from "./page";
import StepPage from "./[empNo]/page";
const hr = { userId: "hr01", name: "이인사", role: "HR" as const, empNo: null };
vi.mock("@/lib/session", () => ({ requireRole: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers({ "x-forwarded-for": "192.0.2.10" })) }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("./actions", () => ({ recalcAction: vi.fn(), bulkConfirmAction: vi.fn(), confirmAction: vi.fn() }));
beforeEach(async () => {
  if (process.env.DATABASE_URL !== "file:test.db") throw new Error("테스트 전용 DB가 아닙니다.");
  vi.resetAllMocks(); vi.stubGlobal("React", React);
  vi.mocked(requireRole).mockResolvedValue(hr); await seedAll();
});
const list = (status?: string) => StepsPage({ params: Promise.resolve({}), searchParams: Promise.resolve(status ? { status } : {}) });
const detail = (empNo: string) => StepPage({ params: Promise.resolve({ empNo }), searchParams: Promise.resolve({}) });
it("SCR-08 빈 목록, 비교 상태 필터, 상태별 인원 및 재계산·일괄 확정 버튼", async () => {
  expect(renderToStaticMarkup(await list())).toContain("재계산을 실행해");
  await recalcAll(hr);
  const html = renderToStaticMarkup(await list("MISMATCH"));
  for (const name of ["강서연", "한상우", "오세린", "일치 건 일괄 확정", "일치 6명", "재확인 필요 0명"]) expect(html).toContain(name);
  expect(html).not.toContain("김지훈");
  expect(await db.select().from(accessLog)).toHaveLength(0);
});
it("상세 계산 근거·반복 과정·휴대전화 전체·직원별 이력 및 VIEW", async () => {
  await recalcAll(hr); await confirmStep(hr, "U1012", { source: "AUTO" });
  const html = renderToStaticMarkup(await detail("U1012"));
  const employee = (await db.select().from(srcEmployee)).find((e) => e.empNo === "U1012")!;
  for (const value of [employee.phone, "2027-08-31", "61일", "2026-08-01", "2026-09-30", "반복 계산 과정", "STEP_CALCULATED", "STEP_CONFIRMED", "직접 입력 사유"]) expect(html).toContain(value);
  expect(await db.select().from(accessLog)).toMatchObject([{ userId: "hr01", subjectEmpNo: "U1012", action: "VIEW", ip: "192.0.2.10", target: "SCR-08 차기승급일 상세" }]);
  await detail("U1012"); expect(await db.select().from(accessLog)).toHaveLength(2);
});
it("권한 실패와 없는 직원은 접근기록을 남기지 않음", async () => {
  vi.mocked(requireRole).mockRejectedValueOnce(new Error("FORBIDDEN"));
  await expect(detail("U1001")).rejects.toThrow("FORBIDDEN");
  await expect(detail("missing")).rejects.toThrow("NOT_FOUND");
  expect(await db.select().from(accessLog)).toHaveLength(0);
});

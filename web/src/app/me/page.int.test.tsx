import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { seedAll } from "@/db/seed";
import { mailOutbox } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { recalcAll, bulkConfirmMatched, sendStepMails } from "@/services/steps";
import MePage from "./page";
import MyMailsPage from "./mails/page";
vi.mock("@/lib/session", () => ({ requireRole: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
const hr = { userId: "hr01", name: "이인사", role: "HR" as const, empNo: null };
const employee = { userId: "u1002", name: "이수빈", role: "EMPLOYEE" as const, empNo: "U1002" };
beforeEach(async () => {
  if (process.env.DATABASE_URL !== "file:test.db") throw new Error("테스트 전용 DB가 아닙니다.");
  vi.resetAllMocks(); vi.stubGlobal("React", React);
  vi.mocked(requireRole).mockResolvedValue(employee); await seedAll();
});
it("승급 정보 미확정과 빈 메일함 표시", async () => {
  const html = renderToStaticMarkup(await MePage());
  for (const text of ["이수빈", "7급", "2호봉", "2025-12-01", "확정 전", "받은 메일이 없습니다."]) expect(html).toContain(text);
  expect(requireRole).toHaveBeenCalledWith("EMPLOYEE");
});
it("8.6의 11단계: E02 확정일 2026-12-01 및 본인 STEP_NOTICE 1건", async () => {
  await recalcAll(hr); await bulkConfirmMatched(hr); await sendStepMails(hr, "2026-11-01");
  const html = renderToStaticMarkup(await MePage());
  expect(html).toContain("2026-12-01");
  expect(html).toContain("[승급] 차기 승급 예정 안내");
  expect(html).not.toContain("임정숙");
  const inbox = renderToStaticMarkup(await MyMailsPage());
  expect(inbox).toContain("이수빈님에게 온 메일 1건");
  expect(inbox).not.toContain("승급 결과 안내");
});
it("최근 본인 메일만 3건, 동시간대는 mailId 내림차순", async () => {
  await db.insert(mailOutbox).values([1, 2, 3, 4, 5].map((n) => ({ dedupKey: `TEST|${n}`, mailType: "STEP_NOTICE", toEmpNo: n === 5 ? "U1001" : "U1002", toEmail: "test@example.com", subject: `제목-${n}`, body: `본문-${n}`, createdAt: "2026-11-01T00:00:00Z" })));
  const html = renderToStaticMarkup(await MePage());
  expect(html.match(/<details/g)).toHaveLength(3);
  expect(html.indexOf("제목-4")).toBeLessThan(html.indexOf("제목-3"));
  expect(html.indexOf("제목-3")).toBeLessThan(html.indexOf("제목-2"));
  expect(html).not.toContain("본문-1"); expect(html).not.toContain("본문-5");
});
it("권한 실패, 사번 누락 또는 ERP 직원 부재 시 조회 중단", async () => {
  vi.mocked(requireRole).mockRejectedValueOnce(new Error("FORBIDDEN"));
  await expect(MePage()).rejects.toThrow("FORBIDDEN");
  vi.mocked(requireRole).mockResolvedValueOnce({ ...employee, empNo: null });
  await expect(MePage()).rejects.toThrow("NOT_FOUND");
  vi.mocked(requireRole).mockResolvedValueOnce({ ...employee, empNo: "missing" });
  await expect(MePage()).rejects.toThrow("NOT_FOUND");
});

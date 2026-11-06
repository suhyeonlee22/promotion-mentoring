import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { seedAll } from "@/db/seed";
import * as s from "@/db/schema";
import { requireRole } from "@/lib/session";
import { recalcAll, bulkConfirmMatched, confirmStep } from "@/services/steps";
import HrPage from "./page";
vi.mock("@/lib/session", () => ({ requireRole: vi.fn() }));
const hr = { userId: "hr01", name: "인사 담당자", role: "HR" as const, empNo: null };
beforeEach(async () => {
  if (process.env.DATABASE_URL !== "file:test.db") throw new Error("테스트 전용 DB가 아닙니다.");
  vi.resetAllMocks(); vi.stubGlobal("React", React); vi.mocked(requireRole).mockResolvedValue(hr); await seedAll();
});
it("실데이터가 없는 대시보드는 0·빈 상태를 표시하고 예시 데이터·가상 기능 없음", async () => {
  const html = renderToStaticMarkup(await HrPage());
  expect(html).toContain("인사관리 대시보드"); expect(html).toContain("진행 중 회차가 없습니다."); expect(html).toContain("처리 이력이 없습니다.");
  expect(html).toContain("관리 대상: 0명"); expect(html).not.toMatch(/NaN|Infinity/);
  for (const text of ["2025년 3월", "376명", "김민수", "운영 매뉴얼 다운로드", 'href="#"']) expect(html).not.toContain(text);
  expect(await db.select().from(s.processHistory)).toHaveLength(0); expect(await db.select().from(s.accessLog)).toHaveLength(0);
});
it("실제 회차별 제출·보완 인원과 경로 연결, 종료 회차는 진행 집계에서 제외", async () => {
  await db.insert(s.promotionRound).values([1, 2].map((roundId) => ({ roundId, name: roundId === 1 ? "실제 진행 회차" : "끝난 회차", baseDate: "2026-12-31", applyStart: "2027-01-04", applyEnd: "2027-01-15", status: roundId === 1 ? "REVIEWING" : "RESULT", createdAt: "2026-11-01T00:00:00Z" })));
  await db.insert(s.application).values([
    { roundId: 1, empNo: "U1001", status: "SUBMITTED" }, { roundId: 1, empNo: "U1002", status: "SUBMITTED" }, { roundId: 1, empNo: "U1003", status: "RETURNED" }, { roundId: 2, empNo: "U1001", status: "SUBMITTED" },
  ]);
  const html = renderToStaticMarkup(await HrPage());
  expect(html).toContain("실제 진행 회차"); expect(html).not.toContain("끝난 회차");
  expect(html).toContain("제출: 2명"); expect(html).toContain("보완 요청: 1명"); expect(html).toContain('href="/hr/rounds/1/applications"');
  expect(html).toContain("2027-01-04"); expect(html).toContain("2027-01-15");
});
it("승급 분모는 관리 제외를 빼고 확정·재확인은 중복하지 않으며 산정 불가 수동 확정 반영", async () => {
  await recalcAll(hr); await bulkConfirmMatched(hr);
  await confirmStep(hr, "U1008", { source: "MANUAL", date: "2027-03-01", reason: "복직 예정일 임시 확정" });
  await db.update(s.stepSchedule).set({ reviewNeeded: "Y" }).where(eq(s.stepSchedule.empNo, "U1001"));
  const html = renderToStaticMarkup(await HrPage());
  expect(html).toContain("관리 대상: 11명");
  expect(html).toContain('data-step-state="confirmed" data-count="6"');
  expect(html).toContain('data-step-state="pending" data-count="4"');
  expect(html).toContain('data-step-state="review" data-count="1"');
  expect(html).toContain("관리 제외: 1명"); expect(html).toContain("재확인 필요: 1명");
});
it("최근 이력은 실제 최신 5건만 읽고 기록을 추가하지 않음", async () => {
  await db.insert(s.processHistory).values(Array.from({ length: 7 }, (_, i) => ({ entityType: "STEP", entityId: `ENTITY-${i}`, action: "STEP_CONFIRMED", actor: "hr01", actedAt: `2026-11-0${i + 1}T00:00:00Z` })));
  const html = renderToStaticMarkup(await HrPage());
  expect(html).toContain("ENTITY-6"); expect(html).toContain("ENTITY-2"); expect(html).not.toContain("ENTITY-1"); expect(html).not.toContain("ENTITY-0");
  expect(html.indexOf("ENTITY-6")).toBeLessThan(html.indexOf("ENTITY-5")); expect(html).toContain("KST");
  expect(await db.select().from(s.processHistory)).toHaveLength(7); expect(await db.select().from(s.accessLog)).toHaveLength(0);
});
it("HR 권한 실패 시 대시보드 조회 차단", async () => {
  vi.mocked(requireRole).mockRejectedValueOnce(new Error("FORBIDDEN"));
  await expect(HrPage()).rejects.toThrow("FORBIDDEN");
});

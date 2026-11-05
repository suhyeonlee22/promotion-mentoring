import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { seedAll } from "@/db/seed";
import { application, promotionRound } from "@/db/schema";
import { requireRole } from "@/lib/session";
import ApplicationsPage from "./rounds/[roundId]/applications/page";
vi.mock("@/lib/session", () => ({ requireRole: vi.fn() }));
vi.mock("./rounds/[roundId]/applications/actions", () => ({ approveCorrectionAction: vi.fn(), rejectCorrectionAction: vi.fn() }));
const submittedAt = "2026-11-01T14:05:30.123Z";
const page = () => ApplicationsPage({ params: Promise.resolve({ roundId: "1" }) });
beforeEach(async () => {
  if (process.env.DATABASE_URL !== "file:test.db") throw new Error("테스트 전용 DB가 아닙니다.");
  vi.resetAllMocks(); vi.stubGlobal("React", React);
  vi.mocked(requireRole).mockResolvedValue({ userId: "hr01", name: "인사팀", role: "HR", empNo: null });
  await seedAll();
  await db.insert(promotionRound).values({ roundId: 1, name: "제출일 확인", baseDate: "2026-12-31", applyStart: "2027-01-04", applyEnd: "2027-01-15", status: "REVIEWING", createdAt: "2026-11-01T00:00:00Z" });
  await db.insert(application).values([
    { appId: 1, roundId: 1, empNo: "U1001", status: "SUBMITTED", submittedAt },
    { appId: 2, roundId: 1, empNo: "U1002", status: "NOT_STARTED" },
  ]);
});
it("HR 목록에 기존 submittedAt을 time으로 표시하고 미제출은 별도 표시", async () => {
  const html = renderToStaticMarkup(await page());
  expect(html).toContain(">제출일</th>");
  expect(html).toContain(`<time dateTime="${submittedAt}">${submittedAt}</time>`);
  const rows = html.match(/<tr[^>]*>.*?<\/tr>/g)!;
  expect(rows.find((r) => r.includes("U1002"))).toContain("미제출");
  expect(rows.find((r) => r.includes("U1001"))).not.toContain("미제출");
  expect(requireRole).toHaveBeenCalledWith("HR");
});
it("보완 요청 상태에서도 마지막 제출 시각을 그대로 표시", async () => {
  await db.update(application).set({ status: "RETURNED" }).where(eq(application.appId, 1));
  const html = renderToStaticMarkup(await page());
  expect(html).toContain(submittedAt); expect(html).toContain("RETURNED");
});
it("HR 권한 실패 시 제출일을 포함한 목록 조회 차단", async () => {
  vi.mocked(requireRole).mockRejectedValueOnce(new Error("FORBIDDEN"));
  await expect(page()).rejects.toThrow("FORBIDDEN");
});

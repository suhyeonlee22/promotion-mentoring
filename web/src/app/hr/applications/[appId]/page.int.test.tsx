import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { seedAll } from "@/db/seed";
import * as s from "@/db/schema";
import { requireRole } from "@/lib/session";
import ApplicationsPage from "./page";

vi.mock("@/lib/session", () => ({ requireRole: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ "x-forwarded-for": "192.0.2.10, 192.0.2.11" })),
}));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND"); },
}));
vi.mock("./actions", () => ({
  returnApplicationAction: vi.fn(), confirmApplicationAction: vi.fn(),
  approveCorrectionAction: vi.fn(), rejectCorrectionAction: vi.fn(),
}));

async function openPage(appId: number) {
  return ApplicationsPage({
    params: Promise.resolve({ appId: String(appId) }),
    searchParams: Promise.resolve({}),
  });
}

describe("SCR-05 처리 이력 및 VIEW 기록", () => {
  beforeEach(async () => {
    if (process.env.DATABASE_URL !== "file:test.db") throw new Error("테스트 전용 DB가 아닙니다.");
    vi.resetAllMocks();
    // Vitest의 JSX 변환에서도 서버 컴포넌트의 마크업을 검증한다.
    vi.stubGlobal("React", React);
    vi.mocked(requireRole).mockResolvedValue({ userId: "hr01", name: "이인사", role: "HR", empNo: null });
    await seedAll();
    await db.insert(s.promotionRound).values({
      roundId: 1, name: "검토 회차", baseDate: "2026-12-31",
      applyStart: "2027-01-04", applyEnd: "2027-01-15", status: "REVIEWING", createdAt: "2026-11-01T00:00:00Z",
    });
    await db.insert(s.application).values([
      { appId: 1, roundId: 1, empNo: "U1001", status: "DRAFT" },
      { appId: 2, roundId: 1, empNo: "U1004", status: "DRAFT" },
    ]);
  });

  it("신청서와 소속 정정 요청 이력만 시간순으로 표시하고 VIEW를 한 건 저장한다", async () => {
    await db.insert(s.correctionRequest).values([
      { reqId: 1, appId: 2, itemKey: "awards", requestedValue: "다른 요청", reason: "누락", status: "PENDING", requestedAt: "2026-11-01T00:00:00Z" },
      { reqId: 2, appId: 1, itemKey: "awards", requestedValue: "표창", reason: "누락", status: "APPROVED", requestedAt: "2026-11-01T00:00:00Z" },
    ]);
    await db.insert(s.processHistory).values([
      { entityType: "CORRECTION", entityId: "2", action: "CORRECTION_APPROVED", actor: "hr01", actedAt: "2026-11-02T00:00:00Z", toStatus: "APPROVED" },
      { entityType: "APPLICATION", entityId: "1", action: "APP_CREATED", actor: "SYSTEM", actedAt: "2026-11-01T00:00:00Z" },
      { entityType: "APPLICATION", entityId: "1", action: "APP_DRAFTED", actor: "u1001", actedAt: "2026-11-01T00:00:00Z" },
      { entityType: "CORRECTION", entityId: "1", action: "OTHER_CORRECTION", actor: "hr01", actedAt: "2026-11-01T00:00:00Z" },
      { entityType: "APPLICATION", entityId: "2", action: "OTHER_APPLICATION", actor: "SYSTEM", actedAt: "2026-11-01T00:00:00Z" },
    ]);
    const html = renderToStaticMarkup(await openPage(1));
    expect(html.indexOf("APP_CREATED")).toBeLessThan(html.indexOf("APP_DRAFTED"));
    expect(html.indexOf("APP_DRAFTED")).toBeLessThan(html.indexOf("CORRECTION_APPROVED"));
    expect(html).not.toContain("OTHER_CORRECTION");
    expect(html).not.toContain("OTHER_APPLICATION");
    expect(requireRole).toHaveBeenCalledWith("HR");
    const logs = await db.select().from(s.accessLog);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ userId: "hr01", ip: "192.0.2.10", subjectEmpNo: "U1001", action: "VIEW", target: "SCR-05 신청서 검토 (신청서 #1)" });
  });

  it("이력이 없는 신청서는 빈 안내를 표시하고 다음 열람도 기록한다", async () => {
    const html = renderToStaticMarkup(await openPage(1));
    expect(html).toContain("처리 이력이 없습니다.");
    await openPage(1);
    expect(await db.select().from(s.accessLog)).toHaveLength(2);
  });

  it("HR 권한 확인 실패나 없는 신청서에는 VIEW를 저장하지 않는다", async () => {
    vi.mocked(requireRole).mockRejectedValueOnce(new Error("FORBIDDEN"));
    await expect(openPage(1)).rejects.toThrow("FORBIDDEN");
    await expect(openPage(999)).rejects.toThrow("NOT_FOUND");
    expect(await db.select().from(s.accessLog)).toHaveLength(0);
  });
});

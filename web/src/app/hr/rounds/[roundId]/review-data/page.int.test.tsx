import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { seedAll } from "@/db/seed";
import * as s from "@/db/schema";
import { requireRole, type CurrentUser } from "@/lib/session";
import { createRound, runSelection, changeRoundStatus } from "@/services/rounds";
import ReviewDataPage from "./page";

vi.mock("@/lib/session", () => ({ requireRole: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ "x-forwarded-for": "192.0.2.20, 192.0.2.21" })),
}));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND"); },
}));

const hr: CurrentUser = { userId: "hr01", name: "이인사", role: "HR", empNo: null };
const roundInput = {
  name: "2027년 상반기 정기승진", baseDate: "2026-12-31",
  applyStart: "2027-01-04", applyEnd: "2027-01-15",
};

async function openPage(roundId: string | number) {
  return ReviewDataPage({
    params: Promise.resolve({ roundId: String(roundId) }),
    searchParams: Promise.resolve({}),
  });
}

describe("SCR-06 심사자료 인쇄", () => {
  beforeEach(async () => {
    if (process.env.DATABASE_URL !== "file:test.db") throw new Error("테스트 전용 DB가 아닙니다.");
    vi.resetAllMocks();
    vi.stubGlobal("React", React);
    vi.mocked(requireRole).mockResolvedValue(hr);
    await seedAll();
  });

  it("해당 회차의 확정된 5명만 개인별 자료에 표시하고 PRINT 한 건을 저장한다", async () => {
    const roundId = await createRound(hr, roundInput);
    await runSelection(hr, roundId);
    await changeRoundStatus(hr, roundId, "APPLYING");
    await db.update(s.application).set({ status: "CONFIRMED", achievement: "주요 성과\n두 번째 줄", plan: "개발 계획" })
      .where(eq(s.application.roundId, roundId));
    await db.insert(s.application).values({ roundId, empNo: "U1003", status: "SUBMITTED", achievement: "미확정 내용" });
    const otherRound = await createRound(hr, { ...roundInput, name: "다른 회차" });
    await db.insert(s.application).values({ roundId: otherRound, empNo: "U1002", status: "CONFIRMED", achievement: "다른 회차 내용" });
    const apps = await db.select().from(s.application).where(and(eq(s.application.roundId, roundId), eq(s.application.status, "CONFIRMED")));
    await db.update(s.applicationItem).set({ currentValue: "정정된 소속", erpValue: "옛 소속" })
      .where(and(eq(s.applicationItem.appId, apps[0].appId), eq(s.applicationItem.itemKey, "org")));

    const html = renderToStaticMarkup(await openPage(roundId));
    expect(html.match(/<article/g)).toHaveLength(5);
    expect(html.match(/scope="row"/g)).toHaveLength(75);
    expect(html).toContain("정정된 소속");
    expect(html).not.toContain("옛 소속");
    expect(html).not.toContain("미확정 내용");
    expect(html).not.toContain("다른 회차 내용");
    expect(html).toContain("주요 성과\n두 번째 줄");
    expect(html).toContain("개발 계획");
    expect(html.indexOf("입사일")).toBeLessThan(html.indexOf("현 직급 임용일"));
    expect(requireRole).toHaveBeenCalledWith("HR");
    const logs = await db.select().from(s.accessLog);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ userId: "hr01", ip: "192.0.2.20", action: "PRINT", subjectEmpNo: null });
    expect(logs[0].target).toContain(`회차 #${roundId}, 5명`);
  });

  it("한 명이면 정보주체 사번을 기록하고, 별도 열람은 새 PRINT로 남긴다", async () => {
    const roundId = await createRound(hr, roundInput);
    await db.insert(s.application).values({ roundId, empNo: "U1001", status: "CONFIRMED" });
    await openPage(roundId);
    await openPage(roundId);
    const logs = await db.select().from(s.accessLog);
    expect(logs).toHaveLength(2);
    expect(logs[0].subjectEmpNo).toBe("U1001");
  });

  it("확정된 신청서가 없으면 빈 안내만 표시하고 PRINT를 남기지 않는다", async () => {
    const roundId = await createRound(hr, roundInput);
    const html = renderToStaticMarkup(await openPage(roundId));
    expect(html).toContain("확정된 신청서가 없습니다.");
    expect(html).not.toContain("<article");
    expect(await db.select().from(s.accessLog)).toHaveLength(0);
  });

  it("잘못된 회차나 HR 권한 실패에는 PRINT를 남기지 않는다", async () => {
    for (const id of ["NaN", "0", "-1", "1.5", "999"]) {
      await expect(openPage(id)).rejects.toThrow("NOT_FOUND");
    }
    vi.mocked(requireRole).mockRejectedValueOnce(new Error("FORBIDDEN"));
    await expect(openPage(1)).rejects.toThrow("FORBIDDEN");
    expect(await db.select().from(s.accessLog)).toHaveLength(0);
  });
});

import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { seedAll } from "@/db/seed";
import { application, promotionRound } from "@/db/schema";
import { requireRole } from "@/lib/session";
import MyPromotionPage from "./page";

vi.mock("@/lib/session", () => ({ requireRole: vi.fn() }));
vi.mock("./actions", () => ({
  saveDraftAction: vi.fn(), submitApplicationAction: vi.fn(), requestCorrectionAction: vi.fn(),
}));

describe("SCR-22 결과 공개 시점", () => {
  beforeEach(async () => {
    if (process.env.DATABASE_URL !== "file:test.db") throw new Error("테스트 전용 DB가 아닙니다.");
    vi.resetAllMocks();
    vi.stubGlobal("React", React);
    vi.mocked(requireRole).mockResolvedValue({ userId: "u1004", name: "최유진", role: "EMPLOYEE", empNo: "U1004" });
    await seedAll();
    await db.insert(promotionRound).values({ roundId: 1, name: "결과 회차", baseDate: "2026-12-31", applyStart: "2027-01-04", applyEnd: "2027-01-15", status: "RESULT", createdAt: "2026-11-01T00:00:00Z" });
    await db.insert(application).values([
      { appId: 1, roundId: 1, empNo: "U1004", status: "CONFIRMED", result: "PROMOTED" },
      { appId: 2, roundId: 1, empNo: "U1001", status: "CONFIRMED", result: "NOT_PROMOTED", resultNotifiedAt: "2026-11-01T00:00:00Z" },
    ]);
  });

  it("안내 전 결과와 다른 직원 결과를 HTML에 노출하지 않는다", async () => {
    const html = renderToStaticMarkup(await MyPromotionPage());
    expect(requireRole).toHaveBeenCalledWith("EMPLOYEE");
    expect(html).not.toContain("심사 결과:");
    expect(html).not.toContain("PROMOTED");
    expect(html).not.toContain("미승진");
  });

  it.each(["PROMOTED", "NOT_PROMOTED"])("안내 후 본인 결과 %s만 표시한다", async (result) => {
    await db.update(application).set({ result, resultNotifiedAt: "2026-11-01T00:00:00Z" }).where(eq(application.appId, 1));
    const html = renderToStaticMarkup(await MyPromotionPage());
    expect(html).toContain("심사 결과:");
    expect(html).toContain(`<strong>${result === "PROMOTED" ? "승진" : "미승진"}</strong>`);
  });
});

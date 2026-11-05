import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { seedAll } from "@/db/seed";
import { application, promotionRound } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { registerResult, notifyResults } from "@/services/applications";
import { redirect } from "next/navigation";
import { registerResultAction, notifyResultsAction } from "./actions";

vi.mock("@/lib/session", () => ({ requireRole: vi.fn() }));
vi.mock("@/services/applications", () => ({ registerResult: vi.fn(), notifyResults: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND"); },
  redirect: vi.fn(() => { throw new Error("REDIRECT"); }),
}));
const hr = { userId: "hr01", name: "이인사", role: "HR" as const, empNo: null };
const form = (roundId: number, appId = 1) => {
  const data = new FormData();
  data.set("roundId", String(roundId)); data.set("appId", String(appId)); data.set("result", "PROMOTED");
  return data;
};

describe("SCR-07 액션 검증", () => {
  beforeEach(async () => {
    if (process.env.DATABASE_URL !== "file:test.db") throw new Error("테스트 전용 DB가 아닙니다.");
    vi.resetAllMocks();
    vi.mocked(requireRole).mockResolvedValue(hr);
    vi.mocked(registerResult).mockResolvedValue(undefined);
    vi.mocked(notifyResults).mockResolvedValue(0);
    await seedAll();
    for (const roundId of [1, 2]) await db.insert(promotionRound).values({ roundId, name: `회차 ${roundId}`, baseDate: "2026-12-31", applyStart: "2027-01-04", applyEnd: "2027-01-15", status: "RESULT", createdAt: "2026-11-01T00:00:00Z" });
    await db.insert(application).values({ appId: 1, roundId: 1, empNo: "U1001", status: "CONFIRMED" });
  });

  it("다른 회차의 신청서로 변조한 폼은 서비스를 호출하지 않는다", async () => {
    await expect(registerResultAction(form(2))).rejects.toThrow("REDIRECT");
    expect(registerResult).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith(expect.stringContaining("/hr/rounds/2/results?error="));
  });
  it("HR 검증 실패 시 등록과 안내를 수행하지 않는다", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("FORBIDDEN"));
    await expect(registerResultAction(form(1))).rejects.toThrow("FORBIDDEN");
    await expect(notifyResultsAction(form(1))).rejects.toThrow("FORBIDDEN");
    expect(registerResult).not.toHaveBeenCalled();
    expect(notifyResults).not.toHaveBeenCalled();
  });
  it("검증된 신청서만 저장하고 두 번째 안내의 0건 결과도 전달한다", async () => {
    await expect(registerResultAction(form(1))).rejects.toThrow("REDIRECT");
    expect(registerResult).toHaveBeenCalledWith(hr, 1, "PROMOTED");
    await expect(notifyResultsAction(form(1))).rejects.toThrow("REDIRECT");
    expect(notifyResults).toHaveBeenCalledWith(hr, 1);
    expect(redirect).toHaveBeenLastCalledWith("/hr/rounds/1/results?sent=0");
  });
});

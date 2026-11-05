import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { seedAll } from "@/db/seed";
import * as s from "@/db/schema";
import { getCurrentUser, type CurrentUser } from "@/lib/session";
import { createRound, runSelection, changeRoundStatus } from "@/services/rounds";
import { POST } from "./route";

vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers({ "x-forwarded-for": "192.0.2.30" })) }));

const hr: CurrentUser = { userId: "hr01", name: "이인사", role: "HR", empNo: null };
const input = { name: "CSV 검토 회차", baseDate: "2026-12-31", applyStart: "2027-01-04", applyEnd: "2027-01-15" };

function download(roundId: number | string, reason: string | Blob | null = "심사위원회 자료") {
  const form = new FormData();
  if (reason !== null) form.set("reason", reason);
  return POST(new Request("http://localhost/hr/rounds/1/review-data/csv", { method: "POST", body: form }), {
    params: Promise.resolve({ roundId: String(roundId) }),
  });
}

describe("SCR-06 CSV 다운로드", () => {
  beforeEach(async () => {
    if (process.env.DATABASE_URL !== "file:test.db") throw new Error("테스트 전용 DB가 아닙니다.");
    vi.resetAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue(hr);
    await seedAll();
  });

  it("해당 회차 확정 5명만 현재 값 17열로 출력하고 사유와 함께 DOWNLOAD 한 건을 기록한다", async () => {
    const roundId = await createRound(hr, input);
    await runSelection(hr, roundId);
    await changeRoundStatus(hr, roundId, "APPLYING");
    await db.update(s.application).set({ status: "CONFIRMED" }).where(eq(s.application.roundId, roundId));
    await db.insert(s.application).values({ roundId, empNo: "U1003", status: "SUBMITTED" });
    const other = await createRound(hr, { ...input, name: "다른 회차" });
    await db.insert(s.application).values({ roundId: other, empNo: "U1002", status: "CONFIRMED" });
    const [app] = await db.select().from(s.application).where(and(eq(s.application.roundId, roundId), eq(s.application.empNo, "U1001")));
    await db.update(s.applicationItem).set({ currentValue: "정정 부서", erpValue: "ERP 부서" })
      .where(and(eq(s.applicationItem.appId, app.appId), eq(s.applicationItem.itemKey, "org")));

    const response = await download(roundId, "  심사위원회 자료  ");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("Content-Disposition")).toBe(`attachment; filename="review-data-${roundId}.csv"`);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const csv = new TextDecoder().decode(bytes);
    const lines = csv.trimEnd().split("\r\n");
    expect(lines).toHaveLength(6);
    expect(lines[0]).toBe('"사번","성명","성명","소속","현 직급","승진 예정 직급","입사일","현 직급 임용일","소요기간 충족일","2024년 근무평정","2025년 근무평정","2026년 근무평정","2024년 교육이수시간","2025년 교육이수시간","2026년 교육이수시간","포상","징계"');
    expect(lines[1]).toContain('"U1001","김지훈","김지훈","정정 부서"');
    expect(csv).not.toContain("ERP 부서");
    expect(csv).not.toContain("U1002");
    expect(csv).not.toContain("U1003");
    const logs = await db.select().from(s.accessLog);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ action: "DOWNLOAD", userId: "hr01", subjectEmpNo: null, ip: "192.0.2.30", reason: "심사위원회 자료" });
    expect(logs[0].target).toContain(`회차 #${roundId}, 5명`);
  });

  it("다른 기준 연도의 항목 순서를 유지하고 특수문자·수식 값을 안전하게 출력한다", async () => {
    const roundId = await createRound(hr, { ...input, baseDate: "2028-12-31", applyStart: "2029-01-01", applyEnd: "2029-01-15" });
    const [app] = await db.insert(s.application).values({ roundId, empNo: "U1001", status: "CONFIRMED" }).returning();
    await db.insert(s.applicationItem).values([
      { appId: app.appId, itemKey: "rating_2028", label: "평정", sortOrder: 1, erpValue: "B", currentValue: "A", correctable: "Y" },
      { appId: app.appId, itemKey: "org", label: "소속", sortOrder: 99, erpValue: "부서", currentValue: "=1+1", correctable: "Y" },
      { appId: app.appId, itemKey: "awards", label: "포상", sortOrder: 2, erpValue: "없음", currentValue: '표창, "우수"\n다음 줄', correctable: "Y" },
    ]);
    const csv = await (await download(roundId)).text();
    expect(csv).toContain('"2026년 근무평정","2027년 근무평정","2028년 근무평정"');
    expect(csv).not.toContain("2024년");
    expect(csv).toContain('"U1001","","","\t=1+1"');
    expect(csv).toContain('"표창, ""우수""\n다음 줄"');
    const [log] = await db.select().from(s.accessLog);
    expect(log.subjectEmpNo).toBe("U1001");
  });

  it.each([null, "", " \t\r\n ", new Blob(["파일"])] as const)("사유 %j는 400이고 접근기록을 남기지 않는다", async (reason) => {
    expect((await download(1, reason)).status).toBe(400);
    expect(await db.select().from(s.accessLog)).toHaveLength(0);
  });

  it.each([null, "EMPLOYEE", "REVIEWER"] as const)("권한 %j는 403이고 기록하지 않는다", async (role) => {
    vi.mocked(getCurrentUser).mockResolvedValue(role ? { ...hr, role } : null);
    expect((await download(1)).status).toBe(403);
    expect(await db.select().from(s.accessLog)).toHaveLength(0);
  });

  it("잘못된 요청·없는 회차에는 기록하지 않는다", async () => {
    expect((await download("bad")).status).toBe(400);
    expect((await download(999)).status).toBe(404);
    expect((await POST(new Request("http://localhost", { method: "POST", body: "bad" }), { params: Promise.resolve({ roundId: "1" }) })).status).toBe(400);
    expect(await db.select().from(s.accessLog)).toHaveLength(0);
  });

  it("확정자가 없으면 헤더만 다운로드하고 0명으로 기록한다", async () => {
    const roundId = await createRound(hr, input);
    const response = await download(roundId);
    expect(response.status).toBe(200);
    expect((await response.text()).trimEnd().split("\r\n")).toHaveLength(1);
    const [log] = await db.select().from(s.accessLog);
    expect(log.target).toContain("0명");
  });
});

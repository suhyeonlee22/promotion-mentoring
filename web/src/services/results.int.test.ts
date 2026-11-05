import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { seedAll } from "@/db/seed";
import * as s from "@/db/schema";
import type { CurrentUser } from "@/lib/session";
import { createRound, runSelection, changeRoundStatus, setManualAction } from "./rounds";
import {
  registerResult, notifyResults, requestCorrection, approveCorrection,
  rejectCorrection, submitApplication, returnApplication, confirmApplication,
} from "./applications";

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

const hr: CurrentUser = { userId: "hr01", name: "이인사", role: "HR", empNo: null };
const employee = (empNo: string): CurrentUser => ({
  userId: empNo.toLowerCase(), name: empNo, role: "EMPLOYEE", empNo,
});
const input = {
  name: "2027년 상반기 정기승진", baseDate: "2026-12-31",
  applyStart: "2027-01-04", applyEnd: "2027-01-15",
};

async function fixture(status = "RESULT", appStatus = "CONFIRMED") {
  const roundId = await createRound(hr, input);
  await db.update(s.promotionRound).set({ status }).where(eq(s.promotionRound.roundId, roundId));
  const [app] = await db.insert(s.application).values({ roundId, empNo: "U1001", status: appStatus }).returning();
  return app;
}

describe("STEP 9 결과 등록 및 안내", () => {
  beforeEach(async () => {
    if (process.env.DATABASE_URL !== "file:test.db") throw new Error("테스트 전용 DB가 아닙니다.");
    await seedAll();
  });

  it("등록 후 발송 전에는 안내시각이 없고, 중복 발송은 새 메일·이력이 0건이다", async () => {
    const app = await fixture();
    await registerResult(hr, app.appId, "PROMOTED");
    let [stored] = await db.select().from(s.application).where(eq(s.application.appId, app.appId));
    expect(stored.result).toBe("PROMOTED");
    expect(stored.resultNotifiedAt).toBeNull();
    expect(await notifyResults(hr, app.roundId)).toBe(1);
    [stored] = await db.select().from(s.application).where(eq(s.application.appId, app.appId));
    expect(stored.resultNotifiedAt).toBeTruthy();
    const before = stored.resultNotifiedAt;
    expect(await notifyResults(hr, app.roundId)).toBe(0);
    const mails = await db.select().from(s.mailOutbox);
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({
      dedupKey: `PROMO_RESULT|${app.roundId}|U1001`, mailType: "PROMO_RESULT",
      toEmpNo: "U1001", toEmail: "u1001@unist.example",
      subject: `[승진] ${input.name} 결과 안내`,
    });
    expect(mails[0].body).toContain("김지훈");
    expect(mails[0].body).toContain("승진");
    const notified = await db.select().from(s.processHistory).where(eq(s.processHistory.action, "RESULT_NOTIFIED"));
    expect(notified).toHaveLength(1);
    [stored] = await db.select().from(s.application).where(eq(s.application.appId, app.appId));
    expect(stored.resultNotifiedAt).toBe(before);
  });

  it("동일 결과 저장은 중복 이력을 만들지 않고 실제 변경만 기록한다", async () => {
    const app = await fixture();
    await registerResult(hr, app.appId, "PROMOTED");
    await registerResult(hr, app.appId, "PROMOTED");
    await notifyResults(hr, app.roundId);
    await registerResult(hr, app.appId, "NOT_PROMOTED");
    const history = await db.select().from(s.processHistory).where(eq(s.processHistory.action, "RESULT_REGISTERED"));
    expect(history).toHaveLength(2);
    expect(JSON.parse(history[1].detailJson!)).toEqual({ before: "PROMOTED", result: "NOT_PROMOTED" });
    const [stored] = await db.select().from(s.application).where(eq(s.application.appId, app.appId));
    expect(stored.result).toBe("NOT_PROMOTED");
    expect(stored.resultNotifiedAt).toBeTruthy();
    expect(await notifyResults(hr, app.roundId)).toBe(0);
  });

  it("확정·결과 등록 신청자만 발송 대상이며 미등록 신청자는 다음 실행에 보낼 수 있다", async () => {
    const app = await fixture();
    const [second] = await db.insert(s.application).values({ roundId: app.roundId, empNo: "U1004", status: "CONFIRMED" }).returning();
    await db.insert(s.application).values({ roundId: app.roundId, empNo: "U1006", status: "DRAFT", result: "PROMOTED" });
    await registerResult(hr, app.appId, "NOT_PROMOTED");
    expect(await notifyResults(hr, app.roundId)).toBe(1);
    await registerResult(hr, second.appId, "PROMOTED");
    expect(await notifyResults(hr, app.roundId)).toBe(1);
    expect(await notifyResults(hr, app.roundId)).toBe(0);
    const mails = await db.select().from(s.mailOutbox);
    expect(mails.map((m) => m.toEmpNo).sort()).toEqual(["U1001", "U1004"]);
  });

  it("권한과 상태 및 결과 입력을 서버에서 검증한다", async () => {
    const app = await fixture("REVIEWING", "SUBMITTED");
    await expect(registerResult(employee("U1001"), app.appId, "PROMOTED")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(notifyResults(null, app.roundId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(registerResult(hr, app.appId, "PROMOTED")).rejects.toMatchObject({ code: "INVALID_ROUND" });
    await expect(notifyResults(hr, app.roundId)).rejects.toMatchObject({ code: "INVALID_ROUND" });
    await db.update(s.promotionRound).set({ status: "RESULT" }).where(eq(s.promotionRound.roundId, app.roundId));
    await expect(registerResult(hr, app.appId, "PROMOTED")).rejects.toMatchObject({ code: "INVALID_APPLICATION" });
    // @ts-expect-error 변조된 런타임 결과 값도 검증한다.
    await expect(registerResult(hr, app.appId, "INVALID")).rejects.toMatchObject({ code: "INVALID_RESULT" });
    await expect(registerResult(hr, 999, "PROMOTED")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(notifyResults(hr, 999)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await db.select().from(s.mailOutbox)).toHaveLength(0);
  });

  it("일부 직원의 인사정보가 없으면 발송함·안내시각·이력을 전부 롤백한다", async () => {
    const app = await fixture();
    await registerResult(hr, app.appId, "PROMOTED");
    await db.insert(s.application).values({ roundId: app.roundId, empNo: "MISSING", status: "CONFIRMED", result: "PROMOTED" });
    await expect(notifyResults(hr, app.roundId)).rejects.toMatchObject({ code: "ERP_NOT_FOUND" });
    expect(await db.select().from(s.mailOutbox)).toHaveLength(0);
    const [stored] = await db.select().from(s.application).where(eq(s.application.appId, app.appId));
    expect(stored.resultNotifiedAt).toBeNull();
    expect(await db.select().from(s.processHistory).where(eq(s.processHistory.action, "RESULT_NOTIFIED"))).toHaveLength(0);
  });

  it("요구사항 8.4 시나리오 후 APPLICATION 처리 이력 개수가 정답표와 일치한다", async () => {
    const roundId = await createRound(hr, input);
    await runSelection(hr, roundId);
    await setManualAction(hr, roundId, "U1003", "ADD", "휴직기간 산정 이의신청 인정");
    await runSelection(hr, roundId);
    await changeRoundStatus(hr, roundId, "APPLYING");
    const apps = await db.select().from(s.application).where(eq(s.application.roundId, roundId));
    const app = (empNo: string) => apps.find((a) => a.empNo === empNo)!;
    await requestCorrection(employee("U1004"), app("U1004").appId, { itemKey: "training_2025", requestedValue: "32", reason: "외부 위탁교육 12시간 누락" });
    await expect(submitApplication(employee("U1004"), app("U1004").appId, { achievement: "주요 실적", plan: "" })).rejects.toMatchObject({ code: "PENDING_CORRECTION" });
    const [request] = await db.select().from(s.correctionRequest).where(eq(s.correctionRequest.appId, app("U1004").appId));
    await approveCorrection(hr, request.reqId, "32");
    await submitApplication(employee("U1004"), app("U1004").appId, { achievement: "주요 실적", plan: "" });
    await requestCorrection(employee("U1001"), app("U1001").appId, { itemKey: "awards", requestedValue: "2026-05-10 우수직원 표창", reason: "포상 누락" });
    const [rejected] = await db.select().from(s.correctionRequest).where(eq(s.correctionRequest.appId, app("U1001").appId));
    await rejectCorrection(hr, rejected.reqId, "ERP 미등록 포상은 증빙과 함께 인사팀에 별도 등록 요청 바랍니다");
    for (const empNo of ["U1001", "U1003", "U1006", "U1007"]) {
      await submitApplication(employee(empNo), app(empNo).appId, { achievement: "주요 실적", plan: "개발 계획" });
    }
    await changeRoundStatus(hr, roundId, "REVIEWING");
    await returnApplication(hr, app("U1006").appId, "업무실적을 구체적인 수치로 보완해 주세요");
    await expect(changeRoundStatus(hr, roundId, "RESULT")).rejects.toMatchObject({ code: "REVIEW_PENDING" });
    await submitApplication(employee("U1006"), app("U1006").appId, { achievement: "개선율 30%", plan: "개발 계획" });
    const submitted = ["U1001", "U1003", "U1004", "U1006", "U1007"];
    for (const empNo of submitted) await confirmApplication(hr, app(empNo).appId);
    await changeRoundStatus(hr, roundId, "RESULT");
    for (const empNo of submitted) {
      await registerResult(hr, app(empNo).appId, ["U1001", "U1004", "U1007"].includes(empNo) ? "PROMOTED" : "NOT_PROMOTED");
    }
    expect(await notifyResults(hr, roundId)).toBe(5);
    expect(await notifyResults(hr, roundId)).toBe(0);
    const history = await db.select().from(s.processHistory).where(eq(s.processHistory.entityType, "APPLICATION"));
    const counts: Record<string, number> = {};
    for (const row of history) counts[row.action] = (counts[row.action] ?? 0) + 1;
    expect(counts).toEqual({ APP_CREATED: 6, APP_DRAFTED: 5, APP_SUBMITTED: 6, APP_RETURNED: 1, APP_CONFIRMED: 5, RESULT_REGISTERED: 5, RESULT_NOTIFIED: 5 });
    const resultMails = await db.select().from(s.mailOutbox).where(eq(s.mailOutbox.mailType, "PROMO_RESULT"));
    expect(resultMails).toHaveLength(5);
    const [unsubmitted] = await db.select().from(s.application).where(and(eq(s.application.roundId, roundId), eq(s.application.empNo, "U1012")));
    expect(unsubmitted.resultNotifiedAt).toBeNull();
  });
});

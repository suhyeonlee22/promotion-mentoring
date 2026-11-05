import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { seedAll } from "@/db/seed";
import * as s from "@/db/schema";
import type { CurrentUser } from "@/lib/session";
import { createRound, runSelection, changeRoundStatus } from "./rounds";
import {
  saveDraft,
  requestCorrection,
  submitApplication,
  approveCorrection,
  rejectCorrection,
  confirmApplication,
  returnApplication,
} from "./applications";

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

const hr: CurrentUser = {
  userId: "hr01",
  name: "이인사",
  role: "HR",
  empNo: null,
};

const employee: CurrentUser = {
  userId: "u1001",
  name: "김지훈",
  role: "EMPLOYEE",
  empNo: "U1001",
};

const roundInput = {
  name: "2027년 상반기 정기승진",
  baseDate: "2026-12-31",
  applyStart: "2027-01-04",
  applyEnd: "2027-01-15",
};

async function prepareApplication() {
  const roundId = await createRound(hr, roundInput);

  await runSelection(hr, roundId);
  await changeRoundStatus(hr, roundId, "APPLYING");

  const [app] = await db
    .select()
    .from(s.application)
    .where(eq(s.application.empNo, "U1001"));

  if (!app) {
    throw new Error("테스트 신청서가 생성되지 않았습니다.");
  }

  return app;
}

describe("STEP 7 신청서 통합 테스트 (test.db 전용)", () => {
  beforeEach(async () => {
    if (process.env.DATABASE_URL !== "file:test.db") {
      throw new Error("테스트 전용 DB가 아닙니다.");
    }

    vi.restoreAllMocks();
    await seedAll();
  });

  it("최초 임시저장은 DRAFT 상태와 이력을 생성한다", async () => {
    const app = await prepareApplication();

    await saveDraft(employee, app.appId, {
      achievement: "2026년 주요 업무 성과",
      plan: "향후 업무 계획",
    });

    const [updated] = await db
      .select()
      .from(s.application)
      .where(eq(s.application.appId, app.appId));

    expect(updated.status).toBe("DRAFT");
    expect(updated.achievement).toBe("2026년 주요 업무 성과");
    expect(updated.plan).toBe("향후 업무 계획");

    const histories = await db
      .select()
      .from(s.processHistory)
      .where(eq(s.processHistory.action, "APP_DRAFTED"));

    expect(histories).toHaveLength(1);
    expect(histories[0]).toMatchObject({
      entityType: "APPLICATION",
      entityId: String(app.appId),
      actor: "u1001",
      fromStatus: "NOT_STARTED",
      toStatus: "DRAFT",
    });
  });

  it("두 번째 임시저장은 최초 작성 이력을 중복 생성하지 않는다", async () => {
    const app = await prepareApplication();

    // 첫 번째 임시저장
    await saveDraft(employee, app.appId, {
      achievement: "첫 번째 작성 내용",
      plan: "첫 번째 계획",
    });

    // 두 번째 임시저장
    await saveDraft(employee, app.appId, {
      achievement: "수정된 작성 내용",
      plan: "수정된 계획",
    });

    // DB에서 신청서 조회
    const [updated] = await db
      .select()
      .from(s.application)
      .where(eq(s.application.appId, app.appId));

    expect(updated.status).toBe("DRAFT");
    expect(updated.achievement).toBe("수정된 작성 내용");
    expect(updated.plan).toBe("수정된 계획");

    // 최초 작성 이력은 여전히 1건이어야 함
    const histories = await db
      .select()
      .from(s.processHistory)
      .where(eq(s.processHistory.action, "APP_DRAFTED"));

    expect(histories).toHaveLength(1);
  });

  it("정정 요청 시 PENDING 상태와 이력, 알림이 생성된다", async () => {
    const app = await prepareApplication();

    // 1. 직원이 교육이수시간 정정 요청
    await requestCorrection(employee, app.appId, {
      itemKey: "training_2025",
      requestedValue: "32",
      reason: "교육 이수 내역이 누락되어 정정을 요청합니다.",
    });

    // 2. 정정 요청이 DB에 생성됐는지 확인
    const requests = await db
      .select()
      .from(s.correctionRequest)
      .where(eq(s.correctionRequest.appId, app.appId));

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      itemKey: "training_2025",
      requestedValue: "32",
      status: "PENDING",
    });

    // 3. 처리 이력 확인
    const histories = await db
      .select()
      .from(s.processHistory)
      .where(eq(s.processHistory.action, "CORRECTION_REQUESTED"));

    expect(histories).toHaveLength(1);
    expect(histories[0]).toMatchObject({
      entityType: "CORRECTION",
      entityId: String(requests[0].reqId),
      actor: "u1001",
      toStatus: "PENDING",
    });

    // 4. 인사팀 알림 확인
    const notifications = await db
      .select()
      .from(s.notification)
      .where(eq(s.notification.type, "CORRECTION_REQUESTED"));

    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      receiver: "HR",
      title: "승진 신청서 정정 요청",
      link: `/hr/rounds/${app.roundId}/applications`,
    });
  });

  it("동일 항목에 처리 대기 중인 정정 요청을 중복 생성할 수 없다", async () => {
    const app = await prepareApplication();

    // 첫 번째 정정 요청은 성공
    await requestCorrection(employee, app.appId, {
      itemKey: "training_2025",
      requestedValue: "32",
      reason: "교육 이수 내역 누락",
    });

    // 동일 항목으로 두 번째 정정 요청 시도
    await expect(
      requestCorrection(employee, app.appId, {
        itemKey: "training_2025",
        requestedValue: "35",
        reason: "추가 교육 이수 내역 누락",
      }),
    ).rejects.toMatchObject({
      code: "DUPLICATE_CORRECTION",
    });

    // DB에는 첫 번째 요청만 존재해야 함
    const requests = await db
      .select()
      .from(s.correctionRequest)
      .where(eq(s.correctionRequest.appId, app.appId));

    expect(requests).toHaveLength(1);
    expect(requests[0].requestedValue).toBe("32");
    expect(requests[0].status).toBe("PENDING");

    // 실패한 두 번째 요청은 이력도 남기지 않아야 함
    const histories = await db
      .select()
      .from(s.processHistory)
      .where(eq(s.processHistory.action, "CORRECTION_REQUESTED"));

    expect(histories).toHaveLength(1);

    // 알림도 중복 생성되면 안 됨
    const notifications = await db
      .select()
      .from(s.notification)
      .where(eq(s.notification.type, "CORRECTION_REQUESTED"));

    expect(notifications).toHaveLength(1);
  });

  it("정정 불가능한 성명 항목은 요청할 수 없다", async () => {
    const app = await prepareApplication();

    // 1. 정정 불가능한 성명 항목에 정정 요청 시도
    await expect(
      requestCorrection(employee, app.appId, {
        itemKey: "name",
        requestedValue: "변경된 이름",
        reason: "성명 변경 요청",
      }),
    ).rejects.toMatchObject({
      code: "NOT_CORRECTABLE",
    });

    // 2. 정정 요청이 생성되지 않았는지 확인
    const requests = await db
      .select()
      .from(s.correctionRequest)
      .where(eq(s.correctionRequest.appId, app.appId));

    expect(requests).toHaveLength(0);

    // 3. 실패한 요청에 대한 처리 이력도 없어야 함
    const histories = await db
      .select()
      .from(s.processHistory)
      .where(eq(s.processHistory.action, "CORRECTION_REQUESTED"));

    expect(histories).toHaveLength(0);

    // 4. 인사팀 알림도 생성되지 않아야 함
    const notifications = await db
      .select()
      .from(s.notification)
      .where(eq(s.notification.type, "CORRECTION_REQUESTED"));

    expect(notifications).toHaveLength(0);
  });

  it("처리 대기 중인 정정 요청이 있으면 최종 제출할 수 없다", async () => {
    const app = await prepareApplication();

    // 1. 먼저 신청서를 임시저장
    await saveDraft(employee, app.appId, {
      achievement: "2026년 주요 업무 성과",
      plan: "향후 업무 계획",
    });

    // 2. 교육이수시간 정정 요청 생성
    await requestCorrection(employee, app.appId, {
      itemKey: "training_2025",
      requestedValue: "32",
      reason: "교육 이수 내역 누락",
    });

    // 3. 정정 요청이 처리되지 않은 상태에서 최종 제출 시도
    await expect(
      submitApplication(employee, app.appId, {
        achievement: "2026년 주요 업무 성과",
        plan: "향후 업무 계획",
      }),
    ).rejects.toMatchObject({
      code: "PENDING_CORRECTION",
    });

    // 4. 신청서 상태가 여전히 DRAFT인지 확인
    const [updated] = await db
      .select()
      .from(s.application)
      .where(eq(s.application.appId, app.appId));

    expect(updated.status).toBe("DRAFT");
    expect(updated.submittedAt).toBeNull();

    // 5. 최종 제출 이력이 생성되지 않았는지 확인
    const histories = await db
      .select()
      .from(s.processHistory)
      .where(eq(s.processHistory.action, "APP_SUBMITTED"));

    expect(histories).toHaveLength(0);

    // 6. 정정 요청은 여전히 PENDING 상태여야 함
    const requests = await db
      .select()
      .from(s.correctionRequest)
      .where(eq(s.correctionRequest.appId, app.appId));

    expect(requests).toHaveLength(1);
    expect(requests[0].status).toBe("PENDING");
  });

  it("정정 승인 시 ERP 원본은 유지하고 현재 값만 변경한다", async () => {
    const app = await prepareApplication();

    await requestCorrection(employee, app.appId, {
      itemKey: "training_2025",
      requestedValue: "32",
      reason: "교육 이수 내역 누락",
    });

    const [request] = await db
      .select()
      .from(s.correctionRequest)
      .where(eq(s.correctionRequest.appId, app.appId));
    const [beforeItem] = await db
      .select()
      .from(s.applicationItem)
      .where(
        and(
          eq(s.applicationItem.appId, app.appId),
          eq(s.applicationItem.itemKey, "training_2025"),
        ),
      );

    expect(beforeItem).toBeDefined();
    await approveCorrection(hr, request.reqId, "32");

    const [updatedRequest] = await db
      .select()
      .from(s.correctionRequest)
      .where(eq(s.correctionRequest.reqId, request.reqId));

    const [trainingItem] = await db
      .select()
      .from(s.applicationItem)
      .where(
        and(
          eq(s.applicationItem.appId, app.appId),
          eq(s.applicationItem.itemKey, "training_2025"),
        ),
      );

    expect(trainingItem.erpValue).toBe(beforeItem.erpValue);
    expect(trainingItem.currentValue).toBe("32");
    expect(updatedRequest.status).toBe("APPROVED");
    expect(updatedRequest.appliedValue).toBe("32");

    const histories = await db
      .select()
      .from(s.processHistory)
      .where(eq(s.processHistory.action, "CORRECTION_APPROVED"));

    expect(histories).toHaveLength(1);
    expect(histories[0].entityId).toBe(String(request.reqId));

    const logs = await db
      .select()
      .from(s.accessLog)
      .where(eq(s.accessLog.action, "UPDATE"));

    expect(logs.some((log) => log.userId === hr.userId)).toBe(true);
  });

  it("정정 반려 시 피드백을 반드시 입력해야 한다", async () => {
    const app = await prepareApplication();

    await requestCorrection(employee, app.appId, {
      itemKey: "training_2025",
      requestedValue: "32",
      reason: "교육 이수 내역 누락",
    });

    const [request] = await db
      .select()
      .from(s.correctionRequest)
      .where(eq(s.correctionRequest.appId, app.appId));

    await expect(
      rejectCorrection(hr, request.reqId, ""),
    ).rejects.toBeInstanceOf(Error);

    const [updated] = await db
      .select()
      .from(s.correctionRequest)
      .where(eq(s.correctionRequest.reqId, request.reqId));

    expect(updated.status).toBe("PENDING");

    const histories = await db
      .select()
      .from(s.processHistory)
      .where(eq(s.processHistory.action, "CORRECTION_REJECTED"));

    expect(histories).toHaveLength(0);
  });

  it("업무실적이 2001자이면 최종 제출할 수 없다", async () => {
    const app = await prepareApplication();

    await saveDraft(employee, app.appId, {
      achievement: "가".repeat(2001),
      plan: "향후 업무 계획",
    });

    await expect(
      submitApplication(employee, app.appId, {
        achievement: "가".repeat(2001),
        plan: "향후 업무 계획",
      }),
    ).rejects.toMatchObject({
      code: "INVALID_ACHIEVEMENT",
    });

    const [updated] = await db
      .select()
      .from(s.application)
      .where(eq(s.application.appId, app.appId));

    expect(updated.status).toBe("DRAFT");
    expect(updated.submittedAt).toBeNull();

    const histories = await db
      .select()
      .from(s.processHistory)
      .where(eq(s.processHistory.action, "APP_SUBMITTED"));

    expect(histories).toHaveLength(0);
  });

  it("정상 제출 시 SUBMITTED 상태와 이력, 알림이 생성된다", async () => {
    const app = await prepareApplication();

    await saveDraft(employee, app.appId, {
      achievement: "2026년 주요 업무 성과",
      plan: "향후 업무 계획",
    });

    await submitApplication(employee, app.appId, {
      achievement: "2026년 주요 업무 성과",
      plan: "향후 업무 계획",
    });

    const [updated] = await db
      .select()
      .from(s.application)
      .where(eq(s.application.appId, app.appId));

    expect(updated.status).toBe("SUBMITTED");
    expect(updated.submittedAt).not.toBeNull();

    const histories = await db
      .select()
      .from(s.processHistory)
      .where(eq(s.processHistory.action, "APP_SUBMITTED"));

    expect(histories).toHaveLength(1);
    expect(histories[0].entityId).toBe(String(app.appId));

    const notifications = await db
      .select()
      .from(s.notification)
      .where(eq(s.notification.type, "APPLICATION_SUBMITTED"));

    expect(notifications).toHaveLength(1);
    expect(notifications[0].receiver).toBe("HR");
  });

  it("작성 전 바로 제출하면 작성과 제출 이력이 순서대로 남는다", async () => {
    const app = await prepareApplication();

    await db
      .update(s.application)
      .set({
        achievement: "2026년 주요 업무 성과",
        plan: "향후 업무 계획",
      })
      .where(eq(s.application.appId, app.appId));

    await submitApplication(employee, app.appId, {
      achievement: "2026년 주요 업무 성과",
      plan: "향후 업무 계획",
    });

    const [updated] = await db
      .select()
      .from(s.application)
      .where(eq(s.application.appId, app.appId));

    expect(updated.status).toBe("SUBMITTED");

    const histories = await db
      .select()
      .from(s.processHistory)
      .where(eq(s.processHistory.entityId, String(app.appId)));

    const actions = histories
      .filter(
        (h) =>
          h.entityType === "APPLICATION" &&
          ["APP_DRAFTED", "APP_SUBMITTED"].includes(h.action),
      )
      .sort((a, b) => a.histId - b.histId)
      .map((h) => h.action);

    expect(actions).toEqual(["APP_DRAFTED", "APP_SUBMITTED"]);
  });

  it("다른 직원의 신청서를 임시저장할 수 없다", async () => {
    await prepareApplication();

    const [otherApp] = await db
      .select()
      .from(s.application)
      .where(eq(s.application.empNo, "U1004"));

    expect(otherApp).toBeDefined();

    await expect(
      saveDraft(employee, otherApp.appId, {
        achievement: "다른 직원의 신청서 수정 시도",
        plan: "권한 확인 테스트",
      }),
    ).rejects.toBeInstanceOf(Error);

    const [updated] = await db
      .select()
      .from(s.application)
      .where(eq(s.application.appId, otherApp.appId));

    expect(updated.status).toBe("NOT_STARTED");
    expect(updated.achievement).toBe(otherApp.achievement);
    expect(updated.plan).toBe(otherApp.plan);
  });

  it("정상 확정 시 CONFIRMED 상태와 이력이 생성된다", async () => {
    // 1. 준비: 신청서 생성
    const app = await prepareApplication();

    // 2. 준비: 임시 저장
    // saveDraft() 참고
    await saveDraft(employee, app.appId, {
      achievement: "2026년 주요 업무 성과",
      plan: "향후 업무 계획",
    });

    // 3. 준비: 제출
    // submitApplication() 참고
    await submitApplication(employee, app.appId, {
      achievement: "2026년 주요 업무 성과",
      plan: "향후 업무 계획",
    });

    // 4. 실행: 인사팀 확정
    // confirmApplication() 호출
    await confirmApplication(hr, app.appId);

    // 5. 검증: DB에서 신청서 다시 조회
    const [updated] = await db
      .select()
      .from(s.application)
      .where(eq(s.application.appId, app.appId));

    // 6. 검증: 상태와 확정 시각 확인
    // expect() 사용
    expect(updated.status).toBe("CONFIRMED");
    expect(updated.confirmedAt).not.toBeNull();

    // 7. 검증: 처리 이력 확인
    // processHistory 테이블 조회 후 expect() 사용
    const histories = await db
      .select()
      .from(s.processHistory)
      .where(eq(s.processHistory.action, "APP_CONFIRMED"));
    expect(histories).toHaveLength(1);
    expect(histories[0].entityId).toBe(String(app.appId));
  });

  it("반려 시 RETURNED 상태와 이력이 생성된다", async () => {
    // 1. 준비: 신청서 생성
    const app = await prepareApplication();
    // 2. 준비: 임시 저장
    await saveDraft(employee, app.appId, {
      achievement: "2026년 주요 업무 성과",
      plan: "향후 업무 계획",
    });
    // 3. 준비: 제출
    await submitApplication(employee, app.appId, {
      achievement: "2026년 주요 업무 성과",
      plan: "향후 업무 계획",
    });
    // 4. 실행: 인사팀 반려
    await returnApplication(hr, app.appId, "신청서 내용이 부적절합니다.");
    // 5. 검증: DB에서 신청서 다시 조회
    const [updated] = await db
      .select()
      .from(s.application)
      .where(eq(s.application.appId, app.appId));
    // 6. 검증: 상태와 반려 사유 확인
    expect(updated.status).toBe("RETURNED");
    expect(updated.returnReason).toBe("신청서 내용이 부적절합니다.");
    // 7. 검증: 처리 이력 확인
    const histories = await db
      .select()
      .from(s.processHistory)
      .where(eq(s.processHistory.action, "APP_RETURNED"));
    expect(histories).toHaveLength(1);
    expect(histories[0].entityId).toBe(String(app.appId));
    expect(histories[0].reason).toBe("신청서 내용이 부적절합니다.");
  });

  it("반려 시 반드시 사유를 입력해야 한다", async () => {
    // 1. 준비: 신청서 생성
    const app = await prepareApplication();
    // 2. 준비: 임시 저장
    await saveDraft(employee, app.appId, {
      achievement: "2026년 주요 업무 성과",
      plan: "향후 업무 계획",
    });
    // 3. 준비: 제출
    await submitApplication(employee, app.appId, {
      achievement: "2026년 주요 업무 성과",
      plan: "향후 업무 계획",
    });
    // 4. 실행: 인사팀 반려 시 사유 없이 호출
    await expect(returnApplication(hr, app.appId, "")).rejects.toMatchObject({
      code: "REASON_REQUIRED",
    });
    // 5. 검증: DB에서 신청서 다시 조회
    const [updated] = await db
      .select()
      .from(s.application)
      .where(eq(s.application.appId, app.appId));
    // 6. 검증: 상태가 여전히 SUBMITTED인지 확인
    expect(updated.status).toBe("SUBMITTED");
  });
});

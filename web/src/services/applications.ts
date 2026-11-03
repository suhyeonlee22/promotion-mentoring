import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  application,
  promotionRound,
  correctionRequest,
  applicationItem,
} from "@/db/schema";
import { BusinessError } from "@/lib/error";
import type { CurrentUser } from "@/lib/session";
import type { Tx } from "@/lib/history";
import { recordHistory } from "@/lib/history";
import { createNotification } from "@/lib/notify";
import { recordAccess, getClientIp } from "@/lib/access-log";

// 로그인한 사용자가 직원인지 확인
// 인사팀이나 심사위원은 직원용 신청서 작성 함수 사용할 수 없음
function assertEmployee(
  me: CurrentUser | null,
): asserts me is CurrentUser & { empNo: string } {
  if (me?.role !== "EMPLOYEE" || !me.empNo) {
    throw new BusinessError("FORBIDDEN", "직원만 신청서를 작성할 수 있습니다.");
  }
}

// 신청서 ID, 사번 함께 조회
// 다른 직원의 신청서 ID를 알아도 접근 차단됨
async function getMyApplication(
  tx: Tx,
  me: CurrentUser & { empNo: string },
  appId: number,
) {
  const [app] = await tx
    .select()
    .from(application)
    .where(and(eq(application.appId, appId), eq(application.empNo, me.empNo)));

  if (!app) {
    throw new BusinessError("FORBIDDEN", "본인의 신청서만 확인할 수 있습니다.");
  }

  return app;
}

// 신청서 상태와 회차 상태를 함께 확인
// 제출, 확정된 신청서는 수정할 수 없지만, RETURNED 상태는 회차 상태와 관계없이 수정 가능
async function assertEditable(tx: Tx, app: typeof application.$inferSelect) {
  const [round] = await tx
    .select()
    .from(promotionRound)
    .where(eq(promotionRound.roundId, app.roundId));

  if (!round) {
    throw new BusinessError("NOT_FOUND", "승진 회차를 찾을 수 없습니다.");
  }

  const editable =
    app.status === "RETURNED" ||
    (round.status === "APPLYING" &&
      ["NOT_STARTED", "DRAFT"].includes(app.status));

  if (!editable) {
    throw new BusinessError(
      "NOT_EDITABLE",
      "현재 수정할 수 없는 신청서입니다.",
    );
  }
}

/**
 * 직원 신청서 임시저장
 *
 * NOT_STARTED → DRAFT: 최초 이력 1건
 * DRAFT → DRAFT: 추가 이력 없음
 * RETURNED → RETURNED: 보완 중 상태 유지
 */
export async function saveDraft(
  me: CurrentUser | null,
  appId: number,
  input: {
    achievement: string;
    plan: string;
  },
): Promise<void> {
  // 1. 직원 권한 확인
  assertEmployee(me);

  // 2. 신청서 저장과 이력을 하나의 트랜잭션으로 처리
  await db.transaction(async (tx) => {
    // 3. 본인 신청서인지 확인
    const app = await getMyApplication(tx, me, appId);

    // 4. 현재 수정 가능한 상태인지 확인
    await assertEditable(tx, app);

    // 5. 최초 저장인지 판단
    const isFirstDraft = app.status === "NOT_STARTED";

    // 6. 저장 후 상태 결정
    const nextStatus = isFirstDraft ? "DRAFT" : app.status;

    // 7. 신청서 데이터 저장
    await tx
      .update(application)
      .set({
        achievement: input.achievement,
        plan: input.plan,
        status: nextStatus,
      })
      .where(eq(application.appId, appId));

    // 8. 최초 임시저장일 때만 처리 이력 생성
    if (isFirstDraft) {
      await recordHistory(tx, {
        entityType: "APPLICATION",
        entityId: String(appId),
        action: "APP_DRAFTED",
        fromStatus: "NOT_STARTED",
        toStatus: "DRAFT",
        actor: me.userId,
      });
    }
  });
}

/**
 * 직원 신청서 최종 제출
 */
export async function submitApplication(
  me: CurrentUser | null,
  appId: number,
  input: {
    achievement: string;
    plan: string;
  },
): Promise<void> {
  // 1. 직원 권한 확인
  assertEmployee(me);

  // 2. 제출 조건 확인
  if (input.achievement.length < 1 || input.achievement.length > 2000) {
    throw new BusinessError(
      "INVALID_ACHIEVEMENT",
      "주요 업무실적은 1~2,000자로 입력해야 합니다.",
    );
  }

  if (input.plan.length > 1000) {
    throw new BusinessError(
      "INVALID_PLAN",
      "자기개발 계획은 1,000자 이하로 입력해야 합니다.",
    );
  }

  await db.transaction(async (tx) => {
    // 3. 본인 신청서 및 수정 가능 여부 확인
    const app = await getMyApplication(tx, me, appId);
    await assertEditable(tx, app);

    // 4. 처리 대기 중인 정정 요청 확인
    const pending = await tx
      .select()
      .from(correctionRequest)
      .where(
        and(
          eq(correctionRequest.appId, appId),
          eq(correctionRequest.status, "PENDING"),
        ),
      );

    if (pending.length > 0) {
      throw new BusinessError(
        "PENDING_CORRECTION",
        "처리 대기 중인 정정 요청이 있어 제출할 수 없습니다.",
      );
    }

    // 5. 작성 전에서 바로 제출한 경우
    if (app.status === "NOT_STARTED") {
      await recordHistory(tx, {
        entityType: "APPLICATION",
        entityId: String(appId),
        action: "APP_DRAFTED",
        fromStatus: "NOT_STARTED",
        toStatus: "DRAFT",
        actor: me.userId,
      });
    }

    // 6. 신청서 제출
    await tx
      .update(application)
      .set({
        achievement: input.achievement,
        plan: input.plan,
        status: "SUBMITTED",
        submittedAt: new Date().toISOString(),
        returnReason: null,
      })
      .where(eq(application.appId, appId));

    // 7. 제출 이력 기록
    await recordHistory(tx, {
      entityType: "APPLICATION",
      entityId: String(appId),
      action: "APP_SUBMITTED",
      fromStatus: app.status === "NOT_STARTED" ? "DRAFT" : app.status,
      toStatus: "SUBMITTED",
      actor: me.userId,
    });

    // 8. 인사팀 알림 생성
    await createNotification(tx, {
      receiver: "HR",
      type: "APPLICATION_SUBMITTED",
      title: "승진 신청서 제출",
      body: `${me.name}님의 승진 신청서가 제출되었습니다.`,
      link: `/hr/rounds/${app.roundId}/applications`,
    });
  });
}

/**
 * 직원 신청서 항목 정정 요청
 */
export async function requestCorrection(
  me: CurrentUser | null,
  appId: number,
  input: {
    itemKey: string;
    requestedValue: string;
    reason: string;
  },
): Promise<void> {
  // 1. 직원 권한 확인
  assertEmployee(me);

  // 2. 필수 입력값 확인
  if (!input.requestedValue.trim()) {
    throw new BusinessError("INVALID_VALUE", "정정할 값을 입력해야 합니다.");
  }

  if (!input.reason.trim()) {
    throw new BusinessError("REASON_REQUIRED", "정정 사유를 입력해야 합니다.");
  }

  await db.transaction(async (tx) => {
    // 3. 본인 신청서 및 수정 가능 상태 확인
    const app = await getMyApplication(tx, me, appId);
    await assertEditable(tx, app);

    // 4. 정정 가능한 항목인지 확인
    const [item] = await tx
      .select()
      .from(applicationItem)
      .where(
        and(
          eq(applicationItem.appId, appId),
          eq(applicationItem.itemKey, input.itemKey),
        ),
      );

    if (!item || item.correctable !== "Y") {
      throw new BusinessError("NOT_CORRECTABLE", "정정할 수 없는 항목입니다.");
    }

    // 5. 동일 항목의 처리 대기 요청 확인
    const [existing] = await tx
      .select()
      .from(correctionRequest)
      .where(
        and(
          eq(correctionRequest.appId, appId),
          eq(correctionRequest.itemKey, input.itemKey),
          eq(correctionRequest.status, "PENDING"),
        ),
      );

    if (existing) {
      throw new BusinessError(
        "DUPLICATE_CORRECTION",
        "이미 처리 대기 중인 정정 요청이 있습니다.",
      );
    }

    // 6. 정정 요청 생성
    const [created] = await tx
      .insert(correctionRequest)
      .values({
        appId,
        itemKey: input.itemKey,
        requestedValue: input.requestedValue.trim(),
        reason: input.reason.trim(),
        status: "PENDING",
        requestedAt: new Date().toISOString(),
      })
      .returning({ reqId: correctionRequest.reqId });

    // 7. 처리 이력 기록
    await recordHistory(tx, {
      entityType: "CORRECTION",
      entityId: String(created.reqId),
      action: "CORRECTION_REQUESTED",
      fromStatus: null,
      toStatus: "PENDING",
      reason: input.reason.trim(),
      detail: {
        appId,
        itemKey: input.itemKey,
        before: item.currentValue,
        requested: input.requestedValue.trim(),
      },
      actor: me.userId,
    });

    // 8. 인사팀 알림 생성
    await createNotification(tx, {
      receiver: "HR",
      type: "CORRECTION_REQUESTED",
      title: "승진 신청서 정정 요청",
      body: `${me.name}님이 ${item.label} 항목의 정정을 요청했습니다.`,
      link: `/hr/rounds/${app.roundId}/applications`,
    });
  });
}

/** 인사팀 정정 요청 승인 */
export async function approveCorrection(
  me: CurrentUser | null,
  reqId: number,
  appliedValue: string,
): Promise<void> {
  if (me?.role !== "HR") {
    throw new BusinessError(
      "FORBIDDEN",
      "인사팀만 정정 요청을 승인할 수 있습니다.",
    );
  }

  if (!appliedValue.trim()) {
    throw new BusinessError("INVALID_VALUE", "반영할 값을 입력해 주세요.");
  }

  const ip = await getClientIp();

  await db.transaction(async (tx) => {
    // 1. 정정 요청 확인
    const [req] = await tx
      .select()
      .from(correctionRequest)
      .where(eq(correctionRequest.reqId, reqId));

    if (!req || req.status !== "PENDING") {
      throw new BusinessError(
        "INVALID_CORRECTION",
        "처리 대기 중인 정정 요청이 아닙니다.",
      );
    }

    // 2. 신청서 및 회차 확인
    const [app] = await tx
      .select()
      .from(application)
      .where(eq(application.appId, req.appId));

    if (!app) {
      throw new BusinessError("NOT_FOUND", "신청서를 찾을 수 없습니다.");
    }

    const [round] = await tx
      .select()
      .from(promotionRound)
      .where(eq(promotionRound.roundId, app.roundId));

    if (!round || !["APPLYING", "REVIEWING"].includes(round.status)) {
      throw new BusinessError(
        "INVALID_ROUND",
        "현재 정정 요청을 처리할 수 없는 회차입니다.",
      );
    }

    // 3. 정정 대상 항목 조회
    const [item] = await tx
      .select()
      .from(applicationItem)
      .where(
        and(
          eq(applicationItem.appId, req.appId),
          eq(applicationItem.itemKey, req.itemKey),
        ),
      );

    if (!item) {
      throw new BusinessError(
        "NOT_FOUND",
        "정정 대상 항목을 찾을 수 없습니다.",
      );
    }

    const before = item.currentValue;
    const after = appliedValue.trim();
    const now = new Date().toISOString();

    // 4. 현재 값만 수정 (ERP 원본 유지)
    await tx
      .update(applicationItem)
      // .set()안에 currentValue만 있다는 건 ERP원본인 erpValue는 그대로 두도록 함
      .set({ currentValue: after })
      .where(
        and(
          eq(applicationItem.appId, req.appId),
          eq(applicationItem.itemKey, req.itemKey),
        ),
      );

    // 5. 정정 요청 승인 처리
    await tx
      .update(correctionRequest)
      .set({
        status: "APPROVED",
        appliedValue: after,
        handledBy: me.userId,
        handledAt: now,
      })
      .where(eq(correctionRequest.reqId, reqId));

    // 6. 처리 이력
    await recordHistory(tx, {
      entityType: "CORRECTION",
      entityId: String(reqId),
      action: "CORRECTION_APPROVED",
      fromStatus: "PENDING",
      toStatus: "APPROVED",
      detail: {
        itemKey: req.itemKey,
        before,
        after,
      },
      actor: me.userId,
    });

    // 7. 개인정보 접근기록
    await recordAccess(
      {
        userId: me.userId,
        ip,
        subjectEmpNo: app.empNo,
        action: "UPDATE",
        target: `신청서 ${req.appId} 정정 승인`,
      },
      tx,
    );
  });
}

/** 인사팀 정정 요청 반려 */
export async function rejectCorrection(
  me: CurrentUser | null,
  reqId: number,
  feedback: string,
): Promise<void> {
  if (me?.role !== "HR") {
    throw new BusinessError(
      "FORBIDDEN",
      "인사팀만 정정 요청을 반려할 수 있습니다.",
    );
  }
  // 피드백이 없으면 반려되지 않고 기존 PENDING 상태가 유지되어야 함
  if (!feedback.trim()) {
    throw new BusinessError(
      "FEEDBACK_REQUIRED",
      "반려 사유를 입력해야 합니다.",
    );
  }

  await db.transaction(async (tx) => {
    // 1. 정정 요청 확인
    const [req] = await tx
      .select()
      .from(correctionRequest)
      .where(eq(correctionRequest.reqId, reqId));

    if (!req || req.status !== "PENDING") {
      throw new BusinessError(
        "INVALID_CORRECTION",
        "처리 대기 중인 정정 요청이 아닙니다.",
      );
    }

    // 2. 신청서 및 회차 확인
    const [app] = await tx
      .select()
      .from(application)
      .where(eq(application.appId, req.appId));

    if (!app) {
      throw new BusinessError("NOT_FOUND", "신청서를 찾을 수 없습니다.");
    }

    const [round] = await tx
      .select()
      .from(promotionRound)
      .where(eq(promotionRound.roundId, app.roundId));

    if (!round || !["APPLYING", "REVIEWING"].includes(round.status)) {
      throw new BusinessError(
        "INVALID_ROUND",
        "현재 정정 요청을 처리할 수 없는 회차입니다.",
      );
    }

    const now = new Date().toISOString();

    // 3. 반려 처리 (항목 현재 값 변경 없음)
    await tx
      .update(correctionRequest)
      .set({
        status: "REJECTED",
        feedback: feedback.trim(),
        handledBy: me.userId,
        handledAt: now,
      })
      .where(eq(correctionRequest.reqId, reqId));

    // 4. 처리 이력
    await recordHistory(tx, {
      entityType: "CORRECTION",
      entityId: String(reqId),
      action: "CORRECTION_REJECTED",
      fromStatus: "PENDING",
      toStatus: "REJECTED",
      reason: feedback.trim(),
      actor: me.userId,
    });
  });
}

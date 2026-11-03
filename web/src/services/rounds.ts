import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  promotionRound,
  promotionCandidate,
  application,
  applicationItem,
  correctionRequest,
} from "@/db/schema";
import { BusinessError } from "@/lib/error";
import type { CurrentUser } from "@/lib/session";
import { recordHistory, type Tx } from "@/lib/history";
import { loadRules } from "@/lib/rules";
import { queueMail } from "@/lib/mail";
import { addDays } from "@/domain/date";
import {
  judgeCandidate,
  finalSelected,
  type CandidateJudgement,
} from "@/domain/promotion";
import { buildApplicationItems } from "@/domain/items";
import { loadErpEmployees } from "./erp";

type ManualAction = "ADD" | "EXCLUDE" | "NONE";
export type SelectionEvidence = Record<
  string,
  {
    judgement: CandidateJudgement;
    disciplines: import("@/domain/period").ApptInput[];
  }
>;
function assertHr(me: CurrentUser | null): asserts me is CurrentUser {
  if (me?.role !== "HR")
    throw new BusinessError("FORBIDDEN", "인사팀만 처리할 수 있습니다.");
}
async function getRound(tx: Tx, roundId: number) {
  if (!Number.isSafeInteger(roundId) || roundId <= 0) {
    throw new BusinessError("INVALID_ROUND", "올바른 회차를 선택해 주세요.");
  }
  const [round] = await tx
    .select()
    .from(promotionRound)
    .where(eq(promotionRound.roundId, roundId));
  if (!round) throw new BusinessError("NOT_FOUND", "회차를 찾을 수 없습니다.");
  return round;
}
function assertPreparing(status: string) {
  if (status !== "PREPARING")
    throw new BusinessError(
      "ROUND_STATUS",
      "준비 상태에서만 선정과 예외 처리가 가능합니다.",
    );
}

/** 회차와 생성 이력을 함께 저장한다. */
export async function createRound(
  me: CurrentUser | null,
  input: {
    name: string;
    baseDate: string;
    applyStart: string;
    applyEnd: string;
  },
): Promise<number> {
  assertHr(me);
  if (!input.name.trim())
    throw new BusinessError("NAME_REQUIRED", "회차명을 입력해 주세요.");
  for (const date of [input.baseDate, input.applyStart, input.applyEnd]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || addDays(date, 0) !== date)
      throw new BusinessError(
        "INVALID_DATE",
        "기준일과 신청 기간을 올바른 날짜로 입력해 주세요.",
      );
  }
  if (input.applyStart > input.applyEnd)
    throw new BusinessError(
      "INVALID_PERIOD",
      "신청 시작일은 종료일보다 늦을 수 없습니다.",
    );
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(promotionRound)
      .values({
        ...input,
        name: input.name.trim(),
        status: "PREPARING",
        createdAt: new Date().toISOString(),
      })
      .returning();
    await recordHistory(tx, {
      entityType: "ROUND",
      entityId: String(created.roundId),
      action: "ROUND_CREATED",
      toStatus: "PREPARING",
      actor: me.userId,
    });
    return created.roundId;
  });
}

/** 자동 판정은 갱신하고 유효한 수동 처리와 사유는 보존한다. */
export async function runSelection(
  me: CurrentUser | null,
  roundId: number,
): Promise<{ total: number; auto: number; final: number }> {
  assertHr(me);
  const rules = await loadRules();
  return db.transaction(async (tx) => {
    const round = await getRound(tx, roundId);
    assertPreparing(round.status);
    const employees = await loadErpEmployees(tx);
    const previous = await tx
      .select()
      .from(promotionCandidate)
      .where(eq(promotionCandidate.roundId, roundId));
    const summary = { total: 0, auto: 0, final: 0 };
    const evidence: SelectionEvidence = {};
    const currentEmpNos = new Set(
      employees.filter((e) => e.candidate.grade !== "G3").map((e) => e.empNo),
    );
    for (const old of previous) {
      if (!currentEmpNos.has(old.empNo)) {
        await tx
          .delete(promotionCandidate)
          .where(
            and(
              eq(promotionCandidate.roundId, roundId),
              eq(promotionCandidate.empNo, old.empNo),
            ),
          );
      }
    }
    for (const employee of employees) {
      const j = judgeCandidate(employee.candidate, round.baseDate, rules);
      if (!j) continue;
      const old = previous.find((c) => c.empNo === employee.empNo);
      let manualAction = (old?.manualAction ?? "NONE") as ManualAction;
      let manualReason = old?.manualReason ?? null;
      if (
        (manualAction === "ADD" && j.autoSelected) ||
        (manualAction === "EXCLUDE" && !j.autoSelected)
      ) {
        await recordHistory(tx, {
          entityType: "CANDIDATE",
          entityId: `${roundId}|${employee.empNo}`,
          action: "MANUAL_CANCEL",
          fromStatus: manualAction,
          toStatus: "NONE",
          reason: "재선정으로 자동 취소",
          actor: me.userId,
        });
        manualAction = "NONE";
        manualReason = null;
      }
      const selected = finalSelected(j.autoSelected, manualAction);
      const values = {
        roundId,
        empNo: employee.empNo,
        name: employee.items.name,
        orgName: employee.items.orgName,
        grade: employee.candidate.grade,
        gradeDate: employee.candidate.gradeDate,
        targetGrade: j.targetGrade,
        requiredMonths: j.requiredMonths,
        excludedDays: j.excludedDays,
        qualifyDate: j.qualifyDate,
        r1Active: j.r1,
        r2Period: j.r2,
        r3Discipline: j.r3,
        restrictEndDate: j.restrictEndDate,
        autoSelected: j.autoSelected ? "Y" : "N",
        manualAction,
        manualReason,
        finalSelected: selected ? "Y" : "N",
        judgedAt: new Date().toISOString(),
      };
      await tx
        .insert(promotionCandidate)
        .values(values)
        .onConflictDoUpdate({
          target: [promotionCandidate.roundId, promotionCandidate.empNo],
          set: values,
        });
      summary.total++;
      if (j.autoSelected) summary.auto++;
      if (selected) summary.final++;
      evidence[employee.empNo] = {
        judgement: j,
        disciplines: employee.candidate.appointments.filter(
          (a) => a.apptType === "DISCIPLINE",
        ),
      };
    }
    // 판정 근거도 선정 당시 값으로 보존하여 이후 ERP 변경과 섞이지 않게 한다.
    await recordHistory(tx, {
      entityType: "ROUND",
      entityId: String(roundId),
      action: "SELECTION_RUN",
      detail: { ...summary, evidence },
      actor: me.userId,
    });
    return summary;
  });
}

export async function setManualAction(
  me: CurrentUser | null,
  roundId: number,
  empNo: string,
  action: ManualAction,
  reason: string,
): Promise<void> {
  assertHr(me);
  if (!["ADD", "EXCLUDE", "NONE"].includes(action))
    throw new BusinessError(
      "INVALID_ACTION",
      "올바른 예외 처리를 선택해 주세요.",
    );
  if (action !== "NONE" && reason.trim().length < 5)
    throw new BusinessError(
      "REASON_REQUIRED",
      "예외 처리 사유는 5자 이상 입력해 주세요.",
    );
  await db.transaction(async (tx) => {
    assertPreparing((await getRound(tx, roundId)).status);
    const key = and(
      eq(promotionCandidate.roundId, roundId),
      eq(promotionCandidate.empNo, empNo),
    );
    const [c] = await tx.select().from(promotionCandidate).where(key);
    if (!c)
      throw new BusinessError("NOT_FOUND", "선정 결과에 없는 직원입니다.");
    if (
      (action === "ADD" && c.autoSelected === "Y") ||
      (action === "EXCLUDE" && c.autoSelected === "N")
    )
      throw new BusinessError(
        "INVALID_ACTION",
        "자동 미선정자는 수동 추가, 자동 선정자는 수동 제외만 가능합니다.",
      );
    if (action === "NONE" && c.manualAction === "NONE")
      throw new BusinessError("INVALID_ACTION", "취소할 예외 처리가 없습니다.");
    await tx
      .update(promotionCandidate)
      .set({
        manualAction: action,
        manualReason: action === "NONE" ? null : reason.trim(),
        finalSelected: finalSelected(c.autoSelected === "Y", action)
          ? "Y"
          : "N",
      })
      .where(key);
    await recordHistory(tx, {
      entityType: "CANDIDATE",
      entityId: `${roundId}|${empNo}`,
      action: action === "NONE" ? "MANUAL_CANCEL" : `MANUAL_${action}`,
      fromStatus: c.manualAction,
      toStatus: action,
      reason: action === "NONE" ? null : reason.trim(),
      actor: me.userId,
    });
  });
}

/** 회차는 앞으로만 전환한다. 신청 시작 시 신청서·항목·메일·이력이 함께 생성된다. */
export async function changeRoundStatus(
  me: CurrentUser | null,
  roundId: number,
  to: "APPLYING" | "REVIEWING" | "RESULT",
): Promise<void> {
  assertHr(me);
  await db.transaction(async (tx) => {
    const round = await getRound(tx, roundId);
    const next: Record<string, string> = {
      PREPARING: "APPLYING",
      APPLYING: "REVIEWING",
      REVIEWING: "RESULT",
    };
    if (next[round.status] !== to || !to)
      throw new BusinessError(
        "ROUND_STATUS",
        "회차 상태는 준비 → 신청 → 검토 → 결과 순서로만 전환할 수 있습니다.",
      );
    if (to === "APPLYING") {
      const selected = await tx
        .select()
        .from(promotionCandidate)
        .where(
          and(
            eq(promotionCandidate.roundId, roundId),
            eq(promotionCandidate.finalSelected, "Y"),
          ),
        );
      if (!selected.length)
        throw new BusinessError(
          "NO_CANDIDATES",
          "선정 실행 후 최종 대상자가 1명 이상 있어야 합니다.",
        );
      const employees = await loadErpEmployees(tx);
      for (const c of selected) {
        const employee = employees.find((e) => e.empNo === c.empNo);
        if (!employee)
          throw new BusinessError(
            "ERP_NOT_FOUND",
            `${c.name}의 ERP 정보를 찾을 수 없습니다. 선정을 다시 실행해 주세요.`,
          );
        const [app] = await tx
          .insert(application)
          .values({ roundId, empNo: c.empNo, status: "NOT_STARTED" })
          .returning();
        const judgement: CandidateJudgement = {
          targetGrade: c.targetGrade as CandidateJudgement["targetGrade"],
          requiredMonths: c.requiredMonths,
          excludedDays: c.excludedDays,
          excludedParts: [],
          qualifyDate: c.qualifyDate,
          r1: c.r1Active as "O" | "X",
          r2: c.r2Period as "O" | "X",
          r3: c.r3Discipline as "O" | "X",
          restrictEndDate: c.restrictEndDate,
          autoSelected: c.autoSelected === "Y",
        };
        const items = buildApplicationItems(
          employee.items,
          judgement,
          round.baseDate,
        );
        await tx.insert(applicationItem).values(
          items.map((item) => ({
            appId: app.appId,
            itemKey: item.itemKey,
            label: item.label,
            sortOrder: item.sortOrder,
            erpValue: item.value,
            currentValue: item.value,
            correctable: item.correctable ? "Y" : "N",
          })),
        );
        await recordHistory(tx, {
          entityType: "APPLICATION",
          entityId: String(app.appId),
          action: "APP_CREATED",
          toStatus: "NOT_STARTED",
          actor: me.userId,
        });
        await queueMail(tx, {
          dedupKey: `PROMO_INVITE|${roundId}|${c.empNo}`,
          mailType: "PROMO_INVITE",
          toEmpNo: c.empNo,
          toEmail: employee.email,
          subject: `[승진] ${round.name} 신청 안내`,
          body: `${employee.items.name}님, ${round.name} 신청 대상입니다. 신청 기간: ${round.applyStart} ~ ${round.applyEnd}. 내 승진 신청서에서 확인해 주세요.`,
        });
      }
    }
    if (to === "RESULT") {
      const unfinished = await tx
        .select({ appId: application.appId })
        .from(application)
        .where(
          and(
            eq(application.roundId, roundId),
            inArray(application.status, ["SUBMITTED", "RETURNED"]),
          ),
        )
        .limit(1);
      const pending = await tx
        .select({ reqId: correctionRequest.reqId })
        .from(correctionRequest)
        .innerJoin(application, eq(application.appId, correctionRequest.appId))
        .where(
          and(
            eq(application.roundId, roundId),
            eq(correctionRequest.status, "PENDING"),
          ),
        )
        .limit(1);
      if (unfinished.length || pending.length)
        throw new BusinessError(
          "REVIEW_PENDING",
          "제출·보완 요청 신청서와 처리 대기 정정 요청을 모두 처리해 주세요.",
        );
    }
    await tx
      .update(promotionRound)
      .set({ status: to })
      .where(eq(promotionRound.roundId, roundId));
    await recordHistory(tx, {
      entityType: "ROUND",
      entityId: String(roundId),
      action: "ROUND_STATUS_CHANGED",
      fromStatus: round.status,
      toStatus: to,
      actor: me.userId,
    });
  });
}

import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { seedAll } from "@/db/seed";
import * as s from "@/db/schema";
import { BusinessError } from "@/lib/error";
import type { CurrentUser } from "@/lib/session";
import { queueMail } from "@/lib/mail";
import * as history from "@/lib/history";
import {
  createRound,
  runSelection,
  setManualAction,
  changeRoundStatus,
} from "./rounds";

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
const input = {
  name: "2027년 상반기 정기승진",
  baseDate: "2026-12-31",
  applyStart: "2027-01-04",
  applyEnd: "2027-01-15",
};
const reason = "휴직기간 산정 이의신청 인정";
async function candidate(roundId: number, empNo: string) {
  const [row] = await db
    .select()
    .from(s.promotionCandidate)
    .where(
      and(
        eq(s.promotionCandidate.roundId, roundId),
        eq(s.promotionCandidate.empNo, empNo),
      ),
    );
  return row;
}
async function histories(action: string) {
  return db
    .select()
    .from(s.processHistory)
    .where(eq(s.processHistory.action, action));
}
async function prepare() {
  const id = await createRound(hr, input);
  await runSelection(hr, id);
  await setManualAction(hr, id, "U1003", "ADD", reason);
  return id;
}
async function applying() {
  const id = await prepare();
  await changeRoundStatus(hr, id, "APPLYING");
  return id;
}

describe("STEP 6 회차 통합 테스트 (test.db 전용)", () => {
  beforeEach(async () => {
    if (process.env.DATABASE_URL !== "file:test.db")
      throw new Error("테스트 전용 DB가 아닙니다.");
    vi.restoreAllMocks();
    await seedAll();
  });

  it("회차 생성: PREPARING과 ROUND_CREATED 1건", async () => {
    const id = await createRound(hr, input);
    expect((await db.select().from(s.promotionRound))[0]).toMatchObject({
      roundId: id,
      ...input,
      status: "PREPARING",
    });
    expect(await histories("ROUND_CREATED")).toMatchObject([
      {
        entityType: "ROUND",
        entityId: String(id),
        actor: "hr01",
        fromStatus: null,
        toStatus: "PREPARING",
      },
    ]);
  });

  it("선정 11행이 요구사항 8.3 정답표의 모든 판정 값과 같다", async () => {
    const id = await createRound(hr, input);
    expect(await runSelection(hr, id)).toEqual({
      total: 11,
      auto: 5,
      final: 5,
    });
    const rows = await db
      .select()
      .from(s.promotionCandidate)
      .orderBy(s.promotionCandidate.empNo);
    expect(
      rows.map((c) => [
        c.empNo,
        c.grade,
        c.targetGrade,
        c.requiredMonths,
        c.excludedDays,
        c.qualifyDate,
        c.r1Active + c.r2Period + c.r3Discipline,
        c.restrictEndDate,
        c.autoSelected,
        c.finalSelected,
      ]),
    ).toEqual([
      ["U1001", "G7", "G6", 24, 0, "2026-01-01", "OOO", null, "Y", "Y"],
      ["U1002", "G7", "G6", 24, 0, "2027-03-01", "OXO", null, "N", "N"],
      ["U1003", "G6", "G5", 36, 184, "2027-01-01", "OXO", null, "N", "N"],
      ["U1004", "G6", "G5", 36, 0, "2026-07-01", "OOO", null, "Y", "Y"],
      ["U1005", "G5", "G4", 48, 0, "2026-01-01", "OOX", "2027-05-31", "N", "N"],
      ["U1006", "G5", "G4", 48, 0, "2025-06-01", "OOO", "2025-07-15", "Y", "Y"],
      ["U1007", "G4", "G3", 48, 0, "2026-12-31", "OOO", null, "Y", "Y"],
      ["U1008", "G6", "G5", 36, 122, "2025-07-01", "XOO", null, "N", "N"],
      ["U1009", "G7", "G6", 24, 0, "2025-01-01", "XOO", null, "N", "N"],
      [
        "U1011",
        "G5",
        "G4",
        48,
        59,
        "2025-03-01",
        "OOX",
        "2027-09-30",
        "N",
        "N",
      ],
      ["U1012", "G4", "G3", 48, 61, "2025-05-01", "OOO", null, "Y", "Y"],
    ]);
    const logs = await histories("SELECTION_RUN");
    expect(logs).toHaveLength(1);
    expect(JSON.parse(logs[0].detailJson!)).toMatchObject({
      total: 11,
      auto: 5,
      final: 5,
      evidence: {
        U1003: {
          judgement: {
            excludedParts: [
              { start: "2024-03-01", end: "2024-08-31", days: 184 },
            ],
          },
        },
      },
    });
  });

  it("E03 수동 추가와 사유를 기록하고 재선정 후에도 최종 6명을 유지한다", async () => {
    const id = await prepare();
    expect(await candidate(id, "U1003")).toMatchObject({
      manualAction: "ADD",
      manualReason: reason,
      finalSelected: "Y",
    });
    expect(await histories("MANUAL_ADD")).toMatchObject([
      { reason, actor: "hr01", entityId: `${id}|U1003` },
    ]);
    expect(await runSelection(hr, id)).toEqual({
      total: 11,
      auto: 5,
      final: 6,
    });
    expect(await candidate(id, "U1003")).toMatchObject({
      manualAction: "ADD",
      manualReason: reason,
      finalSelected: "Y",
    });
  });

  it.each(["", "    ", "네글자임"])(
    "5자 미만 사유 %j는 거부하고 아무것도 바꾸지 않는다",
    async (value) => {
      const id = await createRound(hr, input);
      await runSelection(hr, id);
      const before = await candidate(id, "U1003");
      await expect(
        setManualAction(hr, id, "U1003", "ADD", value),
      ).rejects.toBeInstanceOf(BusinessError);
      expect(await candidate(id, "U1003")).toEqual(before);
      expect(await histories("MANUAL_ADD")).toHaveLength(0);
    },
  );

  it("이미 자동 선정된 E01의 수동 추가와 미선정자의 제외는 거부한다", async () => {
    const id = await prepare();
    await expect(
      setManualAction(hr, id, "U1001", "ADD", reason),
    ).rejects.toBeInstanceOf(BusinessError);
    await expect(
      setManualAction(hr, id, "U1002", "EXCLUDE", reason),
    ).rejects.toBeInstanceOf(BusinessError);
  });

  it("수동 제외와 취소, 수동 추가 취소는 자동 판정으로 복원한다", async () => {
    const id = await prepare();
    await setManualAction(hr, id, "U1001", "EXCLUDE", "별도 심사 대상자");
    expect(await candidate(id, "U1001")).toMatchObject({
      manualAction: "EXCLUDE",
      finalSelected: "N",
    });
    await setManualAction(hr, id, "U1001", "NONE", "");
    await setManualAction(hr, id, "U1003", "NONE", "");
    expect(await candidate(id, "U1001")).toMatchObject({
      manualAction: "NONE",
      manualReason: null,
      finalSelected: "Y",
    });
    expect(await candidate(id, "U1003")).toMatchObject({
      manualAction: "NONE",
      manualReason: null,
      finalSelected: "N",
    });
    expect(await histories("MANUAL_EXCLUDE")).toHaveLength(1);
    expect(await histories("MANUAL_CANCEL")).toHaveLength(2);
  });

  it("ERP 변경 전 스냅샷 보존, 재선정 후 무의미한 추가·제외 자동 취소", async () => {
    const id = await prepare();
    await setManualAction(hr, id, "U1001", "EXCLUDE", "별도 심사 대상자");
    await db
      .update(s.srcEmployee)
      .set({ gradeDate: "2023-01-01", name: "변경 이름" })
      .where(eq(s.srcEmployee.empNo, "U1003"));
    await db
      .update(s.srcEmployee)
      .set({ status: "RETIRED" })
      .where(eq(s.srcEmployee.empNo, "U1001"));
    expect(await candidate(id, "U1003")).toMatchObject({
      name: "박민재",
      autoSelected: "N",
      manualAction: "ADD",
    });
    await runSelection(hr, id);
    expect(await candidate(id, "U1003")).toMatchObject({
      name: "변경 이름",
      autoSelected: "Y",
      manualAction: "NONE",
      manualReason: null,
      finalSelected: "Y",
    });
    expect(await candidate(id, "U1001")).toMatchObject({
      autoSelected: "N",
      manualAction: "NONE",
      manualReason: null,
      finalSelected: "N",
    });
    expect(await histories("MANUAL_CANCEL")).toHaveLength(2);
  });

  it("APPLYING 전환: 신청서 6건, 항목 90행, 메일 6건과 생성 이력", async () => {
    const id = await applying();
    const apps = await db.select().from(s.application);
    expect(apps).toHaveLength(6);
    expect(apps.every((a) => a.status === "NOT_STARTED")).toBe(true);
    expect(apps.map((a) => a.empNo).sort()).toEqual([
      "U1001",
      "U1003",
      "U1004",
      "U1006",
      "U1007",
      "U1012",
    ]);
    const items = await db.select().from(s.applicationItem);
    expect(items).toHaveLength(90);
    expect(items.every((i) => i.erpValue === i.currentValue)).toBe(true);
    for (const app of apps)
      expect(items.filter((i) => i.appId === app.appId)).toHaveLength(15);
    const mails = await db.select().from(s.mailOutbox);
    expect(mails).toHaveLength(6);
    for (const mail of mails)
      expect(mail).toMatchObject({
        dedupKey: `PROMO_INVITE|${id}|${mail.toEmpNo}`,
        mailType: "PROMO_INVITE",
        subject: `[승진] ${input.name} 신청 안내`,
      });
    expect(await histories("APP_CREATED")).toHaveLength(6);
    expect(await histories("ROUND_STATUS_CHANGED")).toMatchObject([
      { fromStatus: "PREPARING", toStatus: "APPLYING" },
    ]);
    await expect(changeRoundStatus(hr, id, "APPLYING")).rejects.toBeInstanceOf(
      BusinessError,
    );
    expect(await db.select().from(s.mailOutbox)).toHaveLength(6);
    expect(await db.select().from(s.application)).toHaveLength(6);
  });

  it("신청서 항목은 생성 당시 ERP와 저장된 판정의 충족일을 사용한다", async () => {
    const id = await prepare();
    await db
      .update(s.srcTraining)
      .set({ hours: 32 })
      .where(
        and(eq(s.srcTraining.empNo, "U1004"), eq(s.srcTraining.year, 2025)),
      );
    await db
      .update(s.srcEmployee)
      .set({ gradeDate: "2020-01-01" })
      .where(eq(s.srcEmployee.empNo, "U1003"));
    await changeRoundStatus(hr, id, "APPLYING");
    const apps = await db.select().from(s.application);
    const items = await db.select().from(s.applicationItem);
    expect(
      items.find(
        (i) =>
          i.appId === apps.find((a) => a.empNo === "U1004")!.appId &&
          i.itemKey === "training_2025",
      )?.erpValue,
    ).toBe("32");
    expect(
      items.find(
        (i) =>
          i.appId === apps.find((a) => a.empNo === "U1003")!.appId &&
          i.itemKey === "qualify_date",
      )?.erpValue,
    ).toBe("2027-01-01");
  });

  it("전환 후 선정과 예외 처리는 거부한다", async () => {
    const id = await applying();
    await expect(runSelection(hr, id)).rejects.toBeInstanceOf(BusinessError);
    await expect(
      setManualAction(hr, id, "U1003", "NONE", ""),
    ).rejects.toBeInstanceOf(BusinessError);
  });

  it("선정 없이 또는 최종 대상 0명인 회차는 전환할 수 없다", async () => {
    const id = await createRound(hr, input);
    await expect(changeRoundStatus(hr, id, "APPLYING")).rejects.toBeInstanceOf(
      BusinessError,
    );
    await runSelection(hr, id);
    for (const empNo of ["U1001", "U1004", "U1006", "U1007", "U1012"])
      await setManualAction(hr, id, empNo, "EXCLUDE", "별도 심사 대상자");
    await expect(changeRoundStatus(hr, id, "APPLYING")).rejects.toBeInstanceOf(
      BusinessError,
    );
    expect(await db.select().from(s.application)).toHaveLength(0);
  });

  it.each([null, employee, { ...hr, role: "REVIEWER" as const }])(
    "비HR 사용자는 모든 쓰기를 거부한다: %j",
    async (me) => {
      const id = await prepare();
      await expect(createRound(me, input)).rejects.toBeInstanceOf(
        BusinessError,
      );
      await expect(runSelection(me, id)).rejects.toBeInstanceOf(BusinessError);
      await expect(
        setManualAction(me, id, "U1003", "ADD", reason),
      ).rejects.toBeInstanceOf(BusinessError);
      await expect(
        changeRoundStatus(me, id, "APPLYING"),
      ).rejects.toBeInstanceOf(BusinessError);
      expect(await db.select().from(s.application)).toHaveLength(0);
    },
  );

  it.each([
    { name: " " },
    { baseDate: "2026-02-30" },
    { applyStart: "" },
    { applyEnd: "2027-01-01" },
  ])("잘못된 회차 입력 %j는 저장하지 않는다", async (patch) => {
    await expect(
      createRound(hr, { ...input, ...patch }),
    ).rejects.toBeInstanceOf(BusinessError);
    expect(await db.select().from(s.promotionRound)).toHaveLength(0);
    expect(await histories("ROUND_CREATED")).toHaveLength(0);
  });

  it("없는 회차와 대상자, 잘못된 처리 코드는 BusinessError", async () => {
    const id = await prepare();
    await expect(runSelection(hr, -1)).rejects.toBeInstanceOf(BusinessError);
    await expect(runSelection(hr, Number.NaN)).rejects.toBeInstanceOf(
      BusinessError,
    );
    await expect(changeRoundStatus(hr, -1, "APPLYING")).rejects.toBeInstanceOf(
      BusinessError,
    );
    await expect(
      setManualAction(hr, id, "U1010", "ADD", reason),
    ).rejects.toBeInstanceOf(BusinessError);
    await expect(
      setManualAction(hr, id, "U1003", "INVALID" as "ADD", reason),
    ).rejects.toBeInstanceOf(BusinessError);
  });

  it("순서 건너뛰기·되돌리기 금지, 신청 → 검토는 미제출을 유지한다", async () => {
    const id = await prepare();
    await expect(changeRoundStatus(hr, id, "RESULT")).rejects.toBeInstanceOf(
      BusinessError,
    );
    await changeRoundStatus(hr, id, "APPLYING");
    await expect(changeRoundStatus(hr, id, "RESULT")).rejects.toBeInstanceOf(
      BusinessError,
    );
    await changeRoundStatus(hr, id, "REVIEWING");
    expect(
      (await db.select().from(s.application)).every(
        (a) => a.status === "NOT_STARTED",
      ),
    ).toBe(true);
    await expect(changeRoundStatus(hr, id, "APPLYING")).rejects.toBeInstanceOf(
      BusinessError,
    );
    await changeRoundStatus(hr, id, "RESULT");
    expect((await db.select().from(s.promotionRound))[0].status).toBe("RESULT");
  });

  it.each(["SUBMITTED", "RETURNED"])(
    "%s 신청서가 있으면 결과 전환 불가",
    async (status) => {
      const id = await applying();
      await changeRoundStatus(hr, id, "REVIEWING");
      await db
        .update(s.application)
        .set({ status })
        .where(eq(s.application.empNo, "U1001"));
      await expect(changeRoundStatus(hr, id, "RESULT")).rejects.toBeInstanceOf(
        BusinessError,
      );
      expect((await db.select().from(s.promotionRound))[0].status).toBe(
        "REVIEWING",
      );
    },
  );

  it("대기 정정 요청이 있으면 결과 전환 불가, 다른 회차의 대기는 영향 없음", async () => {
    const id = await applying();
    await changeRoundStatus(hr, id, "REVIEWING");
    const [app] = await db.select().from(s.application);
    await db.insert(s.correctionRequest).values({
      appId: app.appId,
      itemKey: "org",
      requestedValue: "연구처",
      reason: "소속 정정",
      status: "PENDING",
      requestedAt: new Date().toISOString(),
    });
    await expect(changeRoundStatus(hr, id, "RESULT")).rejects.toBeInstanceOf(
      BusinessError,
    );
    const otherId = await applying();
    await changeRoundStatus(hr, otherId, "REVIEWING");
    await expect(
      changeRoundStatus(hr, otherId, "RESULT"),
    ).resolves.toBeUndefined();
  });

  it("메일 dedupKey가 같으면 false를 반환하고 1건만 저장한다", async () => {
    const mail = {
      dedupKey: "PROMO_INVITE|1|U1001",
      mailType: "PROMO_INVITE" as const,
      toEmpNo: "U1001",
      toEmail: "test@example.com",
      subject: "제목",
      body: "내용",
    };
    await db.transaction(async (tx) => {
      expect(await queueMail(tx, mail)).toBe(true);
      expect(await queueMail(tx, mail)).toBe(false);
    });
    expect(await db.select().from(s.mailOutbox)).toHaveLength(1);
  });

  it("신청서 생성 이력 저장 실패 시 회차·신청서·항목·메일 모두 롤백한다", async () => {
    const id = await prepare();
    const original = history.recordHistory;
    let createdCount = 0;
    vi.spyOn(history, "recordHistory").mockImplementation(async (tx, h) => {
      // 첫 번째 신청서와 메일까지 저장된 뒤 두 번째 생성에서 실패시킨다.
      if (h.action === "APP_CREATED" && ++createdCount === 2)
        throw new Error("이력 저장 실패");
      return original(tx, h);
    });
    try {
      await expect(changeRoundStatus(hr, id, "APPLYING")).rejects.toThrow(
        "이력 저장 실패",
      );
    } finally {
      vi.restoreAllMocks();
    }
    expect((await db.select().from(s.promotionRound))[0].status).toBe(
      "PREPARING",
    );
    expect(await db.select().from(s.application)).toHaveLength(0);
    expect(await db.select().from(s.applicationItem)).toHaveLength(0);
    expect(await db.select().from(s.mailOutbox)).toHaveLength(0);
    expect(await histories("ROUND_STATUS_CHANGED")).toHaveLength(0);
  });
});

import { beforeEach, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { seedAll } from "@/db/seed";
import * as s from "@/db/schema";
import * as history from "@/lib/history";
import { BusinessError } from "@/lib/error";
import { loadRules } from "@/lib/rules";
import { listNotifications, openNotification, unreadNotificationCount } from "./notifications";
import { updateSetting } from "./settings";
import { recalcAll, bulkConfirmMatched } from "./steps";
import { createRound, runSelection } from "./rounds";
const hr = { userId: "hr01", name: "인사팀", role: "HR" as const, empNo: null };
beforeEach(async () => {
  if (process.env.DATABASE_URL !== "file:test.db") throw new Error("테스트 전용 DB가 아닙니다.");
  vi.restoreAllMocks(); await seedAll();
});
it("HR 공용·본인 알림만 최근 순으로 조회·집계하고 클릭 후 읽음 처리", async () => {
  await db.insert(s.notification).values([
    { receiver: "HR", type: "STEP_CHANGED", title: "공용", body: "공용 내용", link: "/hr/steps/U1001", createdAt: "2026-11-01T00:00:00Z" },
    { receiver: "hr01", type: "STEP_CHANGED", title: "본인", body: "본인 내용", createdAt: "2026-11-02T00:00:00Z" },
    { receiver: "hr02", type: "STEP_CHANGED", title: "타인", body: "타인 비공개", createdAt: "2026-11-03T00:00:00Z" },
  ]);
  const rows = await listNotifications(hr);
  expect(rows.map((r) => r.title)).toEqual(["본인", "공용"]);
  expect(await unreadNotificationCount(hr)).toBe(2);
  expect(await openNotification(hr, rows[1].notiId)).toBe("/hr/steps/U1001");
  expect(await unreadNotificationCount(hr)).toBe(1);
  await openNotification(hr, rows[1].notiId); expect(await unreadNotificationCount(hr)).toBe(1);
  const all = await db.select().from(s.notification);
  await expect(openNotification(hr, all.find((r) => r.receiver === "hr02")!.notiId)).rejects.toBeInstanceOf(BusinessError);
  expect((await db.select().from(s.notification)).find((r) => r.receiver === "hr02")?.readYn).toBe("N");
});
it.each(["https://example.com", "//example.com", "/hr\\evil", "javascript:alert(1)"])("위험한 저장 링크 %s는 내부 알림함으로 이동", async (link) => {
  const [n] = await db.insert(s.notification).values({ receiver: "HR", type: "STEP_CHANGED", title: "알림", body: "내용", link, createdAt: "2026-11-01T00:00:00Z" }).returning();
  expect(await openNotification(hr, n.notiId)).toBe("/hr/notifications");
});
it("직원·미로그인의 알림/설정 접근과 없는 알림을 차단", async () => {
  for (const me of [null, { ...hr, role: "EMPLOYEE" as const }]) {
    await expect(listNotifications(me)).rejects.toBeInstanceOf(BusinessError);
    await expect(openNotification(me, 1)).rejects.toBeInstanceOf(BusinessError);
    expect(await unreadNotificationCount(me)).toBe(0);
    await expect(updateSetting(me, "step.cycle_months", "6")).rejects.toBeInstanceOf(BusinessError);
  }
  await expect(openNotification(hr, 999)).rejects.toBeInstanceOf(BusinessError);
  await expect(openNotification(hr, NaN)).rejects.toBeInstanceOf(BusinessError);
});
it("승급 주기 변경이 실제 재계산에 반영되고 확정값은 보존, 설정 이력 멱등성", async () => {
  await recalcAll(hr); await bulkConfirmMatched(hr);
  await updateSetting(hr, "step.cycle_months", "6");
  await updateSetting(hr, "step.cycle_months", "6");
  expect((await loadRules()).stepCycleMonths).toBe(6);
  await recalcAll(hr);
  const [row] = await db.select().from(s.stepSchedule).where(eq(s.stepSchedule.empNo, "U1001"));
  expect(row).toMatchObject({ autoNextDate: "2026-09-01", confirmedDate: "2027-03-01", reviewNeeded: "Y" });
  const settings = await db.select().from(s.processHistory).where(eq(s.processHistory.entityType, "SETTING"));
  expect(settings).toHaveLength(1);
  expect(settings[0]).toMatchObject({ action: "SETTING_UPDATED", actor: "hr01", entityId: "step.cycle_months" });
  expect(JSON.parse(settings[0].detailJson!)).toEqual({ before: "12", after: "6" });
});
it("승진 최소 기간 변경이 실제 재선정 판정에 반영", async () => {
  const id = await createRound(hr, { name: "설정 반영", baseDate: "2026-12-31", applyStart: "2027-01-04", applyEnd: "2027-01-15" });
  await runSelection(hr, id);
  expect((await db.select().from(s.promotionCandidate)).find((c) => c.empNo === "U1002")?.autoSelected).toBe("N");
  await updateSetting(hr, "promotion.min_months.G7", "1"); await runSelection(hr, id);
  expect((await db.select().from(s.promotionCandidate)).find((c) => c.empNo === "U1002")?.autoSelected).toBe("Y");
});
it.each([
  ["step.cycle_months", "0"], ["step.cycle_months", "-1"], ["mail.step_notice_days", "1.5"],
  ["mail.step_result_days", "abc"], ["system.default_today", "2026-02-30"],
  ["period.non_counting_leave", "BAD"], ["period.non_counting_discipline", "SICK"],
  ["step.cycle_months", ""], ["missing", "1"],
])("잘못된 기준정보 %s=%s는 저장·이력 생성 없음", async (key, value) => {
  const before = await db.select().from(s.ruleConfig);
  await expect(updateSetting(hr, key, value)).rejects.toBeInstanceOf(BusinessError);
  expect(await db.select().from(s.ruleConfig)).toEqual(before);
  expect(await db.select().from(s.processHistory)).toHaveLength(0);
});
it("설정 이력 실패 시 설정 변경도 롤백", async () => {
  vi.spyOn(history, "recordHistory").mockRejectedValueOnce(new Error("history failed"));
  await expect(updateSetting(hr, "step.cycle_months", "6")).rejects.toThrow("history failed");
  expect((await loadRules()).stepCycleMonths).toBe(12);
});

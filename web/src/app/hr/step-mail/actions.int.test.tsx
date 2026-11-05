import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { seedAll } from "@/db/seed";
import { mailOutbox, ruleConfig } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { recalcAll, bulkConfirmMatched } from "@/services/steps";
import { sendStepMailsAction, type SendState } from "./actions";
import StepMailPage from "./page";
vi.mock("@/lib/session", () => ({ requireRole: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const hr = { userId: "hr01", name: "이인사", role: "HR" as const, empNo: null };
const initial: SendState = { today: "", error: "", mails: [], ran: false };
function form(today?: string) { const data = new FormData(); if (today !== undefined) data.set("today", today); return data; }
beforeEach(async () => {
  if (process.env.DATABASE_URL !== "file:test.db") throw new Error("테스트 전용 DB가 아닙니다.");
  vi.resetAllMocks(); vi.stubGlobal("React", React);
  vi.mocked(requireRole).mockResolvedValue(hr); await seedAll();
});
it("HR 전용 화면은 설정값을 기본 기준일로 표시", async () => {
  await db.update(ruleConfig).set({ value: "2026-12-31" }).where(eq(ruleConfig.key, "system.default_today"));
  const html = renderToStaticMarkup(await StepMailPage());
  expect(html).toContain('value="2026-12-31"');
  expect(html).toContain("승급 안내 발송");
  expect(requireRole).toHaveBeenCalledWith("HR");
});
it("미입력은 설정 기준일, 이번 실행의 신규 목록만 반환, 재실행 0건", async () => {
  await recalcAll(hr); await bulkConfirmMatched(hr);
  const first = await sendStepMailsAction(initial, form());
  expect(first).toMatchObject({ today: "2026-11-01", error: "", ran: true });
  expect(first.mails.map((m) => m.toEmpNo)).toEqual(["U1002", "U1010"]);
  expect((await sendStepMailsAction(first, form("2026-11-01"))).mails).toEqual([]);
  const later = await sendStepMailsAction(first, form("2026-12-31"));
  expect(later.mails.map((m) => m.toEmpNo)).toEqual(["U1003"]);
});
it("설정 기본값 변경 시 빈 입력에 적용하고 잘못된 기준일은 오류 표시", async () => {
  await recalcAll(hr); await bulkConfirmMatched(hr);
  await db.update(ruleConfig).set({ value: "2026-12-31" }).where(eq(ruleConfig.key, "system.default_today"));
  const result = await sendStepMailsAction(initial, form(""));
  expect(result.today).toBe("2026-12-31");
  expect(result.mails.map((m) => m.toEmpNo)).toEqual(["U1003"]);
  const invalid = await sendStepMailsAction(initial, form("2026-02-30"));
  expect(invalid).toMatchObject({ ran: false, mails: [] }); expect(invalid.error).toBeTruthy();
});
it("페이지와 액션은 각각 HR 권한 실패를 차단", async () => {
  vi.mocked(requireRole).mockRejectedValue(new Error("FORBIDDEN"));
  await expect(StepMailPage()).rejects.toThrow("FORBIDDEN");
  await expect(sendStepMailsAction(initial, form())).rejects.toThrow("FORBIDDEN");
  expect(await db.select().from(mailOutbox)).toHaveLength(0);
});

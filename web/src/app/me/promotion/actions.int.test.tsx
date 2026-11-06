import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { seedAll } from "@/db/seed";
import * as s from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import * as services from "@/services/applications";
import { saveDraftAction, submitApplicationAction, type SubmissionState } from "./actions";
import ApplicationForm from "./application-form";

vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`); }) }));
const employee = { userId: "u1001", name: "김지훈", role: "EMPLOYEE" as const, empNo: "U1001" };
const initial: SubmissionState = { error: "", achievement: "기존 업무실적", plan: "기존 계획" };
const revised = { achievement: "  수정한 업무실적\n둘째 줄 & <검토>  ", plan: "  수정한 계획\n다음 줄  " };
function form(input: { achievement: string; plan: string }, appId = 1) {
  const data = new FormData(); data.set("appId", String(appId));
  data.set("achievement", input.achievement); data.set("plan", input.plan); return data;
}
async function snapshot() {
  return { apps: await db.select().from(s.application), history: await db.select().from(s.processHistory), notifications: await db.select().from(s.notification) };
}
async function pending() {
  await db.insert(s.correctionRequest).values({ appId: 1, itemKey: "awards", requestedValue: "포상 추가", reason: "누락", status: "PENDING", requestedAt: "2026-11-01T00:00:00Z" });
}
beforeEach(async () => {
  if (process.env.DATABASE_URL !== "file:test.db") throw new Error("테스트 전용 DB가 아닙니다.");
  vi.restoreAllMocks(); vi.clearAllMocks(); vi.stubGlobal("React", React);
  vi.mocked(getCurrentUser).mockResolvedValue(employee); await seedAll();
  await db.insert(s.promotionRound).values({ roundId: 1, name: "입력 보존 검증", baseDate: "2026-12-31", applyStart: "2027-01-04", applyEnd: "2027-01-15", status: "APPLYING", createdAt: "2026-11-01T00:00:00Z" });
  await db.insert(s.application).values({ appId: 1, roundId: 1, empNo: "U1001", status: "DRAFT", achievement: initial.achievement, plan: initial.plan });
});

it("정정 대기 제출 실패: 미저장 입력·공백·줄바꿈 보존, 같은 오류와 폼 표시, DB·이력·알림 불변", async () => {
  await pending(); const before = await snapshot();
  const state = await submitApplicationAction(initial, form(revised));
  expect(state).toEqual({ ...revised, error: "처리 대기 중인 정정 요청이 있어 제출할 수 없습니다." });
  const html = renderToStaticMarkup(<ApplicationForm appId={1} initialState={state}/>);
  expect(html).toContain('role="alert"'); expect(html).toContain(state.error);
  expect(html).toContain("  수정한 업무실적\n둘째 줄 &amp; &lt;검토&gt;  ");
  expect(html).toContain(revised.plan); expect(html).not.toContain(initial.achievement);
  expect(html).toContain('aria-describedby="achievement-count"');
  expect(html).toContain(`<p id="achievement-count">${revised.achievement.length} / 2,000자</p>`);
  expect(html).toContain("임시저장"); expect(html).toContain('maxLength="2000"');
  expect(await snapshot()).toEqual(before);
  expect(redirect).not.toHaveBeenCalled(); expect(revalidatePath).not.toHaveBeenCalled();
});

it.each([
  { achievement: "", plan: "지우지 않을 계획" },
  { achievement: "가".repeat(2001), plan: "초과 실적과 함께 보존" },
  { achievement: "보존할 업무실적", plan: "나".repeat(1001) },
])("기존 길이 검증 실패 시 입력 그대로 반환하고 아무것도 저장하지 않음: %j", async (input) => {
  const before = await snapshot();
  const state = await submitApplicationAction(initial, form(input));
  expect(state.achievement).toBe(input.achievement); expect(state.plan).toBe(input.plan);
  expect(state.error).toBe(input.achievement.length < 1 || input.achievement.length > 2000
    ? "주요 업무실적은 1~2,000자로 입력해야 합니다." : "자기개발 계획은 1,000자 이하로 입력해야 합니다.");
  expect(await snapshot()).toEqual(before); expect(redirect).not.toHaveBeenCalled();
});

it("실패 후 수정하여 재제출하면 새 입력 저장 및 기존 성공 경로로 이동", async () => {
  const failed = await submitApplicationAction(initial, form({ achievement: "", plan: "입력 보존" }));
  await expect(submitApplicationAction(failed, form(revised))).rejects.toThrow("REDIRECT:/me/promotion?submitted=1");
  expect((await db.select().from(s.application))[0]).toMatchObject({ status: "SUBMITTED", ...revised });
  expect(revalidatePath).toHaveBeenCalledWith("/me/promotion");
  expect((await db.select().from(s.processHistory)).map((h) => h.action)).toEqual(["APP_SUBMITTED"]);
});

it("제출 실패 후 보존된 값을 기존 임시저장 액션으로 저장 가능", async () => {
  await pending();
  const failed = await submitApplicationAction(initial, form(revised));
  await expect(saveDraftAction(form(failed))).rejects.toThrow("REDIRECT:/me/promotion?saved=1");
  expect((await db.select().from(s.application))[0]).toMatchObject({ status: "DRAFT", ...revised });
});

it("권한·본인 검사 유지: 실패 상태에 타인 DB 입력을 포함하지 않고 데이터 변경 없음", async () => {
  const before = await snapshot();
  vi.mocked(getCurrentUser).mockResolvedValueOnce(null);
  expect((await submitApplicationAction(initial, form(revised))).error).toBeTruthy();
  vi.mocked(getCurrentUser).mockResolvedValueOnce({ ...employee, empNo: "U1002", userId: "u1002" });
  const failed = await submitApplicationAction(initial, form(revised));
  expect(failed).toEqual({ ...revised, error: "본인의 신청서만 확인할 수 있습니다." });
  expect(await snapshot()).toEqual(before);
});

it("예상하지 않은 서버 오류는 검증 오류로 숨기지 않음", async () => {
  vi.spyOn(services, "submitApplication").mockRejectedValueOnce(new Error("DB failed"));
  await expect(submitApplicationAction(initial, form(revised))).rejects.toThrow("DB failed");
});

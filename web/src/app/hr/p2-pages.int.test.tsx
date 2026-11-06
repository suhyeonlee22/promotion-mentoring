import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { seedAll } from "@/db/seed";
import * as s from "@/db/schema";
import { getCurrentUser, requireRole } from "@/lib/session";
import { recalcAll } from "@/services/steps";
import HrPage from "./page";
import SettingsPage from "./settings/page";
import NotificationsPage from "./notifications/page";
import { openNotificationAction } from "./notifications/actions";
import { updateSettingAction } from "./settings/actions";
import HomePage from "../page";
import RootLayout from "../layout";
vi.mock("next/font/google", () => ({ Noto_Sans_KR: () => ({ variable: "font-sans" }), Geist_Mono: () => ({ variable: "font-mono" }) }));
vi.mock("@/lib/session", () => ({ requireRole: vi.fn(), getCurrentUser: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/hr", redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));
const hr = { userId: "hr01", name: "인사팀", role: "HR" as const, empNo: null };
const props = { params: Promise.resolve({}), searchParams: Promise.resolve({}) };
beforeEach(async () => {
  if (process.env.DATABASE_URL !== "file:test.db") throw new Error("테스트 전용 DB가 아닙니다.");
  vi.resetAllMocks(); vi.stubGlobal("React", React); vi.mocked(requireRole).mockResolvedValue(hr); vi.mocked(getCurrentUser).mockResolvedValue(hr); await seedAll();
});
it("HR 첫 화면은 /hr, 대시보드 빈 상태와 비교 상태별 집계", async () => {
  await expect(HomePage()).rejects.toThrow("REDIRECT:/hr");
  expect(renderToStaticMarkup(await HrPage())).toContain("진행 중 회차가 없습니다.");
  await recalcAll(hr);
  const html = renderToStaticMarkup(await HrPage());
  for (const text of ["일치: 6명", "불일치: 3명", "산정 불가: 1명", "재확인 필요: 0명"]) expect(html).toContain(text);
});
it("진행 회차별 상태 인원과 정정 대기 수, 결과 회차는 제외", async () => {
  await db.insert(s.promotionRound).values([1, 2].map((roundId) => ({ roundId, name: roundId === 1 ? "진행 회차" : "종료 회차", baseDate: "2026-12-31", applyStart: "2027-01-04", applyEnd: "2027-01-15", status: roundId === 1 ? "APPLYING" : "RESULT", createdAt: "2026-11-01T00:00:00Z" })));
  const [app] = await db.insert(s.application).values({ roundId: 1, empNo: "U1001", status: "DRAFT" }).returning();
  await db.insert(s.correctionRequest).values({ appId: app.appId, itemKey: "awards", requestedValue: "포상", reason: "누락", status: "PENDING", requestedAt: "2026-11-01T00:00:00Z" });
  const html = renderToStaticMarkup(await HrPage());
  expect(html).toContain("작성 중: 1명"); expect(html).toContain("처리 대기 정정 요청: 1건"); expect(html).not.toContain("종료 회차");
});
it("알림 화면에 공용만 표시하고 클릭 액션으로 읽은 후 저장 링크 이동", async () => {
  const [n] = await db.insert(s.notification).values({ receiver: "HR", type: "STEP_CHANGED", title: "승급 변경", body: "알림 본문", link: "/hr/steps/U1001", createdAt: "2026-11-01T00:00:00Z" }).returning();
  await db.insert(s.notification).values({ receiver: "hr02", type: "STEP_CHANGED", title: "타인 비공개", body: "비공개", createdAt: "2026-11-01T00:00:00Z" });
  const html = renderToStaticMarkup(await NotificationsPage(props));
  expect(html).toContain("안 읽음"); expect(html).not.toContain("타인 비공개");
  const data = new FormData(); data.set("notiId", String(n.notiId));
  await expect(openNotificationAction(data)).rejects.toThrow("REDIRECT:/hr/steps/U1001");
  expect((await db.select().from(s.notification)).find((r) => r.notiId === n.notiId)?.readYn).toBe("Y");
});
it("설정 화면 및 수정 액션, 설정 이력 저장", async () => {
  const html = renderToStaticMarkup(await SettingsPage(props));
  expect(html).toContain("step.cycle_months"); expect(html).toContain("기준정보 저장");
  const data = new FormData(); data.set("key", "step.cycle_months"); data.set("value", "6");
  await expect(updateSettingAction(data)).rejects.toThrow("REDIRECT:/hr/settings?saved=1");
  expect((await db.select().from(s.processHistory))[0].entityType).toBe("SETTING");
});
it("새 화면과 액션은 HR 재검사", async () => {
  vi.mocked(requireRole).mockRejectedValue(new Error("FORBIDDEN"));
  await expect(HrPage()).rejects.toThrow("FORBIDDEN");
  await expect(SettingsPage(props)).rejects.toThrow("FORBIDDEN");
  await expect(NotificationsPage(props)).rejects.toThrow("FORBIDDEN");
  await expect(openNotificationAction(new FormData())).rejects.toThrow("FORBIDDEN");
  await expect(updateSettingAction(new FormData())).rejects.toThrow("FORBIDDEN");
});
it("상단 HR 안 읽은 알림 수는 공용·본인만 집계하고 직원에게 노출하지 않음", async () => {
  await db.insert(s.notification).values(["HR", "hr01", "hr02"].map((receiver) => ({ receiver, type: "STEP_CHANGED", title: "알림", body: "내용", createdAt: "2026-11-01T00:00:00Z" })));
  const html = renderToStaticMarkup(await RootLayout({ children: <p>본문</p>, params: Promise.resolve({}) }));
  expect(html).toContain("알림 2건 (안 읽음)");
  vi.mocked(getCurrentUser).mockResolvedValue({ userId: "u1001", name: "김지훈", role: "EMPLOYEE", empNo: "U1001" });
  const employeeHtml = renderToStaticMarkup(await RootLayout({ children: <p>본문</p>, params: Promise.resolve({}) }));
  expect(employeeHtml).not.toContain("안 읽음");
});

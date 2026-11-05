import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { seedAll } from "@/db/seed";
import { accessLog, processHistory } from "@/db/schema";
import { requireRole } from "@/lib/session";
import HistoryPage from "./history/page";
import AccessLogsPage from "./access-logs/page";
vi.mock("@/lib/session", () => ({ requireRole: vi.fn() }));
const hr = { userId: "hr01", name: "인사팀", role: "HR" as const, empNo: null };
const history = (query: Record<string, string> = {}) => HistoryPage({ params: Promise.resolve({}), searchParams: Promise.resolve(query) });
const access = (query: Record<string, string> = {}) => AccessLogsPage({ params: Promise.resolve({}), searchParams: Promise.resolve(query) });
beforeEach(async () => {
  if (process.env.DATABASE_URL !== "file:test.db") throw new Error("테스트 전용 DB가 아닙니다.");
  vi.resetAllMocks(); vi.stubGlobal("React", React); vi.mocked(requireRole).mockResolvedValue(hr); await seedAll();
});
it("처리 이력 필터 네 종류 조합, 기간 양끝 포함, 최근 순 및 JSON 펼침", async () => {
  await db.insert(processHistory).values([
    { entityType: "STEP", entityId: "U1001", action: "EARLY", actor: "hr01", actedAt: "2026-11-01T00:00:00.000Z", detailJson: '{"before":null,"after":"2027-03-31"}' },
    { entityType: "STEP", entityId: "U1001", action: "LATE", actor: "hr01", actedAt: "2026-11-01T23:59:59.999Z" },
    { entityType: "STEP", entityId: "U1001", action: "NEXT_DAY", actor: "hr01", actedAt: "2026-11-02T00:00:00.000Z" },
    { entityType: "STEP", entityId: "U1001", action: "OTHER_ACTOR", actor: "SYSTEM", actedAt: "2026-11-01T00:00:00Z" },
    { entityType: "STEP", entityId: "U1002", action: "OTHER_ID", actor: "hr01", actedAt: "2026-11-01T00:00:00Z" },
    { entityType: "APPLICATION", entityId: "U1001", action: "OTHER_TYPE", actor: "hr01", actedAt: "2026-11-01T00:00:00Z" },
  ]);
  const html = renderToStaticMarkup(await history({ entityType: "STEP", entityId: "U1001", actor: "hr01", from: "2026-11-01", to: "2026-11-01" }));
  expect(html.indexOf("LATE")).toBeLessThan(html.indexOf("EARLY"));
  for (const excluded of ["NEXT_DAY", "OTHER_ACTOR", "OTHER_ID", "OTHER_TYPE"]) expect(html).not.toContain(excluded);
  expect(html).toContain("<details>"); expect(html).toContain("2027-03-31");
  expect(html).toContain("총 2건");
});
it("동일 시각 처리 이력은 ID 내림차순, 잘못된 상세 JSON도 안전하게 표시", async () => {
  await db.insert(processHistory).values(["FIRST", "SECOND"].map((action) => ({ entityType: "STEP", entityId: "U1001", action, actor: "hr01", actedAt: "2026-11-01T00:00:00Z", detailJson: "<script>bad</script>" })));
  const html = renderToStaticMarkup(await history());
  expect(html.indexOf("SECOND")).toBeLessThan(html.indexOf("FIRST"));
  expect(html).not.toContain("<script>"); expect(html).toContain("&lt;script&gt;");
});
it("접근기록 계정·정보주체·수행업무·기간 필터와 동일 조건 집계", async () => {
  await db.insert(accessLog).values([
    { userId: "hr01", subjectEmpNo: "U1001", action: "VIEW", target: "FIRST_VIEW", ip: "192.0.2.10", actedAt: "2026-11-01T00:00:00Z" },
    { userId: "hr01", subjectEmpNo: "U1001", action: "VIEW", target: "LAST_VIEW", ip: "192.0.2.10", actedAt: "2026-11-01T23:59:59Z" },
    { userId: "hr01", subjectEmpNo: "U1001", action: "DOWNLOAD", target: "심사자료 1명", reason: "위원회 제출", ip: "192.0.2.11", actedAt: "2026-11-01T12:00:00Z" },
    { userId: "hr02", subjectEmpNo: "U1001", action: "VIEW", target: "OTHER_USER", ip: "192.0.2.12", actedAt: "2026-11-01T12:00:00Z" },
    { userId: "hr01", subjectEmpNo: "U1002", action: "VIEW", target: "OTHER_SUBJECT", ip: "192.0.2.10", actedAt: "2026-11-01T12:00:00Z" },
    { userId: "hr01", subjectEmpNo: "U1001", action: "VIEW", target: "NEXT_DAY", ip: "192.0.2.10", actedAt: "2026-11-02T00:00:00Z" },
  ]);
  const html = renderToStaticMarkup(await access({ userId: "hr01", subjectEmpNo: "U1001", action: "VIEW", from: "2026-11-01", to: "2026-11-01" }));
  expect(html).toContain("<td>hr01</td><td>VIEW</td><td>2</td>");
  expect(html.indexOf("LAST_VIEW")).toBeLessThan(html.indexOf("FIRST_VIEW"));
  for (const excluded of ["OTHER_USER", "OTHER_SUBJECT", "NEXT_DAY", "위원회 제출"]) expect(html).not.toContain(excluded);
  const download = renderToStaticMarkup(await access({ action: "DOWNLOAD" }));
  for (const text of ["위원회 제출", "심사자료 1명", "192.0.2.11"]) expect(download).toContain(text);
});
it("빈 결과와 잘못된 날짜 범위는 안내하고, 조회 자체로 기록을 늘리지 않음", async () => {
  expect(renderToStaticMarkup(await history())).toContain("처리 이력이 없습니다.");
  expect(renderToStaticMarkup(await access())).toContain("접근기록이 없습니다.");
  expect(renderToStaticMarkup(await history({ from: "2026-02-30" }))).toContain("올바른 조회 날짜");
  expect(renderToStaticMarkup(await access({ from: "2026-11-02", to: "2026-11-01" }))).toContain("시작일은 종료일보다");
  expect(await db.select().from(accessLog)).toHaveLength(0);
});
it("두 로그 화면은 HR 권한 실패 시 내용을 반환하지 않음", async () => {
  vi.mocked(requireRole).mockRejectedValue(new Error("FORBIDDEN"));
  await expect(history()).rejects.toThrow("FORBIDDEN"); await expect(access()).rejects.toThrow("FORBIDDEN");
});

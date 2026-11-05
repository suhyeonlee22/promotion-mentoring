import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { seedAll } from "@/db/seed";
import { mailOutbox } from "@/db/schema";
import { requireRole, type CurrentUser } from "@/lib/session";
import MailsPage from "@/app/hr/mails/page";
import MyMailsPage from "./page";

vi.mock("@/lib/session", () => ({ requireRole: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));

const employee: CurrentUser = { userId: "u1001", name: "김지훈", role: "EMPLOYEE", empNo: "U1001" };
const hr: CurrentUser = { userId: "hr01", name: "이인사", role: "HR", empNo: null };

async function hrPage(filters: Record<string, string> = {}) {
  return MailsPage({ params: Promise.resolve({}), searchParams: Promise.resolve(filters) });
}

describe("SCR-10/SCR-23 메일함", () => {
  beforeEach(async () => {
    if (process.env.DATABASE_URL !== "file:test.db") throw new Error("테스트 전용 DB가 아닙니다.");
    vi.resetAllMocks();
    vi.stubGlobal("React", React);
    await seedAll();
    await db.insert(mailOutbox).values([
      { dedupKey: "PROMO_INVITE|1|U1001", mailType: "PROMO_INVITE", toEmpNo: "U1001", toEmail: "u1001@unist.example", subject: "내 신청 안내", body: "내 신청 본문", createdAt: "2026-11-01T00:00:00Z" },
      { dedupKey: "PROMO_RESULT|1|U1001", mailType: "PROMO_RESULT", toEmpNo: "U1001", toEmail: "u1001@unist.example", subject: "내 결과 안내", body: "내 결과 본문\n승진", createdAt: "2026-11-02T00:00:00Z" },
      { dedupKey: "PROMO_RESULT|1|U1004", mailType: "PROMO_RESULT", toEmpNo: "U1004", toEmail: "u1004@unist.example", subject: "타인 결과 안내", body: "타인 비공개 본문", createdAt: "2026-11-03T00:00:00Z" },
    ]);
  });

  it("직원은 본인 메일과 본문만 최신순으로 확인한다", async () => {
    vi.mocked(requireRole).mockResolvedValue(employee);
    const html = renderToStaticMarkup(await MyMailsPage());
    expect(requireRole).toHaveBeenCalledWith("EMPLOYEE");
    expect(html).toContain("내 결과 본문\n승진");
    expect(html).toContain("내 신청 본문");
    expect(html).not.toContain("타인");
    expect(html.indexOf("내 결과 안내")).toBeLessThan(html.indexOf("내 신청 안내"));
    expect(html.match(/<details/g)).toHaveLength(2);
  });

  it("직원 사번이 없으면 조회를 중단한다", async () => {
    vi.mocked(requireRole).mockResolvedValue({ ...employee, empNo: null });
    await expect(MyMailsPage()).rejects.toThrow("NOT_FOUND");
  });

  it("HR 전체 조회 및 종류·사번·이메일 필터를 지원한다", async () => {
    vi.mocked(requireRole).mockResolvedValue(hr);
    const all = renderToStaticMarkup(await hrPage());
    expect(requireRole).toHaveBeenCalledWith("HR");
    expect(all.match(/<details/g)).toHaveLength(3);
    const byEmpNo = renderToStaticMarkup(await hrPage({ type: "PROMO_RESULT", recipient: "U1001" }));
    expect(byEmpNo).toContain("내 결과 본문");
    expect(byEmpNo).not.toContain("내 신청 본문");
    expect(byEmpNo).not.toContain("타인 비공개 본문");
    const byEmail = renderToStaticMarkup(await hrPage({ recipient: "u1004@unist.example" }));
    expect(byEmail).toContain("타인 비공개 본문");
    expect(byEmail).not.toContain("내 결과 본문");
  });

  it("필터에 일치하는 메일이 없으면 빈 안내를 표시한다", async () => {
    vi.mocked(requireRole).mockResolvedValue(hr);
    expect(renderToStaticMarkup(await hrPage({ recipient: "U9999" }))).toContain("메일이 없습니다.");
    vi.mocked(requireRole).mockResolvedValue({ ...employee, empNo: "U9999" });
    expect(renderToStaticMarkup(await MyMailsPage())).toContain("받은 메일이 없습니다.");
  });

  it("권한 검사 실패를 우회해 메일을 반환하지 않는다", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("FORBIDDEN"));
    await expect(hrPage()).rejects.toThrow("FORBIDDEN");
    await expect(MyMailsPage()).rejects.toThrow("FORBIDDEN");
  });
});

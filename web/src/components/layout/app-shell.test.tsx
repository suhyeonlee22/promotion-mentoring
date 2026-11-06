import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { AppShell } from "./app-shell";
import { activeNavigation, navigationFor } from "./navigation";
import { Button, LinkButton } from "../ui/primitives";
const route = vi.hoisted(() => ({ pathname: "/hr" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
vi.mock("@/app/login/actions", () => ({ logoutAction: vi.fn() }));
const hr = { userId: "hr01", name: "실제 인사 담당자", role: "HR" as const, empNo: null };
beforeEach(() => { vi.stubGlobal("React", React); route.pathname = "/hr"; });
it("HR 쉘에 실제 사용자·알림·기존 HR 메뉴·로그아웃, 가상 사용자/검색 없음", () => {
  const html = renderToStaticMarkup(<AppShell user={hr} unread={3} development><main>업무 내용</main></AppShell>);
  for (const href of ["/hr", "/hr/rounds", "/hr/steps", "/hr/mails", "/hr/step-mail", "/hr/notifications", "/hr/history", "/hr/access-logs", "/hr/mock-erp", "/hr/settings", "/switch-user"]) expect(html).toContain(`href="${href}"`);
  expect(html).toContain(hr.name); expect(html).toContain("알림 3건 (안 읽음)"); expect(html).toContain("로그아웃");
  expect(html).not.toContain("김민수"); expect(html).not.toContain('href="#"'); expect(html).not.toContain('type="search"');
  expect(html.match(/<main/g)).toHaveLength(1);
});
it("직원 쉘은 본인 업무 메뉴만 표시하고 HR 메뉴·알림 수 미노출", () => {
  route.pathname = "/me";
  const employee = { userId: "u1001", name: "직원 본인", role: "EMPLOYEE" as const, empNo: "U1001" };
  const html = renderToStaticMarkup(<AppShell user={employee} unread={99} development={false}><main>직원 정보</main></AppShell>);
  for (const href of ["/me", "/me/promotion", "/me/mails"]) expect(html).toContain(`href="${href}"`);
  expect(html).not.toContain('href="/hr'); expect(html).not.toContain("안 읽음"); expect(html).not.toContain("사용자 전환");
});
it("로그인/개발 전환은 사이드바 없는 공통 헤더, 운영 모드 전환 링크 없음", () => {
  route.pathname = "/login";
  const html = renderToStaticMarkup(<AppShell user={null} unread={0} development={false}><main>로그인 폼</main></AppShell>);
  expect(html).toContain('href="/login"'); expect(html).not.toContain("app-sidebar"); expect(html).not.toContain("사용자 전환");
});
it("현재 회차 링크는 실제 roundId를 유지하고 가장 구체적인 메뉴 하나만 활성", () => {
  const pathname = "/hr/rounds/17/applications";
  const groups = navigationFor("HR", pathname);
  expect(activeNavigation(groups, pathname)).toBe(pathname);
  expect(groups.flatMap((g) => g.items).map((i) => i.href)).toContain("/hr/rounds/17/results");
  expect(navigationFor("HR", "/hr").flatMap((g) => g.items).some((i) => i.href.includes("/rounds/17"))).toBe(false);
  expect(navigationFor("REVIEWER", "/hr")).toEqual([]);
});
it("공통 버튼은 기존 formAction·필드·disabled 속성을 그대로 전달", () => {
  const action = vi.fn(async () => {});
  const button = Button({ type: "submit", formAction: action, name: "source", value: "AUTO", disabled: true, children: "확정" });
  expect(button.props).toMatchObject({ type: "submit", formAction: action, name: "source", value: "AUTO", disabled: true });
  const link = LinkButton({ href: "/hr/steps/U1001", children: "상세" });
  expect(link.props).toMatchObject({ href: "/hr/steps/U1001", prefetch: false });
});
it("0px 모서리·작은 화면 메뉴·표 스크롤·인쇄 쉘 제거 규칙 포함", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  expect(css).toMatch(/\*, \*::before, \*::after\s*\{\s*border-radius: 0px !important/);
  expect(css).toContain("@media (max-width: 1279px)"); expect(css).toContain(".dashboard-table-scroll { overflow-x: auto;");
  expect(css).toContain("@media print"); expect(css).toContain(".app-sidebar, .app-topbar, .sidebar-backdrop, .skip-link, .public-topbar { display: none !important;");
  const html = renderToStaticMarkup(<AppShell user={hr} unread={0} development><main>본문</main></AppShell>);
  expect(html).toContain('aria-controls="app-sidebar"'); expect(html).toContain('aria-expanded="false"'); expect(html).toContain('href="#app-content"');
});

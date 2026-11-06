import type { CurrentUser } from "@/lib/session";
import type { IconName } from "@/components/ui/icon";

export type NavigationItem = { label: string; href: string; icon: IconName };
export type NavigationGroup = { label: string; items: NavigationItem[] };
export function navigationFor(role: CurrentUser["role"], pathname: string): NavigationGroup[] {
  if (role === "EMPLOYEE") return [{ label: "내 인사 정보", items: [
    { label: "내 정보", href: "/me", icon: "home" }, { label: "내 승진 신청서", href: "/me/promotion", icon: "clipboard" }, { label: "내 메일함", href: "/me/mails", icon: "mail" },
  ] }];
  if (role !== "HR") return [];
  const roundId = pathname.match(/^\/hr\/rounds\/(\d+)(?:\/|$)/)?.[1];
  return [
    { label: "승진 및 인사관리", items: [
      { label: "홈", href: "/hr", icon: "home" }, { label: "승진심사 회차", href: "/hr/rounds", icon: "award" }, { label: "차기승급일 관리", href: "/hr/steps", icon: "calendar" },
    ] },
    ...(roundId ? [{ label: "현재 회차 업무", items: [
      { label: "대상자 선정", href: `/hr/rounds/${roundId}/candidates`, icon: "user" as const },
      { label: "신청서 검토", href: `/hr/rounds/${roundId}/applications`, icon: "clipboard" as const },
      { label: "심사 자료", href: `/hr/rounds/${roundId}/review-data`, icon: "shield" as const },
      { label: "결과 등록", href: `/hr/rounds/${roundId}/results`, icon: "check" as const },
    ] }] : []),
    { label: "커뮤니케이션 & 로그", items: [
      { label: "승급 안내 메일", href: "/hr/step-mail", icon: "mail" }, { label: "메일 발송함", href: "/hr/mails", icon: "mail" },
      { label: "알림함", href: "/hr/notifications", icon: "bell" }, { label: "처리 이력", href: "/hr/history", icon: "history" }, { label: "접근기록", href: "/hr/access-logs", icon: "shield" },
    ] },
    { label: "시스템 연계", items: [{ label: "Mock ERP", href: "/hr/mock-erp", icon: "database" }, { label: "기준정보", href: "/hr/settings", icon: "settings" }] },
  ];
}
export function activeNavigation(groups: NavigationGroup[], pathname: string): string | undefined {
  if (pathname.startsWith("/hr/applications/")) return "/hr/rounds";
  return groups.flatMap((g) => g.items).filter((i) => i.href === pathname || (!["/hr", "/me"].includes(i.href) && pathname.startsWith(i.href + "/"))).sort((a, b) => b.href.length - a.href.length)[0]?.href;
}
export function pageTitle(pathname: string): string {
  if (pathname.startsWith("/hr/applications/")) return "신청서 검토";
  if (/^\/hr\/steps\/.+/.test(pathname)) return "차기승급일 상세";
  if (/\/rounds\/\d+$/.test(pathname)) return "승진심사 회차";
  return navigationFor(pathname.startsWith("/hr") ? "HR" : "EMPLOYEE", pathname).flatMap((g) => g.items).find((i) => i.href === pathname)?.label ?? "인사정보시스템";
}

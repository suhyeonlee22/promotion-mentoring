import Link from "next/link";
import type { CurrentUser } from "@/lib/session";
import { logoutAction } from "@/app/login/actions";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/primitives";
import { pageTitle } from "./navigation";

export function Topbar({ user, unread, pathname, development, menuOpen, onMenuToggle }: { user: CurrentUser; unread: number; pathname: string; development: boolean; menuOpen: boolean; onMenuToggle: () => void }) {
  const role = user.role === "HR" ? "인사팀" : user.role === "EMPLOYEE" ? "직원" : "심사위원";
  return <header className="app-topbar">
    <div className="topbar-leading"><Button className="menu-toggle" aria-label="주 메뉴 열기" aria-controls="app-sidebar" aria-expanded={menuOpen} onClick={onMenuToggle}><Icon name="menu"/></Button><nav className="breadcrumbs" aria-label="현재 위치"><Link href={user.role === "HR" ? "/hr" : "/me"} prefetch={false}>홈</Link><Icon name="chevron" width={14} height={14}/><span aria-current="page">{pathname === "/hr" ? "대시보드" : pageTitle(pathname)}</span></nav></div>
    <div className="topbar-actions">
      {user.role === "HR" && <Link href="/hr/notifications" prefetch={false} className="notification-link"><Icon name="bell"/><span className="sr-only">알림 {unread}건 (안 읽음)</span>{unread > 0 && <span className="notification-count" aria-hidden="true">{unread}</span>}</Link>}
      <div className="current-user"><span className="user-avatar"><Icon name="user"/></span><div><strong>{user.name}</strong><span>{role} · {user.userId}</span></div></div>
      {development && <Link className="switch-user-link" href="/switch-user" prefetch={false}>사용자 전환</Link>}
      <form action={logoutAction}><Button variant="ghost" className="logout-button"><Icon name="logout"/><span>로그아웃</span></Button></form>
    </div>
  </header>;
}

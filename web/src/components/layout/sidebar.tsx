import Link from "next/link";
import type { CurrentUser } from "@/lib/session";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/primitives";
import { activeNavigation, navigationFor } from "./navigation";

export function Sidebar({ user, pathname, open, onClose, development }: { user: CurrentUser; pathname: string; open: boolean; onClose: () => void; development: boolean }) {
  const groups = navigationFor(user.role, pathname);
  const active = activeNavigation(groups, pathname);
  return <aside id="app-sidebar" className={`app-sidebar${open ? " is-open" : ""}`} aria-label="주 메뉴">
    <div className="app-brand"><Icon name="building"/><span>인사정보시스템</span><span className="app-brand__badge">{user.role === "HR" ? "HR" : "MY"}</span><Button className="sidebar-close" aria-label="메뉴 닫기" onClick={onClose}><Icon name="close"/></Button></div>
    <nav className="sidebar-navigation">{groups.map((group) => <div className="sidebar-group" key={group.label}><p className="sidebar-group__label">{group.label}</p>{group.items.map((item) => <Link key={item.href} href={item.href} prefetch={false} onClick={onClose} className={`sidebar-link${active === item.href ? " is-active" : ""}`} aria-current={active === item.href ? "page" : undefined}><Icon name={item.icon}/><span>{item.label}</span></Link>)}</div>)}</nav>
    <div className="sidebar-footer"><span>{development ? "개발 환경" : "운영 환경"}</span><span>승진·승급 관리</span></div>
  </aside>;
}

"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import type { CurrentUser } from "@/lib/session";
import { logoutAction } from "@/app/login/actions";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/primitives";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function AppShell({ user, unread, development, children }: { user: CurrentUser | null; unread: number; development: boolean; children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const [menuOpen, setMenuOpen] = useState(false);
  const shell = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        shell.current?.querySelector<HTMLButtonElement>(".menu-toggle")?.focus();
      }
    };
    document.addEventListener("keydown", close);
    shell.current?.querySelector<HTMLAnchorElement>(".sidebar-link")?.focus();
    return () => document.removeEventListener("keydown", close);
  }, [menuOpen]);
  if (!user || pathname === "/login" || pathname === "/switch-user") return <><header className="public-topbar print:hidden"><Link href="/" className="public-brand"><Icon name="building"/>인사정보시스템</Link><nav aria-label="계정 메뉴">{development && <Link href="/switch-user">사용자 전환</Link>}{user ? <form action={logoutAction}><Button>로그아웃</Button></form> : <Link href="/login">로그인</Link>}</nav></header>{children}</>;
  return <div className="app-shell" ref={shell}>
    <a className="skip-link" href="#app-content">본문으로 바로가기</a>
    <Sidebar user={user} pathname={pathname} open={menuOpen} onClose={() => setMenuOpen(false)} development={development}/>
    {menuOpen && <button type="button" className="sidebar-backdrop" aria-label="주 메뉴 닫기" onClick={() => setMenuOpen(false)}/>}
    <Topbar user={user} unread={unread} pathname={pathname} development={development} menuOpen={menuOpen} onMenuToggle={() => setMenuOpen(!menuOpen)}/>
    <div id="app-content" className="app-content" tabIndex={-1}>{children}</div>
  </div>;
}

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Icon, type IconName } from "./icon";

type Variant = "primary" | "secondary" | "ghost" | "danger";
export function Button({ variant = "secondary", className = "", ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={`ui-button ui-button--${variant} ${className}`} {...props}/>;
}
export function LinkButton({ variant = "secondary", className = "", ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link prefetch={false} className={`ui-button ui-button--${variant} ${className}`} {...props}/>;
}
export type BadgeTone = "info" | "neutral" | "danger" | "success" | "warning";
export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`ui-badge ui-badge--${tone}`}>{children}</span>;
}
export function Panel({ title, actions, children, className = "" }: { title: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`ui-panel ${className}`}><div className="ui-panel__heading"><h2>{title}</h2>{actions}</div><div className="ui-panel__body">{children}</div></section>;
}
export function StatCard({ title, value, unit, icon, note, badge, danger = false }: { title: string; value: number; unit: string; icon: IconName; note: string; badge: string; danger?: boolean }) {
  return <article className={`stat-card${danger ? " stat-card--danger" : ""}`}><div className="stat-card__top"><div><h2>{title}</h2><p className="stat-card__value">{value.toLocaleString("ko-KR")}<span>{unit}</span></p></div><span className="stat-card__icon"><Icon name={icon} width={24} height={24}/></span></div><div className="stat-card__footer"><span>{note}</span><Badge tone={danger && value > 0 ? "danger" : "info"}>{badge}</Badge></div></article>;
}
export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="ui-empty">{children}</p>;
}

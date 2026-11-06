import type { ComponentProps, ReactNode } from "react";
import { APP_STATUS, COMPARE_STATUS, CORRECTION_STATUS, ROUND_STATUS } from "@/lib/codes";
import { Badge, type BadgeTone } from "./primitives";

export function PageHeader({ children, description, className, ...props }: ComponentProps<"h1"> & { description?: string }) {
  return <header className="page-header"><div><h1 className={className} {...props}>{children}</h1>{description && <p>{description}</p>}</div></header>;
}
export function Surface({ className = "", ...props }: ComponentProps<"section">) {
  return <section className={`ui-surface ${className}`} {...props}/>;
}
export function DataTable({ label = "업무 데이터 표", className = "", ...props }: ComponentProps<"table"> & { label?: string }) {
  return <div className="ui-table-region" role="region" aria-label={label} tabIndex={0}><table className={`ui-data-table ${className}`} {...props}/></div>;
}
export function FilterBar({ className = "", ...props }: ComponentProps<"form">) {
  return <form className={`ui-filter-bar ${className}`} {...props}/>;
}
const labels: Record<string, string> = { ...ROUND_STATUS, ...APP_STATUS, ...CORRECTION_STATUS, ...COMPARE_STATUS, AUTO: "자동값", MANUAL: "직접 입력" };
export function StatusBadge({ status, children }: { status: string; children?: ReactNode }) {
  const tone: BadgeTone = ["RETURNED", "REJECTED", "MISMATCH", "UNDETERMINED"].includes(status) ? "danger"
    : ["CONFIRMED", "APPROVED", "MATCH"].includes(status) ? "success"
    : ["PENDING", "SUBMITTED"].includes(status) ? "warning"
    : ["APPLYING", "REVIEWING", "RESULT", "AUTO"].includes(status) ? "info" : "neutral";
  return <span data-status={status}><Badge tone={tone}>{children ?? labels[status] ?? status}</Badge></span>;
}

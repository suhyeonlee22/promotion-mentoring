import { requireRole } from "@/lib/session";
import type { ReactNode } from "react";

export default async function HrLayout({
    children,
}: {
    children: ReactNode;
}) {
    // HR 권한 검사 코드
    await requireRole("HR");

    return <>{children}</>;
}
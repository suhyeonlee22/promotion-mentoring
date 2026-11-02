import { requireRole } from "@/lib/session";
import type { ReactNode } from 'react';

export default async function MeLayout ({
    children,
}: {
    children: ReactNode;
}) {
    // 사용자 권한 검사 코드
    await requireRole("EMPLOYEE");

    return <>{children}</>;
}
// src/lib/access-log.ts (일부)
import { headers } from "next/headers";
import { db } from "@/db/client";
import { accessLog } from "@/db/schema";
import type { Tx } from "@/lib/history";

// 현재 요청의 접속 IP 주소 조회

export async function getClientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() || "127.0.0.1";
}

// 개인정보 접근 기록 저장
export async function recordAccess(
    e: {
        userId: string;
        ip: string;
        subjectEmpNo?: string | null;
        action: "VIEW" | "UPDATE" | "DOWNLOAD" | "PRINT";
        target: string;
        reason?: string | null;
    },
    tx?: Tx
): Promise<void> {
    // 다운로드 사유 필수
    if (e.action === "DOWNLOAD" && !e.reason?.trim()) {
        throw new Error("다운로드 사유를 입력해야 합니다.");
    }

    const values = {
        userId: e.userId,
        ip: e.ip,
        subjectEmpNo: e.subjectEmpNo ?? null,
        action: e.action,
        target: e.target,
        reason: e.reason ?? null,
        actedAt: new Date().toISOString(),
    };

    // 트랜잭션이 전달되면 해당 트랜잭션에서 기록
    if (tx) {
        await tx.insert(accessLog).values(values);
    } else {
        await db.insert(accessLog).values(values);
    }
}
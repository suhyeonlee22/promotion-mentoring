import { notification } from "@/db/schema";
import type { Tx } from "./history";

// DB 트랜잭션. 신청서 처리와 알림 저장을 함께 수행
export async function createNotification(
  tx: Tx,
  // 알림 받을 사람과 알림 내용
  n: {
    receiver: string;
    type: "CORRECTION_REQUESTED" | "APPLICATION_SUBMITTED" | "STEP_CHANGED";
    title: string;
    body: string;
    link?: string | null;
  },
): Promise<void> {
  //알림 테이블에 새 행 저장
  await tx.insert(notification).values({
    receiver: n.receiver,
    type: n.type,
    title: n.title,
    body: n.body,
    link: n.link ?? null,
    createdAt: new Date().toISOString(),
  });
}

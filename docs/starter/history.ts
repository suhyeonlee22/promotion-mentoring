import { db } from '@/db/client';
import { processHistory } from '@/db/schema';

/** db.transaction 콜백이 받는 트랜잭션 객체의 타입 */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** 처리 이력을 남긴다. 상태를 바꾸는 쓰기와 같은 트랜잭션 안에서 호출한다. */
export async function recordHistory(
  tx: Tx,
  h: {
    entityType: 'ROUND' | 'CANDIDATE' | 'APPLICATION' | 'CORRECTION' | 'STEP';
    entityId: string;
    action: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    reason?: string | null;
    detail?: object | null;
    actor: string;
  },
) {
  await tx.insert(processHistory).values({
    entityType: h.entityType,
    entityId: h.entityId,
    action: h.action,
    fromStatus: h.fromStatus ?? null,
    toStatus: h.toStatus ?? null,
    reason: h.reason ?? null,
    detailJson: h.detail ? JSON.stringify(h.detail) : null,
    actor: h.actor,
    actedAt: new Date().toISOString(),
  });
}

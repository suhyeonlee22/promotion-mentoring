import { and, desc, eq, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { notification } from "@/db/schema";
import { BusinessError } from "@/lib/error";
import type { CurrentUser } from "@/lib/session";

function assertHr(me: CurrentUser | null): asserts me is CurrentUser {
  if (me?.role !== "HR") throw new BusinessError("FORBIDDEN", "인사팀만 알림을 확인할 수 있습니다.");
}
const recipient = (userId: string) => or(eq(notification.receiver, "HR"), eq(notification.receiver, userId));
export async function listNotifications(me: CurrentUser | null) {
  assertHr(me);
  return db.select().from(notification).where(recipient(me.userId)).orderBy(desc(notification.createdAt), desc(notification.notiId));
}
export async function unreadNotificationCount(me: CurrentUser | null): Promise<number> {
  if (me?.role !== "HR") return 0;
  const [row] = await db.select({ count: sql<number>`count(*)` }).from(notification)
    .where(and(recipient(me.userId), eq(notification.readYn, "N")));
  return row.count;
}
export async function openNotification(me: CurrentUser | null, notiId: number): Promise<string> {
  assertHr(me);
  if (!Number.isSafeInteger(notiId) || notiId <= 0) throw new BusinessError("INVALID_NOTIFICATION", "올바른 알림을 선택해 주세요.");
  return db.transaction(async (tx) => {
    const where = and(eq(notification.notiId, notiId), recipient(me.userId));
    const [row] = await tx.select().from(notification).where(where);
    if (!row) throw new BusinessError("NOT_FOUND", "조회할 수 없는 알림입니다.");
    await tx.update(notification).set({ readYn: "Y" }).where(where);
    // 저장된 링크도 내부 HR 경로인지 검사한다.
    return row.link && /^\/hr(?:\/|$|\?)/.test(row.link) && !/[\\\x00-\x20]/.test(row.link)
      ? row.link : "/hr/notifications";
  });
}

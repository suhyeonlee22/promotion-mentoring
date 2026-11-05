import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { application, applicationItem, promotionRound } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { getClientIp, recordAccess } from "@/lib/access-log";
import { getApplicationItemDefs } from "@/lib/codes";
import { encodeCsv } from "@/lib/csv";

export async function POST(
  request: Request,
  context: RouteContext<"/hr/rounds/[roundId]/review-data/csv">,
) {
  const me = await getCurrentUser();
  if (me?.role !== "HR")
    return new Response("인사팀만 다운로드할 수 있습니다.", { status: 403 });
  const roundId = Number((await context.params).roundId);
  if (!Number.isSafeInteger(roundId) || roundId <= 0)
    return new Response("잘못된 회차입니다.", { status: 400 });
  let data: FormData;
  try {
    data = await request.formData();
  } catch {
    return new Response("올바른 다운로드 사유를 입력해 주세요.", {
      status: 400,
    });
  }
  const rawReason = data.get("reason");
  const reason = typeof rawReason === "string" ? rawReason.trim() : "";
  if (!reason)
    return new Response("다운로드 사유를 입력해야 합니다.", { status: 400 });
  const [round] = await db
    .select()
    .from(promotionRound)
    .where(eq(promotionRound.roundId, roundId));
  if (!round) return new Response("회차를 찾을 수 없습니다.", { status: 404 });
  const apps = await db
    .select()
    .from(application)
    .where(
      and(
        eq(application.roundId, roundId),
        eq(application.status, "CONFIRMED"),
      ),
    )
    .orderBy(asc(application.empNo));
  const items =
    apps.length === 0
      ? []
      : await db
          .select()
          .from(applicationItem)
          .where(
            inArray(
              applicationItem.appId,
              apps.map((app) => app.appId),
            ),
          );
  const columns = getApplicationItemDefs(round.baseDate);
  // README: 사번·성명과 3.7의 15개 항목(성명 포함), 총 17열이다.
  const rows = [
    ["사번", "성명", ...columns.map((column) => column.label)],
    ...apps.map((app) => {
      const values = new Map(
        items
          .filter((item) => item.appId === app.appId)
          .map((item) => [item.itemKey, item.currentValue]),
      );
      return [
        app.empNo,
        values.get("name") ?? "",
        ...columns.map((column) => values.get(column.key) ?? ""),
      ];
    }),
  ];
  const csv = encodeCsv(rows);
  // 생성 후 한 번 기록한다. 기록 실패 시 파일도 반환하지 않는다.
  await recordAccess({
    userId: me.userId,
    ip: await getClientIp(),
    action: "DOWNLOAD",
    reason,
    subjectEmpNo: apps.length === 1 ? apps[0].empNo : null,
    target: `SCR-06 심사자료 CSV (회차 #${roundId}, ${apps.length}명)`,
  });
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="review-data-${roundId}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

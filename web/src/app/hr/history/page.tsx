import { and, desc, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { processHistory } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { logPeriod, queryText } from "@/lib/log-filters";

function detailText(raw: string) {
  try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; }
}

export default async function HistoryPage({ searchParams }: PageProps<"/hr/history">) {
  await requireRole("HR");
  const query = await searchParams;
  const entityType = queryText(query, "entityType");
  const entityId = queryText(query, "entityId");
  const actor = queryText(query, "actor");
  const period = logPeriod(query);
  const rows = period.error ? [] : await db.select().from(processHistory).where(and(
    entityType ? eq(processHistory.entityType, entityType) : undefined,
    entityId ? eq(processHistory.entityId, entityId) : undefined,
    actor ? eq(processHistory.actor, actor) : undefined,
    period.start ? gte(processHistory.actedAt, period.start) : undefined,
    period.end ? lt(processHistory.actedAt, period.end) : undefined,
  )).orderBy(desc(processHistory.actedAt), desc(processHistory.histId));
  return <main className="space-y-5 p-6"><h1 className="text-2xl font-bold">처리 이력</h1>
    <form method="get" className="flex flex-wrap items-end gap-3">
      <label>대상 종류 <select name="entityType" defaultValue={entityType} className="border p-2"><option value="">전체</option>{["ROUND", "CANDIDATE", "APPLICATION", "CORRECTION", "STEP", "SETTING"].map((type) => <option key={type}>{type}</option>)}</select></label>
      <label>대상 ID <input name="entityId" defaultValue={entityId} className="border p-2"/></label>
      <label>처리자 <input name="actor" defaultValue={actor} className="border p-2"/></label>
      <label>시작일 (UTC) <input type="date" name="from" defaultValue={period.from} className="border p-2"/></label>
      <label>종료일 (UTC) <input type="date" name="to" defaultValue={period.to} className="border p-2"/></label>
      <button className="rounded border px-4 py-2">조회</button>
    </form>
    {period.error && <p role="alert">{period.error}</p>}<p>총 {rows.length}건 · 최근 처리순</p>
    {!rows.length && <p>처리 이력이 없습니다.</p>}
    {rows.map((h) => <article key={h.histId} className="space-y-2 rounded border p-4">
      <p><time dateTime={h.actedAt}>{h.actedAt}</time> / {h.actor} / {h.entityType} / {h.entityId}</p>
      <p>{h.action} · {h.fromStatus ?? "-"} → {h.toStatus ?? "-"}</p><p>사유: {h.reason ?? "-"}</p>
      {h.detailJson && <details><summary className="cursor-pointer">상세 (detail_json)</summary><pre className="overflow-x-auto whitespace-pre-wrap break-words">{detailText(h.detailJson)}</pre></details>}
    </article>)}
  </main>;
}

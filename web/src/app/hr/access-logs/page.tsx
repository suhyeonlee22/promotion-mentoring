import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { accessLog } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { logPeriod, queryText } from "@/lib/log-filters";

export default async function AccessLogsPage({ searchParams }: PageProps<"/hr/access-logs">) {
  await requireRole("HR");
  const query = await searchParams;
  const userId = queryText(query, "userId");
  const subjectEmpNo = queryText(query, "subjectEmpNo");
  const action = queryText(query, "action");
  const period = logPeriod(query);
  const where = and(
    userId ? eq(accessLog.userId, userId) : undefined,
    subjectEmpNo ? eq(accessLog.subjectEmpNo, subjectEmpNo) : undefined,
    action ? eq(accessLog.action, action) : undefined,
    period.start ? gte(accessLog.actedAt, period.start) : undefined,
    period.end ? lt(accessLog.actedAt, period.end) : undefined,
  );
  const rows = period.error ? [] : await db.select().from(accessLog).where(where).orderBy(desc(accessLog.actedAt), desc(accessLog.logId));
  const counts = period.error ? [] : await db.select({ userId: accessLog.userId, action: accessLog.action, count: sql<number>`count(*)` })
    .from(accessLog).where(where).groupBy(accessLog.userId, accessLog.action).orderBy(accessLog.userId, accessLog.action);
  return <main className="space-y-5 p-6"><h1 className="text-2xl font-bold">개인정보 접근기록</h1>
    <form method="get" className="flex flex-wrap items-end gap-3">
      <label>계정 <input name="userId" defaultValue={userId} className="border p-2"/></label>
      <label>정보주체 (사번) <input name="subjectEmpNo" defaultValue={subjectEmpNo} className="border p-2"/></label>
      <label>수행업무 <select name="action" defaultValue={action} className="border p-2"><option value="">전체</option>{["VIEW", "UPDATE", "DOWNLOAD", "PRINT"].map((a) => <option key={a}>{a}</option>)}</select></label>
      <label>시작일 (UTC) <input type="date" name="from" defaultValue={period.from} className="border p-2"/></label>
      <label>종료일 (UTC) <input type="date" name="to" defaultValue={period.to} className="border p-2"/></label>
      <button className="rounded border px-4 py-2">조회</button>
    </form>
    {period.error && <p role="alert">{period.error}</p>}
    <section><h2 className="text-xl font-semibold">사용자별·수행업무별 건수</h2><p>현재 조회 조건 기준 · 총 {rows.length}건</p>
      <table className="w-full text-left"><thead><tr><th>계정</th><th>수행업무</th><th>건수</th></tr></thead><tbody>{counts.map((c) => <tr key={`${c.userId}|${c.action}`}><td>{c.userId}</td><td>{c.action}</td><td>{c.count}</td></tr>)}</tbody></table>
    </section>
    <section><h2 className="text-xl font-semibold">접근기록 목록</h2>{!rows.length && <p>접근기록이 없습니다.</p>}
      {rows.map((r) => <article key={r.logId} className="my-3 space-y-2 rounded border p-4"><p><time dateTime={r.actedAt}>{r.actedAt}</time> / 계정: {r.userId} / IP: {r.ip}</p><p>정보주체: {r.subjectEmpNo ?? "여러 명 (대상 참조)"} / 수행업무: {r.action}</p><p>대상: {r.target}</p><p>사유: {r.reason ?? "-"}</p></article>)}
    </section>
  </main>;
}
